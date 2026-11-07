// Exact-rational CAS engine tests: solve/expand/cancel/factor/limit/Taylor.
// Run on its own:  npx tsx tests/calc-cas-exact.ts
//
// The rule (docs/calculator-testing-guide.md section 8): a wrong answer is far worse
// than "could not solve". The property tests below lean on that: the ENGINE's own
// numeric self-checks are the assertion — if expand/cancel/factor/solve/limit ever
// returned an unchecked wrong answer, these tests fail loudly.
import assert from 'node:assert/strict'
import {
  casExpand, casCancel, casFactor, casSolve, casLimit, casTaylorSeries, casSubstitute
} from '../src/shared/calculator/modules/cas'
import { CalcError } from '../src/shared/calculator/errors'
import { parse } from '../src/shared/calculator/parser'
import { Evaluator } from '../src/shared/calculator/evaluator'
import { Decimal } from '../src/shared/calculator/numeric'

let checks = 0
const ok = () => { checks++ }

// ---------------------------------------------------------------------------
// 1. Guide rows (section 8)
// ---------------------------------------------------------------------------
assert.equal(casExpand('(x + 1)^2', 'x'), 'x^2 + 2*x + 1'); ok()
assert.equal(casExpand('(x + 2)*(x - 3)', 'x'), 'x^2 - x - 6'); ok()
assert.equal(casCancel('(x^2 - 1)/(x - 1)', 'x'), 'x + 1'); ok()
assert.equal(casCancel('(2*x^2 + 4*x)/(6*x)', 'x'), '(x + 2)/3'); ok()
assert.equal(casFactor('x^2 - 5*x + 6', 'x'), '(x - 2)*(x - 3)'); ok()
assert.equal(casFactor('x^2 + 2*x + 1', 'x'), '(x + 1)^2'); ok()
assert.equal(casFactor('6*x^2 + 12*x', 'x'), '6*x*(x + 2)'); ok()
assert.equal(casFactor('2*x^2 + 3*x - 2', 'x'), '2*(x + 2)*(x - 1/2)'); ok()
assert.equal(casSolve('2*x + 3 = 7', 'x'), 'x = 2'); ok()
assert.equal(casSolve('x^2 - 4 = 0', 'x'), 'x = -2 and x = 2'); ok()
assert.equal(casSolve('x^2 - 5*x + 6 = 0', 'x'), 'x = 2 and x = 3'); ok()
assert.equal(casSolve('x^2 + 2*x + 1 = 0', 'x'), 'x = -1 (double root)'); ok()
assert.equal(casSolve('x = x + 1', 'x'), 'No solution'); ok()
assert.equal(casSolve('x = x', 'x'), 'All values of x'); ok()
assert.match(casSolve('x^2 - 2 = 0', 'x'), /sqrt\(2\)/); ok()
assert.match(casSolve('x^2 - 2 = 0', 'x'), /≈/); ok() // decimal companion
assert.throws(() => casSolve('x^2 + 1 = 0', 'x'), /no real solutions/i); ok()
assert.match(casSolve('2*x^2 + 3*x - 2 = 0', 'x'), /x = -2 and x = 1\/2/); ok()
assert.match(casSolve('0*x^2 + 5 = 0', 'x'), /No solution/); ok() // a = 0 edge: constant
assert.equal(casSolve('0 = 0', 'x'), 'All values of x'); ok()
// Cubic with rational roots.
assert.match(casSolve('x^3 - 6*x^2 + 11*x - 6 = 0', 'x'), /x = 1/); ok()
assert.match(casSolve('x^3 - 6*x^2 + 11*x - 6 = 0', 'x'), /x = 2/); ok()
assert.match(casSolve('x^3 - 6*x^2 + 11*x - 6 = 0', 'x'), /x = 3/); ok()
// Cubic with no rational root: honest refusal, never a guess.
assert.throws(() => casSolve('x^3 + x + 1 = 0', 'x'), /Could not solve/i); ok()
// Non-polynomial equations refused before any numeric work.
assert.throws(() => casSolve('x = sin(x)', 'x'), /not a polynomial/i); ok()
assert.throws(() => casSolve('e^x = 2', 'x'), /irrational|not a polynomial|not supported/i); ok()

// ---------------------------------------------------------------------------
// 2. Limits
// ---------------------------------------------------------------------------
assert.equal(casLimit('sin(x)/x', 'x', '0'), '1'); ok()
assert.equal(casLimit('(1 - cos(x))/x^2', 'x', '0'), '1/2'); ok()
assert.equal(casLimit('(1 + 1/x)^x', 'x', 'inf'), 'e'); ok()
assert.equal(casLimit('1/x', 'x', 'inf'), '0'); ok()
const oneOverZero = casLimit('1/x', 'x', '0')
assert.match(oneOverZero, /Does not exist/); ok()
assert.match(oneOverZero, /left: -infinity/); ok()
assert.match(oneOverZero, /right: \+infinity/); ok()
assert.equal(casLimit('(x^2 - 1)/(x - 1)', 'x', '1'), '2'); ok() // hole filled by cancelling
assert.equal(casLimit('(x^2 + 3)/(x + 2)', 'x', '2'), '1.75'); ok()
assert.equal(casLimit('(2*x^2 + 1)/(x^2 + 1)', 'x', 'inf'), '2'); ok()
assert.equal(casLimit('(x + 1)/x^2', 'x', 'inf'), '0'); ok()
// Standard-table verification failure path cannot be triggered by a wrong claim
// (the engine checks numerically), but an unsupported limit refuses honestly.
assert.throws(() => casLimit('gamma(x)', 'x', '0'), /not a polynomial/i); ok()

// ---------------------------------------------------------------------------
// 3. Taylor
// ---------------------------------------------------------------------------
const expSeries = casTaylorSeries('e^x', 'x', 0, 3)
assert.match(expSeries, /\(1\/6\)\*x\^3/); ok()
const sinSeries = casTaylorSeries('sin(x)', 'x', 0, 5) // degree 5, not 11
assert.ok(!sinSeries.includes('x^7'), `degree cap broken: ${sinSeries}`); ok()
assert.match(sinSeries, /x\^5/); ok()
const cosSeries = casTaylorSeries('cos(x)', 'x', 0, 4)
assert.ok(!cosSeries.includes('x^6'), `degree cap broken: ${cosSeries}`); ok()
const lnSeries = casTaylorSeries('ln(1+x)', 'x', 0, 4)
assert.match(lnSeries, /- \(1\/4\)\*x\^4/); ok()
// Each series must approximate its function at small x (already engine-checked,
// re-checked here independently).
const evalAt = (expr: string, x: number): number => Number(casSubstitute(expr, 'x', x))
for (const x of [0.05, 0.1, 0.3]) {
  assert.ok(Math.abs(evalAt(expSeries, x) - Math.exp(x)) < 5e-3, `e^x series off at ${x}`); ok()
  assert.ok(Math.abs(evalAt(sinSeries, x) - Math.sin(x)) < 5e-3, `sin series off at ${x}`); ok()
  assert.ok(Math.abs(evalAt(cosSeries, x) - Math.cos(x)) < 5e-3, `cos series off at ${x}`); ok()
  assert.ok(Math.abs(evalAt(lnSeries, x) - Math.log(1 + x)) < 5e-3, `ln series off at ${x}`); ok()
}
// Unsupported functions refuse honestly — never a Taylor(...) placeholder.
assert.throws(() => casTaylorSeries('tan(x)', 'x', 0, 3), /not supported/i); ok()
assert.throws(() => casTaylorSeries('sqrt(x)', 'x', 0, 3), /not supported/i); ok()

// ---------------------------------------------------------------------------
// 4. Caps and negative cases
// ---------------------------------------------------------------------------
assert.throws(() => casExpand('(x + 1)^10000', 'x'), /polynomial degree is limited/i); ok()
assert.throws(() => casExpand('sin(x)', 'x'), /not a polynomial/i); ok()
assert.throws(() => casExpand('2^x', 'x'), /variable in the exponent/i); ok()
assert.throws(() => casCancel('1/(x - x)', 'x'), /Division by zero/i); ok()
// Cancelling a fraction with no common factor returns it unchanged (with the
// constant-denominator reduction), and never invents a cancellation.
assert.equal(casCancel('(x^2 + 1)/(x + 3)', 'x'), '(x^2 + 1)/(x + 3)'); ok()
assert.throws(() => casExpand('x + y', 'x'), /one variable/i); ok()
assert.throws(() => casExpand('pi*x', 'x'), /irrational/i); ok()
assert.equal(casCancel('5', 'x'), '5'); ok() // a constant cancels to itself
// Errors are CalcErrors, never raw engine errors.
for (const fn of [
  () => casExpand('sin(x)'),
  () => casCancel('(x^2 - 1)/(x - 1', 'x'),
  () => casFactor('x^2 + y', 'x'),
  () => casSolve('x^2 = ', 'x'),
  () => casLimit('1/x', 'x', 'banana'),
  () => casTaylorSeries('!!', 'x', 0, 3)
]) {
  try {
    fn()
    assert.fail('expected a CalcError')
  } catch (err) {
    assert.ok(err instanceof CalcError, `expected CalcError, got ${String(err)}`); ok()
  }
}

// ---------------------------------------------------------------------------
// 5. Property tests: random small-coefficient polynomials through the engine
// ---------------------------------------------------------------------------
// Mulberry32 seeded PRNG (deterministic, reproducible failures).
class Mulberry32 {
  private state: number
  constructor(seed: number) { this.state = seed >>> 0 }
  next(): number {
    this.state |= 0; this.state = (this.state + 0x6d2b79f5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(max: number): number { return Math.floor(this.next() * max) }
}
const rng = new Mulberry32(20261106)

const evalExpr = (expr: string, x: number): number => {
  const e = new Evaluator({ scope: { x: new Decimal(x), __anglemode: new Decimal(1) }, angleMode: 'rad' })
  return e.evaluate(parse(expr)).toNumber()
}

function randomPolyTerm(rngLocal: Mulberry32, degree: number): string {
  const c = rngLocal.int(9) + 1 // 1..9, never zero
  const sign = rngLocal.next() < 0.5 ? '-' : ''
  if (degree === 0) return `${sign}${c}`
  if (degree === 1) return `${sign}${c}*x`
  return `${sign}${c}*x^${degree}`
}

function randomPolynomial(rngLocal: Mulberry32): string {
  const deg = rngLocal.int(4) // 0..4
  const parts: string[] = []
  for (let d = deg; d >= 0; d--) {
    // Coefficients 0..9 with a bias to non-zero; zero terms are skipped.
    if (rngLocal.next() < 0.25 && parts.length > 0) continue
    parts.push(randomPolyTerm(rngLocal, d))
  }
  return parts.length > 0 ? parts.join(' + ') : '1'
}

// Expand: the printed result evaluated at 5 points equals the input there.
for (let i = 0; i < 40; i++) {
  const a = randomPolynomial(rng)
  const b = randomPolynomial(rng)
  const expr = `(${a})*(${b})`
  let expanded: string
  try {
    expanded = casExpand(expr, 'x')
  } catch (err) {
    // Caps are legitimate rejections; wrong answers are not.
    assert.ok(err instanceof CalcError && /limited|not a polynomial|variable/i.test((err as Error).message), `${expr}: ${String(err)}`)
    continue
  }
  for (const x of [-1.9, -0.4, 0.7, 1.3, 2.6]) {
    const want = evalExpr(expr, x)
    const got = evalExpr(expanded, x)
    assert.ok(
      Math.abs(got - want) <= 1e-6 * Math.max(1, Math.abs(want)),
      `expand mismatch for ${expr} at x=${x}: ${got} vs ${want}`
    )
    ok()
  }
}

// Factor: expanding the printed factorisation returns the input, numerically.
for (let i = 0; i < 40; i++) {
  const p = randomPolynomial(rng)
  let factored: string
  try {
    factored = casFactor(p, 'x')
  } catch (err) {
    assert.ok(err instanceof CalcError && /limited|too large/i.test((err as Error).message), `${p}: ${String(err)}`)
    continue
  }
  for (const x of [-1.8, -0.5, 0.6, 1.4, 2.7]) {
    const want = evalExpr(p, x)
    const got = evalExpr(factored, x)
    assert.ok(
      Math.abs(got - want) <= 1e-6 * Math.max(1, Math.abs(want)),
      `factor mismatch for ${p} (printed ${factored}) at x=${x}: ${got} vs ${want}`
    )
    ok()
  }
}

// Cancel: the cancelled fraction equals the original wherever the original is defined.
for (let i = 0; i < 30; i++) {
  const numPoly = randomPolynomial(rng)
  const denPoly = randomPolynomial(rng)
  if (/x\^0/.test(denPoly) === false && !/^\d+$/.test(denPoly)) {
    // Keep denominators honest polynomials; skip expressions that are not a
    // polynomial ratio (the engine refuses those with a CalcError anyway).
  }
  const expr = `(${numPoly})/(${denPoly})`
  let cancelled: string
  try {
    cancelled = casCancel(expr, 'x')
  } catch (err) {
    // Division by zero in the building step or caps are legitimate rejections.
    assert.ok(err instanceof CalcError, `${expr}: ${String(err)}`)
    continue
  }
  for (const x of [-1.6, -0.3, 0.8, 1.5, 2.4]) {
    const want = evalExpr(expr, x)
    if (!Number.isFinite(want)) continue // original undefined at this point
    const got = evalExpr(cancelled, x)
    assert.ok(
      Math.abs(got - want) <= 1e-6 * Math.max(1, Math.abs(want)),
      `cancel mismatch for ${expr} (printed ${cancelled}) at x=${x}: ${got} vs ${want}`
    )
    ok()
  }
}

// Solve: every reported root satisfies the original equation (engine-checked; the
// generated quadratics below always have rational roots by construction).
for (let i = 0; i < 30; i++) {
  const r1 = rng.int(11) - 5
  const r2 = rng.int(11) - 5
  const b = -(r1 + r2)
  const c = r1 * r2
  const expr = `x^2 ${b >= 0 ? '+ ' + b : '- ' + -b}*x ${c >= 0 ? '+ ' + c : '- ' + -c} = 0`
  const out = casSolve(expr, 'x')
  for (const root of [r1, r2]) {
    const m = new RegExp(`x = ${root}(\\D|$)`).test(out)
    assert.ok(m, `${expr}: expected root ${root} in "${out}"`)
    ok()
  }
}

console.log(`ok   ${checks} exact-CAS engine tests passed (solve/expand/cancel/factor/limit/Taylor, property + negative)`)
