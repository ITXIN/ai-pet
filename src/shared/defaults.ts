import type { AppSettings } from './types'

export const DEFAULT_SYSTEM_PROMPT = `你是一个可爱的桌面宠物助手，性格活泼友善。
请用简洁口语化的中文回复，通常不超过 80 字。
回复开头必须带情绪与动作标签，格式严格如下：
[emotion:情绪][motion:动作]正文内容

情绪只能是其一：neutral, happy, sad, angry, surprised, shy, thinking
动作只能是其一：Idle, Tap, Wave, Nod, Shake, Dance, Think

重要：
- 当用户要求表演（如跳舞、挥手、点头、做出某种表情）时，motion/emotion 必须与用户要求一致。
- 不要省略标签。

示例：
[emotion:happy][motion:Wave]你好呀！今天过得怎么样？
[emotion:happy][motion:Dance]好呀，看我跳～`

export const DEFAULT_SETTINGS: AppSettings = {
  modelId: 'builtin-hiyori',
  modelPath: 'models/hiyori/Hiyori.model3.json',
  customModelPaths: [],
  llm: {
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  },
  voice: {
    ttsModel: 'tts-1',
    ttsVoice: 'nova',
    language: 'zh',
    sttModel: 'whisper-1',
  },
  general: {
    alwaysOnTop: true,
    petWidth: 360,
    petHeight: 480,
    showSubtitles: true,
    clickThrough: true,
    openAtLogin: false,
    onboardingDone: false,
    autoBlink: true,
    lookAt: true,
    idleEye: true,
    autoBreath: true,
  },
}

/** 情绪 → Live2D expression 名称候选（按优先级） */
export const EMOTION_EXPRESSION_MAP: Record<string, string[]> = {
  neutral: ['normal', 'Neutral', 'idle', 'default', 'exp_01'],
  happy: ['happy', 'smile', 'Joy', 'f01', 'exp_01', 'exp_02'],
  sad: ['sad', 'sorrow', 'f02', 'exp_03'],
  angry: ['angry', 'mad', 'f03', 'exp_04'],
  surprised: ['surprised', 'shock', 'f04', 'exp_05'],
  shy: ['shy', 'blush', 'embarrassed', 'exp_06'],
  thinking: ['thinking', 'think', 'serious', 'exp_07', 'exp_08'],
}

/** 动作 → Live2D motion group / 名称候选 */
export const MOTION_GROUP_MAP: Record<string, string[]> = {
  Idle: ['Idle', 'idle', 'Idle1'],
  Tap: ['TapBody', 'Tap', 'tap_body'],
  Wave: ['Flick', 'Wave', 'FlickUp', 'TapBody'],
  Nod: ['Nod', 'Agree', 'Idle'],
  Shake: ['Shake', 'Reject', 'TapBody'],
  Dance: ['Dance', 'Special', 'TapBody'],
  Think: ['Think', 'Idle'],
}
