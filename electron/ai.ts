import { parseReplyTags } from '../src/shared/parseReply'
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

async function whisperTranscribe(
  settings: AppSettings,
  audioBuffer: Buffer,
  mimeType: string,
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

async function runChatTurn(userText: string): Promise<ParsedReply> {
  const settings = getSettings()
  ensureApiKey(settings)

  const history = getChatHistory()
  const nextHistory: ChatMessage[] = [
    ...history,
    { role: 'user', content: userText },
  ]

  const raw = await chatCompletion(settings, nextHistory)
  const reply = parseReplyTags(raw)

  setChatHistory([
    ...nextHistory,
    { role: 'assistant', content: reply.raw },
  ])

  return reply
}

export async function handleTextChat(text: string): Promise<TextTurnResult> {
  try {
    const trimmed = text.trim()
    if (!trimmed) return { reply: parseReplyTags(''), error: '请输入内容' }
    const reply = await runChatTurn(trimmed)
    return { reply }
  } catch (err) {
    return {
      reply: parseReplyTags('[emotion:sad][motion:Idle]出错了…'),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function handleVoiceChat(
  audioBase64: string,
  mimeType: string,
  onUserText?: (userText: string) => void,
): Promise<VoiceTurnResult> {
  try {
    const settings = getSettings()
    ensureApiKey(settings)

    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const userText = await whisperTranscribe(settings, audioBuffer, mimeType)
    onUserText?.(userText)
    const reply = await runChatTurn(userText)

    let audio: { audioBase64: string; mimeType: string } | undefined
    try {
      audio = await synthesizeSpeech(settings, reply.text)
    } catch (ttsErr) {
      // TTS 失败仍返回文本与动作
      console.warn('TTS failed:', ttsErr)
    }

    return {
      userText,
      reply,
      audioBase64: audio?.audioBase64,
      mimeType: audio?.mimeType,
    }
  } catch (err) {
    return {
      userText: '',
      reply: parseReplyTags('[emotion:sad][motion:Idle]出错了…'),
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function handleClearHistory(): void {
  clearChatHistory()
}
