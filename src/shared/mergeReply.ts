import type { Emotion, MotionName, ParsedReply } from './types'
import type { UserIntent } from './intentRules'

/** LLM 漏标签时回落到用户意图，再回落到 neutral/Idle */
export function mergeReplyWithIntent(
  reply: ParsedReply,
  intent: UserIntent | null | undefined,
): { emotion: Emotion; motion: MotionName; text: string } {
  const hasEmotion = /\[emotion\s*:/i.test(reply.raw)
  const hasMotion = /\[motion\s*:/i.test(reply.raw)

  return {
    emotion: hasEmotion
      ? reply.emotion
      : intent?.emotion ?? reply.emotion ?? 'neutral',
    motion: hasMotion
      ? reply.motion
      : intent?.motion ?? reply.motion ?? 'Idle',
    text: reply.text,
  }
}
