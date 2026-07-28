import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../src/shared/types'
import type {
  AppSettings,
  ModelCapabilities,
  PetActionPayload,
  PetStatus,
  TextTurnResult,
  VoiceTurnResult,
  ModelInfo,
  ModelMeta,
  UpdateCheckResult,
} from '../src/shared/types'

contextBridge.exposeInMainWorld('aiPet', {
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.SETTINGS_GET),

  setSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, partial),

  openSettings: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_OPEN),

  quit: (): Promise<void> => ipcRenderer.invoke(IPC.APP_QUIT),

  chatText: (text: string): Promise<TextTurnResult> =>
    ipcRenderer.invoke(IPC.CHAT_TEXT, text),

  chatVoice: (
    audioBase64: string,
    mimeType: string,
  ): Promise<VoiceTurnResult> =>
    ipcRenderer.invoke(IPC.CHAT_VOICE, audioBase64, mimeType),

  abortChat: (): Promise<void> => ipcRenderer.invoke(IPC.CHAT_ABORT),

  clearHistory: (): Promise<void> =>
    ipcRenderer.invoke(IPC.CHAT_HISTORY_CLEAR),

  listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.MODEL_LIST),

  pickModelDir: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.MODEL_PICK_DIR),

  setIgnoreMouse: (ignore: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.WINDOW_SET_IGNORE_MOUSE, ignore),

  resolveModelUrl: (modelPath: string): Promise<string> =>
    ipcRenderer.invoke('model:resolve-url', modelPath),

  getModelMeta: (modelPath: string): Promise<ModelMeta | null> =>
    ipcRenderer.invoke(IPC.MODEL_GET_META, modelPath),

  moveWindowTo: (x: number, y: number): void => {
    ipcRenderer.send(IPC.WINDOW_MOVE_TO, x, y)
  },

  reportCapabilities: (caps: ModelCapabilities): void => {
    ipcRenderer.send(IPC.MODEL_CAPABILITIES, caps)
  },

  togglePetWindow: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_TOGGLE),

  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION),

  checkUpdate: (): Promise<UpdateCheckResult> =>
    ipcRenderer.invoke(IPC.APP_CHECK_UPDATE),

  onPetAction: (cb: (payload: PetActionPayload) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: PetActionPayload) =>
      cb(payload)
    ipcRenderer.on(IPC.PET_APPLY_ACTION, listener)
    return () => ipcRenderer.removeListener(IPC.PET_APPLY_ACTION, listener)
  },

  onPetStatus: (cb: (status: PetStatus, message?: string) => void) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      status: PetStatus,
      message?: string,
    ) => cb(status, message)
    ipcRenderer.on(IPC.PET_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC.PET_STATUS, listener)
  },

  onSettingsChanged: (cb: (settings: AppSettings) => void) => {
    const listener = (_: Electron.IpcRendererEvent, settings: AppSettings) =>
      cb(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  },

  onStartVoice: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('pet:start-voice', listener)
    return () => ipcRenderer.removeListener('pet:start-voice', listener)
  },
})
