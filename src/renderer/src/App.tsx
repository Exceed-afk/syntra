import { useCallback, useEffect, useState } from 'react'
import { Sidebar, SIDEBAR_NARROW } from './components/Sidebar'
import { PaletteHost } from './components/PaletteHost'
import { UndoToast } from './components/UndoToast'
import { START_TOOL, TOOLS, findTool } from './tools'
import { getCurrentSettings, loadSettings, updateSettings, useSettings, PLATFORM } from './lib/settingsStore'
import { ErrorBoundary } from './lib/error-boundary'
import type { OpenTarget } from './lib/navigation'
import { pushRecent } from '../../shared/palette'
import { UNDO_SHORTCUT_KEY } from '../../shared/shortcuts'
import { DEFAULT_INTELLIGENCE, type Settings } from '../../shared/types'
import { undoLastDelete } from './lib/undo'

// The visible tool list, respecting the Intelligence feature toggles AND the
// Settings > Modules switches (Phase 0). App subscribes to settings so
// enabling or disabling a tool updates the sidebar and palette immediately.
// The start page can never leave the list: there is always somewhere to be.
function visibleTools(settings: Settings): typeof TOOLS {
  const f = settings.intelligence?.features ?? DEFAULT_INTELLIGENCE.features
  const off = new Set(settings.disabledModules ?? [])
  let list = [...TOOLS].filter((t) => !off.has(t.id))
  if (!f.dailyBriefing) list = list.filter((t) => t.id !== 'briefing')
  if (!f.insights) list = list.filter((t) => t.id !== 'insights')
  if (!f.aiAssistant) list = list.filter((t) => t.id !== 'assistant')
  if (!list.some((t) => t.id === START_TOOL.id)) list = [TOOLS.find((t) => t.id === START_TOOL.id)!, ...list]
  return list
}

export default function App() {
  const settings = useSettings()
  const [active, setActive] = useState(START_TOOL.id)
  // An item another page asked us to open (e.g. a search result). The page
  // that receives it opens the item, then clears it.
  const [target, setTarget] = useState<OpenTarget | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const closePalette = useCallback(() => setPaletteOpen(false), [])
  // Go to a tool by id ("trades") or route ("/trades"). An unknown name is ignored, so a typo cannot blank the app.
  // Every way of changing tool goes through here (sidebar, shortcuts, palette, "View all"), so "recent tools" sees them all.
  const navigate = useCallback((where: string) => {
    const t = findTool(where)
    if (!t) return
    setActive(t.id)
    const recent = getCurrentSettings().recentTools // read live, so quick successive moves never use an old list
    const next = pushRecent(recent, t.id)
    if (next !== recent) updateSettings({ recentTools: next }) // unchanged (already the newest) = nothing to save
  }, [])
  const tools = visibleTools(settings)
  const open = useCallback((t: OpenTarget) => { setTarget(t); navigate(t.module) }, [])
  const clearTarget = useCallback(() => setTarget(null), [])

  // Load the saved look (theme, colours, tag colours) once at startup.
  useEffect(() => { loadSettings() }, [])

  // TEMP-PROBE-23: is this App alive at all (click reachable / effect ran)?
  useEffect(() => { (window as unknown as { __appProbe?: string }).__appProbe = 'mounted' }, [])
  // The global shortcuts, read from shared/shortcuts.ts (the same list Settings > Shortcuts shows): Ctrl+K / Cmd+K
  // opens or closes the command palette, Ctrl+, / Cmd+, opens Settings, Ctrl+B / Cmd+B collapses or expands the
  // sidebar. Ctrl+N is read by each page (a new item there). Ctrl+Z (Cmd+Z) undoes the newest delete of the session.
  // There is no "go to this tool" key: the palette finds any tool.
  useEffect(() => {
    // TEMP-PROBE-23
    ;(window as unknown as { __appHandler?: string }).__appHandler = 'installed'
    // Ctrl on Windows and Linux, Cmd on a Mac: the same modifier the Settings list names.
    const isPrimary = (e: KeyboardEvent) => (PLATFORM === 'darwin' ? e.metaKey : e.ctrlKey)
    const onKey = (e: KeyboardEvent) => {

      if (isPrimary(e) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === UNDO_SHORTCUT_KEY) {
        e.preventDefault() // the app has no text-history undo; the delete undo owns this key
        // A restore that fails (its table is gone, say) must not become an
        // unhandled promise rejection: the undo toast reports it instead.
        void undoLastDelete()
          .then((label) => { if (label) broadcastRestore() })
          .catch((error) => console.error('Undo failed:', error))
        return
      }
      if (!isPrimary(e) || e.altKey || e.shiftKey) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        if (!e.repeat) setPaletteOpen((o) => !o) // holding the keys down must not flicker it open and shut
      } else if (key === ',') {
        e.preventDefault()
        navigate('settings')
      } else if (key === 'b') {
        e.preventDefault()
        // In a narrow window the sidebar is icons-only whatever the setting says (and the button is disabled), so
        // flipping the saved choice would change nothing on screen and surprise the user when the window is widened.
        if (!matchMedia(SIDEBAR_NARROW).matches) updateSettings({ sidebarCollapsed: !getCurrentSettings().sidebarCollapsed })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const Page = (findTool(active) ?? START_TOOL).component

  return (
    <ErrorBoundary fallback={<div className="p-6 text-center text-muted">An error occurred. The app will continue running.</div>}>
      <div className="flex h-full">
        <Sidebar active={active} onSelect={navigate} tools={tools} />
        {/* tabIndex -1: the palette can hand focus to the page when the element that had it is gone */}
        <main tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
          <Page target={target} onTargetHandled={clearTarget} onOpen={open} onNavigate={navigate} />
        </main>
        {paletteOpen && <PaletteHost active={active} navigate={navigate} open={open} onClose={closePalette} tools={tools} />}
        <UndoToast />
      </div>
    </ErrorBoundary>
  )
}

// After an undo restore, every page that listens for the standard "data
// changed" push refetches from SQLite (same channel the Quick capture uses).
function broadcastRestore(): void {
  void window.api.capture.saved()
}