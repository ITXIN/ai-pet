import type { Emotion, MotionName } from './types'

export interface UserIntent {
  emotion?: Emotion
  motion?: MotionName
  matched: boolean
  label?: string
}

interface Rule {
  pattern: RegExp
  emotion?: Emotion
  motion?: MotionName
  label: string
}

/** 用户话术 → 立刻表演的意图（先于 LLM） */
const RULES: Rule[] = [
  { pattern: /跳(个|支)?舞|dance|蹦迪|扭一扭/i, motion: 'Dance', emotion: 'happy', label: '跳舞' },
  { pattern: /挥(挥)?手|招(招)?手|打招[呼呼]|wave/i, motion: 'Wave', emotion: 'happy', label: '挥手' },
  { pattern: /点(点)?头|同意|好的吧|nod/i, motion: 'Nod', emotion: 'neutral', label: '点头' },
  { pattern: /摇(摇)?头|拒绝|不要|shake/i, motion: 'Shake', emotion: 'angry', label: '摇头' },
  { pattern: /拍(拍)?|碰(碰)?|tap/i, motion: 'Tap', emotion: 'surprised', label: '轻拍' },
  { pattern: /想(一想|想)|思考|think/i, motion: 'Think', emotion: 'thinking', label: '思考' },
  { pattern: /开心|高兴|开心一点|笑一个|happy/i, emotion: 'happy', motion: 'Wave', label: '开心' },
  { pattern: /难过|伤心|哭|沮丧|sad/i, emotion: 'sad', motion: 'Idle', label: '难过' },
  { pattern: /生气|愤怒|恼火|angry/i, emotion: 'angry', motion: 'Shake', label: '生气' },
  { pattern: /吃惊|惊讶|surprised|吓/i, emotion: 'surprised', motion: 'Tap', label: '惊讶' },
  { pattern: /害羞|不好意思|shy/i, emotion: 'shy', motion: 'Idle', label: '害羞' },
  { pattern: /待机|休息|idle/i, emotion: 'neutral', motion: 'Idle', label: '待机' },
]

export function matchUserIntent(text: string): UserIntent {
  const trimmed = text.trim()
  if (!trimmed) return { matched: false }

  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        matched: true,
        emotion: rule.emotion,
        motion: rule.motion,
        label: rule.label,
      }
    }
  }
  return { matched: false }
}
