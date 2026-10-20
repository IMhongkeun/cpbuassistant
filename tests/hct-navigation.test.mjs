import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
const adult = readFileSync(new URL("../components/adult-hct-predict-calculator.tsx", import.meta.url), "utf8")

test("Hct navigation uses AHD and PCS under one top-level menu", () => {
  assert.match(page, /onClick=\{\(\) => setActiveTab\("hct"\)\}/)
  assert.match(page, /hctSubTab === "ahd" && <AdultHctPredictCalculator \/>/)
  assert.match(page, /hctSubTab === "pcs" && <BloodHemodilutionCalculator \/>/)
  assert.doesNotMatch(page, /setPcsSubTab\("blood"\)/)
  assert.doesNotMatch(page, /pcsSubTab === "blood"/)
})

test("AHD defaults to editable 1200 mL prime and shares no form state with PCS", () => {
  assert.match(adult, /setPrime\] = useState\("1200"\)/)
  assert.match(adult, /ADULT_BLOOD_VOLUME_ML_PER_KG/)
  assert.match(adult, /KRC_VOLUME_ML_PER_UNIT/)
  assert.match(adult, /setPlannedKrcUnits/)
  assert.match(adult, /step="1"/)
  assert.match(adult, /setCrystalloidAdded/)
  assert.match(adult, /setFluidRemoved/)
  assert.match(adult, /수술 중 Hct 계산/)
  assert.doesNotMatch(adult, /ahd-patient-type/)
  assert.doesNotMatch(adult, /ahd-coefficient/)
  assert.doesNotMatch(adult, /ahd-net/)
  assert.doesNotMatch(adult, /RBC-LF/)
  assert.doesNotMatch(adult, /ahd-unit-volume/)
  assert.match(adult, /onChange=\{setPrime\}/)
  assert.match(adult, /predictAdultPreCpbHct\(/)
  assert.match(adult, /predictAdultOnPumpHct\(/)
  assert.doesNotMatch(adult, /localStorage/)
  assert.doesNotMatch(adult, /cpbuassistant:bloodHemodilution/)
})

test("On-pump result cards precede Desired Hct and KRC entry is number-only", () => {
  const resultIndex = adult.indexOf('label="수술 중 예상 Hct (%)"')
  const desiredIndex = adult.indexOf('id="ahd-pump-desired"')
  assert.ok(resultIndex !== -1 && desiredIndex !== -1 && resultIndex < desiredIndex,
    "four on-pump result cards should come before Desired Hct")
  assert.doesNotMatch(adult, /KRC unit 빠른 선택/)
  assert.doesNotMatch(adult, /setPlannedKrcUnits\(String\(unit\)\)/)
  assert.match(adult, /id="ahd-krc-units"/)
  assert.match(adult, /step="1"/)
})

test("Desired Hct uses measured Current Hct and the initial CPB volume independently", () => {
  assert.match(adult, /const targetResult = useMemo\(/)
  assert.match(adult, /currentTotalVolumeMl: currentEstimatedVolume/)
  assert.match(adult, /currentHctPercent: asNumber\(currentHct\)/)
  assert.match(adult, /requiredKrcExactMl/)
  assert.match(adult, /requiredKrcEquivalentUnits/)
  assert.match(adult, /fluidOnlyAdjustmentMl/)
  assert.match(adult, /KRC만 주입/)
  assert.match(adult, /Crystalloid\/수분만 변화 시/)
})
