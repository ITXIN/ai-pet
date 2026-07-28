import Store from 'electron-store'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'
import type { AppSettings, ChatMessage } from '../src/shared/types'

interface StoreSchema {
  settings: AppSettings
  chatHistory: ChatMessage[]
}

const store = new Store<StoreSchema>({
  name: 'ai-pet-config',
  defaults: {
    settings: DEFAULT_SETTINGS,
    chatHistory: [],
  },
})

export function getSettings(): AppSettings {
  const saved = store.get('settings')
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    llm: { ...DEFAULT_SETTINGS.llm, ...saved?.llm },
    voice: { ...DEFAULT_SETTINGS.voice, ...saved?.voice },
    general: { ...DEFAULT_SETTINGS.general, ...saved?.general },
  }
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const next: AppSettings = {
    ...current,
    ...partial,
    llm: { ...current.llm, ...partial.llm },
    voice: { ...current.voice, ...partial.voice },
    general: { ...current.general, ...partial.general },
  }
  store.set('settings', next)
  return next
}

export function getChatHistory(): ChatMessage[] {
  return store.get('chatHistory') ?? []
}

export function setChatHistory(history: ChatMessage[]): void {
  // 限制历史长度，避免上下文过长
  store.set('chatHistory', history.slice(-20))
}

export function clearChatHistory(): void {
  store.set('chatHistory', [])
}
