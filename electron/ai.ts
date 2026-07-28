import { parseReplyTags } from '../src/shared/parseReply'
import { ReplyStreamParser } from '../src/shared/parseReplyStream'
import type { StreamParseDelta } from '../src/shared/parseReplyStream'
import { readChatCompletionSse } from '../src/shared/openaiStream'
import { formatCapabilitiesPrompt } from '../src/shared/capabilitiesPrompt'
import type {
  AppSettings,
  ChatMessage,
  ModelCapabilities,
  ParsedReply,
  TextTurnResult,
  VoiceTurnResult,
} from '../src/shared/types'
import {
  clearChatHistory,
  getChatHistory,
  getSettings,
  setChatHistory,
} from './store'

let cachedCapabilities: ModelCapabilities | null = null

export function setModelCapabilities(caps: ModelCapabilities): void {
  cachedCapabilities = caps
}

export function getModelCapabilities(): ModelCapabilities | null {
  return cachedCapabilities
}

function openaiHeaders(settings: AppSettings): HeadersInit {
  return {
    Authorization: `Bearer ${settings.llm.apiKey}`,
    'Content-Type': 'application/json',
  }
}

function baseUrl(settings: AppSettings): string {
  return settings.llm.baseURL.replace(/\/$/, '')
}

function buildSystemPrompt(settings: AppSettings): string {
  const base = settings.llm.systemPrompt
  if (!cachedCapabilities) return base
  return `${base}\n${formatCapabilitiesPrompt(cachedCapabilities)}`
}

async function chatCompletion(
  settings: AppSettings,
  history: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const url = `${baseUrl(settings)}/chat/completions`
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(settings) },
    ...history,
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: openaiHeaders(settings),
    body: JSON.stringify({
      model: settings.llm.model,
      temperature: settings.llm.temperature,
      messages,
    }),
    signal,
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

async function chatCompletionStream(
  settings: AppSettings,
  history: ChatMessage[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const url = `${baseUrl(settings)}/chat/completions`
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(settings) },
    ...history,
  ]

  const res = await fetch(url, {
    method: 'POST',
    headers: openaiHeaders(settings),
    body: JSON.stringify({
      model: settings.llm.model,
      temperature: settings.llm.temperature,
      messages,
      stream: true,
    }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LLM 请求失败 (${res.status}): ${errText.slice(0, 200)}`)
  }

  return readChatCompletionSse(res, onDelta)
}

/** 优先 SSE；失败则回退非流式整段 */
async function chatCompletionPreferStream(
  settings: AppSettings,
  history: ChatMessage[],
  onDelta?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  try {
    return await chatCompletionStream(
      settings,
      history,
      (chunk) => {
        onDelta?.(chunk)
      },
      signal,
    )
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw err
    }
    console.warn('[ai] stream failed, fallback to non-stream:', err)
    const content = await chatCompletion(settings, history, signal)
    onDelta?.(content)
    return content
  }
}

async function whisperTranscribe(
  settings: AppSettings,
  audioBuffer: Buffer,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  const ext = mimeType.includes('webm')
    ? 'webm'
    : mimeType.includes('mp4')
      ? 'mp4'
      : mimeType.includes('wav')
        ? 'wav'
        : 'webm'

  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
    `audio.${ext}`,
  )
  form.append('model', settings.voice.sttModel)
  if (settings.voice.language) {
    form.append('language', settings.voice.language)
  }

  const res = await fetch(`${baseUrl(settings)}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.llm.apiKey}`,
    },
    body: form,
    signal,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`STT 失败 (${res.status}): ${errText.slice(0, 200)}`)
  }

  const data = (await res.json()) as { text?: string }
  if (!data.text?.trim()) throw new Error('未能识别到语音内容')
  return data.text.trim()
}

async function synthesizeSpeech(
  settings: AppSettings,
  text: string,
  signal?: AbortSignal,
): Promise<{ audioBase64: string; mimeType: string }> {
  const res = await fetch(`${baseUrl(settings)}/audio/speech`, {
    method: 'POST',
    headers: openaiHeaders(settings),
    body: JSON.stringify({
      model: settings.voice.ttsModel,
      voice: settings.voice.ttsVoice,
      input: text,
      response_format: 'mp3',
    }),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`TTS 失败 (${res.status}): ${errText.slice(0, 200)}`)
  }

  const buf = Buffer.from(await res.arrayBuffer())
  return {
    audioBase64: buf.toString('base64'),
    mimeType: 'audio/mpeg',
  }
}

function ensureApiKey(settings: AppSettings): void {
  if (!settings.llm.apiKey?.trim()) {
    throw new Error('请先在设置中填写 API Key')
  }
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as { name: string }).name === 'AbortError')
  )
}

export type StreamDeltaHandler = (delta: StreamParseDelta) => void

let activeChatAbort: AbortController | null = null

/** 取消进行中的文字/语音 LLM 回合 */
export function abortActiveChat(): void {
  activeChatAbort?.abort()
  activeChatAbort = null
}

function beginChatAbort(): AbortSignal {
  abortActiveChat()
  activeChatAbort = new AbortController()
  return activeChatAbort.signal
}

function endChatAbort(signal: AbortSignal): void {
  if (activeChatAbort?.signal === signal) {
    activeChatAbort = null
  }
}

async function runChatTurn(
  userText: string,
  onStream?: StreamDeltaHandler,
  signal?: AbortSignal,
): Promise<ParsedReply> {
  const settings = getSettings()
  ensureApiKey(settings)

  const history = getChatHistory()
  const nextHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: userText },
  ]

  const parser = new ReplyStreamParser()
  const raw = await chatCompletionPreferStream(
    settings,
    nextHistory,
    (chunk) => {
      const delta = parser.push(chunk)
      if (
        onStream &&
        (delta.emotionChanged || delta.motionChanged || delta.textChanged)
      ) {
        onStream(delta)
      }
    },
    signal,
  )

  if (signal?.aborted) {
    throw Object.assign(new Error('已取消'), { name: 'AbortError' })
  }

  const reply = parseReplyTags(raw)

  setChatHistory([
    ...nextHistory,
    { role: 'assistant', content: reply.raw },
  ])

  return reply
}

export async function handleTextChat(
  text: string,
  onStream?: StreamDeltaHandler,
): Promise<TextTurnResult> {
  const signal = beginChatAbort()
  try {
    const trimmed = text.trim()
    if (!trimmed) return { reply: parseReplyTags(''), error: '请输入内容' }
    const reply = await runChatTurn(trimmed, onStream, signal)
    return { reply }
  } catch (err) {
    if (isAbortError(err) || signal.aborted) {
      return {
        reply: parseReplyTags('[emotion:neutral][motion:Idle]'),
        error: '已取消',
      }
    }
    return {
      reply: parseReplyTags('[emotion:sad][motion:Idle]出错了…'),
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    endChatAbort(signal)
  }
}

export async function handleVoiceChat(
  audioBase64: string,
  mimeType: string,
  onUserText?: (userText: string) => void,
  onStream?: StreamDeltaHandler,
): Promise<VoiceTurnResult> {
  const signal = beginChatAbort()
  try {
    const settings = getSettings()
    ensureApiKey(settings)

    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const userText = await whisperTranscribe(
      settings,
      audioBuffer,
      mimeType,
      signal,
    )
    onUserText?.(userText)
    const reply = await runChatTurn(userText, onStream, signal)

    let audio: { audioBase64: string; mimeType: string } | undefined
    try {
      audio = await synthesizeSpeech(settings, reply.text, signal)
    } catch (ttsErr) {
      if (isAbortError(ttsErr) || signal.aborted) throw ttsErr
      console.warn('TTS failed:', ttsErr)
    }

    return {
      userText,
      reply,
      audioBase64: audio?.audioBase64,
      mimeType: audio?.mimeType,
    }
  } catch (err) {
    if (isAbortError(err) || signal.aborted) {
      return {
        userText: '',
        reply: parseReplyTags('[emotion:neutral][motion:Idle]'),
        error: '已取消',
      }
    }
    return {
      userText: '',
      reply: parseReplyTags('[emotion:sad][motion:Idle]出错了…'),
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    endChatAbort(signal)
  }
}

export function handleClearHistory(): void {
  clearChatHistory()
}
