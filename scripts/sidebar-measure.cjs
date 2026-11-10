// Measures the REAL sidebar in a real Electron window and writes the answer to a file.
// Driven by tests/sidebar-layout.ts (part of `npm test`). By hand:
//
//   npx electron scripts/sidebar-measure.cjs --look=default
//
// This program talks through FILES only (no stdout, no console): a console-less Windows app whose output is a
// pipe can stall on its first write. Its answer is always one of
//   .ui-audit/sidebar-measure-<look>.json        one-line summary (and `error` when something went wrong)
//   .ui-audit/sidebar-measure-<look>.measure.json the rows themselves
//   .ui-audit/sidebar_<look>.png                 a screenshot, for looking at the result
// It always exits by itself: a watchdog writes an `error` and exits if the window does not answer in 60 s.
//
// Why a real window: a headless browser here renders with a fallback font, so a width measured there says nothing
// about the app's own font. The profile (userData) is a throw-away folder, so the real database is never opened.
//
// A machine-level ELECTRON_RUN_AS_NODE (even empty) makes the exe a plain Node process, where `electron` is only a
// path; scripts/dev.cjs and scripts/launch.cjs strip it the same way.
if (process.env.ELECTRON_RUN_AS_NODE !== undefined) {
  const { spawn } = require('node:child_process')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  spawn(process.execPath, process.argv.slice(1), { env, stdio: 'ignore' }).on('exit', (code) => process.exit(code ?? 1))
  return
}

const fs = require('node:fs')
const os = require('node:os')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { app, BrowserWindow, protocol, net, screen } = require('electron')
// The one list of palettes, read from the text of appearance.ts (this file is CommonJS; the app is TypeScript):
// the `palette({` call that opens each entry, then the first `id: '…'` that follows it.
const PALETTE_SOURCE = require('node:fs').readFileSync(resolve('src/shared/appearance.ts'), 'utf8')
const PALETTES = [...PALETTE_SOURCE.matchAll(/palette\(\{([\s\S]*?)id: '([a-z-]+)'/g)].map((m) => m[2])

const OUT = resolve('.ui-audit')
const PREVIEW = resolve('.preview')

/** `--name=value` only (a spaced `--name value` would be read as a look name). */
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const LOOK = arg('look', 'default')

const looks = {
  // Text, font and density extremes: the room a name has must hold in all of them.
  default: { theme: 'default', mode: 'light', width: 1200, height: 800 },
  dark: { theme: 'default', mode: 'dark', width: 1200, height: 800 },
  small: { theme: 'default', mode: 'light', width: 1200, height: 800, size: 'small' },
  large: { theme: 'default', mode: 'light', width: 1200, height: 800, size: 'large' },
  mono: { theme: 'default', mode: 'light', width: 1200, height: 800, font: 'mono' },
  'large-mono': { theme: 'default', mode: 'light', width: 1200, height: 800, size: 'large', font: 'mono' },
  spacious: { theme: 'default', mode: 'light', width: 1200, height: 800, density: 'spacious' },
  'small-mono': { theme: 'default', mode: 'light', width: 1200, height: 800, size: 'small', font: 'mono' },
  'mono-spacious': { theme: 'default', mode: 'light', width: 1200, height: 800, font: 'mono', density: 'spacious' },
  minimal: { theme: 'default', mode: 'light', width: 1200, height: 800, style: 'minimal' },
  // Other window sizes: 1440 (widest check), 900 x 600 (the smallest the app allows), 1024 x 600, and the rail.
  wide: { theme: 'default', mode: 'light', width: 1440, height: 800 },
  short: { theme: 'default', mode: 'light', width: 1200, height: 600 },
  'short-narrow': { theme: 'default', mode: 'light', width: 1024, height: 600 },
  min: { theme: 'default', mode: 'light', width: 900, height: 600 },
  collapsed: { theme: 'default', mode: 'light', width: 1200, height: 800, sidebar: 'collapsed' },
  // Every theme, light and dark, at the default look: a name must fit whatever the palette. One look per palette
  // (13) and per mode, all generated, so a new palette is checked by existing rather than by adding a line here.
  ...Object.fromEntries(PALETTES.flatMap((id) => [
    [`palette-${id}-light`, { theme: id, mode: 'light', width: 1200, height: 800 }],
    [`palette-${id}-dark`, { theme: id, mode: 'dark', width: 1200, height: 800 }]
  ])),
  // The window sizes the sidebar was asked to hold up at: 700 / 1024 / 1280 wide, 600 and 800 high.
  'w1280-h600': { theme: 'default', mode: 'light', width: 1280, height: 600 },
  'w1280-h800': { theme: 'default', mode: 'light', width: 1280, height: 800 },
  'w1024-h800': { theme: 'default', mode: 'light', width: 1024, height: 800 },
  'w1024-h600': { theme: 'default', mode: 'light', width: 1024, height: 600 },
  'w700-h800': { theme: 'default', mode: 'light', width: 700, height: 800 },
  'w700-h600': { theme: 'default', mode: 'light', width: 700, height: 600 }
}

const summaryFile = join(OUT, `sidebar-measure-${LOOK}.json`)
const rowsFile = join(OUT, `sidebar-measure-${LOOK}.measure.json`)

/** Writes the answer once, then exits. `app.exit` cannot be held up by a window, a timer or a pending frame. */
let done = false
function finish(payload, rows) {
  if (done) return
  done = true
  try {
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(summaryFile, JSON.stringify(payload))
    if (rows) fs.writeFileSync(rowsFile, JSON.stringify(rows))
  } catch { /* the test reports a missing answer */ }
  app.exit(0)
}

// Never wait forever: an unanswered window is reported as an error instead of leaving the test hanging. The budget
// is generous on purpose (240 s, and the test allows the process 300 s): a cold Electron start can take a while on a busy machine, and a late answer is still a good
// answer (the test has its own, longer timeout for a process that never starts at all).
const watchdog = setTimeout(() => finish({ look: LOOK, error: 'the window did not answer within 240 s' }), 240_000)
watchdog.unref()

// A throw-away profile, removed on the way out; one left by an interrupted run is never needed either.
const PROFILE = join(os.tmpdir(), `feeblest-sidebar-measure-${process.pid}`)
app.setPath('userData', PROFILE)
// Old profiles are pruned once the app is up (not while Chromium is still starting with this one), and never the
// profile that is in use.
const pruneOlderProfiles = () => {
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!name.startsWith('feeblest-sidebar-measure-') || join(os.tmpdir(), name) === PROFILE) continue
    try { fs.rmSync(join(os.tmpdir(), name), { recursive: true, force: true }) } catch { }
  }
}
app.on('will-quit', () => { try { fs.rmSync(PROFILE, { recursive: true, force: true }) } catch { } })
app.commandLine.appendSwitch('disable-gpu')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

// Runs in the measured page. Every label is measured against a hidden TWIN laid out freely (its whole text, never
// the clipped box); the list's scrolling and the footer's position come from the live boxes. It also reads the
// keyboard facts (tab stops, the list as the one focusable scroller, the pin buttons), whether the shortcut hint
// sits on a name, and whether scrolling the list reaches the Utilities group. The answer is ONE file, written by
// finish(): the page's result has no pin probe in it, so nothing here writes to a file that finish() overwrites.
const PAGE_SCRIPT = (width, height) => `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let i = 0; i < 300 && !document.querySelector('.sb-nav .sb-item'); i++) await sleep(100) // up to 30 s of load
  // The sidebar animates its width (0.18s): wait for two identical frames before reading any box.
  let last = -1
  for (let i = 0; i < 40; i++) {
    const w = document.querySelector('.sb').getBoundingClientRect().width
    if (Math.abs(w - last) < 0.01) break
    last = w
    await sleep(60)
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))

  const twin = (label) => {
    const s = document.createElement('span')
    s.className = label.className
    s.textContent = label.textContent
    s.style.cssText = 'position:fixed;left:-10000px;top:0;white-space:nowrap;pointer-events:none'
    document.body.appendChild(s)
    const w = s.getBoundingClientRect().width
    s.remove()
    return Math.round(w * 100) / 100
  }
  const measure = (el) => {
    const item = el.querySelector('.sb-item')
    const label = el.querySelector('.sb-label')
    if (!label) return null
    // The icons-only rail hides the labels: nothing to read there.
    if (!label.getClientRects().length) return null
    const text = twin(label)
    const box = Math.round(label.getBoundingClientRect().width * 100) / 100
    return {
      name: label.textContent, box, text,
      current: item.getAttribute('aria-current') === 'page',
      slack: Math.round((box - text) * 100) / 100
    }
  }
  const nav = document.querySelector('.sb-nav')
  const foot = document.querySelector('.sb-foot')
  const sb = document.querySelector('.sb')

  // A row is drawn only while its group is open, so focus() on it would scroll nothing: open every group first
  // (headings and rows are collected again after each click, because React re-renders them). The rows then keep
  // the heights already measured above.
  for (const head of [...document.querySelectorAll('.sb-group-head')]) if (head.getAttribute('aria-expanded') === 'false') head.click()
  await sleep(500)

  // Tab order, the list's scrolling and the pin buttons (the checks below read these).
  const visible = (el) => el.getClientRects().length > 0
  const tabStops = [...document.querySelectorAll('.sb button')].filter(visible)
  const order = [...document.querySelectorAll('.sb .sb-item, .sb .sb-group-head')].filter(visible)
  // No row carries a shortcut hint any more (no tool has a key of its own; Ctrl+K finds any tool, shared/shortcuts.ts),
  // so no row may still show one: a hint left behind would sit on a name or claim a key that no longer works.
  const hintsLeft = [...document.querySelectorAll('.sb-nav .sb-kbd, .sb-foot .sb-kbd, .sb-nav [aria-keyshortcuts], .sb-foot [aria-keyshortcuts]')].length
  // The Utilities group is reachable: scroll the list to its end and read its last row against the list's box.
  nav.scrollTop = nav.scrollHeight
  await sleep(60)
  const navBox = nav.getBoundingClientRect()
  const utilHead = [...document.querySelectorAll('.sb-nav .sb-group-head')].find((h) => (h.querySelector('.sb-group-name') || h).textContent.trim() === 'Utilities')
  const lastRow = [...document.querySelectorAll('.sb-nav .sb-row')].pop()
  const lastBox = lastRow ? lastRow.getBoundingClientRect() : null
  const utilitiesReachable = !!utilHead && utilHead.getBoundingClientRect().top >= navBox.top - 1 && !!lastBox && lastBox.bottom <= navBox.bottom + 1
  nav.scrollTop = 0
  await sleep(40)
  // A long list must also scroll when a keyboard user tabs through it: focus a row near its end and read the
  // list again. (Focusing moves focus as well as scrolling, so the pin probe below picks its own, first row.)
  const nearEnd = [...document.querySelectorAll('.sb-nav .sb-item')].slice(-3)[0]
  nearEnd?.focus()
  await sleep(120)
  const nearEndBox = nearEnd ? nearEnd.getBoundingClientRect() : null
  // The focused row must now lie inside the list's visible box (focus scrolls a clipped list to its target).
  const box = nav.getBoundingClientRect()
  const reachedByTab = !!nearEndBox && nearEndBox.top >= box.top - 1 && nearEndBox.top < box.top + nav.clientHeight && nearEndBox.bottom <= box.bottom + 1
  nav.scrollTop = 0
  await sleep(40)

  // Keyboard focus on a row is what shows its pin button (:focus-within); see PIN_PROBE below.
  const pinRow = document.querySelector('.sb-nav .sb-row[data-pinnable="true"]')
  if (pinRow) pinRow.querySelector('.sb-item').focus()
  await sleep(250)

  return {
    width: ${width}, height: ${height},
    collapsed: sb.dataset.collapsed,
    sidebarW: sb.getBoundingClientRect().width,
    nav: { clientH: nav.clientHeight, scrollH: nav.scrollHeight, gutter: getComputedStyle(nav).scrollbarGutter },
    // The list is the one focusable scroller among the sidebar's controls; the rest are ordinary buttons.
    scrollerFocusable: nav.tabIndex === -1 && getComputedStyle(nav).overflowY === 'auto' && getComputedStyle(nav).minHeight === '0px',
    tabStops: tabStops.length,
    // The controls, in DOM (= Tab) order: headings and tool rows only, so a heading comes before its rows.
    order: order.map((el) => el.classList.contains('sb-group-head') ? el.textContent.trim() : (el.querySelector('.sb-label') || {}).textContent).slice(0, 8),
    utilitiesReachable,
    reachedByTab,
    hintsLeft,
    // How many rows have a pin button at all (each is reachable with Tab, see Sidebar.tsx).
    pins: [...document.querySelectorAll('.sb-nav .sb-pin')].length,
    footBottom: foot.getBoundingClientRect().bottom,
    // The app area the sidebar fills (below the real window's frame and title bar): the footer must end there.
    appBottom: sb.parentElement.getBoundingClientRect().bottom,
    // Where the sidebar's own content ends: its box, less the bottom padding it keeps on every side. The footer's
    // last pixel is here, with the list scrolling above it.
    contentBottom: sb.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(sb).paddingBottom) - Number.parseFloat(getComputedStyle(sb).borderBottomWidth),
    rows: [...document.querySelectorAll('.sb-nav .sb-row')].map(measure).filter(Boolean),
    footRows: [...document.querySelectorAll('.sb-foot .sb-row')].map(measure).filter(Boolean)
  }
})()`

// Is the pin of a focused row under the pointer, at its own centre? A pin faded to `pointer-events: none` would let
// the click through and open the page instead of pinning it.
const PIN_PROBE = `(() => {
  const row = document.querySelector('.sb-row[data-pinnable="true"]:focus-within')
  if (!row) return { focused: false }
  const pin = row.querySelector('.sb-pin')
  const r = pin.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { focused: true, row: row.querySelector('.sb-label').textContent, opacity: getComputedStyle(pin).opacity, hitIsPin: hit === pin || hit?.closest('.sb-pin') === pin }
})()`

app.whenReady().then(async () => {
  pruneOlderProfiles()
  protocol.handle('app', (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname)
    return net.fetch(pathToFileURL(join(PREVIEW, path === '/' ? 'preview.html' : path)).toString())
  })

  const look = looks[LOOK]
  if (!look) return finish({ look: LOOK, error: `unknown look "${LOOK}" (known: ${Object.keys(looks).join(', ')})` })

  const qs = new URLSearchParams({ page: 'dashboard', theme: look.theme, mode: look.mode })
  for (const k of ['font', 'size', 'density', 'style', 'sidebar']) if (look[k]) qs.set(k, look[k])
  if (arg('pinned', '')) qs.set('pinnedTools', arg('pinned', ''))

  const win = new BrowserWindow({
    width: look.width, height: look.height, show: false, useContentSize: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  })
  // A hidden window (or one at opacity 0) does not lay out like a visible one, so it is shown for the few seconds a
  // run takes. It sits in the last few pixels of the screen, so it is out of the way.
  const { workAreaSize } = screen.getPrimaryDisplay()
  win.setPosition(Math.max(0, workAreaSize.width - 40), Math.max(0, workAreaSize.height - 40))
  win.showInactive()

  try {
    await win.loadURL(`app://local/preview.html?${qs}`)
    const result = await win.webContents.executeJavaScript(PAGE_SCRIPT(look.width, look.height))
    const pin = await win.webContents.executeJavaScript(PIN_PROBE)
    const image = await win.webContents.capturePage()
    fs.mkdirSync(OUT, { recursive: true })
    fs.writeFileSync(join(OUT, `sidebar_${LOOK}.png`), image.toPNG())

    const all = [...result.rows, ...result.footRows]
    const tightest = all.reduce((a, b) => (b.slack < a.slack ? b : a), all[0] || null)
    finish({
      look: process.env.MEASURE_ID || LOOK,
      width: result.width, height: result.height, appBottom: Math.round(result.appBottom),
      sidebarW: Math.round(result.sidebarW), collapsed: result.collapsed,
      nav: `${result.nav.clientH}/${result.nav.scrollH}`, gutter: result.nav.gutter,
      footerBottom: Math.round(result.footBottom),
      tightest: tightest ? `${tightest.name} ${tightest.slack}px` : null, contentBottom: Math.round(result.contentBottom),
      scrollerFocusable: result.scrollerFocusable, tabStops: result.tabStops, utilitiesReachable: result.utilitiesReachable, reachedByTab: result.reachedByTab, order: result.order,
      hintsLeft: result.hintsLeft, pins: result.pins,
      clipped: all.filter((r) => r.slack < 0).map((r) => r.name),
      names: all.map((r) => r.name),
      pin
    }, { ...result, pin })
  } catch (error) {
    finish({ look: LOOK, error: String(error && error.message ? error.message : error) })
  }
}).catch((error) => finish({ look: LOOK, error: String(error) }))
