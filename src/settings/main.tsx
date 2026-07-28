import { installBrowserBridge } from '../shared/browserBridge'

installBrowserBridge()

async function boot() {
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { SettingsApp } = await import('./SettingsApp')

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <SettingsApp />
    </React.StrictMode>,
  )
}

boot().catch((err) => {
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `<pre style="padding:16px;color:#a00;white-space:pre-wrap">${
      err instanceof Error ? err.message : String(err)
    }</pre>`
  }
  console.error(err)
})
