import type { Emotion } from '../../shared/types'

export type ParamWriter = (id: string, value: number) => void

/** 情绪 → Cubism 参数预设（无 .exp3 时使用） */
export const EMOTION_PARAM_PRESETS: Record<
  Emotion,
  Record<string, number>
> = {
  neutral: {
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0,
    ParamMouthForm: 0,
    ParamBrowLY: 0,
    ParamBrowRY: 0,
    ParamBrowLForm: 0,
    ParamBrowRForm: 0,
    ParamCheek: 0,
    ParamEyeLOpen: 1,
    ParamEyeROpen: 1,
    ParamMouthOpenY: 0,
  },
  happy: {
    ParamEyeLSmile: 1,
    ParamEyeRSmile: 1,
    ParamMouthForm: 1,
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.2,
    ParamCheek: 0.4,
    ParamEyeLOpen: 0.85,
    ParamEyeROpen: 0.85,
  },
  sad: {
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0,
    ParamMouthForm: -1,
    ParamBrowLY: -0.6,
    ParamBrowRY: -0.6,
    ParamBrowLForm: -0.5,
    ParamBrowRForm: -0.5,
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
  },
  angry: {
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0,
    ParamMouthForm: -0.4,
    ParamBrowLY: -0.3,
    ParamBrowRY: -0.3,
    ParamBrowLAngle: 0.8,
    ParamBrowRAngle: -0.8,
    ParamBrowLForm: 0.6,
    ParamBrowRForm: 0.6,
    ParamEyeLOpen: 1,
    ParamEyeROpen: 1,
  },
  surprised: {
    ParamEyeLOpen: 1.2,
    ParamEyeROpen: 1.2,
    ParamMouthOpenY: 0.45,
    ParamMouthForm: 0.2,
    ParamBrowLY: 0.5,
    ParamBrowRY: 0.5,
  },
  shy: {
    ParamEyeLSmile: 0.5,
    ParamEyeRSmile: 0.5,
    ParamMouthForm: 0.3,
    ParamCheek: 0.85,
    ParamEyeLOpen: 0.75,
    ParamEyeROpen: 0.75,
    ParamEyeBallY: -0.2,
  },
  thinking: {
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0,
    ParamMouthForm: 0,
    ParamBrowLY: 0.15,
    ParamBrowRY: -0.1,
    ParamEyeBallX: 0.35,
    ParamEyeBallY: 0.15,
    ParamEyeLOpen: 0.9,
    ParamEyeROpen: 0.9,
  },
}

/** emotion → Idle motion 片段 index（增强无 exp 时的表现） */
export const EMOTION_IDLE_INDEX: Record<Emotion, number> = {
  neutral: 0,
  happy: 2,
  sad: 4,
  angry: 5,
  surprised: 1,
  shy: 3,
  thinking: 6,
}

export function applyEmotionPreset(
  emotion: Emotion,
  setParam: ParamWriter,
): void {
  const preset = EMOTION_PARAM_PRESETS[emotion] ?? EMOTION_PARAM_PRESETS.neutral
  for (const [id, value] of Object.entries(preset)) {
    try {
      setParam(id, value)
    } catch {
      /* 参数不存在则跳过 */
    }
  }
}
