import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { solveMicsDrainage, solveMicsTarget, solveMicsMaximum, FV_CURVES, IJV_CURVES } from "../lib/mics-hydraulics.ts"

const defaults = {
  fv: 25,
  ijv: 0,
  tube: 0.375,
  targetFlow: 5,
  vavdLimit: 60,
  heightCm: 30,
  fvLengthCm: 200,
  ijvLengthCm: 120,
  snaring: false,
  ijvPercent: 35,
}

test("regression: FV25 / 3/8 / 5 Lpm / 30cm retains 66.8 mmHg and 4.8 Lpm", () => {
  const result = solveMicsDrainage(defaults)
  assert.ok(result)
  assert.equal(result.requiredVavd.toFixed(1), "66.8")
  assert.equal(result.maxFlow.toFixed(1), "4.8")
  assert.ok(result.target)
  assert.equal(result.target.svcFlow, 0)
  assert.ok(result.target.pressure > result.budget)
  assert.ok(result.maxResult.pressure <= result.budget + 1e-6)
})

test("changing vacuum limit shifts attainable flow without changing target ΔP", () => {
  const base = solveMicsDrainage(defaults)
  const higher = solveMicsDrainage({ ...defaults, vavdLimit: 80 })
  assert.equal(base.requiredVavd, higher.requiredVavd)
  assert.ok(higher.maxFlow > base.maxFlow)
})

test("FV + IJV non-snaring: target and max split sum to total", () => {
  const result = solveMicsDrainage({ ...defaults, ijv: 17, targetFlow: 4.5 })
  assert.ok(result?.target && result?.maxResult)
  for (const split of [result.target, result.maxResult]) {
    assert.ok(split.fvFlow > 0)
    assert.ok(split.svcFlow > 0)
    assert.ok(Math.abs(split.fvFlow + split.svcFlow - split.totalFlow) < 1e-8)
  }
  assert.ok(Math.abs(result.target.totalFlow - 4.5) < 1e-8)
})

test("snaring preserves the assumed IJV return split", () => {
  const result = solveMicsDrainage({ ...defaults, ijv: 17, targetFlow: 4, snaring: true, ijvPercent: 35 })
  assert.ok(result?.target)
  assert.ok(Math.abs(result.target.svcFlow / result.target.totalFlow - 0.35) < 1e-8)
  assert.ok(result.maxFlow <= 8)
})

test("source curves and bounded search reject extrapolation", () => {
  const result = solveMicsDrainage({ ...defaults, fv: 19, targetFlow: 8 })
  assert.ok(result)
  assert.equal(result.target, null)
  assert.ok(result.maxFlow <= 6)
  assert.equal(FV_CURVES[25].at(-1), 53)
  assert.equal(IJV_CURVES[17].at(-1), 185)
})

test("invalid inputs do not yield misleading estimates", () => {
  assert.equal(solveMicsDrainage({ ...defaults, fvLengthCm: 0 }), null)
  assert.equal(solveMicsDrainage({ ...defaults, vavdLimit: Number.NaN }), null)
})

test("target slider changes target estimate but never the independently computed max flow", () => {
  const config = { ...defaults, ijv: 17 }
  const maximum = solveMicsMaximum({ ...config, targetFlow: 0 })
  const before = solveMicsTarget({ ...config, targetFlow: 4.0 })
  const after = solveMicsTarget({ ...config, targetFlow: 5.0 })
  const combined = solveMicsDrainage({ ...config, targetFlow: 5.0 })

  assert.ok(maximum && before && after && combined)
  assert.ok(before.target && after.target)
  assert.notEqual(before.requiredVavd, after.requiredVavd)
  assert.equal(maximum.maxFlow, combined.maxFlow)
  assert.deepEqual(maximum.maxResult, combined.maxResult)
})

test("UI uses IJV before FV for dual drainage and max is not coupled to target slider", () => {
  const ui = readFileSync(new URL("../components/mics-drainage-calculator.tsx", import.meta.url), "utf8")
  assert.ok(ui.includes(">IJV + FV</button>"))
  assert.ok(ui.indexOf("상부 · IJV cannula") < ui.indexOf("하부 · FV cannula"))
  assert.ok(ui.indexOf("상부 · IJV tubing") < ui.indexOf("하부 · FV tubing"))
  assert.ok(ui.indexOf("상부 · IJV tubing 길이") < ui.indexOf("하부 · FV tubing 길이"))
  assert.ok(ui.indexOf('className="bg-sky-400"') < ui.indexOf('className="bg-teal-600"'))
  assert.ok(ui.indexOf("상부 · IJV</span>") < ui.indexOf("하부 · FV</span>"))
  const maximumMemo = ui.slice(ui.indexOf("const maximumResult = useMemo"), ui.indexOf("const calculated ="))
  assert.match(maximumMemo, /targetFlow: 0/)
  assert.doesNotMatch(maximumMemo.slice(maximumMemo.lastIndexOf("}), [")), /\\btargetFlow\\b/)
})
