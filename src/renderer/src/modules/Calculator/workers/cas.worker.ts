import {
  casSimplify,
  casDifferentiate,
  casIntegratePolynomial,
  casLimitPolynomial,
  casSubstitute,
  casSolveLinear,
  casTaylorSeries,
  casExpand,
  casCancel,
  casFactor,
  casSolve,
  casLimit
} from '../../../../../shared/calculator/modules/cas'
import type { WorkerRequest, WorkerResponse } from './harness'

export interface CasPayload {
  op:
    | 'simplify'
    | 'diff'
    | 'integrate'
    | 'limit'
    | 'subst'
    | 'solve'
    | 'taylor'
    | 'expand'
    | 'cancel'
    | 'factor'
    | 'solveExact'
    | 'limitExact'
  expr: string
  varName?: string
  extraVal?: string
}

self.onmessage = (event: MessageEvent<WorkerRequest<CasPayload>>) => {
  const req = event.data
  if (!req || typeof req !== 'object' || !req.id) return

  try {
    const { op, expr, varName = 'x', extraVal = '' } = req.payload
    let result = ''

    switch (op) {
      case 'simplify':
        result = casSimplify(expr)
        break
      case 'diff':
        result = casDifferentiate(expr, varName.trim() || 'x')
        break
      case 'integrate':
        result = casIntegratePolynomial(expr, varName.trim() || 'x')
        break
      case 'limit':
        result = casLimitPolynomial(expr, varName.trim() || 'x', parseFloat(extraVal) || 0)
        break
      case 'subst':
        result = casSubstitute(expr, varName.trim() || 'x', extraVal.trim())
        break
      case 'solve':
        result = `${varName} = ${casSolveLinear(expr, varName.trim() || 'x')}`
        break
      case 'taylor':
        result = casTaylorSeries(expr, varName.trim() || 'x', 0, parseInt(extraVal, 10) || 3)
        break
      case 'expand':
        result = casExpand(expr, varName.trim() || 'x')
        break
      case 'cancel':
        result = casCancel(expr, varName.trim() || 'x')
        break
      case 'factor':
        result = casFactor(expr, varName.trim() || 'x')
        break
      case 'solveExact':
        result = casSolve(expr, varName.trim() || 'x')
        break
      case 'limitExact':
        result = casLimit(expr, varName.trim() || 'x', extraVal.trim() || '0')
        break
      default:
        throw new Error(`Unknown CAS operation: ${op}`)
    }

    const res: WorkerResponse<string> = { id: req.id, ok: true, result }
    self.postMessage(res)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const res: WorkerResponse<string> = { id: req.id, ok: false, error: errorMsg }
    self.postMessage(res)
  }
}
