// MICS manufacturer pressure-loss curves and original hydraulic equations.
// SVC-labelled source curve refers to the IJV-access drainage limb in the UI.
// No extrapolation is permitted beyond the original curve endpoints.

export const FV_CURVES: Record<number, number[]> = {
  19: [0, 4, 9, 16, 26, 38, 51, 67, 86, 106, 128, 153, 179],
  21: [0, 4, 7, 11, 17, 25, 32, 42, 53, 64, 78, 93, 110],
  23: [0, 4, 6, 10, 14, 18, 24, 31, 38, 47, 57, 68, 80],
  25: [0, 4, 5, 7, 9, 13, 17, 21, 26, 32, 40, 46, 53],
  27: [0, 4, 5, 6, 8, 11, 14, 18, 21, 26, 31, 35, 42],
  29: [0, 3, 4, 5, 6, 8, 11, 13, 15, 18, 23, 27, 31],
}
export const IJV_CURVES: Record<number, number[]> = {
  15: [0, 5, 14, 26, 45, 88, 99, 137, 185],
  17: [0, 2, 5, 13, 24, 37, 54, 73, 96, 122, 152, 185],
  19: [0, 2, 5, 9, 15, 23, 32, 42, 55, 69, 85, 104, 125],
}

function tubeLoss(flow: number, lengthM: number, diameterIn: number) {
  if (flow <= 0) return 0
  const rho = 1060
  const viscosity = 0.0035
  const diameter = diameterIn * 0.0254
  const q = flow / 1000 / 60
  const area = Math.PI * diameter ** 2 / 4
  const velocity = q / area
  const reynolds = rho * velocity * diameter / viscosity
  const relRoughness = 1.5e-6 / diameter
  const inner = (7 / reynolds) ** 0.9 + 0.27 * relRoughness
  const A = (2.457 * Math.log(1 / inner)) ** 16
  const B = (37530 / reynolds) ** 16
  const friction = 8 * ((8 / reynolds) ** 12 + 1 / (A + B) ** 1.5) ** (1 / 12)
  return (friction * (lengthM / diameter) * (rho * velocity ** 2 / 2)) / 133.322
}

function curveLoss(curve: number[], flow: number) {
  const maxFlow = (curve.length - 1) * 0.5
  if (flow < 0 || flow > maxFlow) return null
  const low = Math.floor(flow / 0.5)
  if (low >= curve.length - 1) return curve[curve.length - 1]
  const fraction = (flow - low * 0.5) / 0.5
  return curve[low] + fraction * (curve[low + 1] - curve[low])
}

function branchLoss(curve: number[], flow: number, lengthM: number, diameterIn: number) {
  const cannula = curveLoss(curve, flow)
  return cannula === null ? null : cannula + tubeLoss(flow, lengthM, diameterIn)
}

function invertBranch(curve: number[], pressure: number, lengthM: number, diameterIn: number) {
  const maxFlow = (curve.length - 1) * 0.5
  const maxPressure = branchLoss(curve, maxFlow, lengthM, diameterIn)
  if (maxPressure === null || pressure < 0 || pressure > maxPressure) return null
  let low = 0
  let high = maxFlow
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2
    if ((branchLoss(curve, mid, lengthM, diameterIn) ?? Infinity) < pressure) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function flowAtPressure(fv: number, tube: number, svc: number, pressure: number, fvLengthM = 2, ijvLengthM = 1.2) {
  const fvFlow = invertBranch(FV_CURVES[fv], pressure, fvLengthM, tube)
  if (fvFlow === null) return null
  if (!svc) return { pressure, fvFlow, svcFlow: 0, totalFlow: fvFlow }
  const svcFlow = invertBranch(IJV_CURVES[svc], pressure, ijvLengthM, 0.375)
  if (svcFlow === null) return null
  return { pressure, fvFlow, svcFlow, totalFlow: fvFlow + svcFlow }
}

function pressureForFlow(fv: number, tube: number, svc: number, target: number, fvLengthM = 2, ijvLengthM = 1.2) {
  const fvMaxFlow = (FV_CURVES[fv].length - 1) * 0.5
  const fvMaxPressure = branchLoss(FV_CURVES[fv], fvMaxFlow, fvLengthM, tube)
  if (fvMaxPressure === null) return null
  let maxPressure = fvMaxPressure
  if (svc) {
    const svcMaxFlow = (IJV_CURVES[svc].length - 1) * 0.5
    const svcMaxPressure = branchLoss(IJV_CURVES[svc], svcMaxFlow, ijvLengthM, 0.375)
    if (svcMaxPressure === null) return null
    maxPressure = Math.min(maxPressure, svcMaxPressure)
  }
  const maxResult = flowAtPressure(fv, tube, svc, maxPressure, fvLengthM, ijvLengthM)
  if (!maxResult || target > maxResult.totalFlow) return null
  let low = 0
  let high = maxPressure
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2
    const result = flowAtPressure(fv, tube, svc, mid, fvLengthM, ijvLengthM)
    if (!result || result.totalFlow < target) low = mid
    else high = mid
  }
  return flowAtPressure(fv, tube, svc, (low + high) / 2, fvLengthM, ijvLengthM)
}

// Snaring: assume a fixed regional return split and use the larger branch loss.
function pressureForSnaredFlow(fv: number, tube: number, svc: number, totalFlow: number, svcPercent: number, fvLengthM = 2, ijvLengthM = 1.2) {
  if (!svc || totalFlow < 0 || svcPercent <= 0 || svcPercent >= 100) return null
  const svcFlow = totalFlow * svcPercent / 100
  const fvFlow = totalFlow - svcFlow
  const fvPressure = branchLoss(FV_CURVES[fv], fvFlow, fvLengthM, tube)
  const svcPressure = branchLoss(IJV_CURVES[svc], svcFlow, ijvLengthM, 0.375)
  if (fvPressure === null || svcPressure === null) return null
  return { pressure: Math.max(fvPressure, svcPressure), fvFlow, svcFlow, totalFlow }
}

// Find the greatest flow within BOTH source-curve ranges and the pressure budget.
// If the curve endpoints limit the answer first, flag it rather than extrapolating.
function maxSnaredFlowAtPressure(fv: number, tube: number, svc: number, svcPercent: number, pressure: number, fvLengthM = 2, ijvLengthM = 1.2) {
  if (!svc || pressure < 0 || svcPercent <= 0 || svcPercent >= 100) return null
  const fraction = svcPercent / 100
  const maxFv = (FV_CURVES[fv].length - 1) * 0.5
  const maxSvc = (IJV_CURVES[svc].length - 1) * 0.5
  const curveMax = Math.min(maxFv / (1 - fraction), maxSvc / fraction)
  const curveEndpoint = pressureForSnaredFlow(fv, tube, svc, curveMax, svcPercent, fvLengthM, ijvLengthM)
  if (curveEndpoint && curveEndpoint.pressure <= pressure) return { ...curveEndpoint, curveLimited: true }

  let low = 0
  let high = curveMax
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2
    const result = pressureForSnaredFlow(fv, tube, svc, mid, svcPercent, fvLengthM, ijvLengthM)
    if (result && result.pressure <= pressure) low = mid
    else high = mid
  }
  const result = pressureForSnaredFlow(fv, tube, svc, low, svcPercent, fvLengthM, ijvLengthM)
  return result ? { ...result, curveLimited: false } : null
}


export type MicsHydraulicInput = {
  fv: number
  ijv: number  // 0 indicates FV only
  tube: number // FV limb diameter in inches; IJV limb is 3/8 inch
  targetFlow: number
  vavdLimit: number
  heightCm: number
  fvLengthCm: number
  ijvLengthCm: number
  snaring: boolean
  ijvPercent: number
}

export type MicsFlowResult = { pressure: number; fvFlow: number; svcFlow: number; totalFlow: number }

function hydraulicAtFlow(input: MicsHydraulicInput, flow: number): MicsFlowResult | null {
  if (!Number.isFinite(flow) || flow < 0 || flow > 8) return null
  const fvLengthM = input.fvLengthCm / 100
  const ijvLengthM = input.ijvLengthCm / 100
  if (input.snaring && input.ijv !== 0) {
    return pressureForSnaredFlow(input.fv, input.tube, input.ijv, flow, input.ijvPercent, fvLengthM, ijvLengthM)
  }
  return pressureForFlow(input.fv, input.tube, input.ijv, flow, fvLengthM, ijvLengthM)
}

export function solveMicsDrainage(input: MicsHydraulicInput) {
  const valid =
    FV_CURVES[input.fv] !== undefined &&
    (input.ijv === 0 || IJV_CURVES[input.ijv] !== undefined) &&
    (input.tube === 0.375 || input.tube === 0.5) &&
    [input.targetFlow, input.vavdLimit, input.heightCm, input.fvLengthCm, input.ijvLengthCm, input.ijvPercent]
      .every(Number.isFinite) &&
    input.targetFlow >= 0 && input.targetFlow <= 8 &&
    input.vavdLimit >= 0 && input.heightCm >= 0 &&
    input.fvLengthCm > 0 && input.ijvLengthCm > 0 &&
    (!input.snaring || input.ijv === 0 || (input.ijvPercent > 0 && input.ijvPercent < 100))
  if (!valid) return null

  const head = input.heightCm * 0.7356
  const budget = head + input.vavdLimit
  const target = hydraulicAtFlow(input, input.targetFlow)
  const requiredVavd = target ? Math.max(0, target.pressure - head) : null

  // Monotone binary search over 0–8 L/min, honoring curve validity at every probe.
  // This replaces the former single-pressure inverse; neither cannula nor tube
  // loss equations and neither source curve are modified.
  let low = 0
  let high = 8
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2
    const result = hydraulicAtFlow(input, mid)
    if (result && result.pressure <= budget + 1e-9) low = mid
    else high = mid
  }
  const maxResult = hydraulicAtFlow(input, low)
  const nextProbe = hydraulicAtFlow(input, Math.min(8, low + 0.001))
  const curveLimited = low < 8 - 1e-6 && nextProbe === null

  return {
    head,
    budget,
    target,
    requiredVavd,
    maxResult,
    maxFlow: maxResult?.totalFlow ?? 0,
    curveLimited,
  }
}
