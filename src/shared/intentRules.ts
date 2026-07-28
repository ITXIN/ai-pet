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

/**
 * 用户话术 → 立刻表演的意图（先于 LLM）。
 * 规则偏「指令边界」，避免闲聊误触（如「我不要这个」）。
 */
const RULES: Rule[] = [
  {
    pattern: /(请|来|再)?跳(个|支)?舞|dance|蹦迪|扭一扭/i,
    motion: 'Dance',
    emotion: 'happy',
    label: '跳舞',
  },
  {
    pattern: /(请|来)?挥(挥)?手|(请|来)?招(招)?手|打招呼|wave/i,
    motion: 'Wave',
    emotion: 'happy',
    label: '挥手',
  },
  {
    pattern: /(请|来)?点(点)?头|\bnod\b/i,
    motion: 'Nod',
    emotion: 'neutral',
    label: '点头',
  },
  {
    pattern: /(请|来)?摇(摇)?头|(请|来)?摇晃|晃(一晃|晃)|摇摆|\bshake\b/i,
    motion: 'Shake',
    emotion: 'angry',
    label: '摇晃',
  },
  {
    pattern:
      /(请|来)?(拍一拍|拍拍|拍一下)|(请|来)?(碰一碰|碰碰|碰一下)|\btap\b/i,
    motion: 'Tap',
    emotion: 'surprised',
    label: '轻拍',
  },
  {
    pattern: /(请|来)?想一想|思考一下|思考|\bthink\b/i,
    motion: 'Think',
    emotion: 'thinking',
    label: '思考',
  },
  {
    pattern: /(请|来)?(开心|高兴)(一点)?|(请|来)?笑一个|\bhappy\b/i,
    emotion: 'happy',
    motion: 'Wave',
    label: '开心',
  },
  {
    pattern: /(请|来)?(难过|伤心)(一点)?|(请|来)?哭一个|\bsad\b/i,
    emotion: 'sad',
    motion: 'Idle',
    label: '难过',
  },
  {
    pattern: /(请|来)?(生气|愤怒|恼火)(一下)?|\bangry\b/i,
    emotion: 'angry',
    motion: 'Shake',
    label: '生气',
  },
  {
    pattern: /(请|来)?(吃惊|惊讶)(一下)?|\bsurprised\b/i,
    emotion: 'surprised',
    motion: 'Tap',
    label: '惊讶',
  },
  {
    pattern: /(请|来)?(害羞|不好意思)(一下)?|\bshy\b/i,
    emotion: 'shy',
    motion: 'Idle',
    label: '害羞',
  },
  {
    pattern: /(请|来)?(待机|休息一下|休息)|\bidle\b/i,
    emotion: 'neutral',
    motion: 'Idle',
    label: '待机',
  },
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
