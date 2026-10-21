import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import {
  ADULT_BLOOD_VOLUME_ML_PER_KG,
  KRC_VOLUME_ML_PER_UNIT,
  predictAdultPreCpbHct,
  predictAdultOnPumpHct,
} from "../lib/adult-hct.ts"

const near = (actual, expected) => assert.ok(
  actual !== null && Math.abs(actual - expected) < 0.00001,
  String(actual) + " != " + expected,
)

test("AHD uses fixed 55 mL/kg EBV and 250 mL KRC product units", () => {
  assert.equal(ADULT_BLOOD_VOLUME_ML_PER_KG, 55)
  assert.equal(KRC_VOLUME_ML_PER_UNIT, 250)
  const result = predictAdultPreCpbHct({
    weightKg: 70, preCpbHctPercent: 35, primeVolumeMl: 1200,
    productHctPercent: 66, desiredHctPercent: 30,
  })
  near(result.patientVolumeMl, 3850)
  near(result.totalVolumeMl, 5050)
  near(result.predictedNoRbcHctPercent, 3850 * 0.35 / 5050 * 100)
  near(result.requiredRbcMl, (5050 * 0.30 - 3850 * 0.35) / 0.66)
  near(result.requiredRbcUnits, result.requiredRbcMl / 250)
  assert.equal(result.minimumWholeKrcUnits, 2)
  assert.equal(result.feasible, true)
  near(result.wholeKrcProjectedHctPercent, (3850 * 0.35 + 500 * 0.66) / 5050 * 100)
})

test("KRC prime replacement is limited by fixed prime volume", () => {
  const result = predictAdultPreCpbHct({
    weightKg: 70, preCpbHctPercent: 35, primeVolumeMl: 1200,
    productHctPercent: 66, desiredHctPercent: 50,
  })
  assert.equal(result.feasible, false)
  assert.equal(result.wholeKrcProjectedHctPercent, null)
  assert.ok(result.requiredRbcMl > 1200)
})

test("pre-CPB already above target needs zero KRC", () => {
  const result = predictAdultPreCpbHct({
    weightKg: 70, preCpbHctPercent: 35, primeVolumeMl: 1200,
    productHctPercent: 66, desiredHctPercent: 25,
  })
  near(result.requiredRbcMl, 0)
  assert.equal(result.minimumWholeKrcUnits, 0)
})

test("on-pump 2 KRC units use exactly 500 mL matched HF without changing total volume", () => {
  const result = predictAdultOnPumpHct({
    currentTotalVolumeMl: 5050, currentHctPercent: 24, krcUnits: 2,
    crystalloidAddedMl: 0, fluidRemovedMl: 0, productHctPercent: 66,
  })
  near(result.krcAddedMl, 500)
  near(result.matchedKrcUfMl, 500)
  near(result.totalUfMl, 500)
  near(result.finalVolumeMl, 5050)
  near(result.predictedHctPercent, (5050 * 0.24 + 500 * 0.66) / 5050 * 100)
})

test("independent crystalloid addition/removal changes denominator only, no double-counted UF", () => {
  const result = predictAdultOnPumpHct({
    currentTotalVolumeMl: 5050, currentHctPercent: 24, krcUnits: 2,
    crystalloidAddedMl: 300, fluidRemovedMl: 200, productHctPercent: 66,
  })
  near(result.finalVolumeMl, 5150)
  near(result.matchedKrcUfMl, 500)
  near(result.totalUfMl, 700)
  near(result.predictedHctPercent, (5050 * 0.24 + 500 * 0.66) / 5150 * 100)
})

test("crystalloid alone dilutes Hct; fluid removal alone concentrates it", () => {
  const baseline = {
    currentTotalVolumeMl: 5050, currentHctPercent: 24, krcUnits: 0,
    productHctPercent: 66,
  }
  const added = predictAdultOnPumpHct({ ...baseline, crystalloidAddedMl: 500, fluidRemovedMl: 0 })
  const removed = predictAdultOnPumpHct({ ...baseline, crystalloidAddedMl: 0, fluidRemovedMl: 500 })
  near(added.predictedHctPercent, 5050 * 0.24 / 5550 * 100)
  near(removed.predictedHctPercent, 5050 * 0.24 / 4550 * 100)
  near(added.matchedKrcUfMl, 0)
  near(removed.totalUfMl, 500)
})

test("target helper is based on measured Current Hct and baseline EBV plus prime", () => {
  const result = predictAdultOnPumpHct({
    currentTotalVolumeMl: 5050, currentHctPercent: 24, krcUnits: 0,
    crystalloidAddedMl: 0, fluidRemovedMl: 0,
    productHctPercent: 66, desiredHctPercent: 30,
  })
  assert.equal(result.requiredKrcUnits, 2)
  assert.equal(result.requiredKrcMl, 500)
  near(result.requiredMatchedUfMl, 500)
  near(result.requiredKrcExactMl, (0.30 - 0.24) * 5050 / 0.66)
  near(result.requiredKrcEquivalentUnits, (0.30 - 0.24) * 5050 / 0.66 / 250)
  near(result.fluidOnlyAdjustmentMl, (5050 * 0.24) / 0.30 - 5050)
  assert.equal(result.targetFeasible, true)
  near(result.projectedTargetHctPercent, (5050 * 0.24 + 500 * 0.66) / 5050 * 100)
})

test("KRC only accepts whole units and invalid volume gets rejected", () => {
  const base = {
    currentTotalVolumeMl: 5050, currentHctPercent: 24, krcUnits: 1,
    crystalloidAddedMl: 0, fluidRemovedMl: 0, productHctPercent: 66,
  }
  assert.throws(() => predictAdultOnPumpHct({ ...base, krcUnits: 0.5 }), RangeError)
  assert.throws(() => predictAdultOnPumpHct({ ...base, krcUnits: -1 }), RangeError)
  assert.throws(() => predictAdultOnPumpHct({ ...base, crystalloidAddedMl: -100 }), RangeError)
  assert.throws(() => predictAdultOnPumpHct({ ...base, fluidRemovedMl: 5100 }), RangeError)
  assert.throws(() => predictAdultPreCpbHct({
    weightKg: 0, preCpbHctPercent: 35, primeVolumeMl: 1200, productHctPercent: 66,
  }), RangeError)
})

test("overconcentration is flagged instead of returning a Hct above 100%", () => {
  const result = predictAdultOnPumpHct({
    currentTotalVolumeMl: 5050, currentHctPercent: 90, krcUnits: 2,
    crystalloidAddedMl: 0, fluidRemovedMl: 400, productHctPercent: 66,
  })
  assert.equal(result.plannedFeasible, false)
  assert.equal(result.predictedHctPercent, null)
})

test("Desired Hct helper ignores planned KRC and crystalloid changes", () => {
  const base = {
    currentTotalVolumeMl: 3950, currentHctPercent: 23, productHctPercent: 66,
    desiredHctPercent: 30,
  }
  const unchanged = predictAdultOnPumpHct({
    ...base, krcUnits: 0, crystalloidAddedMl: 0, fluidRemovedMl: 0,
  })
  const planned = predictAdultOnPumpHct({
    ...base, krcUnits: 3, crystalloidAddedMl: 600, fluidRemovedMl: 100,
  })
  // Target result must derive from initial measured Hct and 3950 mL baseline.
  const requiredMl = (0.30 - 0.23) * 3950 / 0.66
  const fluidDelta = (3950 * 0.23) / 0.30 - 3950
  near(planned.requiredKrcExactMl, requiredMl)
  near(planned.requiredKrcEquivalentUnits, requiredMl / 250)
  near(planned.fluidOnlyAdjustmentMl, fluidDelta)
  near(planned.requiredKrcExactMl, unchanged.requiredKrcExactMl)
  near(planned.fluidOnlyAdjustmentMl, unchanged.fluidOnlyAdjustmentMl)
  assert.equal(planned.requiredKrcUnits, 2)
  near(planned.projectedTargetHctPercent, (3950 * 0.23 + 500 * 0.66) / 3950 * 100)
  near(planned.finalVolumeMl, 4450)
})

test("fluid-only adjustment returns signed positive mL for dilution and negative for concentration", () => {
  const base = {
    currentTotalVolumeMl: 3950, currentHctPercent: 23, productHctPercent: 66,
    krcUnits: 0, crystalloidAddedMl: 0, fluidRemovedMl: 0,
  }
  const higher = predictAdultOnPumpHct({ ...base, desiredHctPercent: 30 })
  const lower = predictAdultOnPumpHct({ ...base, desiredHctPercent: 20 })
  const same = predictAdultOnPumpHct({ ...base, desiredHctPercent: 23 })
  near(higher.fluidOnlyAdjustmentMl, 3950 * 0.23 / 0.30 - 3950)
  assert.ok(higher.fluidOnlyAdjustmentMl < 0)
  near(lower.fluidOnlyAdjustmentMl, 3950 * 0.23 / 0.20 - 3950)
  assert.ok(lower.fluidOnlyAdjustmentMl > 0)
  near(same.fluidOnlyAdjustmentMl, 0)
  near(same.requiredKrcExactMl, 0)
  assert.equal(same.requiredKrcUnits, 0)
  assert.equal(lower.rbcOnlyReachable, false)
  assert.equal(lower.requiredKrcExactMl, null)
})

test("invalid desired Hct is rejected", () => {
  const params = {
    currentTotalVolumeMl: 3950, currentHctPercent: 23, productHctPercent: 66,
    krcUnits: 0, crystalloidAddedMl: 0, fluidRemovedMl: 0,
  }
  assert.throws(() => predictAdultOnPumpHct({ ...params, desiredHctPercent: 0 }), RangeError)
  assert.throws(() => predictAdultOnPumpHct({ ...params, desiredHctPercent: 105 }), RangeError)
})

test("optional AHD changes start and reset blank but use zero for omitted calculations", () => {
  const component = readFileSync(
    new URL("../components/adult-hct-predict-calculator.tsx", import.meta.url), "utf8",
  )
  for (const [field, setter] of [
    ["crystalloidAdded", "setCrystalloidAdded"],
    ["fluidRemoved", "setFluidRemoved"],
    ["plannedKrcUnits", "setPlannedKrcUnits"],
  ]) {
    assert.ok(component.includes(`const [${field}, ${setter}] = useState("")`), field + " initial")
    assert.ok(component.includes(`${setter}("")`), field + " reset")
    assert.ok(component.includes(`asOptionalAdjustment(${field})`), field + " parse")
  }
  assert.ok(component.includes('value.trim() === "" ? 0 : asNumber(value)'))
  // The model already supports explicit zero; the optional blank maps to that baseline.
  const baseline = predictAdultOnPumpHct({
    currentTotalVolumeMl: 5000, currentHctPercent: 25,
    productHctPercent: 66, krcUnits: 0,
    crystalloidAddedMl: 0, fluidRemovedMl: 0,
  })
  near(baseline.predictedHctPercent, 25)
  near(baseline.finalVolumeMl, 5000)
})
