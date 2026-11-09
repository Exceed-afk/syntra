// The zoom step and limits (src/shared/zoom.ts, used by the Ctrl+= / numpad keys in src/main/index.ts). Needs no DOM:
//   npm test
import assert from 'node:assert/strict'
import { ZoomIn, ZoomOut, ZoomReset } from '../src/shared/zoom'

let n = 0
const test = (name: string, fn: () => void) => { fn(); n++; console.log('ok  ', name) }

test('one press is one step of 0.5 zoom level, the same step Electron\'s zoom roles use', () => {
  assert.equal(ZoomIn(0), 0.5)
  assert.equal(ZoomIn(0.5), 1)
  assert.equal(ZoomOut(0), -0.5)
  assert.equal(ZoomIn(ZoomOut(0)), 0) // a pair returns to 100%
})
test('zoom stops where the roles stop: about 0.3x and about 4.3x (0.5 level, 1.2x a press)', () => {
  let up = 0
  for (let i = 0; i < 100; i++) up = ZoomIn(up)
  let down = 0
  for (let i = 0; i < 100; i++) down = ZoomOut(down)
  assert.equal(up, 8)
  assert.ok(Math.abs(Math.pow(1.2, up) - 4.3) < 0.05, `top factor ${Math.pow(1.2, up)}`)
  assert.equal(down, -7)
  assert.ok(Math.pow(1.2, down) > 0.27 && Math.pow(1.2, down) < 0.29, `bottom factor ${Math.pow(1.2, down)}`)
  assert.equal(ZoomIn(up), up) // already at the top: nothing more
  assert.equal(ZoomOut(down), down) // already at the bottom: nothing more
})
test('reset is 100%, wherever the level was', () => {
  assert.equal(ZoomReset(), 0)
  assert.equal(ZoomIn(ZoomReset()), 0.5)
})

console.log(`\n${n} zoom checks passed`)
