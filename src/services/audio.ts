export async function recordAudio(
  maxMs = 15000,
): Promise<{ base64: string; mimeType: string; stop: () => void; done: Promise<{ base64: string; mimeType: string }> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'

  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks: BlobPart[] = []

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  let resolveDone!: (v: { base64: string; mimeType: string }) => void
  let rejectDone!: (e: unknown) => void
  const done = new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  recorder.onstop = async () => {
    try {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks, { type: mimeType })
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      resolveDone({ base64, mimeType })
    } catch (err) {
      rejectDone(err)
    }
  }

  recorder.onerror = (e) => rejectDone(e)

  recorder.start()
  const timer = window.setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, maxMs)

  const stop = () => {
    clearTimeout(timer)
    if (recorder.state === 'recording') recorder.stop()
  }

  return {
    base64: '',
    mimeType,
    stop,
    done,
  }
}

function rmsFromTimeDomain(data: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / data.length)
}

/**
 * 用 Web Audio 播放，并通过 Analyser 回调实时音量 (0~1) 供口型驱动。
 */
export async function playBase64Audio(
  base64: string,
  mimeType: string,
  onLevel?: (level: number) => void,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const ctx = new AudioContext()
  const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0))
  const source = ctx.createBufferSource()
  source.buffer = audioBuffer

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  const data = new Uint8Array(analyser.frequencyBinCount)

  source.connect(analyser)
  analyser.connect(ctx.destination)

  let raf = 0
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    const rms = rmsFromTimeDomain(data)
    // 放大一点让嘴部更明显
    onLevel?.(Math.min(1, rms * 3.2))
    raf = requestAnimationFrame(tick)
  }

  return new Promise((resolve, reject) => {
    source.onended = () => {
      cancelAnimationFrame(raf)
      onLevel?.(0)
      onEnd?.()
      void ctx.close()
      resolve()
    }

    try {
      source.start(0)
      onStart?.()
      raf = requestAnimationFrame(tick)
    } catch (err) {
      cancelAnimationFrame(raf)
      void ctx.close()
      onEnd?.()
      reject(err)
    }
  })
}
