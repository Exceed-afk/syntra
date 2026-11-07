// Exact-rational polynomials for the CAS module.
//
// The golden rule of the CAS (docs/calculator-testing-guide.md section 8) is that a wrong
// answer is far worse than "could not solve". Every answer produced here is exact, so it can
// be checked exactly (and is — see the numeric self-checks in index.ts). No floating point
// ever enters the algebra: coefficients are BigInt pairs (numerator/denominator), reduced
// with Euclid's GCD, and the variable part is a dense array indexed by exponent.
//
// Everything in this file is pure: no imports beyond limits/errors, no DOM, no evaluator.

import { CALC_LIMITS, limitMessage } from '../../limits'
import { CalcError } from '../../errors'
import type { ASTNode } from '../../parser'

// ---------- exact rationals ----------

/** Greatest common divisor of two non-negative BigInts. */
export function bigintGcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** An exact rational number: always reduced, denominator always positive. Zero is 0/1. */
export interface Rat {
  n: bigint
  d: bigint
}

export function ratMake(n: bigint, d: bigint): Rat {
  if (d === 0n) throw new CalcError('Division by zero in exact rational arithmetic')
  if (d < 0n) {
    n = -n
    d = -d
  }
  const g = bigintGcd(n < 0n ? -n : n, d) || 1n
  return { n: n / g, d: d / g }
}

const ZERO: Rat = { n: 0n, d: 1n }
const ONE: Rat = { n: 1n, d: 1n }

function ratIsZero(r: Rat): boolean {
  return r.n === 0n
}

function ratAdd(a: Rat, b: Rat): Rat {
  // a/d + b/e = (a*e + b*d) / (d*e), reduced by ratMake
  return ratMake(a.n * b.d + b.n * a.d, a.d * b.d)
}

function ratSub(a: Rat, b: Rat): Rat {
  return ratMake(a.n * b.d - b.n * a.d, a.d * b.d)
}

function ratMul(a: Rat, b: Rat): Rat {
  return ratMake(a.n * b.n, a.d * b.d)
}

function ratDiv(a: Rat, b: Rat): Rat {
  if (ratIsZero(b)) throw new CalcError('Division by zero in exact rational arithmetic')
  return ratMake(a.n * b.d, a.d * b.n)
}

function ratNeg(a: Rat): Rat {
  return { n: -a.n, d: a.d }
}

function ratEquals(a: Rat, b: Rat): boolean {
  return a.n === b.n && a.d === b.d
}

/** True when the rational is a whole number (denominator 1). */
function ratIsInteger(r: Rat): boolean {
  return r.d === 1n
}

/** Human-readable form used inside results: "3", "-1/2". */
function ratToString(r: Rat): string {
  if (r.d === 1n) return r.n.toString()
  return `${r.n}/${r.d}`
}

// ---------- the polynomial type ----------

/**
 * A univariate polynomial with exact rational coefficients, stored densely:
 * `coeffs[i]` is the coefficient of var^i. `coeffs[coeffs.length - 1]` is never zero
 * unless the polynomial itself is zero (which is stored as `[]`).
 */
export interface Poly {
  /** Exponent of the highest non-zero term; 0 for the zero polynomial. */
  deg: number
  coeffs: Rat[]
}

/** The caps check that runs on every coefficient that is appended. */
function checkCoefficientCap(r: Rat): void {
  const digits = Math.max(r.n.toString().length, r.d.toString().length)
  if (digits > CALC_LIMITS.casPolyCoefficientDigits) {
    throw new CalcError(limitMessage('casPolyCoefficientDigits', '(a coefficient grew too large — try a smaller input)'))
  }
}

export function polyFromCoefficients(coeffs: Rat[]): Poly {
  // Trim trailing zeros and cap-check everything once.
  const trimmed: Rat[] = []
  let deg = 0
  for (let i = coeffs.length - 1; i >= 0; i--) {
    if (!ratIsZero(coeffs[i]) || trimmed.length > 0) {
      checkCoefficientCap(coeffs[i])
      trimmed[i] = coeffs[i]
      deg = Math.max(deg, i)
    }
  }
  const out: Rat[] = []
  for (let i = 0; i <= deg; i++) out.push(trimmed[i] ?? ZERO)
  // Degree cap: the number of nonzero terms bounds the work of everything downstream.
  const terms = out.filter((c) => !ratIsZero(c)).length
  if (deg > CALC_LIMITS.casPolyDegree) {
    throw new CalcError(limitMessage('casPolyDegree', `(this polynomial has degree ${deg})`))
  }
  if (terms > CALC_LIMITS.casPolyTerms) {
    throw new CalcError(limitMessage('casPolyTerms', `(this polynomial has ${terms} non-zero terms)`))
  }
  return { deg, coeffs: out }
}

export function polyIsZero(p: Poly): boolean {
  return p.deg === 0 && (p.coeffs.length === 0 || ratIsZero(p.coeffs[0]))
}

/** Coefficient of x^i (0 outside the stored range). */
export function polyCoeff(p: Poly, i: number): Rat {
  return i >= 0 && i < p.coeffs.length ? p.coeffs[i] : ZERO
}

export function polyAdd(a: Poly, b: Poly): Poly {
  const n = Math.max(a.deg, b.deg) + 1
  const out: Rat[] = []
  for (let i = 0; i < n; i++) out.push(ratAdd(polyCoeff(a, i), polyCoeff(b, i)))
  return polyFromCoefficients(out)
}

export function polySub(a: Poly, b: Poly): Poly {
  const n = Math.max(a.deg, b.deg) + 1
  const out: Rat[] = []
  for (let i = 0; i < n; i++) out.push(ratSub(polyCoeff(a, i), polyCoeff(b, i)))
  return polyFromCoefficients(out)
}

export function polyNeg(a: Poly): Poly {
  return polyFromCoefficients(a.coeffs.map(ratNeg))
}

export function polyScale(a: Poly, k: Rat): Poly {
  if (ratIsZero(k)) return polyFromCoefficients([])
  return polyFromCoefficients(a.coeffs.map((c) => ratMul(c, k)))
}

export function polyMul(a: Poly, b: Poly): Poly {
  if (polyIsZero(a) || polyIsZero(b)) return polyFromCoefficients([])
  // Degree and term caps are checked inside polyFromCoefficients, so a product that
  // would be enormous stops here rather than after the work.
  const out: Rat[] = new Array(a.deg + b.deg + 1).fill(ZERO)
  for (let i = 0; i <= a.deg; i++) {
    const ca = a.coeffs[i]
    if (ratIsZero(ca)) continue
    for (let j = 0; j <= b.deg; j++) {
      const cb = b.coeffs[j]
      if (ratIsZero(cb)) continue
      out[i + j] = ratAdd(out[i + j], ratMul(ca, cb))
    }
  }
  return polyFromCoefficients(out)
}

/** Non-negative integer power only. The exponent cap comes from casPolyDegree. */
export function polyPow(a: Poly, exp: number): Poly {
  if (!Number.isInteger(exp) || exp < 0) {
    throw new CalcError('Only whole-number powers of polynomials are supported')
  }
  let result = polyFromCoefficients([ONE])
  let base = a
  let remaining = exp
  while (remaining > 0) {
    if (remaining & 1) result = polyMul(result, base)
    remaining >>= 1
    if (remaining > 0) base = polyMul(base, base)
  }
  return result
}

/** Exact equality of two polynomials. */
export function polyEquals(a: Poly, b: Poly): boolean {
  const n = Math.max(a.deg, b.deg)
  for (let i = 0; i <= n; i++) {
    if (!ratEquals(polyCoeff(a, i), polyCoeff(b, i))) return false
  }
  return true
}

/** Polynomial long division. Throws when the divisor is the zero polynomial. */
export function polyDivMod(a: Poly, b: Poly): { quotient: Poly; remainder: Poly } {
  if (polyIsZero(b)) throw new CalcError('Division by zero in polynomial division')
  let rem = a.coeffs.slice()
  const leadB = b.coeffs[b.deg]
  const q: Rat[] = []
  for (let k = a.deg - b.deg; k >= 0; k--) {
    const factor = ratDiv(polyCoeff({ deg: rem.length - 1, coeffs: rem }, k + b.deg), leadB)
    q[k] = factor
    if (!ratIsZero(factor)) {
      for (let j = 0; j <= b.deg; j++) {
        rem[k + j] = ratSub(rem[k + j], ratMul(factor, b.coeffs[j]))
      }
    }
  }
  return {
    quotient: polyFromCoefficients(q),
    remainder: polyFromCoefficients(rem.slice(0, b.deg))
  }
}

/**
 * GCD of two polynomials over the rationals (Euclid on remainders). The result is
 * normalised to a positive leading coefficient so the caller sees a canonical factor.
 * g(0, 0) is defined as 1 (the GCD of two zero polynomials is everything; 1 is the
 * honest neutral answer for "no common factor").
 */
export function polyGcd(a: Poly, b: Poly): Poly {
  let x = a
  let y = b
  while (!polyIsZero(y)) {
    const r = polyDivMod(x, y).remainder
    x = y
    y = r
  }
  if (polyIsZero(x)) return polyFromCoefficients([ONE])
  // Normalise: leading coefficient positive and (for a canonical answer) 1.
  const lead = x.coeffs[x.deg]
  const scale = ratDiv(ONE, lead.n < 0n ? ratNeg(lead) : lead)
  return polyScale(x, scale)
}

/** Exact rational evaluation p(value). */
export function polyEval(p: Poly, value: Rat): Rat {
  // Horner from the top.
  let acc = ZERO
  for (let i = p.deg; i >= 0; i--) {
    acc = ratAdd(ratMul(acc, value), polyCoeff(p, i))
  }
  return acc
}

// ---------- conversion from the parse tree ----------

/**
 * Identifiers that behave as constants, not variables, in CAS expressions.
 * `i` is deliberately absent: the CAS algebra works over the rationals, so an `i`
 * is treated as a second variable name and then rejected by the one-variable check.
 */
const CAS_CONSTANTS = new Set(['pi', 'e', 'π'])

interface BuildResult {
  /** numerator polynomial */
  num: Poly
  /** denominator polynomial (a ratio of polynomials is allowed, e.g. 1/(x+1)) */
  den: Poly
  /** the one variable name the expression uses, or null for a pure number */
  variable: string | null
}

/** Small helpers over the raw build result before the caps check. */
function buildNode(node: ASTNode, varName: string | null): BuildResult {
  switch (node.type) {
    case 'Number': {
      // The literal came from the tokenizer, so it is a plain decimal string.
      const r = decimalStringToRat(node.value)
      return { num: constPoly(r), den: constPoly(ONE), variable: null }
    }
    case 'Identifier': {
      const name = node.name.toLowerCase()
      if (CAS_CONSTANTS.has(name) || name === 'π') {
        // The exact value of pi/e is irrational; the CAS evaluates numerically only
        // for the self-check, so inside the algebra a constant is not representable.
        throw new CalcError(
          `"${node.name}" is a constant with an irrational value — CAS polynomial operations need a polynomial (a number times powers of the variable)`
        )
      }
      if (varName !== null && name !== varName) {
        throw new CalcError(
          `CAS polynomial operations support one variable (got "${node.name}" and "${varName}")`
        )
      }
      return { num: varPoly(), den: constPoly(ONE), variable: name }
    }
    case 'UnaryOp': {
      const inner = buildNode(node.operand, varName)
      if (node.operator === '-') return { num: polyNeg(inner.num), den: inner.den, variable: inner.variable }
      return inner
    }
    case 'BinaryOp': {
      const left = buildNode(node.left, varName)
      const right = buildNode(node.right, left.variable ?? varName)
      const variable = left.variable ?? right.variable
      switch (node.operator) {
        case '+':
          return { num: polyAdd(left.num, right.num), den: polyMul(left.den, right.den), variable }
        case '-':
          return { num: polySub(left.num, right.num), den: polyMul(left.den, right.den), variable }
        case '*':
          return { num: polyMul(left.num, right.num), den: polyMul(left.den, right.den), variable }
        case '/': {
          if (polyIsZero(right.num) && right.den.deg === 0) {
            // Denominator is the rational zero: a true division by zero.
            throw new CalcError('Division by zero in CAS expression')
          }
          return { num: polyMul(left.num, right.den), den: polyMul(left.den, right.num), variable }
        }
        case '%': {
          throw new CalcError('The modulo operator is not supported in CAS polynomial operations')
        }
        case '^': {
          // Only constant whole-number exponents, or (x)^n where the base is a pure number.
          if (right.num.deg === 0 && right.den.deg === 0) {
            const exp = right.num.coeffs[0]
            if (!ratIsInteger(exp) || exp.n < 0n) {
              throw new CalcError(
                'CAS polynomial operations support whole-number non-negative exponents only'
              )
            }
            if (exp.n > BigInt(CALC_LIMITS.casPolyDegree)) {
              throw new CalcError(limitMessage('casPolyDegree', `(this power would reach ${exp.n})`))
            }
            const expNum = Number(exp.n)
            return {
              num: polyPow(left.num, expNum),
              den: polyPow(left.den, expNum),
              variable: left.variable ?? right.variable
            }
          }
          // Variable in the exponent (x^x, 2^(x+1)): not a polynomial.
          throw new CalcError('A variable in the exponent is not a polynomial — CAS polynomial operations do not support it')
        }
        default: {
          const op = (node as { operator?: string }).operator ?? '?'
          throw new CalcError(`Operator "${op}" is not supported in CAS polynomial operations`)
        }
      }
    }
    case 'FunctionCall':
      throw new CalcError(
        `"${node.name}(...)" is not a polynomial — CAS polynomial operations support sums, products, powers and quotients of polynomials only`
      )
    case 'PercentSuffix': {
      // 50% in CAS terms is 0.5 — postfix percent has the same meaning as the bar.
      const inner = buildNode(node.operand, varName)
      return { num: polyScale(inner.num, { n: 1n, d: 100n }), den: inner.den, variable: inner.variable }
    }
    case 'Assignment':
      throw new CalcError('Assignments are not supported in CAS polynomial operations')
    case 'CurrencyConversion':
      throw new CalcError('Currency conversions are not supported in CAS polynomial operations')
    default:
      throw new CalcError('This expression is not supported by CAS polynomial operations')
  }
}

function constPoly(r: Rat): Poly {
  return polyFromCoefficients([r])
}

function varPoly(): Poly {
  const c: Rat[] = [ZERO, ONE]
  return polyFromCoefficients(c)
}

/** A decimal literal string ("3", "2.5", "1e3") as an exact rational. */
function decimalStringToRat(text: string): Rat {
  const t = text.trim()
  const match = /^([+-]?)(\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(t)
  if (!match) throw new CalcError(`"${t}" is not a number the CAS understands`)
  const [, sign, intPart, fracPart = '', expPart] = match
  const digits = (intPart || '0') + fracPart
  let n = BigInt(digits === '' ? '0' : digits)
  const scale = BigInt(fracPart.length) - BigInt(expPart ? Number(expPart) : 0)
  if (scale > 0n) {
    return ratMake(sign === '-' ? -n : n, 10n ** scale)
  }
  if (scale < 0n) n = n * 10n ** -scale
  return ratMake(sign === '-' ? -n : n, 1n)
}

/** First variable name found in the tree (case preserved), or null. */
export function findVariable(node: ASTNode): string | null {
  switch (node.type) {
    case 'Identifier':
      return CAS_CONSTANTS.has(node.name.toLowerCase()) || node.name === 'π' ? null : node.name
    case 'UnaryOp':
    case 'PercentSuffix':
      return findVariable(node.operand)
    case 'BinaryOp':
      return findVariable(node.left) ?? findVariable(node.right)
    case 'FunctionCall':
      for (const arg of node.args) {
        const v = findVariable(arg)
        if (v !== null) return v
      }
      return null
    default:
      return null
  }
}

/**
 * Convert a parse-tree expression into an exact rational function (num/den polynomials
 * in one variable). Anything that is not a polynomial or a ratio of polynomials — sin,
 * ln, a variable in an exponent, two variables, an irrational constant — throws a
 * CalcError with an honest message. Caps (degree/terms/coefficient size) are enforced.
 */
export function toRationalFunction(ast: ASTNode): { num: Poly; den: Poly; variable: string | null } {
  const guessed = findVariable(ast)
  const built = buildNode(ast, guessed)
  const variable = built.variable ?? guessed
  // A pure number has variable null and stays that way.
  if (variable === null) return { num: built.num, den: built.den, variable: null }
  return { num: built.num, den: built.den, variable }
}

/** Cancel the common factor of a rational function; returns [num, den] with positive denominator. */
export function cancelRationalFunction(
  num: Poly,
  den: Poly
): { num: Poly; den: Poly; removed: Poly } {
  if (polyIsZero(den)) throw new CalcError('Division by zero in CAS expression')
  const g = polyGcd(num, den)
  // polyGcd returns a monic (leading coefficient 1) canonical GCD, so the cancelled
  // pair keeps the same leading-coefficient ratio as the input.
  let n = num
  let d = den
  if (!polyIsZero(g) && !(g.deg === 0)) {
    const divN = polyDivMod(num, g)
    const divD = polyDivMod(den, g)
    if (polyIsZero(divN.remainder) && polyIsZero(divD.remainder)) {
      n = divN.quotient
      d = divD.quotient
    }
  }
  // Keep the denominator's leading coefficient positive.
  if (d.deg >= 0 && !ratIsZero(d.coeffs[d.deg]) && d.coeffs[d.deg].n < 0n) {
    n = polyNeg(n)
    d = polyNeg(d)
  }
  return { num: n, den: d, removed: g }
}

// ---------- printing ----------

/** A coefficient as "3", "-1/2", "(1/2)" when it needs brackets inside a product. */
function coefficientText(r: Rat, brackets: boolean): string {
  const s = ratToString(r)
  if (!brackets) return s
  return r.d === 1n ? s : `(${s})`
}

/**
 * Print a polynomial in descending powers, matching the CAS's existing style
 * (`2*x`, `x^2 - x - 6`). The zero polynomial prints as "0".
 */
export function polyToString(p: Poly, variable = 'x'): string {
  const terms: string[] = []
  for (let i = p.deg; i >= 0; i--) {
    const c = p.coeffs[i]
    if (ratIsZero(c)) continue
    const absC: Rat = c.n < 0n ? ratNeg(c) : c
    const isOne = absC.n === 1n && absC.d === 1n
    let term: string
    if (i === 0) {
      term = coefficientText(absC, false)
    } else {
      const power = i === 1 ? variable : `${variable}^${i}`
      term = isOne ? power : `${coefficientText(absC, true)}*${power}`
    }
    terms.push(c.n < 0n ? `- ${term}` : (terms.length === 0 ? term : `+ ${term}`))
  }
  if (terms.length === 0) return '0'
  return terms.join(' ')
}

/**
 * Print a rational function num/den. Delegates to the CAS printer in factor.ts's
 * expandRationalFunction for consistency: constant denominators reduce fully, and
 * non-constant denominators get parentheses on both sides.
 */
export function rationalFunctionToString(num: Poly, den: Poly, variable = 'x'): string {
  // Lazy import would cycle; replicate the two rules here instead (both small):
  if (den.deg === 0) {
    const d = den.coeffs[0]
    if (d.n === 1n && d.d === 1n) return polyToString(num, variable)
    const scaled = num.coeffs.map((c) => ratDiv(c, d))
    if (scaled.every((c) => ratIsInteger(c))) return polyToString(polyFromCoefficients(scaled), variable)
    const numText = polyToString(num, variable)
    return `${numText.includes(' ') ? `(${numText})` : numText}/${ratToString(d)}`
  }
  const numText = polyToString(num, variable)
  const denText = polyToString(den, variable)
  return `${numText.includes(' ') ? `(${numText})` : numText}/${denText.includes(' ') ? `(${denText})` : denText}`
}

/** A polynomial as a printable product of factors, e.g. `6*x*(x + 2)`. */
export function factorListToString(
  constant: Rat,
  factors: Array<{ poly: Poly; power: number }>,
  variable = 'x'
): string {
  const parts: string[] = []
  const absConstant: Rat = constant.n < 0n ? ratNeg(constant) : constant
  if (!(absConstant.n === 1n && absConstant.d === 1n)) {
    parts.push(coefficientText(absConstant, true))
  }
  for (const f of factors) {
    if (f.poly.deg === 0) continue // constants are already in the scalar
    const text = polyToString(f.poly, variable)
    const needsParens = f.poly.deg > 0 && (f.power !== 1 || polyTermCount(f.poly) > 1)
    const core = needsParens ? `(${text})` : text
    parts.push(f.power === 1 ? core : `${core}^${f.power}`)
  }
  if (parts.length === 0) return '0'
  let out = parts.join('*')
  if (constant.n < 0n) out = `-${out}`
  return out
}

function polyTermCount(p: Poly): number {
  let n = 0
  for (const c of p.coeffs) if (!ratIsZero(c)) n++
  return n
}

/** Evaluate a rational function at a rational point (exact). */
export function rationalFunctionEval(
  num: Poly,
  den: Poly,
  value: Rat
): Rat {
  if (polyIsZero(den) || ratIsZero(polyEval(den, value))) {
    throw new CalcError('Division by zero in CAS expression')
  }
  return ratDiv(polyEval(num, value), polyEval(den, value))
}

// ---------- integer helpers for roots ----------

/** The integer square root of a non-negative BigInt (exact; null when not a perfect square). */
export function bigintSqrtExact(v: bigint): bigint | null {
  if (v < 0n) return null
  if (v < 2n) return v
  let x = BigInt(Math.floor(Math.sqrt(Number(v))))
  // Number(v) loses precision for huge v; correct by Newton steps in BigInt.
  if (x * x > v) x = x >> 1n
  while (x * x > v) x = (x + v / x) >> 1n
  while ((x + 1n) * (x + 1n) <= v) x++
  return x * x === v ? x : null
}

export const ratHelpers = {
  zero: ZERO,
  one: ONE,
  make: ratMake,
  add: ratAdd,
  sub: ratSub,
  mul: ratMul,
  div: ratDiv,
  neg: ratNeg,
  equals: ratEquals,
  isZero: ratIsZero,
  isInteger: ratIsInteger,
  toString: ratToString,
  fromDecimalString: decimalStringToRat
}
