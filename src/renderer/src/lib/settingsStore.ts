// One shared copy of the settings, so the sidebar and the Settings page always agree
// (change the theme in one, the other updates at once).
import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../../../shared/types'
import { normalizeSettings } from '../../../shared/appearance'
import { setTagColors } from './tagColors'
import { applyAppearance, isDark } from './theme'

const CACHE_KEY = 'appearance-cache'
let current: Settings = DEFAULT_SETTINGS
const listeners = new Set<() => void>()

// The operating system, for key labels (Cmd on a Mac): "darwin", "win32"… electron-vite builds the renderer for the
// browser, so `process` is only there in the real app; in the preview the browser's platform is read instead.
export const PLATFORM: string =
  typeof process !== 'undefined' && process.platform ? process.platform
    : typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.userAgent) ? 'darwin' : 'win32'

function set(next: Settings): void {
  current = next
  applyAppearance(next)
  listeners.forEach((l) => l())
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...next, tagColors: {} })) } catch { /* the cache is only a speed-up */ }
}

// Call once before the first render. Uses the copy saved last time, so a light-theme user does not see a dark flash
// while the database is still being read.
export function bootAppearance(): void {
  let cached: unknown = null
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') } catch { /* ignore a damaged cache */ }
  current = normalizeSettings(cached as Partial<Settings> | null)
  applyAppearance(current)
  // "System" theme: follow Windows when it switches between light and dark.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (current.theme === 'system') applyAppearance(current) })
}

// Reads the real settings from the database (the source of truth) and applies them.
export async function loadSettings(): Promise<void> {
  const saved = await window.api.settings.getAll()
  set(normalizeSettings(saved))
  setTagColors(saved.tagColors)
}

export function applyFromMain(patch: Partial<Settings>): void {
  set(normalizeSettings({ ...current, ...patch }))
}

// Dragging a colour picker fires many changes a second: the screen follows each one, the database gets the last one.
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function persist(key: keyof Settings, value: Settings[keyof Settings]): void {
  clearTimeout(timers.get(key))
  timers.set(key, setTimeout(() => { timers.delete(key); window.api.settings.set(key, value as never) }, 200))
}

// Changes one or more settings: shown at once, then saved. Unknown or invalid values are replaced by defaults.
export function updateSettings(patch: Partial<Settings>): void {
  const next = normalizeSettings({ ...current, ...patch })
  set(next)
  for (const key of Object.keys(patch) as (keyof Settings)[]) persist(key, next[key])
}

export const resetAppearance = (): void => {
  const { theme, accent, palette, uiStyle, radius, density, textSize, font, colors } = DEFAULT_SETTINGS
  updateSettings({ theme, accent, palette, uiStyle, radius, density, textSize, font, colors })
}

export const toggleTheme = (): void => updateSettings({ theme: isDark(current) ? 'light' : 'dark' })

export const getCurrentSettings = (): Settings => current

export const useSettings = (): Settings =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => current, () => current)
