"use strict"

// AHD adult CPB fixed local conventions: EBV 55 mL/kg; KRC 250 mL per unit.
// Pre-CPB: KRC replaces crystalloid within a fixed priming volume.
// On-pump: KRC addition is always matched 1:1 by RBC-free HF/UF volume.
// Separately entered crystalloid and fluid removal change total volume.
// Simplified red-cell mass balance; verify against actual measured Hct and volumes.
export const ADULT_BLOOD_VOLUME_ML_PER_KG = 55
export const KRC_VOLUME_ML_PER_UNIT = 250

export type AdultPreCpbInputs = {
  weightKg: number
  preCpbHctPercent: number
  primeVolumeMl: number
  productHctPercent: number
  desiredHctPercent?: number
}

export type AdultOnPumpInputs = {
  currentTotalVolumeMl: number
  currentHctPercent: number
  krcUnits: number
  crystalloidAddedMl: number
  fluidRemovedMl: number
  productHctPercent: number
  desiredHctPercent?: number
}

function positive(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(field + " must be greater than zero.")
  return value
}
function nonnegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(field + " must be zero or greater.")
  return value
}
function percent(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    throw new RangeError(field + " must be greater than zero and no more than 100%.")
  }
  return value / 100
}

export function predictAdultPreCpbHct(input: AdultPreCpbInputs) {
  const patientVolumeMl = positive(input.weightKg, "Weight") * ADULT_BLOOD_VOLUME_ML_PER_KG
  const preFraction = percent(input.preCpbHctPercent, "Pre-CPB Hct")
  const primeVolumeMl = nonnegative(input.primeVolumeMl, "Priming volume")
  const productFraction = percent(input.productHctPercent, "KRC product Hct")
  const totalVolumeMl = patientVolumeMl + primeVolumeMl
  const redCellMl = patientVolumeMl * preFraction
  const predictedNoRbcHctPercent = redCellMl / totalVolumeMl * 100
  const maximumHctWithPrimeReplacementPercent =
    (redCellMl + primeVolumeMl * productFraction) / totalVolumeMl * 100

  if (input.desiredHctPercent === undefined) return {
    patientVolumeMl, totalVolumeMl, predictedNoRbcHctPercent,
    maximumHctWithPrimeReplacementPercent,
    requiredRbcMl: null, requiredRbcUnits: null, minimumWholeKrcUnits: null,
    wholeKrcProjectedHctPercent: null, feasible: null
  }

  const target = percent(input.desiredHctPercent, "Desired Hct")
  // Fixed prime denominator: KRC volume replaces the same crystalloid volume.
  const requiredRbcMl = Math.max(0, (target * totalVolumeMl - redCellMl) / productFraction)
  const requiredRbcUnits = requiredRbcMl / KRC_VOLUME_ML_PER_UNIT
  const minimumWholeKrcUnits = Math.ceil(Math.max(0, requiredRbcUnits - 1e-10))
  const feasible = requiredRbcMl <= primeVolumeMl + 1e-8
  const wholeKrcFitsPrime = minimumWholeKrcUnits * KRC_VOLUME_ML_PER_UNIT <= primeVolumeMl + 1e-8
  return {
    patientVolumeMl, totalVolumeMl, predictedNoRbcHctPercent,
    maximumHctWithPrimeReplacementPercent, requiredRbcMl, requiredRbcUnits,
    minimumWholeKrcUnits, feasible,
    wholeKrcProjectedHctPercent: feasible && wholeKrcFitsPrime
      ? (redCellMl + minimumWholeKrcUnits * KRC_VOLUME_ML_PER_UNIT * productFraction) / totalVolumeMl * 100
      : null
  }
}

export function predictAdultOnPumpHct(input: AdultOnPumpInputs) {
  const baselineVolumeMl = positive(input.currentTotalVolumeMl, "Estimated current CPB volume")
  const currentFraction = percent(input.currentHctPercent, "Current Hct")
  const productFraction = percent(input.productHctPercent, "KRC product Hct")
  const krcUnits = nonnegative(input.krcUnits, "KRC units")
  if (!Number.isSafeInteger(krcUnits)) throw new RangeError("KRC units must be whole numbers.")
  const crystalloidAddedMl = nonnegative(input.crystalloidAddedMl, "Crystalloid addition")
  const fluidRemovedMl = nonnegative(input.fluidRemovedMl, "Fluid removal")
  const krcAddedMl = krcUnits * KRC_VOLUME_ML_PER_UNIT
  const matchedKrcUfMl = krcAddedMl
  const totalUfMl = matchedKrcUfMl + fluidRemovedMl
  const netCrystalloidChangeMl = crystalloidAddedMl - fluidRemovedMl

  // KRC volume and matched UF cancel; only independent fluid change affects volume.
  const finalVolumeMl = baselineVolumeMl + netCrystalloidChangeMl
  if (finalVolumeMl <= 0) throw new RangeError("Final circulating volume must be positive.")
  const baselineRedCellMl = baselineVolumeMl * currentFraction
  const finalRedCellMl = baselineRedCellMl + krcAddedMl * productFraction
  const plannedFeasible = finalRedCellMl <= finalVolumeMl + 1e-8
  const predictedHctPercent = plannedFeasible ? finalRedCellMl / finalVolumeMl * 100 : null

  // Target helper: two *independent* scenarios from the measured Current Hct,
  // using EBV + priming as the baseline. Planned KRC/crystalloid changes above
  // must not be included in either target recommendation.
  let requiredKrcUnits: number | null = null
  let requiredKrcMl: number | null = null
  let requiredKrcExactMl: number | null = null
  let requiredKrcEquivalentUnits: number | null = null
  let projectedTargetHctPercent: number | null = null
  let targetFeasible: boolean | null = null
  let rbcOnlyReachable: boolean | null = null
  let fluidOnlyAdjustmentMl: number | null = null
  let fluidOnlyFinalVolumeMl: number | null = null
  if (input.desiredHctPercent !== undefined) {
    const target = percent(input.desiredHctPercent, "Desired Hct")

    // KRC-only target: each transfused product volume is offset by equal UF,
    // so the denominator remains the INITIAL estimated CPB volume.
    rbcOnlyReachable = target >= currentFraction - 1e-10
    if (rbcOnlyReachable) {
      requiredKrcExactMl = Math.max(0, (target * baselineVolumeMl - baselineRedCellMl) / productFraction)
      requiredKrcEquivalentUnits = requiredKrcExactMl / KRC_VOLUME_ML_PER_UNIT
      // Whole units are a separate practical estimate, not the exact target dose.
      requiredKrcUnits = Math.ceil(Math.max(0, requiredKrcEquivalentUnits - 1e-10))
      requiredKrcMl = requiredKrcUnits * KRC_VOLUME_ML_PER_UNIT
      const targetRedCellMl = baselineRedCellMl + requiredKrcMl * productFraction
      targetFeasible = targetRedCellMl <= baselineVolumeMl + 1e-8
      projectedTargetHctPercent = targetFeasible ? targetRedCellMl / baselineVolumeMl * 100 : null
    } else {
      targetFeasible = false
    }

    // Crystalloid-only target: preserve the measured baseline red-cell mass.
    // Signed delta > 0 means add crystalloid; delta < 0 means remove water.
    fluidOnlyFinalVolumeMl = baselineRedCellMl / target
    fluidOnlyAdjustmentMl = fluidOnlyFinalVolumeMl - baselineVolumeMl
    if (Math.abs(fluidOnlyAdjustmentMl) < 1e-8) fluidOnlyAdjustmentMl = 0
  }
  return {
    baselineVolumeMl, finalVolumeMl, krcUnits, krcAddedMl,
    matchedKrcUfMl, crystalloidAddedMl, fluidRemovedMl, totalUfMl, netCrystalloidChangeMl,
    predictedHctPercent,
    hctChangePoints: predictedHctPercent === null ? null : predictedHctPercent - input.currentHctPercent,
    plannedFeasible, requiredKrcUnits, requiredKrcMl,
    requiredKrcExactMl, requiredKrcEquivalentUnits, rbcOnlyReachable,
    requiredMatchedUfMl: requiredKrcMl, projectedTargetHctPercent, targetFeasible,
    fluidOnlyAdjustmentMl, fluidOnlyFinalVolumeMl
  }
}
