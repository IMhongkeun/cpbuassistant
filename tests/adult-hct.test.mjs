import assert from "node:assert/strict"
import test from "node:test"
import { predictAdultPreCpbHct, predictAdultOnPumpHct } from "../lib/adult-hct.ts"

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, actual + " != " + expected)

test("pre-CPB Hct uses fixed prime and RBC substitution rather than additive volume", () => {
  const result = predictAdultPreCpbHct({
    weightKg: 70, bloodVolumeCoefficientMlPerKg: 70, preCpbHctPercent: 35,
    primeVolumeMl: 1200, productHctPercent: 60, rbcUnitVolumeMl: 350,
    desiredHctPercent: 30,
  })
  near(result.totalVolumeMl, 6100)
  near(result.predictedNoRbcHctPercent, 4900 * 0.35 / 6100 * 100)
  near(result.requiredRbcMl, (6100 * 0.30 - 4900 * 0.35) / 0.6)
  near(result.requiredRbcUnits, result.requiredRbcMl / 350)
  assert.equal(result.feasible, true)
  near(result.targetHctAfterReplacementPercent, 30)
})

test("priming replacement has physical fixed-prime ceiling", () => {
  const result = predictAdultPreCpbHct({
    weightKg: 70, bloodVolumeCoefficientMlPerKg: 70, preCpbHctPercent: 35,
    primeVolumeMl: 1200, productHctPercent: 60, rbcUnitVolumeMl: 350,
    desiredHctPercent: 50,
  })
  assert.equal(result.feasible, false)
  assert.equal(result.targetHctAfterReplacementPercent, null)
  assert.ok(result.requiredRbcMl > 1200)
})

test("at or above target, no RBC substitution is needed", () => {
  const result = predictAdultPreCpbHct({
    weightKg: 70, bloodVolumeCoefficientMlPerKg: 70, preCpbHctPercent: 35,
    primeVolumeMl: 1200, productHctPercent: 60, rbcUnitVolumeMl: 350,
    desiredHctPercent: 25,
  })
  near(result.requiredRbcMl, 0)
})

test("on-pump RBC is volume-neutral with matched RBC-free HF/UF", () => {
  const result = predictAdultOnPumpHct({
    currentTotalVolumeMl: 6100, currentHctPercent: 24, plannedRbcMl: 350,
    productHctPercent: 60, rbcUnitVolumeMl: 350, desiredHctPercent: 30,
  })
  near(result.matchedUfMl, 350)
  near(result.finalVolumeMl, 6100)
  near(result.predictedHctPercent, (6100 * 0.24 + 350 * 0.6) / 6100 * 100)
  near(result.requiredRbcMl, 610)
  assert.equal(result.targetFeasible, true)
  assert.equal(result.plannedFeasible, true)
})

test("on-pump no RBC addition leaves Hct unchanged", () => {
  const result = predictAdultOnPumpHct({
    currentTotalVolumeMl: 6100, currentHctPercent: 24, plannedRbcMl: 0,
    productHctPercent: 60, rbcUnitVolumeMl: 350,
  })
  near(result.predictedHctPercent, 24)
  near(result.matchedUfMl, 0)
  assert.equal(result.requiredRbcMl, null)
})

test("invalid inputs rejected", () => {
  assert.throws(() => predictAdultPreCpbHct({
    weightKg: 0, bloodVolumeCoefficientMlPerKg: 70, preCpbHctPercent: 35,
    primeVolumeMl: 1200, productHctPercent: 60, rbcUnitVolumeMl: 350,
  }), RangeError)
  assert.throws(() => predictAdultOnPumpHct({
    currentTotalVolumeMl: 6100, currentHctPercent: 24, plannedRbcMl: -1,
    productHctPercent: 60, rbcUnitVolumeMl: 350,
  }), RangeError)
})
