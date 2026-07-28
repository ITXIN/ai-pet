import { useEffect, useState } from 'react'
import type { AppSettings, ModelInfo, UpdateCheckResult } from '../shared/types'
import './settings.css'

type Tab = 'avatar' | 'llm' | 'voice' | 'general'

function licenseLabel(license?: ModelInfo['license']): string {
  if (license === 'commercial') return '可商用'
  if (license === 'custom') return '本地导入'
  return '示例（不可商用）'
}

export function SettingsApp() {
  const [tab, setTab] = useState<Tab>('llm')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [savedHint, setSavedHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState('')
  const [updateHint, setUpdateHint] = useState('')
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false)

  useEffect(() => {
    void (async () => {
      const s = await window.aiPet.getSettings()
      setSettings(s)
      setModels(await window.aiPet.listModels())
      setVersion(await window.aiPet.getVersion())
      setShowOnboardingBanner(!s.general.onboardingDone || !s.llm.apiKey.trim())
      if (!s.llm.apiKey.trim()) setTab('llm')
    })()
    const off = window.aiPet.onSettingsChanged((s) => {
      setSettings(s)
      setShowOnboardingBanner(!s.general.onboardingDone || !s.llm.apiKey.trim())
    })
    return off
  }, [])

  async function save(partial: Partial<AppSettings>) {
    setBusy(true)
    try {
      const next = await window.aiPet.setSettings(partial)
      setSettings(next)
      setSavedHint('已保存')
      setTimeout(() => setSavedHint(''), 1500)
    } finally {
      setBusy(false)
    }
  }

  async function runCheckUpdate() {
    setBusy(true)
    setUpdateHint('检查中…')
    try {
      const result: UpdateCheckResult = await window.aiPet.checkUpdate()
      setUpdateHint(result.message)
      if (result.releaseUrl && result.hasUpdate) {
        window.open(result.releaseUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      setUpdateHint(err instanceof Error ? err.message : '检查失败')
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return <div className="settings-loading">加载中…</div>
  }

  return (
    <div className="settings-root">
      <aside className="settings-nav">
        <h1>AI Pet</h1>
        {(
          [
            ['avatar', '形象'],
            ['llm', '大模型'],
            ['voice', '语音'],
            ['general', '通用'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <div className="settings-hint">{savedHint}</div>
        <div className="settings-version">v{version || '…'}</div>
      </aside>

      <main className="settings-main">
        {showOnboardingBanner && (
          <div className="onboarding-banner">
            <strong>首次设置</strong>
            <p>
              1）在「大模型」填入 API Key → 2）回宠物窗试一句「你好」或「请跳舞」→
              3）拖动角色试试点击穿透。
            </p>
          </div>
        )}

        {tab === 'avatar' && (
          <section>
            <h2>虚拟形象</h2>
            <p className="desc">
              选择内置 Live2D，或导入已获授权的商用角色包（目录含 `.model3.json` +
              可选 `model.meta.json`）。
            </p>
            <div className="model-list">
              {models.length === 0 && (
                <p className="empty">
                  暂无模型。请将 Cubism 4 模型放到 `public/models/` 或点击导入。
                </p>
              )}
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={
                    settings.modelPath === m.path || settings.modelId === m.id
                      ? 'model-card active'
                      : 'model-card'
                  }
                  disabled={busy}
                  onClick={() =>
                    void save({ modelId: m.id, modelPath: m.path })
                  }
                >
                  <strong>{m.name}</strong>
                  <span>
                    {m.builtin ? '内置' : '本地'} · {licenseLabel(m.license)}
                  </span>
                </button>
              ))}
            </div>
            <p className="desc warn">
              Hiyori / Mao 为 Live2D 官方示例，仅供开发演示，不可作为商用默认形象对外售卖。
              商用请放入已授权角色包，并在 `model.meta.json` 写 `"license":"commercial"`。
            </p>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={async () => {
                const p = await window.aiPet.pickModelDir()
                if (p) setModels(await window.aiPet.listModels())
              }}
            >
              导入本地 / 商用模型目录
            </button>
          </section>
        )}

        {tab === 'llm' && (
          <section>
            <h2>大模型</h2>
            <p className="desc">
              兼容 OpenAI API（OpenAI / DeepSeek / 本地网关等）。一期为 BYOK：Key
              仅存本机。
            </p>
            {!settings.llm.apiKey.trim() && (
              <p className="desc warn">尚未填写 API Key，对话与语音将不可用。</p>
            )}
            <label>
              Base URL
              <input
                value={settings.llm.baseURL}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: { ...settings.llm, baseURL: e.target.value },
                  })
                }
              />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={settings.llm.apiKey}
                placeholder="sk-..."
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: { ...settings.llm, apiKey: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Model
              <input
                value={settings.llm.model}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: { ...settings.llm, model: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Temperature ({settings.llm.temperature})
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={settings.llm.temperature}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: {
                      ...settings.llm,
                      temperature: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              System Prompt
              <textarea
                rows={8}
                value={settings.llm.systemPrompt}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    llm: { ...settings.llm, systemPrompt: e.target.value },
                  })
                }
              />
            </label>
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void save({ llm: settings.llm })}
              >
                保存
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void window.aiPet.clearHistory()}
              >
                清空对话历史
              </button>
            </div>
          </section>
        )}

        {tab === 'voice' && (
          <section>
            <h2>语音</h2>
            <p className="desc">
              STT 使用 Whisper，TTS 使用 OpenAI TTS（同一 Base URL / API Key）。
              麦克风仅用于语音对话转写，音频不会上传到本项目服务器。
            </p>
            <label>
              STT Model
              <input
                value={settings.voice.sttModel}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    voice: { ...settings.voice, sttModel: e.target.value },
                  })
                }
              />
            </label>
            <label>
              TTS Model
              <input
                value={settings.voice.ttsModel}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    voice: { ...settings.voice, ttsModel: e.target.value },
                  })
                }
              />
            </label>
            <label>
              TTS Voice
              <select
                value={settings.voice.ttsVoice}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    voice: { ...settings.voice, ttsVoice: e.target.value },
                  })
                }
              >
                {['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              语言代码
              <input
                value={settings.voice.language}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    voice: { ...settings.voice, language: e.target.value },
                  })
                }
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void save({ voice: settings.voice })}
            >
              保存
            </button>
          </section>
        )}

        {tab === 'general' && (
          <section>
            <h2>通用</h2>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.general.alwaysOnTop}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      alwaysOnTop: e.target.checked,
                    },
                  })
                }
              />
              窗口置顶
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.general.showSubtitles}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      showSubtitles: e.target.checked,
                    },
                  })
                }
              />
              显示字幕气泡
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.general.clickThrough !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      clickThrough: e.target.checked,
                    },
                  })
                }
              />
              点击穿透（空白处点穿到下层窗口）
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Boolean(settings.general.openAtLogin)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      openAtLogin: e.target.checked,
                    },
                  })
                }
              />
              开机时启动（可隐藏启动）
            </label>
            <p className="desc">
              开机启动仅在打包后的 dmg 应用中生效；开发模式（npm run
              dev）下 macOS 会拒绝写入登录项。
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.general.autoBlink !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      autoBlink: e.target.checked,
                    },
                  })
                }
              />
              自动眨眼
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.general.lookAt !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      lookAt: e.target.checked,
                    },
                  })
                }
              />
              视线跟随鼠标
            </label>
            <p className="desc">
              眨眼 / 注视参考 AIRI 等 Live2D 伴侣的「生命感」做法；说话时会暂停眨眼以免抢口型。
            </p>
            <label>
              宽度 ({settings.general.petWidth}px)
              <input
                type="range"
                min={240}
                max={640}
                value={settings.general.petWidth}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      petWidth: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              高度 ({settings.general.petHeight}px)
              <input
                type="range"
                min={320}
                max={800}
                value={settings.general.petHeight}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    general: {
                      ...settings.general,
                      petHeight: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void save({ general: settings.general })}
              >
                保存
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runCheckUpdate()}
              >
                检查更新
              </button>
            </div>
            {updateHint && <p className="desc">{updateHint}</p>}
            <p className="desc">
              当前版本 v{version}。正式分发为 dmg（未签名时需在「隐私与安全性」中允许打开）。
            </p>
          </section>
        )}
      </main>
    </div>
  )
}
