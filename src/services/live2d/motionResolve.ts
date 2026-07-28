import type { MotionName } from '../../shared/types'
import type { ModelCapabilities } from '../../shared/types'

export interface ResolvedMotion {
  group: string
  index: number
}

function pickGroup(
  candidates: string[],
  available: Record<string, number>,
): string | null {
  const keys = Object.keys(available)
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase() === c.toLowerCase())
    if (found && (available[found] ?? 0) > 0) return found
  }
  return null
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return ((index % count) + count) % count
}

/**
 * 将语义动作解析为模型真实 motion group + index。
 * Hiyori 仅有 Idle / TapBody 时：交互类进 TapBody，其余进 Idle 不同片段。
 */
export function resolveMotion(
  semantic: MotionName,
  caps: ModelCapabilities,
  preferredIdleIndex?: number,
  preferredIdleGroup?: string,
): ResolvedMotion {
  const available = caps.motionGroups
  const idle =
    (preferredIdleGroup
      ? pickGroup([preferredIdleGroup], available)
      : null) ??
    pickGroup(['Idle', 'idle', 'Idle1'], available) ??
    Object.keys(available).find((k) => (available[k] ?? 0) > 0) ??
    'Idle'
  const tap = pickGroup(['TapBody', 'Tap', 'tap_body', 'Flick', 'Wave'], available)

  const idleCount = available[idle] ?? 1

  const tapCount = tap ? (available[tap] ?? 0) : 0

  switch (semantic) {
    case 'Tap':
      if (tap) return { group: tap, index: 0 }
      return { group: idle, index: clampIndex(2, idleCount) }
    case 'Wave':
      // TapBody 只有 1 条时改用不同 Idle，避免与 Dance 完全同款
      if (tap && tapCount > 1) {
        return { group: tap, index: clampIndex(1, tapCount) }
      }
      return { group: idle, index: clampIndex(preferredIdleIndex ?? 2, idleCount) }
    case 'Shake':
      if (tap && tapCount > 2) {
        return { group: tap, index: clampIndex(2, tapCount) }
      }
      return { group: idle, index: clampIndex(preferredIdleIndex ?? 4, idleCount) }
    case 'Dance': {
      const dance = pickGroup(['Dance', 'Special'], available)
      if (dance) return { group: dance, index: 0 }
      // 优先交互组最后一段（Mao special）；Hiyori 仅 m04
      if (tap) {
        return { group: tap, index: clampIndex(Math.max(0, tapCount - 1), tapCount) }
      }
      return {
        group: idle,
        index: clampIndex(preferredIdleIndex ?? 3, idleCount),
      }
    }
    case 'Nod':
      return { group: idle, index: clampIndex(preferredIdleIndex ?? 1, idleCount) }
    case 'Think':
      return { group: idle, index: clampIndex(preferredIdleIndex ?? 6, idleCount) }
    case 'Idle':
    default:
      return {
        group: idle,
        index: clampIndex(preferredIdleIndex ?? 0, idleCount),
      }
  }
}

/** 说话晃动动作组：Talk → meta → Idle */
export function resolveTalkGroup(
  caps: ModelCapabilities,
  preferredTalkGroup?: string,
): string {
  const available = caps.motionGroups
  const preferred = preferredTalkGroup
    ? pickGroup([preferredTalkGroup], available)
    : null
  return (
    preferred ??
    pickGroup(['Talk', 'talk', 'Speak', 'speak'], available) ??
    pickGroup(['Idle', 'idle', 'Idle1'], available) ??
    Object.keys(available).find((k) => (available[k] ?? 0) > 0) ??
    'Idle'
  )
}
