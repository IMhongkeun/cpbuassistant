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


test("O2ER shows BSA as optional, retains DO2i requirement and explains extra indices", () => {
  const src = readFileSync(new URL("../components/gdp-calculator.tsx", import.meta.url), "utf8")
  assert.match(src, /BSA \(m²\) \{gdpSubTab === "do2i"/)
  assert.match(src, /O₂ER 비율에는 필요하지 않으며, Pump Flow와 함께 입력하면 체격 대비 DO₂i·VO₂i를 확인합니다/)
  assert.match(src, /BSA와 함께 입력하면 체표면적당 산소전달량\(DO₂i\)과 추정 산소소비량\(VO₂i\)을 확인합니다/)
  assert.match(src, /gdpSubTab === "o2er" && \(/)
})

test("calculator formula help uses compact math layout without plain slash equations", () => {
  const pages = [
    "../components/gdp-calculator.tsx",
    "../components/qp-qs-calculator.tsx",
    "../components/simple-cpb-calculator.tsx",
    "../components/echo-zscore-tool.tsx",
    "../components/echo-zscore-pettersen.tsx",
  ]
  for (const path of pages) {
    const src = readFileSync(new URL(path, import.meta.url), "utf8")
    assert.match(src, /<CompactEquation/, path)
  }
  const shared = readFileSync(new URL("../components/ui/compact-equation.tsx", import.meta.url), "utf8")
  assert.match(shared, /role="math"/)
  assert.match(shared, /overflow-x-auto/)
  assert.match(shared, /border-b border-current/)
})


test("optional inputs are clearly marked and their clinical calculation effects explained", () => {
  const src = readFileSync(new URL("../components/gdp-calculator.tsx", import.meta.url), "utf8")
  assert.match(src, /PaO₂ \(mmHg\) <span className="font-normal text-slate-500">\(선택\)<\/span>/)
  assert.match(src, /미입력 시 DO₂i 계산에는 PaO₂ 200 mmHg를 가정합니다/)
  assert.match(src, /입력 시 동맥혈 용존산소를 CaO₂에 반영합니다/)
  assert.match(src, /선택 항목을 입력하면 무엇이 달라지나요\?/)
  assert.match(src, /선택 항목 입력 시 O₂ER 결과는 어떻게 달라지나요\?/)
  assert.match(src, /PaO₂와 PvO₂를 함께 입력하는 편이 좋습니다/)
  assert.match(src, /O₂ER 비율 자체는 변하지 않습니다/)
})

test("adding both dissolved oxygen pressures changes O2ER; adding flow and BSA only adds indexed values", () => {
  const base = { hgb: 8, sao2: 100, svo2: 70 }
  const simplified = computeO2er(base)
  const full = computeO2er({ ...base, pao2: 250, pvo2: 40 })
  const indexed = computeO2er({ ...base, pao2: 250, pvo2: 40, flow: 4.8, bsa: 2 })
  assert.equal(simplified.ok, true)
  assert.equal(full.ok, true)
  assert.equal(indexed.ok, true)
  assert.equal(simplified.o2er.toFixed(1), "30.0")
  assert.equal(full.o2er.toFixed(1), "33.5")
  assert.equal(full.do2i, null)
  assert.equal(indexed.o2er, full.o2er)
  assert.ok(indexed.do2i > 0)
  assert.ok(indexed.vo2i > 0)
})


test("required inputs are strongly marked and accessible by calculation mode", () => {
  const src = readFileSync(new URL("../components/gdp-calculator.tsx", import.meta.url), "utf8")
  assert.match(src, /htmlFor="hgb" className="text-sm font-bold text-slate-900"/)
  assert.match(src, /htmlFor="sao2" className="text-sm font-bold text-slate-900"/)
  assert.match(src, /htmlFor="svo2" className="text-sm font-bold text-slate-900"/)
  assert.match(src, /BSA \(m²\) \{gdpSubTab === "do2i"/)
  assert.match(src, /aria-required=\{gdpSubTab === "do2i"\}/)
  for (const id of ["hgb", "sao2", "svo2"]) {
    assert.match(src, new RegExp('id="' + id + '"\\s+aria-required="true"'))
  }
  assert.ok((src.match(/\* 필수/g) ?? []).length >= 4)
})

test("O2ER result groups content-based extraction and indexed supply/consumption separately", () => {
  const src = readFileSync(new URL("../components/gdp-calculator.tsx", import.meta.url), "utf8")
  const contentStart = src.indexOf("① CaO₂·CvO₂ 기준 — 산소추출 비율")
  const indexedStart = src.indexOf("② DO₂i·VO₂i 기준 — 환자 체격 대비 산소 공급·소비")
  const logStart = src.indexOf("<O2erLogPanel records=")
  assert.ok(contentStart > 0 && contentStart < indexedStart && indexedStart < logStart)
  assert.match(src, /O₂ER · 산소함량 기반/)
  assert.match(src, /O₂ER · DO₂i\/VO₂i로 표현한 동일 비율/)
  assert.match(src, /VO₂i \/ DO₂i × 100/)
  assert.match(src, /수학적으로 같습니다/)
  assert.match(src, /독립적인 두 측정값이 아닙니다/)
  assert.match(src, /BSA \+ Pump Flow/)
  assert.match(src, /조직 산소소비량을 직접 측정한 값이 아닙니다/)
})

test("indexed oxygen delivery and consumption yield the identical extraction ratio over multiple values", () => {
  for (const caseInput of [
    { hgb: 8, sao2: 100, svo2: 70, pao2: 250, pvo2: 40, flow: 4.8, bsa: 2 },
    { hgb: 10.2, sao2: 99, svo2: 64, pao2: 140, pvo2: 35, flow: 3.6, bsa: 1.5 },
    { hgb: 12, sao2: 98, svo2: 81, flow: 5.3, bsa: 1.9 },
  ]) {
    const result = computeO2er(caseInput)
    assert.equal(result.ok, true)
    assert.ok(result.do2i > 0)
    assert.ok(result.vo2i > 0)
    close((result.vo2i / result.do2i) * 100, result.o2er, 1e-10)
  }
})
