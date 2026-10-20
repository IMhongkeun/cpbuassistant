"use strict"

/**
 * Adult CPB hematocrit planning, simplified well-mixed red-cell mass balance.
 *
 * Pre-CPB: Packed RBC product replaces an equal volume of cell-free priming fluid,
 * without increasing the stated total priming volume.
 * On-pump: Packed RBC product is added and an equal volume of cell-free
 * plasma water is removed by HF/UF, without changing circulating volume.
 *
 * Assumptions must be checked against measured Hct, circuit volumes, and
 * actual blood product Hct. These are planning estimates, not transfusion orders.
 */

export type AdultPreCpbInputs = {
  weightKg: number
  bloodVolumeCoefficientMlPerKg: number
  preCpbHctPercent: number
  primeVolumeMl: number
  productHctPercent: number
  rbcUnitVolumeMl: number
  desiredHctPercent?: number
}

export type AdultOnPumpInputs = {
  currentTotalVolumeMl: number
  currentHctPercent: number
  plannedRbcMl: number
  productHctPercent: number
  rbcUnitVolumeMl: number
  desiredHctPercent?: number
}

function positive(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(field + " must be greater than zero.")
  }
  return value
}

function nonnegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(field + " must be zero or greater.")
  }
  return value
}

function percent(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    throw new RangeError(field + " must be greater than zero and no more than 100%.")
  }
  return value / 100
}

export function predictAdultPreCpbHct(input: AdultPreCpbInputs) {
  const patientVolumeMl = positive(input.weightKg, "Weight") *
    positive(input.bloodVolumeCoefficientMlPerKg, "EBV coefficient")
  const preHctFraction = percent(input.preCpbHctPercent, "Pre-CPB Hct")
  const primeVolumeMl = nonnegative(input.primeVolumeMl, "Priming volume")
  const productFraction = percent(input.productHctPercent, "RBC product Hct")
  const unitVolumeMl = positive(input.rbcUnitVolumeMl, "RBC unit volume")

  const totalVolumeMl = patientVolumeMl + primeVolumeMl
  const startingRedCellMl = patientVolumeMl * preHctFraction
  const predictedNoRbcHctPercent = 100 * startingRedCellMl / totalVolumeMl
  const maximumHctWithPrimeReplacementPercent =
    100 * (startingRedCellMl + primeVolumeMl * productFraction) / totalVolumeMl

  if (input.desiredHctPercent === undefined) {
    return {
      patientVolumeMl,
      totalVolumeMl,
      predictedNoRbcHctPercent,
      maximumHctWithPrimeReplacementPercent,
      requiredRbcMl: null,
      requiredRbcUnits: null,
      feasible: null,
      targetHctAfterReplacementPercent: null,
    }
  }

  const targetFraction = percent(input.desiredHctPercent, "Desired Hct")
  // Denominator stays EBV + original prime: product replaces cell-free prime.
  const requiredRbcMl = Math.max(0, (targetFraction * totalVolumeMl - startingRedCellMl) / productFraction)
  const feasible = requiredRbcMl <= primeVolumeMl + 1e-8
  return {
    patientVolumeMl,
    totalVolumeMl,
    predictedNoRbcHctPercent,
    maximumHctWithPrimeReplacementPercent,
    requiredRbcMl,
    requiredRbcUnits: requiredRbcMl / unitVolumeMl,
    feasible,
    targetHctAfterReplacementPercent: feasible
      ? 100 * (startingRedCellMl + requiredRbcMl * productFraction) / totalVolumeMl
      : null,
  }
}

export function predictAdultOnPumpHct(input: AdultOnPumpInputs) {
  const volumeMl = positive(input.currentTotalVolumeMl, "Current circulating volume")
  const currentFraction = percent(input.currentHctPercent, "Current Hct")
  const plannedRbcMl = nonnegative(input.plannedRbcMl, "Planned RBC")
  const productFraction = percent(input.productHctPercent, "RBC product Hct")
  const unitVolumeMl = positive(input.rbcUnitVolumeMl, "RBC unit volume")

  const baselineRedCellMl = volumeMl * currentFraction
  const resultRedCellMl = baselineRedCellMl + plannedRbcMl * productFraction
  const predictedHctPercent = 100 * resultRedCellMl / volumeMl
  // HF/UF removal is RBC-free fluid in this simplified model.
  // Removing product volume 1:1 with HF/UF cannot exceed available plasma water.
  const plannedFeasible = plannedRbcMl * productFraction <=
    volumeMl * (1 - currentFraction) + 1e-8

  let requiredRbcMl: number | null = null
  let targetFeasible: boolean | null = null
  if (input.desiredHctPercent !== undefined) {
    const desiredFraction = percent(input.desiredHctPercent, "Desired Hct")
    requiredRbcMl = Math.max(0, (volumeMl * desiredFraction - baselineRedCellMl) / productFraction)
    targetFeasible = requiredRbcMl * productFraction <= volumeMl * (1 - currentFraction) + 1e-8
  }

  return {
    estimatedVolumeMl: volumeMl,
    plannedRbcMl,
    matchedUfMl: plannedRbcMl,
    finalVolumeMl: volumeMl,
    predictedHctPercent,
    hctChangePoints: predictedHctPercent - input.currentHctPercent,
    plannedFeasible,
    requiredRbcMl,
    requiredRbcUnits: requiredRbcMl === null ? null : requiredRbcMl / unitVolumeMl,
    requiredMatchedUfMl: requiredRbcMl,
    targetFeasible,
  }
}
