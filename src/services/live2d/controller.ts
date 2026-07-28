import * as PIXI from 'pixi.js'
import { Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import { EMOTION_EXPRESSION_MAP } from '../../shared/defaults'
import type {
  Emotion,
  ModelCapabilities,
  ModelMeta,
  MotionName,
} from '../../shared/types'
import {
  applyEmotionPreset,
  EMOTION_IDLE_INDEX,
} from './emotionPresets'
import { resolveMotion, resolveTalkGroup } from './motionResolve'

Live2DModel.registerTicker(PIXI.Ticker)

type CoreModel = {
  setParameterValueById?: (id: string, value: number) => void
}

export class Live2DController {
  private app: PIXI.Application | null = null
  private model: Live2DModel | null = null
  private container: HTMLElement
  private destroyed = false
  private capabilities: ModelCapabilities = {
    expressions: [],
    motionGroups: {},
    lipSyncParams: ['ParamMouthOpenY'],
  }
  private modelMeta: ModelMeta | null = null
  private mouthSmoothed = 0
  private lastEmotion: Emotion = 'neutral'
  private emotionMode: 'file' | 'preset' = 'preset'
  private emotionTicker: ((delta: number) => void) | null = null
  private afterMotionHandler: (() => void) | null = null
  private speaking = false
  private onSpeakingMotionFinish: (() => void) | null = null

  private applyPresetExcludingLip(): void {
    if (this.emotionMode !== 'preset') return
    const lip = new Set(this.capabilities.lipSyncParams)
    applyEmotionPreset(this.lastEmotion, (id, v) => {
      if (lip.has(id)) return
      this.setParam(id, v)
    })
  }

  constructor(container: HTMLElement) {
    this.container = container
  }

  async init(width: number, height: number): Promise<void> {
    if (this.app) return

    this.app = new PIXI.Application({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    this.container.appendChild(this.app.view as HTMLCanvasElement)
    const canvas = this.app.view as HTMLCanvasElement
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
  }

  getCanvas(): HTMLCanvasElement | null {
    return (this.app?.view as HTMLCanvasElement) ?? null
  }

  getCapabilities(): ModelCapabilities {
    return this.capabilities
  }

  setModelMeta(meta: ModelMeta | null): void {
    this.modelMeta = meta
  }

  async loadModel(modelUrl: string): Promise<void> {
    if (!this.app) throw new Error('Live2D 未初始化')

    this.stopSpeakingMotion(false)

    if (this.model) {
      this.app.stage.removeChild(this.model)
      this.model.destroy()
      this.model = null
    }

    const model = await Live2DModel.from(modelUrl, {
      autoInteract: false,
    })

    if (this.destroyed) {
      model.destroy()
      return
    }

    this.model = model
    this.capabilities = this.inspectCapabilities(model)
    this.fitModel()
    this.app.stage.addChild(model)

    model.on('hit', (hitAreas: string[]) => {
      if (hitAreas.length && !this.speaking) void this.playMotion('Tap')
    })

    void this.playMotion('Idle', MotionPriority.IDLE)
    void this.setEmotion('neutral')
  }

  private inspectCapabilities(model: Live2DModel): ModelCapabilities {
    const settings = model.internalModel.settings as {
      expressions?: Array<{ Name?: string; name?: string }>
      groups?: Array<{ Name?: string; Ids?: string[] }>
    }

    const expressions = (settings.expressions ?? [])
      .map((e) => e.Name ?? e.name ?? '')
      .filter(Boolean)

    const definitions = model.internalModel.motionManager.definitions as Record<
      string,
      unknown[] | undefined
    >
    const motionGroups: Record<string, number> = {}
    for (const [group, clips] of Object.entries(definitions)) {
      motionGroups[group] = clips?.length ?? 0
    }

    const lipGroup = settings.groups?.find(
      (g) => (g.Name ?? '').toLowerCase() === 'lipsync',
    )
    const lipSyncParams =
      lipGroup?.Ids && lipGroup.Ids.length > 0
        ? lipGroup.Ids
        : ['ParamMouthOpenY']

    return { expressions, motionGroups, lipSyncParams }
  }

  private fitModel(): void {
    if (!this.app || !this.model) return
    const { width, height } = this.app.screen
    const scale =
      Math.min(width / this.model.width, height / this.model.height) * 0.92
    this.model.scale.set(scale)
    this.model.x = width / 2
    this.model.y = height * 0.95
    this.model.anchor.set(0.5, 1)
  }

  resize(width: number, height: number): void {
    if (!this.app) return
    this.app.renderer.resize(width, height)
    this.fitModel()
  }

  private setParam(id: string, value: number): void {
    const core = this.model?.internalModel.coreModel as CoreModel | undefined
    core?.setParameterValueById?.(id, value)
  }

  private async applyExpressionName(name: string): Promise<boolean> {
    if (!this.model) return false
    try {
      await this.model.expression(name)
      this.emotionMode = 'file'
      this.stopEmotionTicker()
      return true
    } catch {
      return false
    }
  }

  async setEmotion(emotion: Emotion): Promise<void> {
    if (!this.model) return
    this.lastEmotion = emotion

    const mapped = this.modelMeta?.emotionMap?.[emotion]
    if (mapped !== undefined && mapped !== null && mapped !== '') {
      if (typeof mapped === 'number') {
        const byIndex = this.capabilities.expressions[mapped]
        if (byIndex && (await this.applyExpressionName(byIndex))) {
          console.debug('[live2d] emotionMap index', emotion, mapped, byIndex)
          return
        }
      } else {
        const names = this.capabilities.expressions
        const match = names.find(
          (n) => n.toLowerCase() === String(mapped).toLowerCase(),
        )
        if (match && (await this.applyExpressionName(match))) {
          console.debug('[live2d] emotionMap name', emotion, match)
          return
        }
        if (await this.applyExpressionName(String(mapped))) {
          console.debug('[live2d] emotionMap raw', emotion, mapped)
          return
        }
      }
    }

    const candidates = EMOTION_EXPRESSION_MAP[emotion] ?? ['normal']
    const names = this.capabilities.expressions

    for (const candidate of candidates) {
      const match = names.find(
        (n) => n.toLowerCase() === candidate.toLowerCase(),
      )
      if (match && (await this.applyExpressionName(match))) {
        console.debug('[live2d] expression file', emotion, '->', match)
        return
      }
    }

    this.emotionMode = 'preset'
    applyEmotionPreset(emotion, (id, v) => this.setParam(id, v))
    this.startEmotionTicker()
    console.debug('[live2d] emotion preset', emotion)
  }

  private startEmotionTicker(): void {
    this.stopEmotionTicker()
    if (!this.model) return
    this.afterMotionHandler = () => this.applyPresetExcludingLip()
    this.model.internalModel.on('afterMotionUpdate', this.afterMotionHandler)
    if (this.app) {
      this.emotionTicker = () => this.applyPresetExcludingLip()
      this.app.ticker.add(this.emotionTicker)
    }
  }

  private stopEmotionTicker(): void {
    if (this.model && this.afterMotionHandler) {
      this.model.internalModel.off('afterMotionUpdate', this.afterMotionHandler)
      this.afterMotionHandler = null
    }
    if (this.app && this.emotionTicker) {
      this.app.ticker.remove(this.emotionTicker)
      this.emotionTicker = null
    }
  }

  async playMotion(
    motion: MotionName,
    priority: MotionPriority = MotionPriority.FORCE,
  ): Promise<void> {
    if (!this.model) return
    if (this.speaking && priority === MotionPriority.FORCE) {
      // 说话循环中允许 FORCE 表演，但会短暂打断 Talk；表演后由 motionFinish 续上
    }

    const preferredIdle = EMOTION_IDLE_INDEX[this.lastEmotion]
    const resolved = resolveMotion(
      motion,
      this.capabilities,
      motion === 'Idle' ? preferredIdle : undefined,
      this.modelMeta?.idleMotionGroup,
    )

    console.debug('[live2d] motion resolve', motion, '->', resolved, priority)

    try {
      await this.model.motion(resolved.group, resolved.index, priority)
    } catch {
      try {
        await this.model.motion(resolved.group, undefined, priority)
      } catch {
        const fallback = Object.keys(this.capabilities.motionGroups)[0]
        if (fallback) await this.model.motion(fallback, undefined, priority)
      }
    }
  }

  private async playSpeakingClip(): Promise<void> {
    if (!this.model || !this.speaking) return
    const group = resolveTalkGroup(
      this.capabilities,
      this.modelMeta?.talkMotionGroup,
    )
    const count = this.capabilities.motionGroups[group] ?? 0
    const index = count > 0 ? Math.floor(Math.random() * count) : 0
    console.debug('[live2d] speaking motion', group, index)
    try {
      await this.model.motion(group, index, MotionPriority.IDLE)
    } catch {
      try {
        await this.model.motion(group, undefined, MotionPriority.IDLE)
      } catch {
        /* ignore */
      }
    }
  }

  /** TTS 开始：循环 Talk/Idle，不盖过口型参数 */
  startSpeakingMotion(): void {
    if (!this.model) return
    this.speaking = true
    const mm = this.model.internalModel.motionManager
    if (!this.onSpeakingMotionFinish) {
      this.onSpeakingMotionFinish = () => {
        if (this.speaking) void this.playSpeakingClip()
      }
    }
    mm.on('motionFinish', this.onSpeakingMotionFinish)
    void this.playSpeakingClip()
  }

  /** TTS 结束：停止说话循环并回 Idle */
  stopSpeakingMotion(returnIdle = true): void {
    this.speaking = false
    if (this.model && this.onSpeakingMotionFinish) {
      this.model.internalModel.motionManager.off(
        'motionFinish',
        this.onSpeakingMotionFinish,
      )
    }
    if (returnIdle && this.model) {
      void this.playMotion('Idle', MotionPriority.IDLE)
    }
  }

  /** 0~1，带平滑 */
  setMouthOpen(level: number): void {
    const target = Math.max(0, Math.min(1, level))
    this.mouthSmoothed = this.mouthSmoothed * 0.6 + target * 0.4
    for (const id of this.capabilities.lipSyncParams) {
      this.setParam(id, this.mouthSmoothed)
    }
  }

  /** @deprecated 改用音频 level 驱动；保留空实现避免旧调用报错 */
  startMouthSync(): void {
    /* no-op: use setMouthOpen from audio analyser */
  }

  stopMouthSync(): void {
    this.mouthSmoothed = 0
    for (const id of this.capabilities.lipSyncParams) {
      this.setParam(id, 0)
    }
  }

  hitTestModel(canvasX: number, canvasY: number): boolean {
    if (!this.model || !this.app) return false
    try {
      const hits = this.model.hitTest(canvasX, canvasY)
      return Boolean(hits && hits.length > 0)
    } catch {
      return false
    }
  }

  sampleAlpha(clientX: number, clientY: number): number {
    const canvas = this.getCanvas()
    if (!canvas || !this.app || !this.model) return 0
    const rect = canvas.getBoundingClientRect()
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return 0
    }

    const localX =
      ((clientX - rect.left) / rect.width) * this.app.screen.width
    const localY =
      ((clientY - rect.top) / rect.height) * this.app.screen.height

    try {
      const hits = this.model.hitTest(localX, localY)
      if (hits && hits.length > 0) return 255
    } catch {
      /* ignore */
    }

    return this.samplePixelAlpha(localX, localY)
  }

  private samplePixelAlpha(localX: number, localY: number): number {
    if (!this.app) return 0
    try {
      const renderer = this.app.renderer as PIXI.Renderer & {
        extract?: {
          pixels: (
            target?: PIXI.DisplayObject | PIXI.RenderTexture,
            frame?: PIXI.Rectangle,
          ) => Uint8Array
        }
        gl?: WebGLRenderingContext
      }

      const res = renderer.resolution || 1
      const x = Math.max(0, Math.floor(localX * res))
      const y = Math.max(0, Math.floor(localY * res))

      if (renderer.extract?.pixels) {
        const pixels = renderer.extract.pixels(
          this.app.stage,
          new PIXI.Rectangle(x, y, 1, 1),
        )
        if (pixels && pixels.length >= 4) return pixels[3]
      }

      const gl = renderer.gl
      if (gl) {
        const h = Math.floor(this.app.screen.height * res)
        const pixel = new Uint8Array(4)
        gl.readPixels(x, h - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        return pixel[3]
      }
    } catch {
      /* ignore */
    }
    return 0
  }

  destroy(): void {
    this.destroyed = true
    this.stopSpeakingMotion(false)
    this.stopEmotionTicker()
    this.stopMouthSync()
    if (this.model) {
      this.model.destroy()
      this.model = null
    }
    if (this.app) {
      this.app.destroy(true, { children: true })
      this.app = null
    }
  }
}

export function isCubismReady(): boolean {
  return typeof (window as unknown as { Live2DCubismCore?: unknown })
    .Live2DCubismCore !== 'undefined'
}
