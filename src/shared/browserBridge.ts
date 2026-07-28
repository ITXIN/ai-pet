import { DEFAULT_SETTINGS } from './defaults'
import { parseReplyTags } from './parseReply'
import { ReplyStreamParser } from './parseReplyStream'
import { readChatCompletionSse } from './openaiStream'
import { matchUserIntent } from './intentRules'
import { mergeReplyWithIntent } from './mergeReply'
import type {
  AppSettings,
  ChatMessage,
  ModelInfo,
  ModelMeta,
  PetActionPayload,
  PetStatus,
  TextTurnResult,
  VoiceTurnResult,
} from './types'

const STORAGE_KEY = 'ai-pet-browser-settings'
const HISTORY_KEY = 'ai-pet-browser-history'

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const saved = JSON.parse(raw) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      llm: { ...DEFAULT_SETTINGS.llm, ...saved.llm },
      voice: { ...DEFAULT_SETTINGS.voice, ...saved.voice },
      general: { ...DEFAULT_SETTINGS.general, ...saved.general },
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function loadHistory(): ChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as ChatMessage[]
  } catch {
    return []
  }
}

function saveHistory(history: ChatMessage[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20)))
}

type ListenerMap = {
  action: Array<(p: PetActionPayload) => void>
  status: Array<(s: PetStatus, m?: string) => void>
  settings: Array<(s: AppSettings) => void>
  voice: Array<() => void>
}

const listeners: ListenerMap = {
  action: [],
  status: [],
  settings: [],
  voice: [],
}

let browserChatAbort: AbortController | null = null

function emitStatus(status: PetStatus, message?: string): void {
  listeners.status.forEach((cb) => cb(status, message))
}

function emitAction(payload: PetActionPayload): void {
  listeners.action.forEach((cb) => cb(payload))
}

async function chatCompletion(
  settings: AppSettings,
  history: ChatMessage[],
): Promise<string> {
  if (!settings.llm.apiKey.trim()) {
    throw new Error('请先在设置中填写 API Key（浏览器预览也可用本地设置）')
  }
  const base = settings.llm.baseURL.replace(/\/$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.llm.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.llm.model,
      temperature: settings.llm.temperature,
      messages: [
        { role: 'system', content: settings.llm.systemPrompt },
        ...history,
      ],
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM 请求失败 (${res.status}): ${errText.slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM 返回为空')
  return content
}

async function chatCompletionPreferStream(
  settings: AppSettings,
  history: ChatMessage[],
  onDelta?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!settings.llm.apiKey.trim()) {
    throw new Error('请先在设置中填写 API Key（浏览器预览也可用本地设置）')
  }
  const base = settings.llm.baseURL.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.llm.model,
        temperature: settings.llm.temperature,
        messages: [
          { role: 'system', content: settings.llm.systemPrompt },
          ...history,
        ],
        stream: true,
      }),
      signal,
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`LLM 请求失败 (${res.status}): ${errText.slice(0, 200)}`)
    }
    return await readChatCompletionSse(res, (chunk) => onDelta?.(chunk))
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw err
    }
    console.warn('[browser] stream failed, fallback:', err)
    const content = await chatCompletion(settings, history)
    onDelta?.(content)
    return content
  }
}

/** 浏览器打开 Vite 页面时注入，避免缺少 Electron preload 导致白屏 */
export function installBrowserBridge(): void {
  if (typeof window === 'undefined') return
  if (window.aiPet) return

  document.documentElement.classList.add('browser-preview')

  window.aiPet = {
    getSettings: async () => loadSettings(),

    setSettings: async (partial) => {
      const current = loadSettings()
      const next: AppSettings = {
        ...current,
        ...partial,
        llm: { ...current.llm, ...partial.llm },
        voice: { ...current.voice, ...partial.voice },
        general: { ...current.general, ...partial.general },
      }
      saveSettings(next)
      listeners.settings.forEach((cb) => cb(next))
      return next
    },

    openSettings: async () => {
      window.open('/settings.html', '_blank', 'noopener,noreferrer')
    },

    quit: async () => {
      window.close()
    },

    chatText: async (text): Promise<TextTurnResult> => {
      browserChatAbort?.abort()
      browserChatAbort = new AbortController()
      const signal = browserChatAbort.signal
      try {
        emitStatus('thinking')
        const settings = loadSettings()
        const history = loadHistory()
        const trimmed = text.trim()
        const intent = matchUserIntent(trimmed)
        const next = [...history, { role: 'user' as const, content: trimmed }]
        const parser = new ReplyStreamParser()
        let streamedMotion = false
        const raw = await chatCompletionPreferStream(
          settings,
          next,
          (chunk) => {
            const delta = parser.push(chunk)
            if (
              !delta.emotionChanged &&
              !delta.motionChanged &&
              !delta.textChanged
            ) {
              return
            }
            const skipMotion =
              intent.matched || streamedMotion || !delta.motionChanged
            if (delta.motionChanged && !intent.matched) streamedMotion = true
            emitAction({
              emotion: delta.emotion,
              motion: delta.motion,
              text: delta.text || undefined,
              speaking: false,
              skipMotion,
              streamPartial: true,
              textOnly:
                !delta.emotionChanged &&
                !delta.motionChanged &&
                delta.textChanged,
            })
          },
          signal,
        )
        const parsed = parseReplyTags(raw)
        const merged = mergeReplyWithIntent(parsed, intent)
        const reply = {
          ...parsed,
          emotion: merged.emotion,
          motion: merged.motion,
          text: merged.text,
        }
        saveHistory([...next, { role: 'assistant', content: reply.raw }])
        emitAction({
          emotion: reply.emotion,
          motion: reply.motion,
          text: reply.text,
          speaking: false,
          skipMotion: intent.matched || streamedMotion,
        })
        emitStatus('idle')
        return { reply }
      } catch (err) {
        if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          emitStatus('idle')
          return {
            reply: parseReplyTags('[emotion:neutral][motion:Idle]'),
            error: '已取消',
          }
        }
        const message = err instanceof Error ? err.message : String(err)
        emitStatus('error', message)
        return {
          reply: parseReplyTags('[emotion:sad][motion:Idle]出错了…'),
          error: message,
        }
      } finally {
        if (browserChatAbort?.signal === signal) browserChatAbort = null
      }
    },

    chatVoice: async (): Promise<VoiceTurnResult> => {
      const message =
        '浏览器预览暂不支持完整语音链路，请用文字聊天，或通过 Electron 窗口（npm run dev 自动打开）使用语音'
      emitStatus('error', message)
      return {
        userText: '',
        reply: parseReplyTags('[emotion:shy][motion:Idle]语音请用桌面窗口哦'),
        error: message,
      }
    },

    abortChat: async () => {
      browserChatAbort?.abort()
      browserChatAbort = null
      emitStatus('idle')
    },

    clearHistory: async () => {
      saveHistory([])
    },

    listModels: async (): Promise<ModelInfo[]> => [
      {
        id: 'builtin-hiyori',
        name: 'hiyori',
        path: 'models/hiyori/Hiyori.model3.json',
        builtin: true,
        license: 'sample',
      },
      {
        id: 'builtin-mao',
        name: 'mao',
        path: 'models/mao/Mao.model3.json',
        builtin: true,
        license: 'sample',
      },
    ],

    pickModelDir: async () => {
      window.alert('浏览器预览无法选择本地目录，请在 Electron 桌面窗口中导入模型')
      return null
    },

    setIgnoreMouse: async () => {},

    moveWindowTo: () => {},

    reportCapabilities: () => {},

    togglePetWindow: async () => {},

    getVersion: async () => '0.1.0-browser',

    checkUpdate: async () => ({
      current: '0.1.0-browser',
      latest: null,
      hasUpdate: false,
      releaseUrl: 'https://github.com/ITXIN/ai-pet/releases',
      message: '浏览器预览不支持自动检查更新',
    }),

    resolveModelUrl: async (modelPath: string) => {
      if (modelPath.startsWith('http') || modelPath.startsWith('file:')) {
        return modelPath
      }
      const cleaned = modelPath.replace(/^\//, '')
      return `/${cleaned}`
    },

    getModelMeta: async (modelPath: string): Promise<ModelMeta | null> => {
      try {
        const dir = modelPath.replace(/\/[^/]+$/, '')
        const res = await fetch(`/${dir}/model.meta.json`.replace(/\/+/g, '/'))
        if (!res.ok) return null
        return (await res.json()) as ModelMeta
      } catch {
        return null
      }
    },

    onPetAction: (cb) => {
      listeners.action.push(cb)
      return () => {
        listeners.action = listeners.action.filter((x) => x !== cb)
      }
    },

    onPetStatus: (cb) => {
      listeners.status.push(cb)
      return () => {
        listeners.status = listeners.status.filter((x) => x !== cb)
      }
    },

    onSettingsChanged: (cb) => {
      listeners.settings.push(cb)
      return () => {
        listeners.settings = listeners.settings.filter((x) => x !== cb)
      }
    },

    onStartVoice: (cb) => {
      listeners.voice.push(cb)
      return () => {
        listeners.voice = listeners.voice.filter((x) => x !== cb)
      }
    },
  }
}
