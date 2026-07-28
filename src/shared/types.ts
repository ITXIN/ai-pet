export const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_OPEN: 'settings:open',
  CHAT_TEXT: 'chat:text',
  CHAT_VOICE: 'chat:voice',
  CHAT_HISTORY_CLEAR: 'chat:history-clear',
  PET_APPLY_ACTION: 'pet:apply-action',
  PET_STATUS: 'pet:status',
  PET_ERROR: 'pet:error',
  APP_QUIT: 'app:quit',
  WINDOW_SET_IGNORE_MOUSE: 'window:set-ignore-mouse',
  WINDOW_MOVE_TO: 'window:move-to',
  WINDOW_TOGGLE: 'window:toggle',
  MODEL_LIST: 'model:list',
  MODEL_PICK_DIR: 'model:pick-dir',
  MODEL_CAPABILITIES: 'model:capabilities',
  MODEL_GET_META: 'model:get-meta',
  APP_CHECK_UPDATE: 'app:check-update',
  APP_GET_VERSION: 'app:get-version',
} as const

export type Emotion =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'shy'
  | 'thinking'

export type MotionName =
  | 'Idle'
  | 'Tap'
  | 'Wave'
  | 'Nod'
  | 'Shake'
  | 'Dance'
  | 'Think'

export interface ModelCapabilities {
  expressions: string[]
  motionGroups: Record<string, number>
  lipSyncParams: string[]
}

export interface AppSettings {
  modelId: string
  modelPath: string
  customModelPaths: string[]
  llm: {
    baseURL: string
    apiKey: string
    model: string
    temperature: number
    systemPrompt: string
  }
  voice: {
    ttsModel: string
    ttsVoice: string
    language: string
    sttModel: string
  }
  general: {
    alwaysOnTop: boolean
    petWidth: number
    petHeight: number
    showSubtitles: boolean
    clickThrough: boolean
    openAtLogin: boolean
    onboardingDone: boolean
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ParsedReply {
  emotion: Emotion
  motion: MotionName
  text: string
  raw: string
}

export interface VoiceTurnResult {
  userText: string
  reply: ParsedReply
  audioBase64?: string
  mimeType?: string
  error?: string
}

export interface TextTurnResult {
  reply: ParsedReply
  error?: string
}

export interface ModelMeta {
  displayName?: string
  license?: 'sample' | 'commercial' | 'custom'
  notes?: string
  /** 语义情绪 → 表情名或 Expressions 数组下标 */
  emotionMap?: Partial<Record<Emotion, string | number>>
  /** 说话循环动作组；无 Talk 时用 Idle */
  talkMotionGroup?: string
  idleMotionGroup?: string
}

export interface ModelInfo {
  id: string
  name: string
  path: string
  builtin: boolean
  /** sample = Live2D 官方示例不可商用；commercial = 可商用授权包 */
  license?: 'sample' | 'commercial' | 'custom'
}

export interface UpdateCheckResult {
  current: string
  latest: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  message: string
}

export interface PetActionPayload {
  emotion: Emotion
  motion: MotionName
  text?: string
  speaking?: boolean
  /** 用户意图即时表演：强制播动作并上锁，避免 LLM 立刻盖掉 */
  fromIntent?: boolean
  /** 意图锁期间跳过 motion，只更新字幕/表情 */
  skipMotion?: boolean
}

export type PetStatus =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'

declare global {
  interface Window {
    aiPet: {
      getSettings: () => Promise<AppSettings>
      setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
      openSettings: () => Promise<void>
      quit: () => Promise<void>
      chatText: (text: string) => Promise<TextTurnResult>
      chatVoice: (audioBase64: string, mimeType: string) => Promise<VoiceTurnResult>
      clearHistory: () => Promise<void>
      listModels: () => Promise<ModelInfo[]>
      pickModelDir: () => Promise<string | null>
      setIgnoreMouse: (ignore: boolean) => Promise<void>
      resolveModelUrl: (modelPath: string) => Promise<string>
      getModelMeta: (modelPath: string) => Promise<ModelMeta | null>
      moveWindowTo: (x: number, y: number) => void
      reportCapabilities: (caps: ModelCapabilities) => void
      togglePetWindow: () => Promise<void>
      getVersion: () => Promise<string>
      checkUpdate: () => Promise<UpdateCheckResult>
      onPetAction: (cb: (payload: PetActionPayload) => void) => () => void
      onPetStatus: (cb: (status: PetStatus, message?: string) => void) => () => void
      onSettingsChanged: (cb: (settings: AppSettings) => void) => () => void
      onStartVoice: (cb: () => void) => () => void
    }
  }
}

export {}
