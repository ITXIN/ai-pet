import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  handleClearHistory,
  handleTextChat,
  handleVoiceChat,
  abortActiveChat,
  setModelCapabilities,
} from './ai'
import { matchUserIntent } from '../src/shared/intentRules'
import { mergeReplyWithIntent } from '../src/shared/mergeReply'
import { getSettings, setSettings } from './store'
import { IPC } from '../src/shared/types'
import type {
  AppSettings,
  ModelCapabilities,
  ModelInfo,
  ModelMeta,
  UpdateCheckResult,
} from '../src/shared/types'

const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, '../public')

let petWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null

const RELEASES_API =
  process.env.AIPET_RELEASES_API ||
  'https://api.github.com/repos/ITXIN/ai-pet/releases/latest'
const RELEASES_PAGE =
  process.env.AIPET_RELEASES_PAGE ||
  'https://github.com/ITXIN/ai-pet/releases'

function modelsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'models')
  }
  return path.join(process.env.VITE_PUBLIC!, 'models')
}

function resolveModelPath(relativeOrAbsolute: string): string {
  if (path.isAbsolute(relativeOrAbsolute)) return relativeOrAbsolute
  const fromPublic = path.join(process.env.VITE_PUBLIC!, relativeOrAbsolute)
  if (fs.existsSync(fromPublic)) return fromPublic
  const stripped = relativeOrAbsolute.replace(/^models[\\/]/, '')
  return path.join(modelsRoot(), stripped)
}

function readModelMetaFile(dir: string): ModelMeta | null {
  const metaPath = path.join(dir, 'model.meta.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ModelMeta
  } catch {
    return null
  }
}

function readModelLicense(
  dir: string,
): 'sample' | 'commercial' | 'custom' {
  const meta = readModelMetaFile(dir)
  if (!meta?.license) return 'sample'
  if (meta.license === 'commercial') return 'commercial'
  if (meta.license === 'custom') return 'custom'
  return 'sample'
}

function getModelMetaForPath(modelPath: string): ModelMeta | null {
  const absolute = resolveModelPath(modelPath)
  const dir = path.dirname(absolute)
  return readModelMetaFile(dir)
}

function listBuiltinModels(): ModelInfo[] {
  const root = modelsRoot()
  if (!fs.existsSync(root)) return []

  const results: ModelInfo[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('_')) continue
    const dir = path.join(root, entry.name)
    const modelJson = fs
      .readdirSync(dir)
      .find((f) => f.endsWith('.model3.json'))
    if (!modelJson) continue
    const license = readModelLicense(dir)
    results.push({
      id: `builtin-${entry.name}`,
      name: entry.name,
      path: `models/${entry.name}/${modelJson}`,
      builtin: true,
      license,
    })
  }
  return results
}

function listAllModels(): ModelInfo[] {
  const settings = getSettings()
  const builtin = listBuiltinModels()
  const custom: ModelInfo[] = settings.customModelPaths
    .filter((p) => fs.existsSync(p))
    .map((p, i) => ({
      id: `custom-${i}-${path.basename(path.dirname(p))}`,
      name: path.basename(path.dirname(p)),
      path: p,
      builtin: false,
      license: 'custom' as const,
    }))
  return [...builtin, ...custom]
}

function petHtmlUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return `${process.env.VITE_DEV_SERVER_URL}/pet.html`
  }
  return `file://${path.join(process.env.DIST!, 'pet.html')}`
}

function settingsHtmlUrl(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return `${process.env.VITE_DEV_SERVER_URL}/settings.html`
  }
  return `file://${path.join(process.env.DIST!, 'settings.html')}`
}

function applyOpenAtLogin(enabled: boolean): void {
  // 开发态（未签名 / Vite 拉起的 Electron）macOS 常拒绝改 Login Item，会打
  // “Unable to set login item: Operation not permitted”。仅打包后应用。
  if (!app.isPackaged) {
    return
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    })
  } catch (err) {
    console.warn('setLoginItemSettings failed', err)
  }
}

function createPetWindow(): BrowserWindow {
  const settings = getSettings()
  const display = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: settings.general.petWidth,
    height: settings.general.petHeight,
    x: display.width - settings.general.petWidth - 40,
    y: display.height - settings.general.petHeight - 40,
    transparent: true,
    frame: false,
    alwaysOnTop: settings.general.alwaysOnTop,
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.loadURL(petHtmlUrl())

  win.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: '语音对话',
        click: () => win.webContents.send('pet:start-voice'),
      },
      {
        label: '打开设置',
        click: () => openSettingsWindow(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit(),
      },
    ])
    menu.popup({ window: win })
  })

  return win
}

function openSettingsWindow(focusOnboarding = false): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    if (focusOnboarding) {
      settingsWindow.webContents.send('settings:focus-onboarding')
    }
    return
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'AI Pet 设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  settingsWindow.loadURL(settingsHtmlUrl())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  if (focusOnboarding) {
    settingsWindow.webContents.once('did-finish-load', () => {
      settingsWindow?.webContents.send('settings:focus-onboarding')
    })
  }
}

function togglePetWindow(): void {
  if (!petWindow || petWindow.isDestroyed()) {
    petWindow = createPetWindow()
    return
  }
  if (petWindow.isVisible()) petWindow.hide()
  else {
    petWindow.show()
    petWindow.focus()
  }
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.env.DIST!, 'tray-icon.png')
    : path.join(process.env.VITE_PUBLIC!, 'tray-icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty()
  } else {
    icon = icon.resize({ width: 16, height: 16 })
  }
  tray = new Tray(icon)
  tray.setToolTip('AI Pet')

  const rebuild = () => {
    const visible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible())
    const menu = Menu.buildFromTemplate([
      {
        label: visible ? '隐藏桌宠' : '显示桌宠',
        click: () => togglePetWindow(),
      },
      {
        label: '打开设置',
        click: () => openSettingsWindow(),
      },
      {
        label: '检查更新',
        click: async () => {
          const result = await checkForUpdate()
          dialog.showMessageBox({
            type: 'info',
            title: '检查更新',
            message: result.message,
            buttons: result.releaseUrl ? ['打开发布页', '关闭'] : ['关闭'],
          }).then(({ response }) => {
            if (result.releaseUrl && response === 0) {
              void shell.openExternal(result.releaseUrl)
            }
          })
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => app.quit(),
      },
    ])
    tray?.setContextMenu(menu)
  }

  rebuild()
  tray.on('click', () => {
    togglePetWindow()
    rebuild()
  })
  tray.on('right-click', () => rebuild())
}

function broadcastSettings(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', settings)
  }
}

async function checkForUpdate(): Promise<UpdateCheckResult> {
  const current = app.getVersion()
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ai-pet' },
    })
    if (!res.ok) {
      return {
        current,
        latest: null,
        hasUpdate: false,
        releaseUrl: RELEASES_PAGE,
        message: `当前版本 v${current}。无法拉取最新版本（${res.status}），可手动查看发布页。`,
      }
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = (data.tag_name || '').replace(/^v/, '')
    const hasUpdate = Boolean(latest && latest !== current)
    return {
      current,
      latest: latest || null,
      hasUpdate,
      releaseUrl: data.html_url || RELEASES_PAGE,
      message: hasUpdate
        ? `发现新版本 v${latest}（当前 v${current}）`
        : `已是最新版本 v${current}`,
    }
  } catch (err) {
    return {
      current,
      latest: null,
      hasUpdate: false,
      releaseUrl: RELEASES_PAGE,
      message: `当前版本 v${current}。检查更新失败：${
        err instanceof Error ? err.message : String(err)
      }`,
    }
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC.SETTINGS_SET, (_e, partial: Partial<AppSettings>) => {
    const next = setSettings(partial)
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.setAlwaysOnTop(next.general.alwaysOnTop)
      petWindow.setSize(next.general.petWidth, next.general.petHeight)
      if (!next.general.clickThrough) {
        petWindow.setIgnoreMouseEvents(false)
      }
    }
    if (partial.general && 'openAtLogin' in partial.general) {
      applyOpenAtLogin(Boolean(next.general.openAtLogin))
    }
    broadcastSettings(next)
    return next
  })

  ipcMain.handle(IPC.SETTINGS_OPEN, () => {
    openSettingsWindow()
  })

  ipcMain.handle(IPC.APP_QUIT, () => app.quit())

  ipcMain.handle(IPC.WINDOW_TOGGLE, () => {
    togglePetWindow()
  })

  ipcMain.handle(IPC.APP_GET_VERSION, () => app.getVersion())

  ipcMain.handle(IPC.APP_CHECK_UPDATE, () => checkForUpdate())

  ipcMain.handle(IPC.CHAT_TEXT, async (_e, text: string) => {
    if (petWindow) petWindow.webContents.send(IPC.PET_STATUS, 'thinking')
    const intent = matchUserIntent(text)
    let streamedMotion = false
    const result = await handleTextChat(text, (delta) => {
      if (!petWindow || petWindow.isDestroyed()) return
      const skipMotion =
        intent.matched || streamedMotion || !delta.motionChanged
      if (delta.motionChanged && !intent.matched) streamedMotion = true
      petWindow.webContents.send(IPC.PET_APPLY_ACTION, {
        emotion: delta.emotion,
        motion: delta.motion,
        text: delta.text || undefined,
        speaking: false,
        skipMotion,
        streamPartial: true,
        textOnly:
          !delta.emotionChanged && !delta.motionChanged && delta.textChanged,
      })
    })
    if (petWindow) {
      if (result.error) {
        if (result.error === '已取消') {
          petWindow.webContents.send(IPC.PET_STATUS, 'idle')
        } else {
          petWindow.webContents.send(IPC.PET_STATUS, 'error', result.error)
        }
      } else {
        const merged = mergeReplyWithIntent(result.reply, intent)
        petWindow.webContents.send(IPC.PET_APPLY_ACTION, {
          emotion: merged.emotion,
          motion: merged.motion,
          text: merged.text,
          speaking: false,
          // 流中或意图已演过；终态只对齐字幕/表情
          skipMotion: intent.matched || streamedMotion,
        })
        petWindow.webContents.send(IPC.PET_STATUS, 'idle')
        result.reply = {
          ...result.reply,
          emotion: merged.emotion,
          motion: merged.motion,
          text: merged.text,
        }
      }
    }
    return result
  })

  ipcMain.handle(
    IPC.CHAT_VOICE,
    async (_e, audioBase64: string, mimeType: string) => {
      if (petWindow) petWindow.webContents.send(IPC.PET_STATUS, 'thinking')
      let voiceIntent = matchUserIntent('')
      let streamedMotion = false
      const result = await handleVoiceChat(
        audioBase64,
        mimeType,
        (userText) => {
          voiceIntent = matchUserIntent(userText)
          if (!voiceIntent.matched || !petWindow || petWindow.isDestroyed())
            return
          petWindow.webContents.send(IPC.PET_APPLY_ACTION, {
            emotion: voiceIntent.emotion ?? 'neutral',
            motion: voiceIntent.motion ?? 'Idle',
            text: voiceIntent.label ? `（${voiceIntent.label}）` : undefined,
            speaking: false,
            fromIntent: true,
          })
        },
        (delta) => {
          if (!petWindow || petWindow.isDestroyed()) return
          const skipMotion =
            voiceIntent.matched || streamedMotion || !delta.motionChanged
          if (delta.motionChanged && !voiceIntent.matched) streamedMotion = true
          petWindow.webContents.send(IPC.PET_APPLY_ACTION, {
            emotion: delta.emotion,
            motion: delta.motion,
            text: delta.text || undefined,
            speaking: false,
            skipMotion,
            streamPartial: true,
            textOnly:
              !delta.emotionChanged &&
              !delta.motionChanged &&
              delta.textChanged,
          })
        },
      )
      if (petWindow) {
        if (result.error) {
          if (result.error === '已取消') {
            petWindow.webContents.send(IPC.PET_STATUS, 'idle')
          } else {
            petWindow.webContents.send(IPC.PET_STATUS, 'error', result.error)
          }
        } else {
          const merged = mergeReplyWithIntent(result.reply, voiceIntent)
          result.reply = {
            ...result.reply,
            emotion: merged.emotion,
            motion: merged.motion,
            text: merged.text,
          }
          petWindow.webContents.send(IPC.PET_APPLY_ACTION, {
            emotion: merged.emotion,
            motion: merged.motion,
            text: merged.text,
            speaking: Boolean(result.audioBase64),
            skipMotion: voiceIntent.matched || streamedMotion,
          })
          petWindow.webContents.send(
            IPC.PET_STATUS,
            result.audioBase64 ? 'speaking' : 'idle',
          )
        }
      }
      return result
    },
  )

  ipcMain.handle(IPC.CHAT_ABORT, () => {
    abortActiveChat()
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send(IPC.PET_STATUS, 'idle')
    }
  })

  ipcMain.handle(IPC.CHAT_HISTORY_CLEAR, () => {
    handleClearHistory()
  })

  ipcMain.handle(IPC.MODEL_LIST, () => listAllModels())

  ipcMain.handle(IPC.MODEL_GET_META, (_e, modelPath: string) => {
    return getModelMetaForPath(modelPath)
  })

  ipcMain.handle(IPC.MODEL_PICK_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择 Live2D 模型目录（含 .model3.json）',
    })
    if (result.canceled || !result.filePaths[0]) return null

    const dir = result.filePaths[0]
    const modelJson = fs
      .readdirSync(dir)
      .find((f) => f.endsWith('.model3.json'))
    if (!modelJson) {
      dialog.showErrorBox(
        '无效模型',
        '所选目录中未找到 .model3.json 文件',
      )
      return null
    }

    const modelPath = path.join(dir, modelJson)
    const settings = getSettings()
    const custom = Array.from(
      new Set([...settings.customModelPaths, modelPath]),
    )
    setSettings({
      customModelPaths: custom,
      modelId: `custom-${path.basename(dir)}`,
      modelPath,
    })
    broadcastSettings(getSettings())
    return modelPath
  })

  ipcMain.handle(IPC.WINDOW_SET_IGNORE_MOUSE, (_e, ignore: boolean) => {
    if (!petWindow || petWindow.isDestroyed()) return
    if (ignore) {
      petWindow.setIgnoreMouseEvents(true, { forward: true })
    } else {
      petWindow.setIgnoreMouseEvents(false)
    }
  })

  ipcMain.on(IPC.WINDOW_MOVE_TO, (e, x: number, y: number) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? petWindow
    if (!win || win.isDestroyed()) return
    win.setPosition(Math.round(x), Math.round(y))
  })

  ipcMain.on(IPC.MODEL_CAPABILITIES, (_e, caps: ModelCapabilities) => {
    setModelCapabilities(caps)
  })

  ipcMain.handle('model:resolve-url', (_e, modelPath: string) => {
    const absolute = resolveModelPath(modelPath)
    return pathToFileURLSafe(absolute)
  })
}

function pathToFileURLSafe(filePath: string): string {
  const resolved = path.resolve(filePath)
  let url = `file://${resolved}`
  if (process.platform === 'win32') {
    url = `file:///${resolved.replace(/\\/g, '/')}`
  }
  return url
}

app.whenReady().then(() => {
  registerIpc()
  const settings = getSettings()
  applyOpenAtLogin(Boolean(settings.general.openAtLogin))
  petWindow = createPetWindow()
  createTray()

  // macOS：无窗口时点 Dock 恢复
  app.on('activate', () => {
    if (!petWindow || petWindow.isDestroyed()) {
      petWindow = createPetWindow()
    } else {
      petWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  // 保留托盘，不因关窗退出（Mac 桌宠习惯）
  if (process.platform !== 'darwin') {
    if (!tray) app.quit()
  }
})
