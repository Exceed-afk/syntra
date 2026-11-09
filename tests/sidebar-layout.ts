// The sidebar, measured in a real Electron window with the app's own font (part of `npm test`).
//
//   tsx tests/sidebar-layout.ts
//
// scripts/sidebar-measure.cjs opens the design preview in one real window and writes .ui-audit/sidebar-measure-<look>
// .json; each check below reads one such answer. What it proves, for the full sidebar:
//   - every tool name fits its row with the pin button showing, at the default look and at the extremes of the text
//     size, font and density settings, and for the row that is BOTH active and shows a pin (a pinned current page);
//   - the list scrolls when it is taller than the window and always keeps the scrollbar's room, so rows never shift;
//   - the footer (Dark mode, Settings) ends on the app area's bottom edge, so it never scrolls away;
//   - the pin button of a focused row receives the pointer (it is not faded out under it);
//   - the icons-only rail still lays out and keeps the same scrolling rules.
//
// It skips (with a message) only when the measurement cannot run at all: no Electron installed, or no preview build
// that can be made. A window that was asked to measure and answers with an error is a FAILURE, never a skip.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const helper = join(root, 'scripts', 'sidebar-measure.cjs')
const preview = join(root, '.preview', 'preview.html')
const outDir = join(root, '.ui-audit')

let n = 0
const ok = (name: string) => { n++; console.log('ok  ', name) }
function skip(reason: string): never {
  console.log(`skip  sidebar layout: ${reason}`)
  console.log('\n0 sidebar layout checks run (skipped)')
  process.exit(0)
}

const buildPreview = () => spawnSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.preview.config.ts'], { cwd: root, stdio: 'ignore' })

if (!existsSync(electron)) skip('Electron is not installed (node_modules/electron)')
if (!existsSync(preview) || Date.now() - statSync(preview).mtimeMs > 7 * 24 * 60 * 60 * 1000) {
  // The preview is what gets measured: it must exist, and be recent enough to carry the styles under test.
  buildPreview()
  if (!existsSync(preview)) skip('the preview build failed')
}

interface Answer {
  error?: string
  width: number
  height: number
  appBottom: number
  contentBottom: number
  collapsed: string
  nav: string          // "<visible>/<content>", px
  gutter: string
  footerBottom: number
  tightest: string | null
  clipped: string[]
  names: string[]
  pin: { focused: boolean; row?: string; opacity?: string; hitIsPin?: boolean }
}
interface Rows {
  rows: { name: string; box: number; text: number; slack: number; current: boolean }[]
  footRows: { name: string; box: number; text: number; slack: number; current: boolean }[]
}

/** Runs one look and reads its answer. `rows` also loads the per-row file; `wantNames` is off for the icons-only
 *  rail, where the names are hidden and there is nothing to measure. */
function look(name: string, extra: string[] = [], wantRows = false, wantNames = true): { a: Answer; rows: Rows | null } {
  const answerFile = join(outDir, `sidebar-measure-${name}.json`)
  rmSync(answerFile, { force: true })
  // A Windows Electron app writes nothing to a captured console, so the answer is a file. The helper exits by itself
  // (it has its own 150 s watchdog); this timeout only guards against the window process never starting at all.
  const run = spawnSync(electron, [helper, `--look=${name}`, ...extra], { cwd: root, timeout: 180_000, env: { ...process.env, MEASURE_ID: `${name}${extra.length ? ` ${extra.join(' ')}` : ''}` } })
  const why = run.error ? String(run.error.message) : `exit ${run.status ?? run.signal}`
  if (!existsSync(answerFile)) assert.fail(`the measurement window did not answer for "${name}" (${why})`)
  const a = JSON.parse(readFileSync(answerFile, 'utf8')) as Answer
  assert.equal(a.error, undefined, `"${name}": ${a.error}`)
  if (wantNames) assert.ok(a.names.length > 10, `"${name}": the whole list was measured (${a.names.length} names)`)
  const rows = wantRows ? JSON.parse(readFileSync(join(outDir, `sidebar-measure-${name}.measure.json`), 'utf8')) as Rows : null
  return { a, rows }
}

const px = (pair: string) => pair.split('/').map(Number)

// ---- every name fits, with the pin button's room ----
// Each row keeps the pin's room whether or not the pin is showing, so the label box is the same in every state:
// at rest, hovered with the pin, with the shortcut hint, and on the active row. One measurement covers them all.
const EXTREMES = ['default', 'small', 'large', 'mono', 'large-mono', 'spacious', 'minimal']
for (const name of EXTREMES) {
  const { a, rows } = look(name, [], true)
  assert.deepEqual(a.clipped, [], `${name}: these names do not fit their row`)
  const tightest = [...rows!.rows].sort((x, y) => x.slack - y.slack)[0]
  assert.ok(tightest.slack >= 0, `${name}: "${tightest.name}" has ${tightest.slack}px`)
  ok(`${name}: every tool name fits with the pin button's room (tightest: ${tightest.name}, ${tightest.slack}px spare)`)
}

// ---- the row that is BOTH the current page AND shows a pin button (a pinned current page) ----
for (const name of EXTREMES) {
  const { a, rows } = look(name, ['--pinned=trades,habits'], true)
  assert.deepEqual(a.clipped, [], `${name} (pinned): a name does not fit`)
  const active = rows!.rows.filter((r) => r.current)
  assert.equal(active.length, 1, `${name} (pinned): exactly one row is the current page`)
  assert.ok(active[0].slack >= 0, `${name} (pinned): the active row "${active[0].name}" keeps its name`)
  ok(`${name} (pinned): the active row's own name fits (${active[0].name}, ${active[0].slack}px spare)`)
}

// ---- scrolling, the footer, and the scrollbar's stable room ----
for (const name of ['default', 'wide', 'short', 'short-narrow', 'min']) {
  // At 900px wide the sidebar is the icons-only rail, whose names are hidden.
  const { a } = look(name, [], false, name !== 'min')
  const [visible, content] = px(a.nav)
  const atRail = a.collapsed === 'true'
  if (name === 'min') {
    // The window is 900px wide: the sidebar is the icons-only rail there, by the app's own 999px rule.
    assert.equal(atRail, true, 'min: the icons-only rail at 900px')
  } else {
    assert.equal(atRail, false, `${name}: the full sidebar`)
  }
  assert.equal(a.gutter, 'stable', `${name}: the list always keeps the scrollbar's room`)
  // The footer ends where the sidebar's content ends (the same 12px padding stays below it, as on every side),
  // with the list scrolling above it: it can never be pushed off-screen or scrolled away.
  assert.equal(a.footerBottom, a.contentBottom, `${name}: the footer ends where the sidebar's content ends (${a.footerBottom} vs ${a.contentBottom})`)
  assert.ok(visible > 100 && visible < a.appBottom, `${name}: the list keeps its own height (${visible}px)`)
  // The full list (21 tools under 6 headings) is taller than any of these windows, so it scrolls; the footer is
  // below the scrolling list and does not move.
  assert.ok(content > visible, `${name}: a list taller than the window scrolls (${content} > ${visible})`)
  ok(`${name}: ${a.width}x${a.height}, list ${visible}/${content}px, footer at the bottom, scrollbar room kept`)
}

// ---- rows do not shift when the scrollbar appears ----
{
  const tall = look('default', [], true).rows!.rows[0]
  const short = look('short', [], true).rows!.rows[0]
  assert.equal(short.box, tall.box, 'the first row is the same width with or without the scrollbar')
  ok('rows do not shift when the scrollbar appears')
}

// ---- the pin button of a row is really there, under the pointer ----
for (const name of ['default', 'dark']) {
  const { a } = look(name)
  assert.equal(a.pin.focused, true, `${name}: a row took keyboard focus`)
  assert.equal(a.pin.hitIsPin, true, `${name}: the pin of the focused row "${a.pin.row}" receives the pointer`)
  ok(`${name}: the pin button of a row receives the pointer`)
}

// ---- the icons-only rail ----
{
  const { a } = look('collapsed', [], false, false)
  assert.equal(a.collapsed, 'true', 'collapsed: the icons-only rail')
  assert.ok(a.nav.length > 0 && px(a.nav)[0] > 100, 'collapsed: the rail list still has its height')
  assert.equal(a.gutter, 'stable', 'collapsed: the same scrolling rules')
  assert.equal(a.footerBottom, a.contentBottom, 'collapsed: the footer ends where the sidebar\'s content ends')
  ok('collapsed: a working rail with the same scrolling and a footer at the bottom')
}

console.log(`\n${n} sidebar layout checks passed`)
