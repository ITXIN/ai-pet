import type { Emotion, MotionName } from './types'
import { parseReplyTags } from './parseReply'

export interface StreamParseDelta {
  emotion: Emotion
  motion: MotionName
  text: string
  raw: string
  emotionChanged: boolean
  motionChanged: boolean
  textChanged: boolean
}

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

function normalizeMotion(rawMotion: string): MotionName {
  const found = MOTIONS.find(
    (m) => m.toLowerCase() === rawMotion.toLowerCase(),
  )
  if (found) return found
  const normalized = (rawMotion.charAt(0).toUpperCase() +
    rawMotion.slice(1).toLowerCase()) as MotionName
  return MOTIONS.includes(normalized) ? normalized : 'Idle'
}

function splitIncompleteTag(s: string): { safe: string; hold: string } {
  const lastOpen = s.lastIndexOf('[')
  if (lastOpen === -1) return { safe: s, hold: '' }
  const after = s.slice(lastOpen)
  if (after.includes(']')) return { safe: s, hold: '' }
  return { safe: s.slice(0, lastOpen), hold: after }
}

/**
 * 增量解析 LLM 流：标签跨 chunk 不误触发；闭合后立刻给出 emotion/motion。
 */
export class ReplyStreamParser {
  private raw = ''
  private emotion: Emotion = 'neutral'
  private motion: MotionName = 'Idle'
  private text = ''
  private emotionSet = false
  private motionSet = false

  push(chunk: string): StreamParseDelta {
    if (!chunk) {
      return {
        emotion: this.emotion,
        motion: this.motion,
        text: this.text,
        raw: this.raw,
        emotionChanged: false,
        motionChanged: false,
        textChanged: false,
      }
    }

    this.raw += chunk
    const { safe } = splitIncompleteTag(this.raw)

    let emotionChanged = false
    let motionChanged = false

    if (!this.emotionSet) {
      const emotionMatch = safe.match(/\[emotion:\s*([a-zA-Z_]+)\]/i)
      if (emotionMatch) {
        const value = emotionMatch[1].toLowerCase() as Emotion
        if (EMOTIONS.includes(value)) {
          this.emotion = value
          this.emotionSet = true
          emotionChanged = true
        }
      }
    }

    if (!this.motionSet) {
      const motionMatch = safe.match(/\[motion:\s*([a-zA-Z_]+)\]/i)
      if (motionMatch) {
        this.motion = normalizeMotion(motionMatch[1])
        this.motionSet = true
        motionChanged = true
      }
    }

    const nextText = safe.replace(/\[[^\]]*\]/g, '').trim()
    const textChanged = nextText !== this.text
    this.text = nextText

    return {
      emotion: this.emotion,
      motion: this.motion,
      text: this.text,
      raw: this.raw,
      emotionChanged,
      motionChanged,
      textChanged,
    }
  }

  finish() {
    return parseReplyTags(this.raw)
  }

  getRaw(): string {
    return this.raw
  }
}
