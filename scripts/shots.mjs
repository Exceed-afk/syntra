// Screenshot EVERY page of the app at three widths, in light and dark, into
// .ui-audit/ (gitignored). Run with `npm run shots`.
//
// It drives the design preview harness (vite.preview.config.ts ->
// src/renderer/preview.html), which renders each page in a plain browser with
// deterministic sample data. No Electron and no real database are involved.
//
// Needs, once per machine:
//   npx patchright install chromium
// The build is done for you here (vite build --config vite.preview.config.ts).
//
// Usage:
//   npm run shots                      every page, 3 widths x 2 modes
//   npm run shots -- --page=tasks      one page (repeatable: --page=tasks --page=notes)
//   npm run shots -- --width=1440      one width
//   npm run shots -- --mode=dark       one mode (light | dark)
//   npm run shots -- --theme=forest    a palette other than the default
//   npm run shots -- --tag=v2          a run tag, part of every file name
//
// File names carry a run stamp and are unique per image, e.g.
//   .ui-audit/2026-11-05_101500_deadbeef_tasks_1440_light_default.png
// so a stale cached image can never be mistaken for a fresh one.
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
process.chdir(root)

// ---------- arguments ----------

const args = process.argv.slice(2)
const many = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3))
const one = (name, fallback) => many(name)[0] ?? fallback

const widthArgs = many('width').map(Number).filter((n) => Number.isFinite(n))
const WIDTHS = widthArgs.length > 0 ? widthArgs : [1440, 1024, 700]
const MODES = many('mode').length > 0 ? many('mode') : ['light', 'dark']
const THEME = one('theme', 'default')
const TAG = one('tag', '')
const ONLY = many('page')
const OUT = resolve('.ui-audit')
const PORT = Number(process.env.SHOTS_PORT ?? 5236)

const toolIds = readToolIds()
const pages = ONLY.length > 0 ? ONLY.map((p) => p.replace(/^\//, '')) : toolIds
const unknown = pages.filter((p) => !toolIds.includes(p))
if (unknown.length > 0) {
  console.error(`Unknown page(s): ${unknown.join(', ')}\nKnown pages: ${toolIds.join(', ')}`)
  process.exit(1)
}

/** Reads the tool ids straight from the registry, so this never drifts from it. */
function readToolIds() {
  const source = readFileSync(join(root, 'src/renderer/src/tools.ts'), 'utf8')
  return [...source.matchAll(/^\s*\{ id: '([a-z-]+)'/gm)].map((m) => m[1])
}

// ---------- patchright (same discovery as tests/calc-ui.ts) ----------

function loadChromium() {
  const roots = []
  const add = (r) => { if (r && existsSync(r)) roots.push(r) }
  add(process.env.CODEGPT_RUNTIME_MODULES)
  try { add(JSON.parse(readFileSync(join(homedir(), '.codegpt', 'runtime.json'), 'utf8'))?.modulesRoot) } catch { }
  add(resolve(root, '..'))
  add(root)
  for (const base of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.trae', '.kiro']) {
    const dir = join(homedir(), base, 'extensions')
    if (!existsSync(dir)) continue
    const newest = readdirSync(dir).filter((d) => d.startsWith('danielsanmedium.dscodegpt-')).sort().pop()
    if (newest) add(join(dir, newest, 'standalone'))
  }
  for (const r of roots) {
    try {
      const mod = createRequire(join(r, 'noop.js'))('patchright')
      const chromium = mod?.chromium ?? mod?.default?.chromium
      if (chromium) return chromium
    } catch { }
  }
  return null
}

const chromium = loadChromium()
if (!chromium) {
  console.error('Chromium / patchright not found. Run: npx patchright install chromium')
  process.exit(1)
}

// ---------- build the preview ----------

console.log('Building the preview harness (vite.preview.config.ts)…')
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
if (!existsSync(viteBin)) {
  console.error('vite is not installed (node_modules/vite). Run npm install first.')
  process.exit(1)
}
const build = spawnSync(process.execPath, [viteBin, 'build', '--config', 'vite.preview.config.ts'], { stdio: 'inherit' })
if (build.status !== 0) {
  console.error('The preview build failed; nothing was screenshotted.')
  process.exit(build.status ?? 1)
}

// ---------- serve .preview ----------

const ROOT = resolve('.preview')
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
}
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0])
  const file = join(ROOT, normalize(path))
  readFile(file).then(
    (body) => { res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body) },
    () => {
      readFile(join(ROOT, 'preview.html')).then(
        (body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(body) },
        () => { res.writeHead(404); res.end('preview.html not found') }
      )
    }
  )
})
await new Promise((done) => server.listen(PORT, '127.0.0.1', done))

// ---------- shoot ----------

mkdirSync(OUT, { recursive: true })
const runTime = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '_')
const runId = createHash('sha1').update(`${runTime}:${process.pid}`).digest('hex').slice(0, 8)
const tagPart = TAG ? `_${TAG.replace(/[^a-z0-9-]+/gi, '-')}` : ''

const browser = await chromium.launch({ channel: 'chromium', headless: true })
let shot = 0
let failed = 0
for (const page of pages) {
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const url = `http://127.0.0.1:${PORT}/?page=${page}&theme=${THEME}&mode=${mode}`
      const name = `${runTime}${tagPart}_${runId}_${page}_${width}_${mode}_${THEME}.png`
      const file = join(OUT, name)
      const tab = await browser.newPage({ viewport: { width, height: 900 } })
      const problems = []
      tab.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
      tab.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
      try {
        await tab.goto(url, { waitUntil: 'networkidle' })
        // Every page renders inside <main>; give lazy widgets a moment to settle.
        await tab.waitForSelector('main .page', { timeout: 15000 })
        await tab.waitForTimeout(400)
        await tab.screenshot({ path: file })
        shot++
        const note = problems.length > 0 ? `  (${problems.length} console/page error(s): ${problems[0]})` : ''
        console.log(`  ${name}${note}`)
        if (problems.length > 0) failed++
      } catch (e) {
        failed++
        console.error(`  FAILED ${name}: ${e.message}`)
      } finally {
        await tab.close()
      }
    }
  }
}
await browser.close()
server.close()

console.log(`\n${shot} screenshot(s) in ${OUT}${failed > 0 ? `, ${failed} with problems` : ''}.`)
console.log(`Run id: ${runId}${TAG ? ` (tag ${TAG})` : ''}. Every file name carries it, so cached images cannot be confused.`)
