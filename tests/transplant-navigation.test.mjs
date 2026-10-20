import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
const adult = readFileSync(new URL("../components/adult-hct-predict-calculator.tsx", import.meta.url), "utf8")

test("main nav has transplant management then Hct, PCS, GDP, MICS, and rightmost LBM", () => {
  const labels = [...page.matchAll(/\{ id: "(.*?)", label: "(.*?)"/g)].map((m) => m[2])
  assert.deepEqual(labels, ["이식관리", "Hct", "PCS", "GDP", "MICS", "LBM"])
  assert.match(page, /setTransplantSubTab\("lung"\)/)
  assert.match(page, /setTransplantSubTab\("heart"\)/)
  assert.match(page, /activeTab === "transplant" && transplantSubTab === "lung"/)
  assert.match(page, /activeTab === "transplant" && transplantSubTab === "heart"/)
  assert.doesNotMatch(page, /setActiveTab\("lung"\)/)
  assert.doesNotMatch(page, /setActiveTab\("heart"\)/)
})

test("time inputs are defined at module level so parent rerenders do not remount focused controls", () => {
  const parent = page.indexOf("const CPBUassistant = () =>")
  for (const section of ["const TimeInput =", "const DonorAccTimeInput =", "const TimeSection =", "const getCurrentTime ="]) {
    const pos = page.indexOf(section)
    assert.ok(pos > 0 && pos < parent, section + " must be outside the parent component")
  }
})

test("Tab sequence skips auto-populated fields and clock buttons", () => {
  assert.match(page, /tabIndex=\{readOnly \|\| skipTab \? -1 : 0\}/)
  assert.match(page, /tabIndex=\{-1\}/)
  assert.match(page, /skipTab=\{skipStartTab\}/)
  assert.match(page, /skipTab=\{skipEndTab\}/)
  const lt = page.slice(page.indexOf("/* Left Lung Section */"), page.indexOf("/* Right Lung Section */"))
  const rt = page.slice(page.indexOf("/* Right Lung Section */"), page.indexOf("/* Pump Time Section"))
  const heart = page.slice(page.indexOf("/* Heart Transplant Section */"), page.indexOf("/* Pediatric Cardiac Surgery Section"))
  for (const lungSide of [lt, rt]) {
    assert.equal((lungSide.match(/skipStartTab=\{true\}/g) || []).length, 1, "warm start auto-filled")
    assert.equal((lungSide.match(/skipEndTab=\{true\}/g) || []).length, 1, "anastomosis end auto-filled")
    assert.match(lungSide, /readOnlyStart=\{true\}/)
  }
  assert.equal((heart.match(/skipStartTab=\{true\}/g) || []).length, 1, "heart warm start auto-filled")
  assert.match(heart, /readOnlyStart=\{true\}/)
  assert.match(heart, /onEndChange=\{\(e\) =>/)
})

test("adult Hct has paired inputs, lower crystalloid row and separated target calculator", () => {
  const current = adult.indexOf('id="ahd-current-hct"')
  const krc = adult.indexOf('id="ahd-krc-units"')
  const add = adult.indexOf('id="ahd-crystalloid-added"')
  const remove = adult.indexOf('id="ahd-fluid-removed"')
  const result = adult.indexOf('label="수술 중 예상 Hct (%)"')
  const target = adult.indexOf('id="ahd-pump-desired"')
  assert.ok([current, krc, add, remove, result, target].every((x) => x > 0))
  assert.ok(current < krc && krc < add && add < remove && remove < result && result < target)
  assert.match(adult, /<section aria-labelledby="ahd-target-heading"/)
  assert.match(adult, /목표 Hct 맞추기/)
  assert.doesNotMatch(adult, /AHD는 leukocyte filter를 별도로 사용하지 않는 KRC 기준입니다/)
})
