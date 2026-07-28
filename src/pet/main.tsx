import { installBrowserBridge } from '../shared/browserBridge'

installBrowserBridge()

async function boot() {
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PetApp } = await import('./PetApp')

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <PetApp />
    </React.StrictMode>,
  )
}

boot().catch((err) => {
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `<pre style="padding:16px;color:#a00;white-space:pre-wrap;font:13px/1.4 ui-monospace,monospace">${
      err instanceof Error ? err.stack || err.message : String(err)
    }</pre>`
  }
  console.error(err)
})
