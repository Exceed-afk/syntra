// URL options for the preview harness (see ./preview.tsx for the list).
//
// applyAppearance() is the app's own function (src/renderer/src/lib/theme.ts),
// so the preview looks exactly like the app would with these settings. Nothing
// is written to the settings store: the URL is the only source here.
import { PALETTES } from '../../../shared/appearance'
import { DEFAULT_SETTINGS, type Density, type FontChoice, type Radius, type TextSize, type UiStyle } from '../../../shared/types'
import { applyAppearance } from '../lib/theme'

export type PreviewMode = 'light' | 'dark'

export interface PreviewOptions {
  page: string
  theme: string
  mode: PreviewMode
  style: UiStyle
  density: Density
  font: FontChoice
  radius: Radius
  size: TextSize
  sidebarCollapsed: boolean
  palette: boolean
}

const DENSITIES = ['compact', 'comfortable', 'spacious'] as const satisfies readonly Density[]
const FONTS = ['system', 'clean', 'serif', 'mono'] as const satisfies readonly FontChoice[]
const RADII = ['sharp', 'soft', 'round'] as const satisfies readonly Radius[]
const SIZES = ['small', 'default', 'large'] as const satisfies readonly TextSize[]
const STYLES = ['modern', 'minimal'] as const satisfies readonly UiStyle[]
const MODES = ['light', 'dark'] as const satisfies readonly PreviewMode[]

const THEME_IDS = PALETTES.map((p) => p.id)

function pick<T extends string>(params: URLSearchParams, key: string, values: readonly T[], fallback: T): T {
  const raw = params.get(key)
  return raw && (values as readonly string[]).includes(raw) ? (raw as T) : fallback
}

/** Reads the URL and puts the chosen look on the page. */
export function previewOptions(params: URLSearchParams): PreviewOptions {
  const options: PreviewOptions = {
    page: params.get('page') ?? 'dashboard',
    theme: pick(params, 'theme', THEME_IDS, 'default'),
    mode: pick(params, 'mode', MODES, 'light'),
    style: pick(params, 'style', STYLES, 'modern'),
    density: pick(params, 'density', DENSITIES, 'comfortable'),
    font: pick(params, 'font', FONTS, 'system'),
    radius: pick(params, 'radius', RADII, 'soft'),
    size: pick(params, 'size', SIZES, 'default'),
    sidebarCollapsed: pick(params, 'sidebar', ['open', 'collapsed'] as const, 'open') === 'collapsed',
    palette: params.get('palette') === '1'
  }
  applyAppearance({
    ...DEFAULT_SETTINGS,
    theme: options.mode,
    palette: options.theme,
    uiStyle: options.style,
    density: options.density,
    font: options.font,
    radius: options.radius,
    textSize: options.size,
    sidebarCollapsed: options.sidebarCollapsed
  })
  return options
}
