// ---------------------------------------------------------------------------
// PREVIEW ENTRY — every page in a plain browser, with sample data.
//
// Reachable only from src/renderer/preview.html (npm run preview / npm run
// shots). electron-vite never builds this file: main.tsx is the real app.
//
// URL options (all optional; the bar at the top changes page, theme and mode):
//   ?page=tasks          tool id or route ("/tasks") - see src/renderer/src/tools.ts
//   ?theme=forest        palette id - any of PALETTES in shared/appearance.ts
//   ?mode=dark           dark | light
//   ?style=minimal       modern (default) | minimal
//   ?density=compact     compact | comfortable (default) | spacious
//   ?font=serif          system (default) | clean | serif | mono
//   ?radius=round        sharp | soft (default) | round
//   ?size=large          small | default | large
//   ?sidebar=collapsed   collapsed | open (overrides the window width rule)
//   ?pinned=trades,habits the Pinned list, without a click (comma-separated tool ids)
//   ?palette=1           open the command palette
//
// Examples:  ?page=tasks&theme=forest&mode=dark
//            ?page=notes&theme=default&mode=light&palette=1
//
// The fake API in ./fakeApi.ts answers every window.api call from
// ./fixtures.ts. Nothing here touches the real database.
// ---------------------------------------------------------------------------
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { Sidebar } from '../components/Sidebar'
import { PaletteHost } from '../components/PaletteHost'
import { UndoToast } from '../components/UndoToast'
import { TOOLS, findTool } from '../tools'
import type { OpenTarget } from '../lib/navigation'
import { useSettings } from '../lib/settingsStore'
import { PALETTES } from '../../../shared/appearance'
import '../styles.css'
import { installFakeApi } from './fakeApi'
import { previewOptions } from './options'

// Install the fake API BEFORE anything that reads it is loaded.
installFakeApi()

// Navigation that updates the URL, so every page state can be linked and screenshotted.
function setParam(key: string, value: string): void {
  const params = new URLSearchParams(window.location.search)
  params.set(key, value)
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
}

// `mode` and `theme` change live, so they are read from the URL on every render
// (the selects change the URL and reload, which is the simplest correct path).
function PreviewBar({ page }: { page: string }) {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode') === 'dark' ? 'dark' : 'light'
  const theme = params.get('theme') ?? 'default'
  return (
    <div className="preview-bar" role="region" aria-label="Preview options">
      <span className="preview-bar-title">Preview</span>
      <label className="preview-bar-field">
        Page
        <select value={page} onChange={(e) => { setParam('page', e.target.value); window.location.reload() }} aria-label="Page">
          {TOOLS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <label className="preview-bar-field">
        Theme
        <select value={theme} onChange={(e) => { setParam('theme', e.target.value); window.location.reload() }} aria-label="Theme">
          {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <button type="button" className="btn btn-sm" aria-pressed={mode === 'dark'}
        onClick={() => { setParam('mode', mode === 'dark' ? 'light' : 'dark'); window.location.reload() }}>
        {mode === 'dark' ? 'Dark' : 'Light'}
      </button>
      <span className="preview-bar-meta">sample data, not saved. Today is 2026-11-05.</span>
    </div>
  )
}

// The look comes from the URL. previewOptions() applies theme, palette, style,
// density, font, radius and text size to the page (no settings write).
const options = previewOptions(new URLSearchParams(window.location.search))

function PreviewApp() {
  const requested = options.page
  const tool = findTool(requested) ?? TOOLS[0]
  const [active, setActive] = useState(tool.id)
  const [target, setTarget] = useState<OpenTarget | null>(null)
  // ?palette=1 opens the command palette on load.
  const [paletteOpen, setPaletteOpen] = useState(options.palette)
  // Subscribed so a theme change in the bar re-renders the page and sidebar.
  const settings = useSettings()
  // ?pinned=… asked for a Pinned list: it is drawn from the URL, so the page's own settings load (which brings
  // the sample pins) cannot put them back.
  const pins = options.pinnedTools.length > 0 ? options.pinnedTools : settings.pinnedTools

  const navigate = (where: string): void => {
    const t = findTool(where)
    if (!t) return
    setActive(t.id)
    setParam('page', t.id)
  }
  const open = (t: OpenTarget): void => { setTarget(t); navigate(t.module) }

  const Page = (findTool(active) ?? TOOLS[0]).component
  return (
    <div className="flex h-full flex-col">
      <PreviewBar page={active} />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={active} onSelect={navigate} tools={TOOLS} pinned={pins} />
        <main tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
          <Page target={target} onTargetHandled={() => setTarget(null)} onOpen={open} onNavigate={navigate} />
        </main>
        {paletteOpen && (
          <PaletteHost active={active} navigate={(w) => { setPaletteOpen(false); navigate(w) }}
            open={(t) => { setPaletteOpen(false); open(t) }} onClose={() => setPaletteOpen(false)} tools={TOOLS} />
        )}
        <UndoToast />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<PreviewApp />)
