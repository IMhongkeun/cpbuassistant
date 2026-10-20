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
  assert.match(adult, /onChange=\{setPrime\}/)
  assert.match(adult, /predictAdultPreCpbHct\(/)
  assert.match(adult, /predictAdultOnPumpHct\(/)
  assert.doesNotMatch(adult, /localStorage/)
  assert.doesNotMatch(adult, /cpbuassistant:bloodHemodilution/)
})
