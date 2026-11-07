// CAS operations on exact polynomials: expand, cancel, factor, solve.
//
// Every public function here returns an exact string built from exact arithmetic and
// then runs the numeric self-check (index.ts) before its answer reaches the user.
// Anything the algebra cannot do exactly throws a CalcError with an honest message.

import { CalcError } from '../../errors'
import {
  type Poly,
  type Rat,
  polyToString,
  polyEquals,
  polyIsZero,
  polyCoeff,
  polyDivMod,
  polyGcd,
  ratHelpers,
  bigintSqrtExact
} from './poly'

const { one, make, isZero, equals, mul, div, sub, neg, isInteger } = ratHelpers

// ---------- expand ----------

/** Expand a numerator/denominator pair into the printed product of polynomials. */
export function expandRationalFunction(
  num: Poly,
  den: Poly,
  variable: string | null
): string {
  const v = variable ?? 'x'
  if (den.deg === 0) {
    const d = den.coeffs[0]
    if (d.n === 1n && d.d === 1n) return polyToString(num, v)
    // c/d with d constant: fold into coefficients when it divides each coefficient
    // exactly; otherwise reduce the fraction by the common factor and print the
    // honest reduced fraction. The numerator is always parenthesised when it is a
    // multi-term sum or starts with a sign, so the fraction bar stays unambiguous
    // in plain text ((x^3 - 7)/3, not x^3 - 7/3).
    const scaled = num.coeffs.map((c) => div(c, d))
    if (scaled.every(isInteger)) return polyToString({ deg: num.deg, coeffs: scaled }, v)
    // Reduce the whole fraction by the common factor of the numerator's integer
    // content and the denominator's numerator: (2x+4)/6 → (x+2)/3. The den pair
    // (d.n/g)/d.d is then reduced once more, and any sign moves to the numerator.
    const numContent = num.coeffs.reduce((acc, c) => (c.n === 0n ? acc : gcdBig(acc, c.n < 0n ? -c.n : c.n)), 0n) || 1n
    const g = gcdBig(numContent, d.n < 0n ? -d.n : d.n)
    if (g > 1n) {
      const partialNum = num.coeffs.map((c) => div(c, make(g, 1n)))
      const newN = d.n / g
      const g2 = gcdBig(newN < 0n ? -newN : newN, d.d)
      const denSigned = newN / g2
      const denAbs = denSigned < 0n ? -denSigned : denSigned
      const flip = denSigned < 0n
      let numText = polyToString({ deg: num.deg, coeffs: flip ? partialNum.map((c) => neg(c)) : partialNum }, v)
      if (numText.includes(' ')) numText = `(${numText})`
      // A product like 3*x^3 in the denominator binds tighter than '/', so parens
      // are required: (-7)/(3*x^3), never (-7)/3*x^3.
      return denAbs === 1n ? numText : `${numText}/(${polyToString({ deg: 0, coeffs: [{ n: denAbs, d: 1n }] }, v)})`
    }
    let numText = polyToString(num, v)
    if (numText.includes(' ') || numText.startsWith('-')) numText = `(${numText})`
    return `${numText}/${d.d === 1n ? d.n.toString() : `${d.n}/${d.d}`}`
  }
  // Non-constant denominator: parenthesise both sides so `1/(x + 3)` never
  // collapses into `1/x + 3`, and `1/(3*x^3)` never into `1/3*x^3`.
  const numText = polyToString(num, v)
  const denText = polyToString(den, v)
  const numNeeds = numText.includes(' ') || numText.startsWith('-')
  const denNeeds = denText.includes(' ') || denText.includes('*') || denText.startsWith('-')
  return `${numNeeds ? `(${numText})` : numText}/${denNeeds ? `(${denText})` : denText}`
}

// ---------- factoring ----------

interface Factor {
  poly: Poly
  power: number
}

/**
 * Content (integer GCD of numerators / LCM of denominators) pulled out of a polynomial
 * so the primitive part factors over the integers.
 */
function contentOf(p: Poly): Rat {
  let numGcd: bigint | null = null
  let denLcm = 1n
  for (const c of p.coeffs) {
    if (isZero(c)) continue
    numGcd = numGcd === null ? (c.n < 0n ? -c.n : c.n) : gcdBig(numGcd, c.n < 0n ? -c.n : c.n)
    denLcm = (denLcm * c.d) / gcdBig(denLcm, c.d)
  }
  if (numGcd === null) return one
  return make(numGcd, denLcm)
}

function gcdBig(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

function primitivePart(p: Poly): { content: Rat; primitive: Poly } {
  const content = contentOf(p)
  // contentOf is non-negative; the SIGN of the leading coefficient belongs to the
  // content too (−7x = −7·x, not 7·x with a negative x factor).
  const lead = polyCoeff(p, p.deg)
  const signedContent: Rat = lead.n < 0n ? neg(content) : content
  // Divide each coefficient by the signed content.
  const primitive: Poly = {
    deg: p.deg,
    coeffs: p.coeffs.map((c) => make(c.n * signedContent.d, c.d * signedContent.n))
  }
  return { content: signedContent, primitive }
}

/** All positive divisors of a BigInt (capped so a hostile coefficient cannot hang us). */
function divisorsOf(v: bigint): bigint[] {
  const n = v < 0n ? -v : v
  if (n > 10n ** 12n) {
    throw new CalcError('The coefficients are too large for exact factoring')
  }
  const out: bigint[] = []
  for (let i = 1n; i * i <= n; i++) {
    if (n % i === 0n) {
      out.push(i)
      if (i !== n / i) out.push(n / i)
    }
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** Exact evaluation of p at rational r (Horner). */
function evaluateAt(p: Poly, r: Rat): Rat {
  let acc = make(0n, 1n)
  for (let i = p.deg; i >= 0; i--) {
    acc = ratHelpers.add(ratHelpers.mul(acc, r), polyCoeff(p, i))
  }
  return acc
}

function pushFactor(out: Factor[], poly: Poly, power: number): void {
  const same = out.find((m) => polyEquals(m.poly, poly))
  if (same) same.power += power
  else out.push({ poly, power })
}

/** One exact rational root by the rational root theorem, verified by exact evaluation. */
function findRationalRoot(p: Poly): Rat | null {
  const a0 = polyCoeff(p, 0)
  const an = polyCoeff(p, p.deg)
  const ps = divisorsOf(a0.n)
  const qs = divisorsOf(an.n)
  for (const q of qs) {
    for (const pc of ps) {
      for (const s of [1n, -1n]) {
        const candidate = make(s * pc, q)
        if (isZero(evaluateAt(p, candidate))) return candidate
      }
    }
  }
  return null
}

/**
 * Exact roots of a*x^2 + b*x + c when disc = b^2 - 4ac is a rational square.
 * sqrt(n/d) is rational exactly when n and d are both perfect squares.
 */
export function quadraticExactRoots(a: Rat, b: Rat, c: Rat): [Rat, Rat] | null {
  const disc = sub(mul(b, b), mul(make(4n, 1n), mul(a, c)))
  if (disc.n < 0n) return null
  const nRoot = bigintSqrtExact(disc.n)
  const dRoot = bigintSqrtExact(disc.d)
  if (nRoot === null || dRoot === null) return null
  const sq = make(nRoot, dRoot)
  const r1 = div(sub(neg(b), sq), mul(make(2n, 1n), a))
  const r2 = div(sub(neg(b), neg(sq)), mul(make(2n, 1n), a))
  return [r1, r2]
}

/**
 * Factor a polynomial over the rationals, exactly: content first (6x^2 + 12x =
 * 6x(x + 2)), then exact rational roots (each verified by exact evaluation), then
 * quadratics by the discriminant. Whatever has no exact factor stays as a factor
 * (x^2 + 1 over the rationals). The identity p = constant * prod factors holds by
 * construction, and index.ts re-verifies it before showing anything.
 */
export function factorPolynomial(p: Poly): { constant: Rat; factors: Factor[] } {
  if (polyIsZero(p)) return { constant: make(0n, 1n), factors: [] }
  let { content, primitive } = primitivePart(p)
  const factors: Factor[] = []

  // x^k first (constant term zero).
  while (primitive.deg > 0 && isZero(polyCoeff(primitive, 0))) {
    pushFactor(factors, { deg: 1, coeffs: [make(0n, 1n), one] }, 1)
    primitive = { deg: primitive.deg - 1, coeffs: primitive.coeffs.slice(1) }
  }

  // Rational roots on the primitive part, dividing out (x - r) each time.
  for (;;) {
    if (primitive.deg <= 2) break
    if (isZero(polyCoeff(primitive, 0))) {
      pushFactor(factors, { deg: 1, coeffs: [make(0n, 1n), one] }, 1)
      primitive = { deg: primitive.deg - 1, coeffs: primitive.coeffs.slice(1) }
      continue
    }
    const candidate = findRationalRoot(primitive)
    if (candidate === null) break
    const lin: Poly = { deg: 1, coeffs: [neg(candidate), one] }
    const dm = polyDivMod(primitive, lin)
    if (!polyIsZero(dm.remainder)) break // exactness guard; never expected
    pushFactor(factors, lin, 1)
    primitive = dm.quotient
  }

  // Degree 2 left over: exact factors only when the discriminant is a rational square.
  if (primitive.deg === 2) {
    const a = polyCoeff(primitive, 2)
    const b = polyCoeff(primitive, 1)
    const c = polyCoeff(primitive, 0)
    const roots = quadraticExactRoots(a, b, c)
    if (roots !== null) {
      pushFactor(factors, { deg: 1, coeffs: [neg(roots[0]), one] }, 1)
      pushFactor(factors, { deg: 1, coeffs: [neg(roots[1]), one] }, 1)
      // a*x^2+bx+c = a*(x-r1)(x-r2): the a joins the content.
      content = mul(content, a)
      primitive = { deg: 0, coeffs: [] }
    }
  }

  // Degree 1 left over: a*x + b = a*(x + b/a); the a joins the content.
  if (primitive.deg === 1) {
    const a = polyCoeff(primitive, 1)
    const b = polyCoeff(primitive, 0)
    const root = div(neg(b), a)
    pushFactor(factors, { deg: 1, coeffs: [neg(root), one] }, 1)
    content = mul(content, a)
    primitive = { deg: 0, coeffs: [] }
  }

  // Whatever remains (degree >= 2, no exact factor found) is irreducible over the
  // rationals as far as this engine goes: keep it as a factor.
  if (primitive.deg > 0) {
    pushFactor(factors, primitive, 1)
  }

  // Merge repeated factors (x^2 + 2x + 1 → (x + 1)^2).
  const merged: Factor[] = []
  for (const f of factors) {
    if (f.poly.deg === 0) continue
    const same = merged.find((m) => polyEquals(m.poly, f.poly))
    if (same) same.power += f.power
    else merged.push({ poly: f.poly, power: f.power })
  }
  return { constant: content, factors: merged }
}

// ---------- solving ----------
/** Print a factorisation like `6*x*(x + 2)` or `(x + 1)^2`. */
export function factorizationToString(constant: Rat, factors: Factor[], variable: string): string {
  const parts: string[] = []
  const absConstant: Rat = constant.n < 0n ? neg(constant) : constant
  if (!(absConstant.n === 1n && absConstant.d === 1n)) {
    parts.push(absConstant.d === 1n ? absConstant.n.toString() : `(${absConstant.n}/${absConstant.d})`)
  }
  for (const f of factors) {
    const text = polyToString(f.poly, variable)
    const needsParens = text.includes(' ') || text.includes('/')
    const core = needsParens ? `(${text})` : text
    parts.push(f.power === 1 ? core : `${core}^${f.power}`)
  }
  if (parts.length === 0) return constant.n === 0n ? '0' : `${constant.n}/${constant.d}`.replace('/1', '')
  let out = parts.join('*')
  if (constant.n < 0n) out = `-${out}`
  return out
}

export interface SolveResult {
  kind: 'none' | 'all' | 'roots'
  /** exact roots with multiplicity, when kind is 'roots' */
  roots: Array<{ value: Rat; multiplicity: number }>
  /**
   * Present only for quadratics whose discriminant is NOT a rational square:
   * roots = (-b ± sqrt(disc)) / (2a), still exact as a description.
   */
  quadraticForm?: { a: Rat; b: Rat; disc: Rat } | null
}

function pushRoot(roots: Array<{ value: Rat; multiplicity: number }>, value: Rat): void {
  const same = roots.find((r) => equals(r.value, value))
  if (same) same.multiplicity += 1
  else roots.push({ value, multiplicity: 1 })
}

/**
 * Solve p = 0 exactly. Linear and quadratic are complete; degree 3+ only reports
 * exact rational roots — the caller says "Could not solve" for anything left over.
 */
export function solvePolynomial(p: Poly): SolveResult {
  if (polyIsZero(p)) return { kind: 'all', roots: [] }
  const roots: Array<{ value: Rat; multiplicity: number }> = []
  let work = p
  // Strip x^k: those roots are 0.
  while (work.deg > 0 && isZero(polyCoeff(work, 0))) {
    pushRoot(roots, make(0n, 1n))
    work = { deg: work.deg - 1, coeffs: work.coeffs.slice(1) }
  }
  if (work.deg === 0) {
    return { kind: 'none', roots } // non-zero constant: no solutions
  }
  if (work.deg === 1) {
    const a = polyCoeff(work, 1)
    const b = polyCoeff(work, 0)
    pushRoot(roots, div(neg(b), a))
    return { kind: 'roots', roots }
  }
  if (work.deg === 2) {
    const a = polyCoeff(work, 2)
    const b = polyCoeff(work, 1)
    const c = polyCoeff(work, 0)
    const disc = sub(mul(b, b), mul(make(4n, 1n), mul(a, c)))
    if (isZero(disc)) {
      roots.push({ value: div(neg(b), mul(make(2n, 1n), a)), multiplicity: 2 })
      return { kind: 'roots', roots }
    }
    const exact = quadraticExactRoots(a, b, c)
    if (exact !== null) {
      const [r1, r2] = exact
      if (equals(r1, r2)) {
        // A double root: it is one value with multiplicity 2.
        roots.push({ value: r1, multiplicity: 2 })
      } else {
        roots.push({ value: r1, multiplicity: 1 })
        roots.push({ value: r2, multiplicity: 1 })
      }
      return { kind: 'roots', roots }
    }
    return { kind: 'roots', roots, quadraticForm: { a, b, disc } }
  }
  // Degree 3+: exact rational roots only.
  for (;;) {
    if (work.deg <= 1) break
    if (isZero(polyCoeff(work, 0))) {
      pushRoot(roots, make(0n, 1n))
      work = { deg: work.deg - 1, coeffs: work.coeffs.slice(1) }
      continue
    }
    const cand = findRationalRoot(work)
    if (cand === null) break
    const lin: Poly = { deg: 1, coeffs: [neg(cand), one] }
    const dm = polyDivMod(work, lin)
    if (!polyIsZero(dm.remainder)) break
    pushRoot(roots, cand)
    work = dm.quotient
  }
  if (work.deg === 1) {
    const a = polyCoeff(work, 1)
    const b = polyCoeff(work, 0)
    pushRoot(roots, div(neg(b), a))
    return { kind: 'roots', roots }
  }
  if (work.deg === 0) return { kind: 'roots', roots }
  // A factor of degree >= 2 with no exact rational root remains.
  roots.sort((x, y) => {
    const a = x.value.n * y.value.d
    const b = y.value.n * x.value.d
    return a < b ? -1 : a > b ? 1 : 0
  })
  return { kind: 'roots', roots }
}

/** GCD-based cancellation of a rational function num/den (both exact). */
export function cancelPolynomials(num: Poly, den: Poly): { num: Poly; den: Poly; removed: Poly } {
  if (polyIsZero(den)) throw new CalcError('Division by zero in CAS expression')
  const g = polyGcd(num, den)
  let n = num
  let d = den
  if (g.deg > 0) {
    const dn = polyDivMod(num, g)
    const dd = polyDivMod(den, g)
    if (!polyIsZero(dn.remainder) || !polyIsZero(dd.remainder)) {
      throw new CalcError('Internal: the common factor did not divide exactly')
    }
    n = dn.quotient
    d = dd.quotient
  }
  // Also reduce the scalar fraction: num/den = (cn·pn)/(cd·pd). Reducing cn/cd to
  // lowest terms a/b gives num/den = (a·pn)/(b·pd), so
  //   num' = a·(num/cn)   and   den' = b·(den/cd)
  // keeps the value exactly while removing the common scalar ((2x+4)/6 → (x+2)/3).
  const cn = contentOf(n)
  const cd = contentOf(d)
  if (!(cn.n === 0n) && !(cd.n === 0n)) {
    const gConst = gcdBig(cn.n < 0n ? -cn.n : cn.n, cd.n < 0n ? -cd.n : cd.n) || 1n
    const a = make(cn.n / gConst, cn.d)
    const b = make(cd.n / gConst, cd.d)
    n = { deg: n.deg, coeffs: n.coeffs.map((c) => mul(div(c, cn), a)) }
    d = { deg: d.deg, coeffs: d.coeffs.map((c) => mul(div(c, cd), b)) }
  }
  // Keep the denominator's leading coefficient positive.
  if (d.deg >= 0 && polyCoeff(d, d.deg).n < 0n) {
    n = { deg: n.deg, coeffs: n.coeffs.map(neg) }
    d = { deg: d.deg, coeffs: d.coeffs.map(neg) }
  }
  return { num: n, den: d, removed: g }
}
