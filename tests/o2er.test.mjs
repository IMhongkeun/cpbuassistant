import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { computeO2er, parseSaO2 } from "../lib/o2er.ts"

const close = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`)

test("full-content O2ER with dissolved O2 (Hb 8, SaO2 100, PaO2 250, SvO2 70, PvO2 40, 2.4 L/min/m²)", () => {
  const r = computeO2er({ hgb: 8, sao2: 100, svo2: 70, pao2: 250, pvo2: 40, flow: 4.8, bsa: 2.0 })
  assert.equal(r.ok, true)
  close(r.cao2, 11.47)
  close(r.cvo2, 7.624)
  close(r.avDiff, 3.846)
  close(r.o2er, 33.53, 0.01)
  close(r.o2erSaturationOnly, 30.0)
  close(r.ci, 2.4)
  close(r.do2i, 275.28)
  close(r.vo2i, 92.30)
  // VO2i / DO2i equals O2ER
  close((r.vo2i / r.do2i) * 100, r.o2er, 1e-9)
  assert.deepEqual(r.warnings, [])
})

test("O2ER does not depend on pump flow; DO2i/VO2i require flow and BSA", () => {
  const a = computeO2er({ hgb: 9, sao2: 99, svo2: 75, pao2: 200, pvo2: 45 })
  const b = computeO2er({ hgb: 9, sao2: 99, svo2: 75, pao2: 200, pvo2: 45, flow: 3, bsa: 1.5 })
  close(a.o2er, b.o2er, 1e-12)
  assert.equal(a.do2i, null)
  assert.equal(a.vo2i, null)
  assert.equal(computeO2er({ hgb: 9, sao2: 99, svo2: 75, flow: 3 }).do2i, null)
})

test("missing PaO2/PvO2 excludes dissolved O2 and warns", () => {
  const r = computeO2er({ hgb: 10, sao2: 100, svo2: 75 })
  assert.equal(r.ok, true)
  close(r.o2er, 25.0)
  close(r.o2er, r.o2erSaturationOnly, 1e-12)
  assert.equal(r.dissolvedArterialIncluded, false)
  assert.ok(r.warnings.some((w) => w.includes("PaO₂ 미입력")))

  const noPv = computeO2er({ hgb: 10, sao2: 100, svo2: 75, pao2: 300 })
  assert.ok(noPv.warnings.some((w) => w.includes("PvO₂ 미입력")))
})

test("invalid inputs are rejected without extrapolation", () => {
  assert.equal(computeO2er({ hgb: 0, sao2: 100, svo2: 70 }).ok, false)
  assert.equal(computeO2er({ hgb: 8, sao2: 0, svo2: 70 }).ok, false)
  assert.equal(computeO2er({ hgb: 8, sao2: 101, svo2: 70 }).ok, false)
  assert.equal(computeO2er({ hgb: 8, sao2: 100, svo2: 101 }).ok, false)
  assert.equal(computeO2er({ hgb: 8, sao2: 100, svo2: NaN }).ok, false)
  // CvO2 >= CaO2
  const r = computeO2er({ hgb: 8, sao2: 90, svo2: 95 })
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /CvO₂가 CaO₂ 이상/)
})

test("GDP component exposes DO2i / O2ER sub-tabs sharing one input state", () => {
  const src = readFileSync(new URL("../components/gdp-calculator.tsx", import.meta.url), "utf8")
  assert.match(src, /from "@\/lib\/o2er"/)
  assert.match(src, /gdpSubTab === "do2i"/)
  assert.match(src, /gdpSubTab === "o2er"/)
  assert.match(src, /cpbu-subtab/)
  assert.match(src, /id="svo2"/)
  // existing DO2i behaviour preserved
  assert.match(src, /computeMinFlow\(bsa, cao2, baseTarget\)/)
  assert.match(src, /Math\.max\(n\(params\.pao2, 200\), 0\)/)
})

test("shared SaO2: empty or out-of-range is invalid (no silent 100% fallback)", () => {
  assert.equal(parseSaO2(""), null)
  assert.equal(parseSaO2("   "), null)
  assert.equal(parseSaO2("abc"), null)
  assert.equal(parseSaO2("0"), null)
  assert.equal(parseSaO2("100.5"), null)
  assert.equal(parseSaO2("-5"), null)
  assert.equal(parseSaO2("100"), 100)
  assert.equal(parseSaO2("97,5"), 97.5)
  const src = readFileSync(new URL("../components/gdp-calculator.tsx", import.meta.url), "utf8")
  // DO2i path requires a valid shared SaO2 and no longer clamps/falls back to 100
  assert.match(src, /const sao2 = parseSaO2\(params\.sao2\)/)
  assert.match(src, /if \(bsa > 0 && hgb > 0 && sao2 !== null\)/)
  assert.doesNotMatch(src, /n\(params\.sao2, 100\)/)
})
