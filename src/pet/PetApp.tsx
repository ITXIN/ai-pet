import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Live2DController, isCubismReady } from '../services/live2d/controller'
import { playBase64Audio, recordAudio, stopPlayback } from '../services/audio'
import { matchUserIntent, type UserIntent } from '../shared/intentRules'
import type { AppSettings, Emotion, MotionName, PetStatus } from '../shared/types'
import './pet.css'

const ALPHA_HIT = 10
/** 意图动作不被 LLM 覆盖的最短保护时间 */
const INTENT_LOCK_MS = 3200

export function PetApp() {
  const stageRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<Live2DController | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [status, setStatus] = useState<PetStatus>('idle')
  const [subtitle, setSubtitle] = useState('')
  const [error, setError] = useState('')
  const [modelError, setModelError] = useState('')
  const [textInput, setTextInput] = useState('')
  const [recording, setRecording] = useState(false)
  const stopRecordRef = useRef<(() => void) | null>(null)
  const toggleVoiceRef = useRef<() => Promise<void>>(async () => {})
  const [panelOpen, setPanelOpen] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState<0 | 1 | 2 | 3 | null>(
    null,
  )
  const [actLabel, setActLabel] = useState('')
  const dragRef = useRef<{
    active: boolean
    offsetX: number
    offsetY: number
  } | null>(null)
  const ignoreMouseRef = useRef<boolean | null>(null)
  const clickThroughRef = useRef(true)
  const intentLockUntilRef = useRef(0)
  const intentLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnBusyRef = useRef(false)

  function isIntentLocked(): boolean {
    return Date.now() < intentLockUntilRef.current
  }

  function isTurnBusy(): boolean {
    return (
      turnBusyRef.current ||
      status === 'thinking' ||
      status === 'speaking'
    )
  }

  async function interruptTurn(): Promise<void> {
    stopPlayback()
    controllerRef.current?.stopMouthSync()
    controllerRef.current?.stopSpeakingMotion()
    await window.aiPet.abortChat()
    turnBusyRef.current = false
    setStatus('idle')
  }

  function lockIntentMotion(label?: string): void {
    intentLockUntilRef.current = Date.now() + INTENT_LOCK_MS
    if (label) setActLabel(label)
    if (intentLockTimerRef.current) clearTimeout(intentLockTimerRef.current)
    intentLockTimerRef.current = setTimeout(() => {
      setActLabel('')
      intentLockTimerRef.current = null
    }, INTENT_LOCK_MS)
  }

  async function applyVisual(opts: {
    emotion?: Emotion
    motion?: MotionName
    text?: string
    speaking?: boolean
    fromIntent?: boolean
    skipMotion?: boolean
  }): Promise<void> {
    if (opts.text !== undefined) setSubtitle(opts.text)
    if (opts.emotion) {
      await controllerRef.current?.setEmotion(opts.emotion)
    }
    const shouldPlayMotion =
      Boolean(opts.motion) &&
      (opts.fromIntent || (!opts.skipMotion && !isIntentLocked()))
    if (shouldPlayMotion && opts.motion) {
      await controllerRef.current?.playMotion(opts.motion)
    }
    if (!opts.speaking) controllerRef.current?.stopMouthSync()
  }

  useEffect(() => {
    let disposed = false
    const unsubs: Array<() => void> = []

    async function boot() {
      try {
        if (!window.aiPet) {
          setModelError('桌面桥接未就绪，请刷新或使用 Electron 窗口')
          return
        }
        const s = await window.aiPet.getSettings()
        if (disposed) return
        setSettings(s)
        clickThroughRef.current = s.general.clickThrough !== false
        if (!s.general.onboardingDone) {
          setOnboardingStep(0)
        }

        if (!stageRef.current) return
        const controller = new Live2DController(stageRef.current)
        controllerRef.current = controller
        await controller.init(s.general.petWidth, s.general.petHeight)
        controller.setLifeOptions({
          autoBlink: s.general.autoBlink !== false,
          lookAt: s.general.lookAt !== false,
          idleEye: s.general.idleEye !== false,
          autoBreath: s.general.autoBreath !== false,
        })

        try {
          if (!isCubismReady()) {
            throw new Error('Live2D Cubism Core 未加载')
          }
          const url = await window.aiPet.resolveModelUrl(s.modelPath)
          const meta = await window.aiPet.getModelMeta(s.modelPath)
          controller.setModelMeta(meta)
          await controller.loadModel(url)
          window.aiPet.reportCapabilities(controller.getCapabilities())
          setModelError('')
        } catch (err) {
          setModelError(
            err instanceof Error ? err.message : '模型加载失败，请检查模型文件',
          )
        }

        if (clickThroughRef.current) {
          await window.aiPet.setIgnoreMouse(true)
          ignoreMouseRef.current = true
        } else {
          await window.aiPet.setIgnoreMouse(false)
          ignoreMouseRef.current = false
        }

        unsubs.push(
          window.aiPet.onSettingsChanged(async (next) => {
            setSettings(next)
            clickThroughRef.current = next.general.clickThrough !== false
            if (next.general.onboardingDone) setOnboardingStep(null)
            controller.setLifeOptions({
              autoBlink: next.general.autoBlink !== false,
              lookAt: next.general.lookAt !== false,
              idleEye: next.general.idleEye !== false,
              autoBreath: next.general.autoBreath !== false,
            })
            controller.resize(next.general.petWidth, next.general.petHeight)
            try {
              const url = await window.aiPet.resolveModelUrl(next.modelPath)
              const meta = await window.aiPet.getModelMeta(next.modelPath)
              controller.setModelMeta(meta)
              await controller.loadModel(url)
              window.aiPet.reportCapabilities(controller.getCapabilities())
              setModelError('')
            } catch (e) {
              setModelError(e instanceof Error ? e.message : '模型加载失败')
            }
            if (!clickThroughRef.current) {
              await window.aiPet.setIgnoreMouse(false)
              ignoreMouseRef.current = false
            }
          }),
        )

        unsubs.push(
          window.aiPet.onPetAction(async (payload) => {
            if (payload.fromIntent) {
              lockIntentMotion(
                payload.text?.replace(/^[（(]|[）)]$/g, '') || undefined,
              )
            }
            if (payload.textOnly) {
              if (payload.text !== undefined) setSubtitle(payload.text)
              return
            }
            await applyVisual({
              emotion: payload.emotion,
              motion: payload.motion,
              text: payload.text,
              speaking: payload.speaking,
              fromIntent: payload.fromIntent,
              skipMotion: payload.skipMotion,
            })
          }),
        )

        unsubs.push(
          window.aiPet.onPetStatus((st, message) => {
            setStatus(st)
            if (st === 'error' && message) setError(message)
            else if (st !== 'error') setError('')
          }),
        )

        unsubs.push(
          window.aiPet.onStartVoice(() => {
            void toggleVoiceRef.current()
          }),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : '初始化失败')
        setStatus('error')
      }
    }

    void boot()

    return () => {
      disposed = true
      unsubs.forEach((u) => u())
      if (intentLockTimerRef.current) clearTimeout(intentLockTimerRef.current)
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [])

  // 点击穿透：mousemove 命中交互区则捕获
  useEffect(() => {
    const isBrowser = document.documentElement.classList.contains(
      'browser-preview',
    )
    if (isBrowser) return

    let lastIgnore: boolean | null = null

    const applyIgnore = (shouldIgnore: boolean) => {
      if (lastIgnore === shouldIgnore && ignoreMouseRef.current === shouldIgnore) {
        return
      }
      lastIgnore = shouldIgnore
      ignoreMouseRef.current = shouldIgnore
      void window.aiPet.setIgnoreMouse(shouldIgnore)
    }

    const onMove = (e: MouseEvent) => {
      if (!clickThroughRef.current) {
        applyIgnore(false)
        return
      }
      if (dragRef.current?.active) return

      const target = e.target as HTMLElement | null
      const overUi = Boolean(
        target?.closest?.(
          '.pet-hud, .pet-subtitle, .pet-error, .pet-text-row, .pet-onboarding',
        ),
      )

      let overModel = false
      if (!overUi && controllerRef.current) {
        overModel =
          controllerRef.current.sampleAlpha(e.clientX, e.clientY) > ALPHA_HIT
      }

      applyIgnore(!(overUi || overModel))
    }

    const onLeave = () => {
      if (!clickThroughRef.current) return
      if (dragRef.current?.active) return
      applyIgnore(true)
    }

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // 视线跟随：指针在窗内时驱动；离开约 1s 后回中（注视滞留）
  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | null = null
    const onMove = (e: MouseEvent) => {
      if (clearTimer) {
        clearTimeout(clearTimer)
        clearTimer = null
      }
      controllerRef.current?.setLookAtFromClient(e.clientX, e.clientY)
    }
    const onLeave = () => {
      if (clearTimer) clearTimeout(clearTimer)
      clearTimer = setTimeout(() => {
        controllerRef.current?.clearLookAt()
        clearTimer = null
      }, 1000)
    }
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      if (clearTimer) clearTimeout(clearTimer)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  async function applyIntentNow(intent: UserIntent): Promise<void> {
    if (!intent.matched) return
    lockIntentMotion(intent.label)
    await applyVisual({
      emotion: intent.emotion,
      motion: intent.motion,
      text: intent.label ? `（${intent.label}）` : undefined,
      fromIntent: true,
    })
  }

  async function sendText() {
    if (!textInput.trim()) return
    if (isTurnBusy()) return
    const userText = textInput.trim()
    setError('')
    setTextInput('')
    setPanelOpen(true)

    const intent = matchUserIntent(userText)
    if (intent.matched) {
      await applyIntentNow(intent)
    }

    turnBusyRef.current = true
    setStatus('thinking')
    const result = await window.aiPet.chatText(userText)
    turnBusyRef.current = false
    if (result.error) {
      if (result.error === '已取消') {
        setStatus('idle')
        return
      }
      setError(
        result.error.includes('API Key')
          ? '还没有 API Key。请打开设置 → 大模型，填入后重试。'
          : result.error,
      )
      setStatus('error')
      return
    }
    // 主进程流式增量 + 终态已 apply；此处只兜底字幕与状态
    setSubtitle(result.reply.text)
    setStatus('idle')
    if (onboardingStep === 1) setOnboardingStep(2)
  }

  async function toggleVoice() {
    if (recording) {
      stopRecordRef.current?.()
      stopRecordRef.current = null
      setRecording(false)
      return
    }

    if (status === 'speaking' || status === 'thinking') {
      await interruptTurn()
      return
    }

    if (isTurnBusy()) return

    try {
      setError('')
      setStatus('listening')
      setRecording(true)
      const session = await recordAudio(12000)
      stopRecordRef.current = session.stop

      const audio = await session.done
      setRecording(false)
      stopRecordRef.current = null
      turnBusyRef.current = true
      setStatus('thinking')

      const result = await window.aiPet.chatVoice(audio.base64, audio.mimeType)
      turnBusyRef.current = false
      if (result.error) {
        if (result.error === '已取消') {
          setStatus('idle')
          return
        }
        setError(
          result.error.includes('API Key')
            ? '还没有 API Key。请打开设置 → 大模型，填入后重试。'
            : result.error.includes('麦克风')
              ? result.error
              : result.error,
        )
        setStatus('error')
        return
      }

      // 主进程意图预演 + 流式标签已 apply；此处播 TTS（合成仍等全文）
      setSubtitle(result.reply.text)

      if (result.audioBase64 && result.mimeType) {
        setStatus('speaking')
        const ctrl = controllerRef.current
        const playback = await playBase64Audio(
          result.audioBase64,
          result.mimeType,
          (level) => ctrl?.setMouthOpen(level),
          () => ctrl?.startSpeakingMotion(),
          () => {
            ctrl?.stopMouthSync()
            ctrl?.stopSpeakingMotion()
          },
        )
        await playback.done
      }
      setStatus('idle')
      if (onboardingStep === 1) setOnboardingStep(2)
    } catch (err) {
      setRecording(false)
      turnBusyRef.current = false
      setStatus('error')
      setError(
        err instanceof Error
          ? err.message
          : '麦克风不可用，请到「系统设置 → 隐私与安全性 → 麦克风」允许本应用',
      )
    }
  }

  toggleVoiceRef.current = toggleVoice

  async function finishOnboarding(): Promise<void> {
    setOnboardingStep(null)
    await window.aiPet.setSettings({
      general: {
        ...(settings?.general ?? {
          alwaysOnTop: true,
          petWidth: 360,
          petHeight: 480,
          showSubtitles: true,
          clickThrough: true,
          openAtLogin: false,
          onboardingDone: true,
          autoBlink: true,
          lookAt: true,
          idleEye: true,
          autoBreath: true,
        }),
        onboardingDone: true,
      },
    })
  }

  function onStagePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    if (document.documentElement.classList.contains('browser-preview')) return
    if (
      (e.target as HTMLElement).closest(
        '.pet-hud, .pet-subtitle, .pet-error, .pet-onboarding',
      )
    ) {
      return
    }

    const alpha = controllerRef.current?.sampleAlpha(e.clientX, e.clientY) ?? 0
    if (alpha <= ALPHA_HIT && !modelError) return

    if (clickThroughRef.current) {
      void window.aiPet.setIgnoreMouse(false)
      ignoreMouseRef.current = false
    }

    dragRef.current = {
      active: true,
      offsetX: e.screenX - window.screenX,
      offsetY: e.screenY - window.screenY,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (onboardingStep === 2) setOnboardingStep(3)
  }

  function onStagePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag?.active) return
    window.aiPet.moveWindowTo(
      e.screenX - drag.offsetX,
      e.screenY - drag.offsetY,
    )
  }

  function onStagePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current?.active) return
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const statusLabel: Record<PetStatus, string> = {
    idle: actLabel ? `表演：${actLabel}` : '待机',
    listening: recording ? '聆听中…再点停止' : '聆听中',
    thinking: actLabel ? `表演：${actLabel} · 思考中` : '思考中…',
    speaking: actLabel ? `表演：${actLabel} · 说话中` : '说话中…',
    error: '出错',
  }

  const onboardingCopy: Record<0 | 1 | 2 | 3, { title: string; body: string }> =
    {
      0: {
        title: '欢迎来到 AI Pet',
        body: '先填入你的 API Key，即可开始对话（一期自带 Key，不扣订阅）。',
      },
      1: {
        title: '试着说一句',
        body: '点「输入」发「你好」或「请跳舞」；有指令时角色会立刻动起来。',
      },
      2: {
        title: '拖一拖 · 点穿透',
        body: '按住角色可拖动。空白处可点穿到下层 App；点角色或底部按钮可交互。',
      },
      3: {
        title: '搞定啦',
        body: '菜单栏托盘可隐藏/显示桌宠。随时在设置里改形象与语音。',
      },
    }

  return (
    <div
      className="pet-root"
      ref={rootRef}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
    >
      <div className="pet-stage" ref={stageRef}>
        {modelError && (
          <div className="pet-fallback">
            <div className="pet-avatar-face" data-status={status}>
              <div className="eyes">
                <span />
                <span />
              </div>
              <div className="mouth" />
            </div>
            <p className="pet-fallback-hint">{modelError}</p>
          </div>
        )}
      </div>

      {settings?.general.showSubtitles && subtitle && (
        <div className="pet-subtitle">{subtitle}</div>
      )}

      {error && <div className="pet-error">{error}</div>}

      {onboardingStep !== null && (
        <div className="pet-onboarding">
          <strong>{onboardingCopy[onboardingStep].title}</strong>
          <p>{onboardingCopy[onboardingStep].body}</p>
          <div className="pet-onboarding-actions">
            {onboardingStep === 0 && (
              <button
                type="button"
                onClick={() => {
                  void window.aiPet.openSettings()
                  setOnboardingStep(1)
                }}
              >
                去填 Key
              </button>
            )}
            {onboardingStep === 1 && (
              <button
                type="button"
                onClick={() => {
                  setPanelOpen(true)
                  setTextInput('请跳舞')
                }}
              >
                试一句「请跳舞」
              </button>
            )}
            {onboardingStep < 3 ? (
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setOnboardingStep(
                    (onboardingStep + 1) as 0 | 1 | 2 | 3,
                  )
                }
              >
                下一步
              </button>
            ) : (
              <button type="button" onClick={() => void finishOnboarding()}>
                开始使用
              </button>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => void finishOnboarding()}
            >
              跳过
            </button>
          </div>
        </div>
      )}

      <div className={`pet-hud ${panelOpen ? 'open' : ''}`}>
        <div className="pet-status">{statusLabel[status]}</div>
        <div className="pet-actions">
          <button
            type="button"
            className={recording ? 'recording' : ''}
            onClick={() => void toggleVoice()}
          >
            {recording || status === 'speaking' || status === 'thinking'
              ? '停止'
              : '语音'}
          </button>
          <button type="button" onClick={() => setPanelOpen((v) => !v)}>
            {panelOpen ? '收起' : '输入'}
          </button>
          <button type="button" onClick={() => void window.aiPet.openSettings()}>
            设置
          </button>
        </div>
        {panelOpen && (
          <div className="pet-text-row">
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isTurnBusy()) void sendText()
              }}
              placeholder="打字聊天…试试「请跳舞」"
              disabled={status === 'thinking' || status === 'speaking'}
            />
            <button
              type="button"
              onClick={() => void sendText()}
              disabled={status === 'thinking' || status === 'speaking'}
            >
              发送
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
