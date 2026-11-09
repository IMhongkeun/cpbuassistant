import assert from "node:assert/strict"
import test from "node:test"
import {
  WORKSPACE_TTL_MS,
  applyPatientEdit,
  caseExpiresAt,
  computedBsa,
  createCase,
  effectiveBsa,
  emptyPatient,
  formatElapsed,
  isBsaManual,
  isCaseExpired,
  mostellerBsa,
  parseStoredCase,
  readPatientBinding,
  replaceCasePatient,
  samePatientValue,
  serializeCase,
  touchCase,
  updateCaseCalculator,
  updateCasePatient,
  validatePatient,
} from "../lib/patient-workspace.ts"

const T0 = Date.UTC(2026, 10, 9, 0, 0, 0)
const HOUR = 60 * 60 * 1000
const patient = (overrides = {}) => ({
  ...emptyPatient(), sex: "M", heightCm: "170", weightKg: "68", preHct: "38", procedure: "CABG", ...overrides,
})

test("TTL is 12 hours", () => {
  assert.equal(WORKSPACE_TTL_MS, 12 * HOUR)
})

test("Mosteller BSA and the virtual bsa binding", () => {
  const bsa = mostellerBsa(170, 68)
  assert.ok(Math.abs(bsa - Math.sqrt(170 * 68 / 3600)) < 1e-12)
  assert.equal(readPatientBinding(patient(), "bsa"), bsa.toFixed(2))
  assert.equal(mostellerBsa(null, 68), null)
  assert.equal(mostellerBsa(0, 68), null)
  assert.equal(computedBsa(patient({ heightCm: "" })), null)
  assert.equal(readPatientBinding(patient({ weightKg: "" }), "bsa"), "")
})

test("BSA override is set by a different value and cleared by the Mosteller value", () => {
  const base = patient()
  const manual = applyPatientEdit(base, "bsa", "1.90")
  assert.equal(manual.bsaOverride, "1.90")
  assert.equal(isBsaManual(manual), true)
  assert.equal(effectiveBsa(manual), 1.9)
  assert.equal(readPatientBinding(manual, "bsa"), "1.90")
  const computed = computedBsa(base).toFixed(2)
  const cleared = applyPatientEdit(manual, "bsa", computed)
  assert.equal(cleared.bsaOverride, "")
  assert.equal(isBsaManual(cleared), false)
  assert.equal(applyPatientEdit(manual, "bsa", "").bsaOverride, "")
})

test("sex edits only accept M or F", () => {
  assert.equal(applyPatientEdit(patient(), "sex", "F").sex, "F")
  assert.equal(applyPatientEdit(patient(), "sex", "X").sex, "")
})

test("numeric-aware equality", () => {
  assert.equal(samePatientValue("70", "70.0"), true)
  assert.equal(samePatientValue("70", "70.5"), false)
  assert.equal(samePatientValue("M", "M"), true)
  assert.equal(samePatientValue("", "0"), false)
})

test("validation requires sex, height, weight and Pre Hct; warns outside typical ranges", () => {
  const empty = validatePatient(emptyPatient())
  assert.equal(empty.valid, false)
  for (const key of ["sex", "heightCm", "weightKg", "preHct"]) assert.ok(empty.errors[key], key)
  assert.equal(empty.errors.ageYears, undefined)

  const ok = validatePatient(patient())
  assert.equal(ok.valid, true)
  assert.deepEqual(ok.warnings, {})

  const unusual = validatePatient(patient({ preHct: "18", weightKg: "1.2", heightCm: "45" }))
  assert.equal(unusual.valid, true)
  assert.ok(unusual.warnings.preHct)
  assert.ok(unusual.warnings.weightKg)

  const impossible = validatePatient(patient({ preHct: "80", heightCm: "abc", ageYears: "130" }))
  assert.equal(impossible.valid, false)
  assert.ok(impossible.errors.preHct)
  assert.ok(impossible.errors.heightCm)
  assert.ok(impossible.errors.ageYears)
})

test("expiry is a sliding window from the last update with an exclusive boundary", () => {
  const c = createCase(patient(), T0, "case-a")
  assert.equal(caseExpiresAt(c), T0 + 12 * HOUR)
  assert.equal(isCaseExpired(c, T0 + 12 * HOUR - 1), false)
  assert.equal(isCaseExpired(c, T0 + 12 * HOUR), true)

  const touched = touchCase(c, T0 + 10 * HOUR)
  assert.equal(isCaseExpired(touched, T0 + 20 * HOUR), false)
  assert.equal(isCaseExpired(touched, T0 + 22 * HOUR), true)
  assert.equal(touchCase(touched, T0), touched, "touch never moves updatedAt backwards")
})

test("edits move updatedAt forward only when something changed", () => {
  const c = createCase(patient(), T0, "case-a")
  assert.equal(updateCasePatient(c, "weightKg", "68", T0 + HOUR), c)
  const edited = updateCasePatient(c, "weightKg", "70", T0 + HOUR)
  assert.equal(edited.patient.weightKg, "70")
  assert.equal(edited.updatedAt, T0 + HOUR)

  const calc = updateCaseCalculator(edited, "ahd", { prime: "1200" }, T0 + 2 * HOUR)
  assert.equal(calc.updatedAt, T0 + 2 * HOUR)
  assert.equal(updateCaseCalculator(calc, "ahd", { prime: "1200" }, T0 + 3 * HOUR), calc)

  const replaced = replaceCasePatient(calc, patient({ weightKg: "72" }), T0 + 4 * HOUR)
  assert.equal(replaced.patient.weightKg, "72")
  assert.deepEqual(replaced.calculators, calc.calculators)
})

test("stored cases round-trip and are classified as none, invalid, expired or active", () => {
  assert.deepEqual(parseStoredCase(null, T0), { status: "none" })
  assert.deepEqual(parseStoredCase("", T0), { status: "none" })
  assert.deepEqual(parseStoredCase("{not json", T0), { status: "invalid" })
  assert.deepEqual(parseStoredCase(JSON.stringify({ version: 99 }), T0), { status: "invalid" })
  assert.deepEqual(parseStoredCase(JSON.stringify({ version: 1, id: "x", createdAt: T0, updatedAt: T0, patient: "bad" }), T0), { status: "invalid" })

  const c = updateCaseCalculator(createCase(patient(), T0, "case-a"), "gdp", { params: { hgb: "9" } }, T0 + HOUR)
  const raw = serializeCase(c)
  const active = parseStoredCase(raw, T0 + 2 * HOUR)
  assert.equal(active.status, "active")
  assert.deepEqual(active.case, c)

  const expired = parseStoredCase(raw, T0 + HOUR + 12 * HOUR)
  assert.equal(expired.status, "expired")
})

test("stored data is sanitized: unknown patient keys dropped, invalid sex cleared, non-object calculators ignored", () => {
  const raw = JSON.stringify({
    version: 1, id: "case-b", createdAt: T0, updatedAt: T0,
    patient: { sex: "Z", heightCm: 170, weightKg: "68", preHct: "38", registrationNumber: "12345" },
    calculators: { ok: { a: 1 }, bad: "string", arr: [1] },
  })
  const result = parseStoredCase(raw, T0 + 1)
  assert.equal(result.status, "active")
  assert.equal(result.case.patient.sex, "")
  assert.equal(result.case.patient.heightCm, "170")
  assert.equal("registrationNumber" in result.case.patient, false)
  assert.deepEqual(Object.keys(result.case.calculators), ["ok"])
})

test("patient model has no name or registration number fields", () => {
  const keys = Object.keys(emptyPatient())
  for (const forbidden of ["name", "patientName", "mrn", "registrationNumber", "id"]) {
    assert.equal(keys.includes(forbidden), false, forbidden)
  }
})

test("elapsed formatting", () => {
  assert.equal(formatElapsed(0), "0:00")
  assert.equal(formatElapsed(65 * 60000), "1:05")
  assert.equal(formatElapsed(-5), "0:00")
})

import { readFileSync } from "node:fs"
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("calculators bind shared patient values through useWorkspaceSync", () => {
  const expectations = {
    "components/adult-hct-predict-calculator.tsx": ['useWorkspaceSync("adult-hct"', 'patient: "weightKg"', 'patient: "preHct"', "workspaceSync.refillPatient()"],
    "components/blood-hemodilution-calculator.tsx": ['useWorkspaceSync("pcs-hct"', 'patient: "weightKg"', 'patient: "preHct"', "workspaceActive ? null : safeSessionStorageGetItem"],
    "components/gdp-calculator.tsx": ['useWorkspaceSync("gdp"', 'patient: "bsa"'],
    "components/simple-cpb-calculator.tsx": ['useWorkspaceSync("lbm"', 'patient: "sex"', 'patient: "heightCm"', 'patient: "weightKg"'],
    "components/scmp-flow-calculator.tsx": ['useWorkspaceSync("scmp"', 'patient: "weightKg"'],
    "components/echo-zscore-tool.tsx": ['useWorkspaceSync("echo-lopez"', 'patient: "heightCm"'],
    "components/echo-zscore-pettersen.tsx": ['useWorkspaceSync("echo-pettersen"', 'patient: "heightCm"'],
    "components/qp-qs-calculator.tsx": ['useWorkspaceSync("qpqs"'],
    "components/cannula-browser.tsx": ['useWorkspaceSync("cannula"', "selectedIds"],
  }
  for (const [file, needles] of Object.entries(expectations)) {
    const src = read(file)
    for (const needle of needles) assert.ok(src.includes(needle), file + " missing " + needle)
  }
})

test("MICS drainage height is never bound to patient height, and clamped weight/Hct are follow-only", () => {
  const mics = read("components/mics-drainage-calculator.tsx")
  assert.match(mics, /heightCm: \{ value: heightCm, set: setHeightCm \}/)
  assert.doesNotMatch(mics, /heightCm: \{[^}]*patient:/)
  assert.match(mics, /weight: \{ value: weight, set: setWeight, patient: "weightKg", writePatient: false \}/)
  assert.match(mics, /preHct: \{ value: preHct, set: setPreHct, patient: "preHct", writePatient: false \}/)
})

test("page wires the workspace: provider, mode switch, summary bar, per-case remount, transplant persistence", () => {
  const page = read("app/page.tsx")
  assert.match(page, /<PatientWorkspaceProvider>/)
  assert.match(page, /<WorkspaceModeSwitch \/>/)
  assert.match(page, /<WorkspaceSummaryBar \/>/)
  assert.match(page, /<main key=\{mainKey\}/)
  assert.match(page, /useWorkspaceSync\("transplant"/)
  assert.match(page, /setLungData\(createInitialLungData\(\)\)/)
})

test("shared patient edits from calculators never clear the case value", () => {
  const provider = read("components/workspace/workspace-provider.tsx")
  assert.match(provider, /local\[name\]\.trim\(\) !== ""/)
  assert.match(provider, /binding\.writePatient !== false/)
})

test("site always opens in Quick Calc and the title link returns to that first screen", () => {
  const provider = read("components/workspace/workspace-provider.tsx")
  const shell = read("components/workspace/workspace-shell.tsx")
  const page = read("app/page.tsx")
  assert.match(provider, /useState<WorkspaceMode>\("quick"\)/)
  assert.doesNotMatch(provider, /uiPrefs|cpbu\.ui\.v1/)
  assert.match(shell, /label: "Quick Calc"/)
  assert.doesNotMatch(shell, /빠른 계산/)
  assert.match(page, /<a\s+href="\/"/)
  const home = page.slice(page.indexOf("const goHome = () => {"), page.indexOf("const showWorkspaceGate"))
  for (const step of ['setMode("quick")', 'setActiveTab("transplant")', 'setTransplantSubTab("lung")', 'setPcsSubTab("echo")', 'setHctSubTab("ahd")', "setHomeNonce"]) {
    assert.ok(home.includes(step), "goHome missing " + step)
  }
  for (const [name, initial] of [["activeTab", "transplant"], ["transplantSubTab", "lung"], ["pcsSubTab", "echo"], ["hctSubTab", "ahd"]]) {
    assert.match(page, new RegExp("const \\[" + name + ", set\\w+\\] = useState\\(\"" + initial + "\"\\)"), name + " default matches home")
  }
})
