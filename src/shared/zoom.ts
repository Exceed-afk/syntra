// Page zoom, as the default menu's zoomIn / zoomOut roles do it: one step of 0.5 zoom level (about 1.2x) per
// press, stop at the same ends (zoom factor 0.25 to 5). Plain, so it can be checked without a window.
// Zoom is per window and per run: nothing saves it, so every start is 100% again.
const STEP = 0.5
const MIN = -7 // about 0.28x
const MAX = 8 // about 4.3x (1.2^8); the roles stop there too

const clamp = (level: number): number => Math.round(Math.min(MAX, Math.max(MIN, level)) * 100) / 100

export const ZoomIn = (level: number): number => clamp(level + STEP)
export const ZoomOut = (level: number): number => clamp(level - STEP)
export const ZoomReset = (): number => 0
