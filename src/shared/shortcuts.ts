// The app's keyboard shortcuts, in one list. App.tsx's key handler and Settings > Shortcuts both read this, so the
// list on the page and the keys that really work cannot drift apart. Plain data with no DOM, so it can be checked
// in a plain test (tests/registry.ts). On a Mac the label says "Cmd" instead of "Ctrl".
//
// Only a few keys are global. A numbered "go to this tool" key does not scale as tools are added, so none exists:
// Ctrl+K (Cmd+K on a Mac) finds any tool through the command palette. Page shortcuts (Ctrl+N on the page you are on,
// the Expenses tabs on Ctrl+1..4, the Tasks keys, Ctrl+Enter to save) belong to their page and are listed second.
//
// {key} and {mod} are filled in by shortcutRows(), so the list follows the keyboard instead of hard-coding "Ctrl".

export interface GlobalShortcut {
  id: string
  key: string // the pressed key, compared lowercase ("k", ",")
  description: string
  // handled by: 'app' = App.tsx's own key handler; 'page' = the page itself reads Ctrl+N
  handled: 'app' | 'page'
}

// In the order Settings shows them: the palette first, Settings next, then the rest.
export const GLOBAL_SHORTCUTS: GlobalShortcut[] = [
  { id: 'palette', key: 'k', description: 'Command palette: jump to any tool', handled: 'app' },
  { id: 'settings', key: ',', description: 'Open Settings', handled: 'app' },
  { id: 'sidebar', key: 'b', description: 'Collapse or expand the sidebar', handled: 'app' },
  { id: 'new-item', key: 'n', description: 'New item on the current page', handled: 'page' }
]

// "Cmd" on a Mac, "Ctrl" everywhere else: what the labels say.
export const primaryLabel = (platform: string | undefined): string => (platform === 'darwin' ? 'Cmd' : 'Ctrl')

// The accelerator the key handler builds itself for the Delete-undo (Ctrl+Z / Cmd+Z): it is not in GLOBAL_SHORTCUTS
// because no page key here is an undo, but the list must match the keys that really work (tests/registry.ts).
export const UNDO_SHORTCUT_KEY = 'z'

// One row per shortcut, then one row per group of page keys. `platform` is process.platform / window.api.platform.
export function shortcutRows(platform: string | undefined): { group: string; description: string; keys: string }[] {
  const mod = primaryLabel(platform)
  return [
    ...GLOBAL_SHORTCUTS.map((s) => ({ group: 'Everywhere', description: s.description, keys: `${mod}+${s.key.toUpperCase()}` })),
    { group: 'Everywhere', description: 'Undo the last delete', keys: `${mod}+${UNDO_SHORTCUT_KEY.toUpperCase()}` },
    { group: 'On some pages', description: 'Save the open editor', keys: `${mod}+Enter` },
    { group: 'On some pages', description: 'Expenses: switch between Overview, Transactions, Budgets and Recurring', keys: `${mod}+1 to 4` },
    { group: 'On some pages', description: 'Notes: switch the editor layout', keys: `${mod}+E` },
    { group: 'On some pages', description: 'Tasks: move between rows (j / k), tick (x), edit (e), due date (d), new (n), search (/)', keys: 'j k x e d n /' },
    { group: 'On some pages', description: 'Tools, Stopwatch tab: start or stop, lap, reset', keys: 'Space L R' }
  ]
}
