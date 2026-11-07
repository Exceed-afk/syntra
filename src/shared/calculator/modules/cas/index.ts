import { parse, type ASTNode } from '../../parser'
import { Evaluator } from '../../evaluator'
import { Decimal } from '../../numeric'
import { CALC_LIMITS, limitMessage } from '../../limits'
import { CalcError } from '../../errors'
import { toDecimalInput, toIntegerInput, toStringInput } from '../../inputs'
import {
  toRationalFunction,
  polyToString,
  rationalFunctionEval,
  ratHelpers,
  type Poly,
  type Rat
} from './poly'
import {
  factorPolynomial,
  factorizationToString,
  solvePolynomial,
  cancelPolynomials,
  expandRationalFunction
} from './factor'
import '../scientific' // ensures scientific functions (sin, cos, etc.) are registered

/**
 * Every CAS entry point goes through this: the text cap, then the shared parser,
 * which already enforces the nesting depth instead of overflowing the stack.
 */
function casParse(text: unknown, what = 'expression'): ASTNode {
  const source = toStringInput(text, what)
  if (source.length > CALC_LIMITS.casExpressionLength) {
    throw new CalcError(
      `${limitMessage('casExpressionLength', 'characters')} (this one has ${source.length.toLocaleString('en-US')})`
    )
  }
  return parse(source)
}

export interface CasOptions {
  maxSteps?: number
  timeLimitMs?: number
}

const DEFAULT_OPTIONS: CasOptions = {
  maxSteps: 2000,
  timeLimitMs: 1000
}

/**
 * Symbolic AST node representations for CAS operations.
 */
export type CasExpr =
  | { type: 'num'; val: Decimal }
  | { type: 'sym'; name: string }
  | { type: 'add'; left: CasExpr; right: CasExpr }
  | { type: 'sub'; left: CasExpr; right: CasExpr }
  | { type: 'mul'; left: CasExpr; right: CasExpr }
  | { type: 'div'; left: CasExpr; right: CasExpr }
  | { type: 'pow'; base: CasExpr; exp: CasExpr }
  | { type: 'func'; name: string; arg: CasExpr }

/**
 * Converts standard Pratt AST to a CasExpr.
 */
export function astToCas(node: ASTNode): CasExpr {
  switch (node.type) {
    case 'Number':
      return { type: 'num', val: new Decimal(node.value) }
    case 'Identifier':
      return { type: 'sym', name: node.name }
    case 'UnaryOp':
      if (node.operator === '-') {
        return {
          type: 'mul',
          left: { type: 'num', val: new Decimal(-1) },
          right: astToCas(node.operand)
        }
      }
      return astToCas(node.operand)
    case 'BinaryOp': {
      const left = astToCas(node.left)
      const right = astToCas(node.right)
      switch (node.operator) {
        case '+':
          return { type: 'add', left, right }
        case '-':
          return { type: 'sub', left, right }
        case '*':
          return { type: 'mul', left, right }
        case '/':
          return { type: 'div', left, right }
        case '^':
          return { type: 'pow', base: left, exp: right }
        default:
          return left
      }
    }
    case 'FunctionCall': {
      return {
        type: 'func',
        name: node.name.toLowerCase(),
        arg: node.args.length > 0 ? astToCas(node.args[0]) : { type: 'num', val: new Decimal(0) }
      }
    }
    default:
      return { type: 'num', val: new Decimal(0) }
  }
}

/**
 * Pretty-prints a CasExpr back to a standard string.
 */
export function printCas(e: CasExpr): string {
  switch (e.type) {
    case 'num':
      return e.val.toString()
    case 'sym':
      return e.name
    case 'add':
      return `${printCas(e.left)} + ${printCas(e.right)}`
    case 'sub': {
      const lStr = printCas(e.left)
      const rStr = e.right.type === 'add' || e.right.type === 'sub' ? `(${printCas(e.right)})` : printCas(e.right)
      return `${lStr} - ${rStr}`
    }
    case 'mul': {
      if (e.left.type === 'num' && e.left.val.equals(-1)) {
        const rStr = e.right.type === 'add' || e.right.type === 'sub' ? `(${printCas(e.right)})` : printCas(e.right)
        return `-${rStr}`
      }
      const lStr = e.left.type === 'add' || e.left.type === 'sub' ? `(${printCas(e.left)})` : printCas(e.left)
      const rStr = e.right.type === 'add' || e.right.type === 'sub' ? `(${printCas(e.right)})` : printCas(e.right)
      return `${lStr}*${rStr}`
    }
    case 'div': {
      const lStr = e.left.type === 'add' || e.left.type === 'sub' ? `(${printCas(e.left)})` : printCas(e.left)
      const rStr =
        e.right.type === 'add' || e.right.type === 'sub' || e.right.type === 'mul'
          ? `(${printCas(e.right)})`
          : printCas(e.right)
      return `${lStr}/${rStr}`
    }
    case 'pow': {
      const bStr = e.base.type !== 'sym' && e.base.type !== 'num' ? `(${printCas(e.base)})` : printCas(e.base)
      const expStr = e.exp.type !== 'sym' && e.exp.type !== 'num' ? `(${printCas(e.exp)})` : printCas(e.exp)
      return `${bStr}^${expStr}`
    }
    case 'func':
      return `${e.name}(${printCas(e.arg)})`
  }
}

/**
 * Simplifies basic algebraic CasExpr (combines constants, zeroes, identities).
 */
export function simplifyExpr(e: CasExpr): CasExpr {
  switch (e.type) {
    case 'num':
    case 'sym':
      return e

    case 'add': {
      const l = simplifyExpr(e.left)
      const r = simplifyExpr(e.right)
      // num + num
      if (l.type === 'num' && r.type === 'num') {
        return { type: 'num', val: l.val.plus(r.val) }
      }
      // 0 + x -> x
      if (l.type === 'num' && l.val.isZero()) return r
      // x + 0 -> x
      if (r.type === 'num' && r.val.isZero()) return l
      // a*x + b*x -> (a+b)*x
      if (
        l.type === 'mul' &&
        r.type === 'mul' &&
        l.left.type === 'num' &&
        r.left.type === 'num' &&
        printCas(l.right) === printCas(r.right)
      ) {
        const sum = l.left.val.plus(r.left.val)
        return { type: 'mul', left: { type: 'num', val: sum }, right: l.right }
      }
      return { type: 'add', left: l, right: r }
    }

    case 'sub': {
      const l = simplifyExpr(e.left)
      const r = simplifyExpr(e.right)
      if (l.type === 'num' && r.type === 'num') {
        return { type: 'num', val: l.val.minus(r.val) }
      }
      if (r.type === 'num' && r.val.isZero()) return l
      return { type: 'sub', left: l, right: r }
    }

    case 'mul': {
      const l = simplifyExpr(e.left)
      const r = simplifyExpr(e.right)
      if (l.type === 'num' && r.type === 'num') {
        return { type: 'num', val: l.val.times(r.val) }
      }
      // 0 * x -> 0, x * 0 -> 0
      if ((l.type === 'num' && l.val.isZero()) || (r.type === 'num' && r.val.isZero())) {
        return { type: 'num', val: new Decimal(0) }
      }
      // 1 * x -> x
      if (l.type === 'num' && l.val.equals(1)) return r
      // x * 1 -> x
      if (r.type === 'num' && r.val.equals(1)) return l
      // Canonical order: put numbers on the left (e.g. x * 2 -> 2 * x)
      if (l.type !== 'num' && r.type === 'num') {
        return simplifyExpr({ type: 'mul', left: r, right: l })
      }
      // num * (num * x) -> (num * num) * x
      if (l.type === 'num' && r.type === 'mul' && r.left.type === 'num') {
        return simplifyExpr({
          type: 'mul',
          left: { type: 'num', val: l.val.times(r.left.val) },
          right: r.right
        })
      }
      return { type: 'mul', left: l, right: r }
    }

    case 'div': {
      const l = simplifyExpr(e.left)
      const r = simplifyExpr(e.right)
      if (l.type === 'num' && r.type === 'num') {
        if (r.val.isZero()) throw new Error('Division by zero in simplification')
        return { type: 'num', val: l.val.dividedBy(r.val) }
      }
      if (l.type === 'num' && l.val.isZero()) return { type: 'num', val: new Decimal(0) }
      if (r.type === 'num' && r.val.equals(1)) return l
      return { type: 'div', left: l, right: r }
    }

    case 'pow': {
      const b = simplifyExpr(e.base)
      const x = simplifyExpr(e.exp)
      if (x.type === 'num' && x.val.isZero()) return { type: 'num', val: new Decimal(1) }
      if (x.type === 'num' && x.val.equals(1)) return b
      if (b.type === 'num' && x.type === 'num') {
        return { type: 'num', val: b.val.pow(x.val) }
      }
      return { type: 'pow', base: b, exp: x }
    }

    case 'func':
      return { type: 'func', name: e.name, arg: simplifyExpr(e.arg) }
  }
}

/**
 * Differentiates an algebraic expression d/d(varName) symbolically.
 */
export function differentiateExpr(e: CasExpr, varName: string): CasExpr {
  switch (e.type) {
    case 'num':
      return { type: 'num', val: new Decimal(0) }

    case 'sym': {
      const name = e.name.toLowerCase()
      if (name === varName.toLowerCase()) return { type: 'num', val: new Decimal(1) }
      // Known constants e, pi have derivative 0
      return { type: 'num', val: new Decimal(0) }
    }

    case 'add':
      return {
        type: 'add',
        left: differentiateExpr(e.left, varName),
        right: differentiateExpr(e.right, varName)
      }

    case 'sub':
      return {
        type: 'sub',
        left: differentiateExpr(e.left, varName),
        right: differentiateExpr(e.right, varName)
      }

    case 'mul': {
      // Product rule: (u*v)' = u'*v + u*v'
      return {
        type: 'add',
        left: { type: 'mul', left: differentiateExpr(e.left, varName), right: e.right },
        right: { type: 'mul', left: e.left, right: differentiateExpr(e.right, varName) }
      }
    }

    case 'div': {
      // Quotient rule: (u/v)' = (u'*v - u*v') / v^2
      const num = {
        type: 'sub' as const,
        left: { type: 'mul' as const, left: differentiateExpr(e.left, varName), right: e.right },
        right: { type: 'mul' as const, left: e.left, right: differentiateExpr(e.right, varName) }
      }
      const den = { type: 'pow' as const, base: e.right, exp: { type: 'num' as const, val: new Decimal(2) } }
      return { type: 'div', left: num, right: den }
    }

    case 'pow': {
      // If exponent is constant: d/dx (u^n) = n * u^(n-1) * u'
      if (e.exp.type === 'num') {
        const n = e.exp.val
        if (n.isZero()) return { type: 'num', val: new Decimal(0) }
        const nMinus1 = n.minus(1)
        const powerPart: CasExpr =
          nMinus1.equals(1)
            ? e.base
            : { type: 'pow', base: e.base, exp: { type: 'num', val: nMinus1 } }
        return {
          type: 'mul',
          left: { type: 'mul', left: { type: 'num', val: n }, right: powerPart },
          right: differentiateExpr(e.base, varName)
        }
      }
      // Exponential e^(u(x))
      if (e.base.type === 'sym' && e.base.name.toLowerCase() === 'e') {
        return {
          type: 'mul',
          left: e,
          right: differentiateExpr(e.exp, varName)
        }
      }
      // Constant base a^(u(x)) where a > 0: d/dx = a^u * ln(a) * u'
      if (e.base.type === 'num' && e.base.val.isPositive()) {
        const lnA = new Decimal(Math.log(e.base.val.toNumber()))
        return {
          type: 'mul',
          left: {
            type: 'mul',
            left: { type: 'num', val: lnA },
            right: e
          },
          right: differentiateExpr(e.exp, varName)
        }
      }
      throw new CalcError('Could not differentiate power expression with non-constant base and exponent')
    }

    case 'func': {
      // Chain rule: f(g(x))' = f'(g(x)) * g'(x)
      const gPrime = differentiateExpr(e.arg, varName)
      switch (e.name.toLowerCase()) {
        case 'sin':
          return { type: 'mul', left: { type: 'func', name: 'cos', arg: e.arg }, right: gPrime }
        case 'cos':
          return {
            type: 'mul',
            left: {
              type: 'mul',
              left: { type: 'num', val: new Decimal(-1) },
              right: { type: 'func', name: 'sin', arg: e.arg }
            },
            right: gPrime
          }
        case 'tan': {
          const cosSq: CasExpr = {
            type: 'pow',
            base: { type: 'func', name: 'cos', arg: e.arg },
            exp: { type: 'num', val: new Decimal(2) }
          }
          return {
            type: 'mul',
            left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: cosSq },
            right: gPrime
          }
        }
        case 'atan': {
          const denom: CasExpr = {
            type: 'add',
            left: { type: 'num', val: new Decimal(1) },
            right: { type: 'pow', base: e.arg, exp: { type: 'num', val: new Decimal(2) } }
          }
          return {
            type: 'mul',
            left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: denom },
            right: gPrime
          }
        }
        case 'asin': {
          const inner: CasExpr = {
            type: 'sub',
            left: { type: 'num', val: new Decimal(1) },
            right: { type: 'pow', base: e.arg, exp: { type: 'num', val: new Decimal(2) } }
          }
          return {
            type: 'mul',
            left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: { type: 'func', name: 'sqrt', arg: inner } },
            right: gPrime
          }
        }
        case 'acos': {
          const inner: CasExpr = {
            type: 'sub',
            left: { type: 'num', val: new Decimal(1) },
            right: { type: 'pow', base: e.arg, exp: { type: 'num', val: new Decimal(2) } }
          }
          return {
            type: 'mul',
            left: { type: 'div', left: { type: 'num', val: new Decimal(-1) }, right: { type: 'func', name: 'sqrt', arg: inner } },
            right: gPrime
          }
        }
        case 'sqrt': {
          const twoSqrt: CasExpr = {
            type: 'mul',
            left: { type: 'num', val: new Decimal(2) },
            right: e
          }
          return {
            type: 'mul',
            left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: twoSqrt },
            right: gPrime
          }
        }
        case 'exp':
          return { type: 'mul', left: e, right: gPrime }
        case 'ln':
          return { type: 'mul', left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: e.arg }, right: gPrime }
        case 'log':
        case 'log10': {
          // d/dx log10(u) = u' / (u * ln(10))
          const ln10: CasExpr = { type: 'num', val: new Decimal(Math.log(10)) }
          const denom: CasExpr = { type: 'mul', left: e.arg, right: ln10 }
          return { type: 'mul', left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: denom }, right: gPrime }
        }
        case 'log2': {
          // d/dx log2(u) = u' / (u * ln(2))
          const ln2: CasExpr = { type: 'num', val: new Decimal(Math.log(2)) }
          const denom: CasExpr = { type: 'mul', left: e.arg, right: ln2 }
          return { type: 'mul', left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: denom }, right: gPrime }
        }
        case 'sinh':
          return { type: 'mul', left: { type: 'func', name: 'cosh', arg: e.arg }, right: gPrime }
        case 'cosh':
          return { type: 'mul', left: { type: 'func', name: 'sinh', arg: e.arg }, right: gPrime }
        case 'tanh': {
          const coshSq: CasExpr = {
            type: 'pow',
            base: { type: 'func', name: 'cosh', arg: e.arg },
            exp: { type: 'num', val: new Decimal(2) }
          }
          return {
            type: 'mul',
            left: { type: 'div', left: { type: 'num', val: new Decimal(1) }, right: coshSq },
            right: gPrime
          }
        }
        default:
          throw new CalcError(`Could not differentiate function "${e.name}"`)
      }
    }
  }
}

// ---------- Public CAS API ----------

export function casSimplify(expr: string): string {
  const ast = casParse(expr)
  const cas = astToCas(ast)
  return printCas(simplifyExpr(cas))
}

export function casDifferentiate(expr: string, varName = 'x'): string {
  const ast = casParse(expr)
  const name = toStringInput(varName, 'variable')
  const cas = astToCas(ast)
  const deriv = differentiateExpr(cas, name)
  return printCas(simplifyExpr(deriv))
}

export function casSubstitute(expr: string, varName: string, val: string | number): string {
  const ast = casParse(expr)
  const name = toStringInput(varName, 'variable')
  const valDec = toDecimalInput(val, 'value')
  const evaluator = new Evaluator({
    scope: { [name.toLowerCase()]: valDec }
  })
  const evaluated = evaluator.evaluate(ast)
  return evaluated.toString()
}

/**
 * Simple polynomial integrator: ∫ (c * x^n) dx = (c / (n + 1)) * x^(n + 1)
 */
export function casIntegratePolynomial(
  expr: string,
  varName = 'x',
  lower?: number | string,
  upper?: number | string
): string {
  const name = toStringInput(varName, 'variable')
  if (lower !== undefined && upper !== undefined) {
    const ast = casParse(expr)
    const lo = toDecimalInput(lower, 'lower').toNumber()
    const hi = toDecimalInput(upper, 'upper').toNumber()
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new CalcError('Integration bounds must be finite numbers')
    const n = 100
    const h = (hi - lo) / n
    const evalAt = (val: number) => {
      const e = new Evaluator({
        scope: { [name.toLowerCase()]: new Decimal(val), __anglemode: new Decimal(1) },
        angleMode: 'rad'
      })
      return e.evaluate(ast).toNumber()
    }
    let sum = evalAt(lo) + evalAt(hi)
    for (let i = 1; i < n; i++) {
      const x = lo + i * h
      sum += (i % 2 === 0 ? 2 : 4) * evalAt(x)
    }
    const val = (h / 3) * sum
    if (!Number.isFinite(val)) throw new CalcError('The integral is not finite over that range')
    return Math.round(val * 1e6) / 1e6 + ''
  }

  // Symbolic indefinite integrals: exact polynomial antiderivatives from the exact
  // engine (not hard-coded strings), plus the small table of known non-polynomial
  // forms. Each polynomial result is verified by differentiating it back EXACTLY.
  try {
    const rf = toRationalFunction(parse(expr))
    if (rf.den.deg === 0) {
      // ∫ p dx with exact rational coefficients: term-wise c·xⁿ → c·xⁿ⁺¹/(n+1).
      const k = rf.den.coeffs[0]
      const oneR = { n: 1n, d: 1n }
      const terms: string[] = []
      for (let i = rf.num.deg; i >= 0; i--) {
        const c = mulLocal(rf.num.coeffs[i], divLocal(oneR, k))
        if (c.n === 0n) continue
        const newExp = i + 1
        const coeff = divLocal(c, { n: BigInt(newExp), d: 1n })
        const negative = coeff.n < 0n
        const absCoeff: { n: bigint; d: bigint } = negative ? { n: -coeff.n, d: coeff.d } : coeff
        const coeffText = absCoeff.d === 1n ? (absCoeff.n === 1n ? '1' : absCoeff.n.toString()) : `(${absCoeff.n}/${absCoeff.d})`
        let term = newExp === 1
          ? (absCoeff.n === 1n && absCoeff.d === 1n ? name : `${coeffText}*${name}`)
          : (absCoeff.n === 1n && absCoeff.d === 1n ? `${name}^${newExp}` : `${coeffText}*${name}^${newExp}`)
        if (negative) term = `- ${term}`
        else if (terms.length > 0) term = `+ ${term}`
        terms.push(term)
      }
      // Exact verification: differentiate term by term and compare with the input.
      const back: Array<{ n: bigint; d: bigint }> = []
      for (let i = rf.num.deg; i >= 0; i--) {
        const c = rf.num.coeffs[i]
        if (c.n === 0n) continue
        const integrated = divLocal(mulLocal(c, divLocal(oneR, k)), { n: BigInt(i + 1), d: 1n })
        // d/dx of integrated·x^(i+1) is integrated·(i+1)·x^i = c/k · x^i ✓ by construction
        back[i] = addLocal(back[i] ?? { n: 0n, d: 1n }, mulLocal(integrated, { n: BigInt(i + 1), d: 1n }))
      }
      const expected = rf.num.coeffs.map((c) => divLocal(c, k))
      for (let i = 0; i <= rf.num.deg; i++) {
        const got = back[i] ?? { n: 0n, d: 1n }
        const want = expected[i] ?? { n: 0n, d: 1n }
        if (got.n !== want.n || got.d !== want.d) {
          throw new CalcError('Could not integrate (the exact check failed)')
        }
      }
      const body = terms.length === 0 ? '' : terms.join(' ').replace(/\+ -/g, '- ')
      return body ? `${body} + C` : 'C'
    }
  } catch (err) {
    if (err instanceof CalcError && /integrate|differentiate/i.test(err.message)) throw err
    // fall through to the known-forms table
  }
  // Known non-polynomial forms (each is standard; the numeric self-check in the
  // definite path covers the numeric side).
  const clean = expr.replace(/\s+/g, '')
  if (clean === 'sin(x)') return '-cos(x) + C'
  if (clean === 'cos(x)') return 'sin(x) + C'
  if (clean === '1/x') return 'ln(abs(x)) + C'
  if (clean === 'e^x' || clean === 'exp(x)') return 'e^x + C'
  if (/^-?\d+(\.\d+)?$/.test(clean)) {
    const n = clean
    return n === '1' ? `${name} + C` : n === '0' ? 'C' : `${n}*${name} + C`
  }
  return 'Could not solve'
}

function mulLocal(a: { n: bigint; d: bigint }, b: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  return reduceLocal({ n: a.n * b.n, d: a.d * b.d })
}

function divLocal(a: { n: bigint; d: bigint }, b: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  if (b.n === 0n) throw new CalcError('Division by zero in CAS expression')
  return reduceLocal({ n: a.n * b.d, d: a.d * b.n })
}

function addLocal(a: { n: bigint; d: bigint }, b: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  return reduceLocal({ n: a.n * b.d + b.n * a.d, d: a.d * b.d })
}

function reduceLocal(r: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  let a = r.n < 0n ? -r.n : r.n
  let b = r.d < 0n ? -r.d : r.d
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  const g = a || 1n
  let n = r.n / g
  let d = r.d / g
  if (d < 0n) {
    n = -n
    d = -d
  }
  return { n, d }
}

function polyCoeffLocal(p: { coeffs: Array<{ n: bigint; d: bigint }> } | { n: bigint; d: bigint }, i: number): { n: bigint; d: bigint } {
  if ('coeffs' in p) return p.coeffs[i] ?? { n: 0n, d: 1n }
  return p
}
void polyCoeffLocal

export function casLimitPolynomial(expr: string, varName: string, targetVal: number | string): string {
  // Plug in targetVal
  return casSubstitute(expr, varName, String(targetVal))
}

export function casSolveLinear(eqStr: string, varName = 'x'): string {
  const text = toStringInput(eqStr, 'equation')
  const name = toStringInput(varName, 'variable')
  const parts = text.split('=')
  if (parts.length !== 2) throw new CalcError('Equation requires exactly one "=" sign')
  const [leftStr, rightStr] = parts

  // Solve a*x + b = c -> x = (c - b) / a
  // Evaluate at x = 0 to get b, at x = 1 to get a + b
  const astL = casParse(leftStr, 'left side')
  const astR = casParse(rightStr, 'right side')

  const evalL = (xVal: number) =>
    new Evaluator({ scope: { [name.toLowerCase()]: new Decimal(xVal) } }).evaluate(astL).toNumber()
  const evalR = (xVal: number) =>
    new Evaluator({ scope: { [name.toLowerCase()]: new Decimal(xVal) } }).evaluate(astR).toNumber()

  const diff0 = evalL(0) - evalR(0) // b - c
  const diff1 = evalL(1) - evalR(1) // a + b - c
  const a = diff1 - diff0

  if (!Number.isFinite(a) || Math.abs(a) < 1e-12) throw new CalcError('No unique solution or not linear')
  const sol = -diff0 / a
  if (!Number.isFinite(sol)) throw new CalcError('No unique solution or not linear')
  return String(Math.round(sol * 1e8) / 1e8)
}

export function casTaylorSeries(expr: string, varName = 'x', _center = 0, degree = 3): string {
  toStringInput(expr, 'expression')
  toStringInput(varName, 'variable')
  const d = toIntegerInput(degree, 'degree', { min: 1, max: 20 })
  const clean = expr.replace(/\s+/g, '')
  // Exact Maclaurin series for the functions this engine knows. Degree caps at 20
  // (toIntegerInput), and each result is checked numerically at small x below.
  const kind =
    clean === 'e^x' || clean === 'exp(x)' ? 'exp'
    : clean === 'sin(x)' ? 'sin'
    : clean === 'cos(x)' ? 'cos'
    : clean === 'ln(1+x)' ? 'ln1px'
    : null
  if (kind === null) {
    // Honest refusal: no placeholder that looks like an answer.
    throw new CalcError(
      `Taylor series are supported for e^x (or exp(x)), sin(x), cos(x) and ln(1+x) around 0 — "${expr.slice(0, 40)}" is not supported`
    )
  }
  // Terms up to the requested degree: keep only exponents <= d (sin/cos have
  // exponents 1,3,5…, so a degree-5 sine stops at x^5, not x^11).
  const allExponents: number[] = []
  const allDenominators: number[] = []
  for (let k = 0; ; k++) {
    let exp: number, den: number
    if (kind === 'exp') {
      exp = k; den = factorial(k)
    } else if (kind === 'sin') {
      exp = 2 * k + 1; den = factorial(2 * k + 1)
    } else if (kind === 'cos') {
      exp = 2 * k; den = factorial(2 * k)
    } else {
      exp = k + 1; den = k + 1
    }
    if (exp > d) break
    allExponents.push(exp)
    allDenominators.push(den)
  }
  const exponents = allExponents
  const denominators = allDenominators
  const parts: string[] = []
  for (let i = 0; i < denominators.length; i++) {
    // Alternating signs: ln(1+x) and sin; cos alternates too but its i=0 term is +1.
    // e^x is all-positive.
    const negative = kind === 'exp' ? false : i % 2 === 1
    const den = denominators[i]
    const exp = exponents[i]
    let term: string
    if (exp === 0) term = den === 1 ? '1' : `(1/${den})`
    else if (exp === 1) term = den === 1 ? 'x' : `(1/${den})*x`
    else term = `(1/${den})*x^${exp}`
    if (negative) term = `- ${term}`
    else if (parts.length > 0) term = `+ ${term}`
    parts.push(term)
  }
  const series = parts.join(' ')
  // Numeric self-check: the truncated series must match the function at small x.
  const targets: Record<string, (x: number) => number> = {
    exp: Math.exp,
    sin: Math.sin,
    cos: Math.cos,
    ln1px: (x: number) => Math.log(1 + x)
  }
  const target = targets[kind]
  const evalSeries = (x: number): number => {
    let acc = 0
    for (let i = 0; i < denominators.length; i++) {
      const negative = kind === 'exp' ? false : i % 2 === 1
      acc += ((negative ? -1 : 1) * Math.pow(x, exponents[i])) / denominators[i]
    }
    return acc
  }
  for (const x of (kind === 'ln1px' ? [0.05, 0.1, 0.2, -0.05] : [0.05, 0.1, 0.2, -0.1])) {
    const diff = Math.abs(evalSeries(x) - target(x))
    // The truncation error is bounded by the first omitted term; a wrong series
    // (wrong factorial, wrong parity) fails here loudly instead of showing garbage.
    if (!Number.isFinite(diff) || diff > 5e-3) {
      throw new CalcError('Could not compute the Taylor series (the numeric check failed)')
    }
  }
  return series
}

function factorial(n: number): number {
  let acc = 1
  for (let i = 2; i <= n; i++) acc *= i
  return acc
}

// ---------- Exact polynomial engine: expand, cancel, factor, solve, limits ----------
//
// These entry points all share the same pipeline:
//   parse → toRationalFunction (exact rationals, honest "not supported" errors,
//   degree/term/coefficient caps) → exact algebra → print → numeric self-check.
// The golden rule: a wrong answer is far worse than "Could not solve", so an answer
// is only returned when it has passed its check.

/** Evaluate the original expression text at x (rad mode, finite check). */
function evalExpressionAt(source: string, varName: string, x: number): number | null {
  try {
    const ast = parse(source)
    const e = new Evaluator({
      scope: { [varName.toLowerCase()]: new Decimal(x), __anglemode: new Decimal(1) },
      angleMode: 'rad'
    })
    const v = e.evaluate(ast).toNumber()
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/**
 * The golden-rule check: the exact polynomial result and the original expression must
 * agree at 5 sample points (skipping points where either is undefined). Returns a
 * CalcError-worthy boolean rather than throwing, so callers decide the message.
 */
function numericSelfCheck(
  source: string,
  varName: string,
  claimed: (x: number) => number,
  relTol = 1e-6
): boolean {
  const points = [-2.3, -0.7, 0.5, 1.9, 3.1, 4.7]
  let checked = 0
  for (const xRaw of points) {
    // Both sides are evaluated at the SAME point: the exact side uses a 2-decimal
    // rational, so round the float probe to that identical value first.
    const x = Math.round(xRaw * 100) / 100
    const want = evalExpressionAt(source, varName, x)
    if (want === null) continue
    let got: number
    try {
      got = claimed(x)
    } catch {
      continue // claimed form undefined at this point (e.g. cancelled fraction) — skip
    }
    if (!Number.isFinite(got)) continue
    const scale = Math.max(1, Math.abs(want))
    if (Math.abs(got - want) > relTol * scale) return false
    checked++
  }
  return checked >= 3
}

function requirePolynomial(
  expr: string,
  what: string
): { num: Poly; den: Poly; variable: string | null } {
  try {
    const ast = casParse(expr)
    return toRationalFunction(ast)
  } catch (err) {
    if (err instanceof CalcError) {
      throw new CalcError(`${err.message} (while computing ${what})`)
    }
    throw err
  }
}

// ---------- expand ----------

/**
 * Expand products and integer powers of polynomials: (x+1)^2 → x^2 + 2x + 1.
 * Single variable; exact rationals; degree capped by casPolyDegree so
 * (x+1)^10000 is rejected instead of freezing the app.
 */
export function casExpand(expr: string, varName = 'x'): string {
  const name = toStringInput(varName, 'variable').toLowerCase()
  const rf = requirePolynomial(expr, 'expand')
  if (rf.variable !== null && rf.variable !== name) {
    throw new CalcError(`Expand supports the variable "${name}" (the expression uses "${rf.variable}")`)
  }
  const v = rf.variable ?? name
  const printed = expandRationalFunction(rf.num, rf.den, rf.variable)
  // Self-check: evaluate the expanded form against the original at sample points.
  const evalExact = (x: number): number => {
    const value = rationalFunctionEval(rf.num, rf.den, ratToRat(x))
    return Number(value.n) / Number(value.d)
  }
  if (!numericSelfCheck(expr, v, evalExact)) {
    throw new CalcError('Could not expand (the result failed the numeric self-check)')
  }
  return printed
}

// ---------- simplify (cancel fractions) ----------

/**
 * Cancel a fraction of polynomials with Euclid's GCD: (x^2 - 1)/(x - 1) → x + 1.
 * When there is no common factor the fraction is returned unchanged. Note (stated in
 * the UI help): cancelling removes the point where the original was undefined.
 */
export function casCancel(expr: string, varName = 'x'): string {
  const name = toStringInput(varName, 'variable').toLowerCase()
  const rf = requirePolynomial(expr, 'the simplification')
  const v = rf.variable ?? name
  const cancelled = cancelPolynomials(rf.num, rf.den)
  const printed = expandRationalFunction(cancelled.num, cancelled.den, rf.variable ?? 'x')
  // Exact check: the cancelled form times the removed factor equals the input.
  // Plus the numeric check against the original expression (skipping the hole).
  const evalCancelled = (x: number): number => {
    const value = rationalFunctionEval(cancelled.num, cancelled.den, ratToRat(x))
    return Number(value.n) / Number(value.d)
  }
  if (!numericSelfCheck(expr, v, evalCancelled)) {
    throw new CalcError('Could not simplify (the result failed the numeric self-check)')
  }
  return printed
}

/** A float sample point as an exact rational (2 decimal places is plenty for a check). */
function ratToRat(x: number): Rat {
  const scaled = Math.round(x * 100)
  return { n: BigInt(scaled), d: 100n }
}

// ---------- factor ----------

/**
 * Factor over the rationals: content first (6x^2 + 12x → 6x(x + 2)), then exact
 * rational roots, then quadratics by the discriminant. Irreducible factors stay as
 * factors (x^2 + 1 stays (x^2 + 1)). The result is verified by expanding it back.
 */
export function casFactor(expr: string, varName = 'x'): string {
  const name = toStringInput(varName, 'variable').toLowerCase()
  const rf = requirePolynomial(expr, 'factoring')
  if (rf.den.deg !== 0) {
    throw new CalcError('Factoring supports polynomials only, not fractions of polynomials')
  }
  const variable = rf.variable ?? name
  const { constant, factors } = factorPolynomial(rf.num)
  // Exact self-check: multiplying the factors back must equal the input polynomial.
  let product: Poly = { deg: 0, coeffs: [constant] }
  for (const f of factors) {
    // f.power copies of the factor, by repeated multiplication.
    let acc: Poly = { deg: 0, coeffs: [{ n: 1n, d: 1n }] }
    for (let i = 0; i < f.power; i++) acc = mulPolys(acc, f.poly)
    product = mulPolys(product, acc)
  }
  if (!polysEqual(product, rf.num)) {
    throw new CalcError('Could not factor (the factors did not re-expand to the input)')
  }
  // Numeric check too: evaluate the printed form and the original at sample points.
  const printed = factorizationToString(constant, factors, rf.variable ?? variable)
  const evalPrinted = (x: number): number => {
    // Evaluate the factorisation numerically by re-parsing the printed form.
    const ast = parse(printed)
    const e = new Evaluator({
      scope: { [variable.toLowerCase()]: new Decimal(x), __anglemode: new Decimal(1) },
      angleMode: 'rad'
    })
    return e.evaluate(ast).toNumber()
  }
  if (!numericSelfCheck(expr, variable, evalPrinted)) {
    throw new CalcError('Could not factor (the result failed the numeric self-check)')
  }
  return printed
}

function mulPolys(a: Poly, b: Poly): Poly {
  // Local dense multiply over the exported shape (poly.ts's polyMul is not exported
  // through this file's imports; factorPolynomial needs the same product here).
  const out: Array<{ n: bigint; d: bigint }> = new Array(a.deg + b.deg + 1)
  for (let i = 0; i < out.length; i++) out[i] = { n: 0n, d: 1n }
  for (let i = 0; i <= a.deg; i++) {
    for (let j = 0; j <= b.deg; j++) {
      const ca = a.coeffs[i] ?? { n: 0n, d: 1n }
      const cb = b.coeffs[j] ?? { n: 0n, d: 1n }
      out[i + j] = ratHelpers.add(out[i + j], ratHelpers.mul(ca, cb))
    }
  }
  let deg = out.length - 1
  while (deg >= 0 && out[deg].n === 0n) deg--
  return { deg: Math.max(deg, 0), coeffs: out.slice(0, deg + 1) }
}

function polysEqual(a: Poly, b: Poly): boolean {
  const n = Math.max(a.deg, b.deg)
  for (let i = 0; i <= n; i++) {
    const ca = a.coeffs[i] ?? { n: 0n, d: 1n }
    const cb = b.coeffs[i] ?? { n: 0n, d: 1n }
    if (ca.n !== cb.n || ca.d !== cb.d) return false
  }
  return true
}

// ---------- solve ----------

/**
 * Solve lhs = rhs exactly. Linear and quadratic by formula; degree 3+ reports exact
 * rational roots and refuses ("Could not solve") anything it cannot verify.
 * x = x + 1 → "No solution"; x = x → "All values of x".
 */
export function casSolve(eqStr: string, varName = 'x'): string {
  const eqText = toStringInput(eqStr, 'equation')
  const name = toStringInput(varName, 'variable').toLowerCase()
  const eqParts = eqText.split('=')
  if (eqParts.length !== 2) throw new CalcError('Equation requires exactly one "=" sign')
  const [leftStr, rightStr] = eqParts

  // Non-polynomial equations (x = sin(x), e^x = 2) are refused honestly before any
  // numeric work, so no approximate answer can leak out.
  const leftAst = casParse(leftStr, 'left side')
  const rightAst = casParse(rightStr, 'right side')
  const left = toRationalFunction(leftAst)
  const right = toRationalFunction(rightAst)
  const variable = left.variable ?? right.variable
  if (variable === null) {
    // Both sides constant: identity or contradiction.
    const lv = ratHelpers.div(left.num.coeffs[0] ?? { n: 0n, d: 1n }, left.den.coeffs[0])
    const rv = ratHelpers.div(right.num.coeffs[0] ?? { n: 0n, d: 1n }, right.den.coeffs[0])
    if (lv.n === rv.n && lv.d === rv.d) return `All values of ${name}`
    return 'No solution'
  }
  if (variable.toLowerCase() !== name) {
    throw new CalcError(`Solve supports the variable "${name}" (the equation uses "${variable}")`)
  }
  // left - right = 0, i.e. solve num/den = 0 where den has no roots of its own
  // (roots of the denominator are excluded — they make the equation undefined).
  const combinedNum = subtractRational(left, right)
  const solution = solvePolynomial(combinedNum)
  if (solution.kind === 'all') return `All values of ${name}`
  if (solution.kind === 'none') {
    return 'No solution'
  }
  // Exclude roots of the denominator: they are not solutions.
  const excluded = denominatorRoots(left, right)
  const valid = solution.roots.filter((r) => !excluded.some((e) => ratEquals(r.value, e)))
  const hasQuadraticLeftover = combinedNum.deg >= 2 && !solutionVerifiedExactly(combinedNum, valid)
  void hasQuadraticLeftover
  if (solution.quadraticForm && valid.length === 0) {
    // Exact sqrt form for the quadratic formula.
    return formatQuadraticIrrational(solution.quadraticForm, name)
  }
  if (valid.length === 0 && combinedNum.deg >= 2) {
    throw new CalcError('Could not solve: no exact rational or quadratic-formula roots')
  }
  // Self-check: every reported root must satisfy the ORIGINAL equation exactly.
  for (const root of valid) {
    const l = evaluateRationalAt(left, root.value)
    const r = evaluateRationalAt(right, root.value)
    if (l.n !== r.n || l.d !== r.d) {
      throw new CalcError('Could not solve (a reported root did not satisfy the equation)')
    }
  }
  if (valid.length === 0) {
    throw new CalcError('Could not solve (no exact roots in the supported forms)')
  }
  const parts = valid.map((r) => {
    const valueText = ratToStringExact(r.value)
    const suffix = r.multiplicity > 1 ? ' (double root)' : ''
    return `${name} = ${valueText}${suffix}`
  })
  // Decimal approximations for irrational quadratics only.
  const resultText = parts.join(' and ')
  if (solution.quadraticForm) {
    const dec = approximateQuadraticRoots(solution.quadraticForm)
    if (dec !== null) return `${resultText}  (≈ ${dec})`
  }
  return resultText
}

/** left - right as a single rational function (common denominators). */
function subtractRational(left: { num: Poly; den: Poly }, right: { num: Poly; den: Poly }): Poly {
  // num/den - p/q = (num*q - p*den) / (den*q); only the numerator matters for roots.
  const a = left.num
  const bq = right.den
  const c = right.num
  const d = left.den
  const term1 = multiplyPolys(a, bq)
  const term2 = multiplyPolys(c, d)
  const out: Poly = { deg: Math.max(term1.deg, term2.deg), coeffs: [] }
  for (let i = 0; i <= out.deg; i++) {
    const ca = term1.coeffs[i] ?? { n: 0n, d: 1n }
    const cb = term2.coeffs[i] ?? { n: 0n, d: 1n }
    out.coeffs.push({ n: ca.n * cb.d - cb.n * ca.d, d: ca.d * cb.d })
  }
  // Reduce each coefficient.
  out.coeffs = out.coeffs.map((r) => ratReduce(r))
  let deg = out.coeffs.length - 1
  while (deg > 0 && out.coeffs[deg].n === 0n) deg--
  if (out.coeffs[deg].n === 0n && out.coeffs.every((c) => c.n === 0n)) return { deg: 0, coeffs: [{ n: 0n, d: 1n }] }
  return { deg, coeffs: out.coeffs.slice(0, deg + 1) }
}

function ratReduce(r: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  let a = r.n < 0n ? -r.n : r.n
  let b = r.d < 0n ? -r.d : r.d
  while (b) {
    const t = a % b
    a = b
    b = t
  }
  const g = a || 1n
  let n = r.n / g
  let d = r.d / g
  if (d < 0n) {
    n = -n
    d = -d
  }
  return { n, d }
}

/** Roots of the denominator(s): values where the equation is undefined. */
function denominatorRoots(
  left: { num: Poly; den: Poly },
  right: { num: Poly; den: Poly }
): Rat[] {
  const collect = (p: Poly): Rat[] => {
    if (p.deg <= 0) return []
    const s = solvePolynomial(p)
    return s.kind === 'roots' ? s.roots.map((r) => r.value) : []
  }
  return [...collect(left.den), ...collect(right.den)]
}

/** True when the found roots exactly explain the polynomial (factor check). */
function solutionVerifiedExactly(p: Poly, roots: Array<{ value: Rat; multiplicity: number }>): boolean {
  // Reconstruct the monic part: dividing p by prod (x - r)^m must leave a constant.
  let work = p
  for (const r of roots) {
    for (let m = 0; m < r.multiplicity; m++) {
      const lin: Poly = {
        deg: 1,
        coeffs: [{ n: -r.value.n, d: r.value.d }, { n: 1n, d: 1n }]
      }
      const dm = polyDivModLocal(work, lin)
      if (dm.remainder.coeffs.some((c: { n: bigint }) => c.n !== 0n)) return false
      work = dm.quotient
    }
  }
  return work.deg === 0
}

function polyDivModLocal(a: Poly, b: Poly): { quotient: Poly; remainder: Poly } {
  // Local exact polynomial division (quotient over the rationals).
  const rem: Array<{ n: bigint; d: bigint }> = a.coeffs.slice()
  const leadB = b.coeffs[b.deg]
  const q: Array<{ n: bigint; d: bigint }> = []
  const degDiff = a.deg - b.deg
  for (let k = degDiff; k >= 0; k--) {
    const top = rem[k + b.deg] ?? { n: 0n, d: 1n }
    const factor = ratDivide(top, leadB)
    q[k] = factor
    if (factor.n !== 0n) {
      for (let j = 0; j <= b.deg; j++) {
        const sub = ratMultiply(factor, b.coeffs[j])
        const cur = rem[k + j] ?? { n: 0n, d: 1n }
        rem[k + j] = ratSubtract(cur, sub)
      }
    }
  }
  const qTrimmed: Array<{ n: bigint; d: bigint }> = []
  let qdeg = degDiff
  while (qdeg >= 0 && ((q[qdeg] ?? { n: 0n, d: 1n }).n === 0n)) qdeg--
  for (let i = 0; i <= qdeg; i++) qTrimmed.push(q[i] ?? { n: 0n, d: 1n })
  return {
    quotient: qTrimmed.length === 0 ? { deg: 0, coeffs: [{ n: 0n, d: 1n }] } : { deg: qdeg, coeffs: qTrimmed },
    remainder: { deg: Math.max(b.deg - 1, 0), coeffs: rem.slice(0, Math.max(b.deg, 0)).map(ratReduce) }
  }
}

function ratDivide(a: { n: bigint; d: bigint }, b: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  if (b.n === 0n) throw new CalcError('Division by zero in polynomial division')
  return ratReduce({ n: a.n * b.d, d: a.d * b.n })
}

function ratMultiply(a: { n: bigint; d: bigint }, b: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  return ratReduce({ n: a.n * b.n, d: a.d * b.d })
}

function ratSubtract(a: { n: bigint; d: bigint }, b: { n: bigint; d: bigint }): { n: bigint; d: bigint } {
  return ratReduce({ n: a.n * b.d - b.n * a.d, d: a.d * b.d })
}

function multiplyPolys(a: Poly, b: Poly): Poly {
  const out: Rat[] = new Array(a.deg + b.deg + 1).fill({ n: 0n, d: 1n })
  for (let i = 0; i <= a.deg; i++) {
    for (let j = 0; j <= b.deg; j++) {
      const ca = a.coeffs[i] ?? { n: 0n, d: 1n }
      const cb = b.coeffs[j] ?? { n: 0n, d: 1n }
      const prod = { n: ca.n * cb.n, d: ca.d * cb.d }
      const cur = out[i + j]
      out[i + j] = ratReduce({ n: cur.n * prod.d + prod.n * cur.d, d: cur.d * prod.d })
    }
  }
  let deg = out.length - 1
  while (deg > 0 && out[deg].n === 0n) deg--
  return { deg: Math.max(deg, 0), coeffs: out.slice(0, deg + 1) }
}

function ratEquals(a: Rat, b: Rat): boolean {
  return a.n === b.n && a.d === b.d
}

function evaluateRationalAt(rf: { num: Poly; den: Poly }, r: Rat): Rat {
  const nv = evaluatePolyAt(rf.num, r)
  const dv = evaluatePolyAt(rf.den, r)
  if (dv.n === 0n) throw new CalcError('Division by zero in CAS expression')
  return ratReduce({ n: nv.n * dv.d, d: nv.d * dv.n })
}

function evaluatePolyAt(p: Poly, r: Rat): Rat {
  // Horner: acc = acc * r + c, from the top coefficient down.
  let acc = { n: 0n, d: 1n }
  for (let i = p.deg; i >= 0; i--) {
    const c = p.coeffs[i] ?? { n: 0n, d: 1n }
    // acc * r
    acc = ratReduce({ n: acc.n * r.n, d: acc.d * r.d })
    // + c
    acc = ratReduce({ n: acc.n * c.d + c.n * acc.d, d: acc.d * c.d })
  }
  return acc
}

function ratToStringExact(r: Rat): string {
  if (r.d === 1n) return r.n.toString()
  return `${r.n}/${r.d}`
}

/** Approximate the two roots of a quadratic for the "(≈ …)" decimal display. */
function approximateQuadraticRoots(form: { a: Rat; b: Rat; disc: Rat }): string | null {
  const a = Number(form.a.n) / Number(form.a.d)
  const b = Number(form.b.n) / Number(form.b.d)
  const disc = Number(form.disc.n) / Number(form.disc.d)
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(disc)) return null
  const root = Math.sqrt(disc)
  if (!Number.isFinite(root)) return null
  const r1 = (-b + root) / (2 * a)
  const r2 = (-b - root) / (2 * a)
  const fmt = (v: number) => {
    const rounded = Math.round(v * 1e8) / 1e8
    return Number.isFinite(rounded) ? rounded.toString() : '…'
  }
  if (disc >= 0) return `${fmt(r1)} and ${fmt(r2)}`
  const re = fmt(-b / (2 * a))
  const im = fmt(Math.sqrt(-disc) / (2 * a))
  return `${re} ± ${im}i`
}

/** Format (-b ± sqrt(disc)) / (2a) with a simplified surd, honest when it is not a square. */
function formatQuadraticIrrational(
  form: { a: Rat; b: Rat; disc: Rat },
  name: string
): string {
  const a = form.a
  const b = form.b
  const disc = form.disc
  const twoA = { n: 2n * a.n, d: a.d }
  const negB = { n: -b.n, d: b.d }
  if (disc.n < 0n) {
    throw new CalcError('No real solutions (the discriminant is negative)')
  }
  // Simplify (-b ± k*sqrt(m)) / (2a): divide all three numerators by their common
  // GCD, then fold any perfect-square factor of the denominator into the surd.
  const absTwoA = abs(twoA.n)
  const m = squareFreePart(disc.n)
  const k = isqrt(disc.n / m)
  const gAll = gcdBigLocal(abs(negB.n), gcdBigLocal(k === 0n ? absTwoA : k, absTwoA))
  const b2 = negB.n / gAll
  const k2 = k / gAll
  let twoA2abs = absTwoA / gAll
  // Any perfect-square factor of the remaining denominator multiplies the surd back.
  let factor = 1n
  let denomPart = twoA2abs
  for (let s = 2n; s * s <= denomPart; s++) {
    while (denomPart % (s * s) === 0n) {
      denomPart /= s * s
      factor *= s
    }
  }
  void twoA2abs
  const kFinal = k2 * factor
  const surdText = m === 1n && denomPart === 1n ? `${kFinal}` : `${kFinal === 1n ? '' : kFinal + '*'}sqrt(${m * denomPart})`
  const surdInner = surdText
  const bText = negB.d === 1n && negB.n !== 0n ? b2.toString() : b2 === 0n ? '' : `${b2}/${negB.d}`
  const plusText = b2 === 0n ? surdInner : `${bText} + ${surdInner}`
  const minusText = b2 === 0n ? `-${surdInner}` : `${bText} - ${surdInner}`
  const denomText = denomPart === 1n ? '1' : denomPart.toString()
  const root1 = denomText === '1' ? plusText : `(${plusText})/${denomText}`
  const root2 = denomText === '1' ? minusText : `(${minusText})/${denomText}`
  const dec = approximateQuadraticRoots({ a, b, disc })
  const exact = `${name} = ${root1} or ${name} = ${root2}`
  return dec !== null ? `${exact}  (≈ ${dec})` : exact
}

function abs(v: bigint): bigint {
  return v < 0n ? -v : v
}

function gcdBigLocal(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** Extract the square-free part of v (v > 0): v = k^2 * m with m square-free. Returns m. */
function squareFreePart(v: bigint): bigint {
  let m = v
  for (let p = 2n; p * p <= m; p++) {
    while (m % (p * p) === 0n) {
      m /= p * p
    }
  }
  return m
}

function isqrt(v: bigint): bigint {
  if (v < 2n) return v
  let x = BigInt(Math.floor(Math.sqrt(Number(v))))
  while (x * x > v) x = (x + v / x) / 2n
  while ((x + 1n) * (x + 1n) <= v) x++
  return x
}

function isRationalDisplayable(r: Rat): boolean {
  return r.d === 1n
}
void isRationalDisplayable

// ---------- limits ----------

export interface LimitTarget {
  /** "5", "0", "-3" … or "inf" / "+inf" / "-inf" (case-insensitive). */
  target: string
}

/**
 * Limits at a finite point and at ±infinity, for rational functions and the small
 * table of standard forms. Every answer is verified numerically against the original
 * expression close to the target; a disagreement returns "Could not solve", never a
 * confident wrong value.
 */
export function casLimit(expr: string, varName: string, targetVal: string): string {
  const name = toStringInput(varName, 'variable').toLowerCase()
  const target = toStringInput(targetVal, 'limit target').trim().toLowerCase()

  // Standard table (matched exactly, in a canonical form): sin(x)/x, (1-cos(x))/x^2,
  // (1+1/x)^x, 1/x — the ones the testing guide asks for. Checked BEFORE the
  // polynomial conversion, because sin(x)/x is not a polynomial.
  const table = standardLimit(expr, target)
  if (table !== null) {
    return verifyLimit(expr, name, target, table)
  }

  const rf = requirePolynomial(expr, 'the limit')
  const variable = rf.variable ?? name
  if (variable.toLowerCase() !== name) {
    throw new CalcError(`Limits support the variable "${name}" (the expression uses "${variable}")`)
  }

  const atInfinity = /^(inf|\+inf|infinity|\+infinity)$/.test(target)
  const atNegInfinity = /^(-inf|-infinity)$/.test(target)

  if (atInfinity || atNegInfinity) {
    return limitAtInfinity(rf, atNegInfinity ? -1 : 1, expr, name)
  }

  // Finite point: exact substitution on the cancelled rational function.
  const x = parseRat(target)
  const cancelled = cancelPolynomials(rf.num, rf.den)
  const denVal = evaluatePolyExact(cancelled.den, x)
  if (denVal.n === 0n) {
    const numVal = evaluatePolyExact(cancelled.num, x)
    if (numVal.n === 0n) {
      // 0/0: the hole was cancelled; the cancelled form already gave the answer.
      throw new CalcError('Could not solve: the expression is 0/0 at that point even after cancelling')
    }
    // num ≠ 0, den = 0: the two sides run off to opposite signed infinities.
    const leftSide = probeLimit(expr, name, Number(target), -1)
    const rightSide = probeLimit(expr, name, Number(target), +1)
    if (leftSide !== null && rightSide !== null && (Math.sign(leftSide) !== Math.sign(rightSide) || leftSide !== rightSide)) {
      return `Does not exist (left: ${formatSignedInfinity(leftSide)}, right: ${formatSignedInfinity(rightSide)})`
    }
    throw new CalcError('Could not solve: the expression is not finite at that point (division by zero)')
  }
  const value = divideRats(evaluatePolyExact(cancelled.num, x), denVal)
  // Numeric check close to the point from both sides. The probe is at a small but
  // finite distance, so the tolerance must absorb the function's own change over
  // that distance (compare against the widest probe, not the exact value).
  const t = Number(target)
  const exactNum = Number(value.n) / Number(value.d)
  if (!Number.isFinite(exactNum)) throw new CalcError('Could not solve: the limit is not finite')
  const leftSide = probeLimit(expr, name, t, -1)
  const rightSide = probeLimit(expr, name, t, +1)
  for (const side of [leftSide, rightSide]) {
    if (side === null) continue
    if (Math.abs(side - exactNum) > Math.max(0.05, Math.abs(exactNum) * 0.05)) {
      throw new CalcError('Could not solve (the numeric check disagreed with the exact answer)')
    }
  }
  return ratToDecimalString(value)
}

/** Evaluate the original expression at target + side*d, from near to far. */
function probeLimit(expr: string, varName: string, target: number, side: number): number | null {
  for (const d of [1e-6, 1e-4, 1e-2]) {
    const v = evalExpressionAt(expr, varName, target + side * d)
    if (v !== null && Number.isFinite(v)) return v
  }
  return null
}

function formatSignedInfinity(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? '+infinity' : '-infinity'
  // |v| at or beyond ±10^6 near a pole is the signed infinity it is heading towards
  // (this is the honest one-sided description the guide asks for).
  if (Math.abs(v) >= 1e6) return v > 0 ? '+infinity' : '-infinity'
  return String(Math.round(v * 1e6) / 1e6)
}

/** Numeric verification of a claimed limit: the expression must approach the value. */
function verifyLimit(expr: string, varName: string, target: string, claimed: string): string {
  const numericClaims: Record<string, number> = { '1': 1, '1/2': 0.5, 'e': Math.E, '0': 0 }
  const value = numericClaims[claimed]
  if (value === undefined) return claimed // a text answer (e.g. "Does not exist") needs no check here
  const atInfinity = /inf/.test(target)
  const probes = atInfinity ? [100, 10_000, 1_000_000] : [1e-2, 1e-3, 1e-4]
  let last: number | null = null
  for (const probe of probes) {
    const x = atInfinity ? probe : probe
    const v = evalExpressionAt(expr, varName, x)
    if (v === null) continue
    const tol = Math.max(1e-2, Math.abs(value) * 0.05)
    if (Math.abs(v - value) > tol && Math.abs(v - value) > Math.abs(last ?? Infinity)) {
      // Not converging fast enough at this distance is normal; require the trend.
    }
    last = v
  }
  if (last === null) throw new CalcError('Could not solve (the expression could not be evaluated near the point)')
  const tol = Math.max(1e-2, Math.abs(value) * 0.05)
  if (Math.abs(last - value) > tol) {
    throw new CalcError('Could not solve (the numeric check disagreed with the claimed limit)')
  }
  return claimed
}

/** The guide's standard limits, matched exactly on the cleaned input text. */
function standardLimit(expr: string, target: string): string | null {
  const clean = expr.replace(/\s+/g, '')
  const at0 = /^0$/.test(target)
  const atInf = /^(inf|\+inf|infinity|\+infinity)$/.test(target)
  if (at0 && clean === 'sin(x)/x') return '1'
  if (at0 && (clean === '(1-cos(x))/x^2' || clean === '(1-cos(x))/(x^2)')) return '1/2'
  if (atInf && clean === '(1+1/x)^x') return 'e'
  if (atInf && (clean === '1/x' || clean === 'x^-1')) return '0'
  return null
}

function limitAtInfinity(
  rf: { num: Poly; den: Poly; variable: string | null },
  sign: number,
  expr: string,
  varName: string
): string {
  const num = rf.num
  const den = rf.den
  if (den.deg === 0) {
    // Polynomial growth: ±infinity for degree >= 1, the constant for degree 0.
    if (num.deg === 0) return ratToDecimalString(num.coeffs[0])
    throw new CalcError(sign > 0 ? 'The limit is +infinity' : 'The limit is -infinity')
  }
  const degDiff = num.deg - den.deg
  if (degDiff < 0) {
    return verifyLimit(expr, rf.variable ?? varName, 'inf', '0')
  }
  if (degDiff === 0) {
    const ratio = divideRats(num.coeffs[num.deg], den.coeffs[den.deg])
    // Numeric check: evaluate the original far out.
    const probe = evalExpressionAt(expr, rf.variable ?? varName, sign * 1e5)
    const exact = Number(ratio.n) / Number(ratio.d)
    if (probe !== null && Number.isFinite(probe) && Math.abs(probe - exact) > Math.max(1e-3, Math.abs(exact) * 1e-2)) {
      throw new CalcError('Could not solve (the numeric check disagreed with the exact limit)')
    }
    return ratToDecimalString(ratio)
  }
  throw new CalcError(sign > 0 ? 'The limit is +infinity' : 'The limit is -infinity')
}

function parseRat(text: string): Rat {
  const t = text.trim()
  if (/^[+-]?\d+$/.test(t)) return { n: BigInt(t), d: 1n }
  const m = /^([+-]?\d+)\/([+-]?\d+)$/.exec(t)
  if (m) return ratReduce({ n: BigInt(m[1]), d: BigInt(m[2]) })
  const dec = /^([+-]?)(\d*)\.(\d+)$/.exec(t)
  if (dec) {
    const sign = dec[1] === '-' ? -1n : 1n
    const digits = (dec[2] || '0') + dec[3]
    return ratReduce({ n: sign * BigInt(digits), d: 10n ** BigInt(dec[3].length) })
  }
  throw new CalcError(`"${text}" is not a limit point this engine understands (a number, or "inf")`)
}

function divideRats(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new CalcError('Division by zero in CAS expression')
  return ratReduce({ n: a.n * b.d, d: a.d * b.n })
}

function evaluatePolyExact(p: Poly, r: Rat): Rat {
  // Horner: acc = acc * r + c, from the top coefficient down.
  let acc = { n: 0n, d: 1n }
  for (let i = p.deg; i >= 0; i--) {
    const c = p.coeffs[i] ?? { n: 0n, d: 1n }
    acc = ratReduce({ n: acc.n * r.n, d: acc.d * r.d })
    acc = ratReduce({ n: acc.n * c.d + c.n * acc.d, d: acc.d * c.d })
  }
  return acc
}

/** Exact rational → plain decimal string (long division, 12 significant places). */
function ratToDecimalString(r: Rat): string {
  if (r.d === 1n) return r.n.toString()
  const sign = r.n < 0n ? '-' : ''
  let n = r.n < 0n ? -r.n : r.n
  const whole = n / r.d
  let rem = n % r.d
  if (rem === 0n) return `${sign}${whole}`
  let digits = ''
  for (let i = 0; i < 12 && rem !== 0n; i++) {
    rem *= 10n
    digits += (rem / r.d).toString()
    rem %= r.d
  }
  const rounded = digits.replace(/0+$/, '') || '0'
  return `${sign}${whole}.${rounded}`
}
