import type { Emotion, MotionName, ParsedReply } from './types'

const EMOTIONS: Emotion[] = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'shy',
  'thinking',
]

const MOTIONS: MotionName[] = [
  'Idle',
  'Tap',
  'Wave',
  'Nod',
  'Shake',
  'Dance',
  'Think',
]

export function parseReplyTags(raw: string): ParsedReply {
  let emotion: Emotion = 'neutral'
  let motion: MotionName = 'Idle'
  let text = raw.trim()

  const emotionMatch = text.match(/\[emotion:\s*([a-zA-Z_]+)\]/i)
  if (emotionMatch) {
    const value = emotionMatch[1].toLowerCase() as Emotion
    if (EMOTIONS.includes(value)) emotion = value
    text = text.replace(emotionMatch[0], '')
  }

  const motionMatch = text.match(/\[motion:\s*([a-zA-Z_]+)\]/i)
  if (motionMatch) {
    const rawMotion = motionMatch[1]
    const normalized = (rawMotion.charAt(0).toUpperCase() +
      rawMotion.slice(1).toLowerCase()) as MotionName
    const found = MOTIONS.find(
      (m) => m.toLowerCase() === rawMotion.toLowerCase(),
    )
    motion = found ?? (MOTIONS.includes(normalized) ? normalized : 'Idle')
    text = text.replace(motionMatch[0], '')
  }

  // 清理可能残留的其它方括号标签
  text = text.replace(/\[[^\]]+\]/g, '').trim()

  return { emotion, motion, text: text || raw.trim(), raw }
}
