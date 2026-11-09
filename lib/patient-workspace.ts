// Patient Workspace: one patient per operating-room laptop, kept only in this
// browser's localStorage. Nothing here is ever sent to a server.
//
// Rules
// - No name or registration number fields exist by design.
// - A case expires WORKSPACE_TTL_MS after its last update (sliding window).
//   Expiry is checked when the stored case is read, before it can be resumed,
//   so opening the site never extends a stale case.
// - Shared patient values (sex, height, weight, Pre Hct, BSA) are the single
//   source for every connected calculator. Calculator-only inputs are stored
//   per calculator id.

export const WORKSPACE_STORAGE_KEY = "cpbu.patientWorkspace.v1"
export const WORKSPACE_UI_STORAGE_KEY = "cpbu.ui.v1"
export const WORKSPACE_VERSION = 1
export const WORKSPACE_TTL_MS = 12 * 60 * 60 * 1000

export type Sex = "M" | "F" | ""

export type PatientInfo = {
  sex: Sex
  ageYears: string
  heightCm: string
  weightKg: string
  preHct: string
  procedure: string
  note: string
  // Empty means "use Mosteller BSA from height and weight".
  bsaOverride: string
}

// Keys a calculator may bind to. "bsa" is virtual: it reads the effective BSA
// and writes bsaOverride.
export type PatientBindingKey = "sex" | "heightCm" | "weightKg" | "preHct" | "bsa"

export type WorkspaceCase = {
  version: number
  id: string
  createdAt: number
  updatedAt: number
  patient: PatientInfo
  calculators: Record<string, Record<string, unknown>>
}

export type StoredCaseResult =
  | { status: "none" }
  | { status: "invalid" }
  | { status: "expired"; case: WorkspaceCase }
  | { status: "active"; case: WorkspaceCase }

export type PatientValidation = {
  errors: Partial<Record<keyof PatientInfo, string>>
  warnings: Partial<Record<keyof PatientInfo, string>>
  valid: boolean
}

export const emptyPatient = (): PatientInfo => ({
  sex: "",
  ageYears: "",
  heightCm: "",
  weightKg: "",
  preHct: "",
  procedure: "",
  note: "",
  bsaOverride: "",
})

export const parseNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(",", ".")
  if (trimmed === "") return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

// Mosteller: BSA (m²) = √(height cm × weight kg / 3600)
export const mostellerBsa = (heightCm: number | null, weightKg: number | null): number | null => {
  if (heightCm === null || weightKg === null || heightCm <= 0 || weightKg <= 0) return null
  return Math.sqrt((heightCm * weightKg) / 3600)
}

export const computedBsa = (patient: PatientInfo): number | null =>
  mostellerBsa(parseNumber(patient.heightCm), parseNumber(patient.weightKg))

export const effectiveBsa = (patient: PatientInfo): number | null => {
  const override = parseNumber(patient.bsaOverride)
  if (override !== null && override > 0) return override
  return computedBsa(patient)
}

export const formatBsa = (bsa: number | null): string => (bsa === null ? "" : bsa.toFixed(2))

export const isBsaManual = (patient: PatientInfo): boolean => {
  const override = parseNumber(patient.bsaOverride)
  return override !== null && override > 0
}

export const readPatientBinding = (patient: PatientInfo, key: PatientBindingKey): string => {
  if (key === "bsa") return formatBsa(effectiveBsa(patient))
  return patient[key]
}

// Numeric-aware equality so "70", "70.0" and 70 are treated as the same value.
export const samePatientValue = (a: string, b: string): boolean => {
  const na = parseNumber(a)
  const nb = parseNumber(b)
  if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-9
  return a.trim() === b.trim()
}

// Applies an edit coming from a calculator or the patient form.
export const applyPatientEdit = (
  patient: PatientInfo,
  key: PatientBindingKey | keyof PatientInfo,
  value: string,
): PatientInfo => {
  if (key === "bsa") {
    const entered = parseNumber(value)
    const computed = computedBsa(patient)
    // Matching the Mosteller value (at the displayed 0.01 precision) clears the override.
    if (entered === null || (computed !== null && Math.abs(entered - computed) < 0.005)) {
      return { ...patient, bsaOverride: "" }
    }
    return { ...patient, bsaOverride: value.trim() }
  }
  if (key === "sex") {
    return { ...patient, sex: value === "M" || value === "F" ? value : "" }
  }
  return { ...patient, [key]: value }
}

type Range = { min: number; max: number }
type FieldRule = { label: string; unit: string; required: boolean; hard: Range; typical: Range }

export const PATIENT_FIELD_RULES: Record<"heightCm" | "weightKg" | "preHct" | "ageYears" | "bsaOverride", FieldRule> = {
  heightCm: { label: "키", unit: "cm", required: true, hard: { min: 20, max: 250 }, typical: { min: 40, max: 210 } },
  weightKg: { label: "체중", unit: "kg", required: true, hard: { min: 0.3, max: 300 }, typical: { min: 1.5, max: 200 } },
  preHct: { label: "Pre Hct", unit: "%", required: true, hard: { min: 5, max: 75 }, typical: { min: 20, max: 55 } },
  ageYears: { label: "나이", unit: "세", required: false, hard: { min: 0, max: 120 }, typical: { min: 0, max: 100 } },
  bsaOverride: { label: "BSA", unit: "m²", required: false, hard: { min: 0.1, max: 3.5 }, typical: { min: 0.15, max: 2.6 } },
}

export const validatePatient = (patient: PatientInfo): PatientValidation => {
  const errors: PatientValidation["errors"] = {}
  const warnings: PatientValidation["warnings"] = {}

  if (patient.sex !== "M" && patient.sex !== "F") errors.sex = "성별을 선택하세요."

  for (const [key, rule] of Object.entries(PATIENT_FIELD_RULES) as [keyof typeof PATIENT_FIELD_RULES, FieldRule][]) {
    const raw = patient[key]
    if (raw.trim() === "") {
      if (rule.required) errors[key] = rule.label + "을(를) 입력하세요."
      continue
    }
    const value = parseNumber(raw)
    if (value === null) {
      errors[key] = "숫자로 입력하세요."
      continue
    }
    if (value < rule.hard.min || value > rule.hard.max) {
      errors[key] = `${rule.hard.min}–${rule.hard.max} ${rule.unit} 범위를 벗어났습니다.`
      continue
    }
    if (value < rule.typical.min || value > rule.typical.max) {
      warnings[key] = `일반 범위(${rule.typical.min}–${rule.typical.max} ${rule.unit}) 밖입니다. 값을 확인하세요.`
    }
  }

  return { errors, warnings, valid: Object.keys(errors).length === 0 }
}

export const createCaseId = (now: number, random: () => number = Math.random): string =>
  now.toString(36) + "-" + Math.floor(random() * 0x100000000).toString(36)

export const createCase = (patient: PatientInfo, now: number, id: string = createCaseId(now)): WorkspaceCase => ({
  version: WORKSPACE_VERSION,
  id,
  createdAt: now,
  updatedAt: now,
  patient: { ...emptyPatient(), ...patient },
  calculators: {},
})

export const caseExpiresAt = (workspaceCase: WorkspaceCase, ttlMs: number = WORKSPACE_TTL_MS): number =>
  workspaceCase.updatedAt + ttlMs

// Expired exactly at the boundary: updatedAt + TTL is no longer valid.
export const isCaseExpired = (workspaceCase: WorkspaceCase, now: number, ttlMs: number = WORKSPACE_TTL_MS): boolean =>
  now >= caseExpiresAt(workspaceCase, ttlMs)

export const touchCase = (workspaceCase: WorkspaceCase, now: number): WorkspaceCase =>
  now > workspaceCase.updatedAt ? { ...workspaceCase, updatedAt: now } : workspaceCase

export const updateCasePatient = (
  workspaceCase: WorkspaceCase,
  key: PatientBindingKey | keyof PatientInfo,
  value: string,
  now: number,
): WorkspaceCase => {
  const patient = applyPatientEdit(workspaceCase.patient, key, value)
  if (JSON.stringify(patient) === JSON.stringify(workspaceCase.patient)) return workspaceCase
  return { ...workspaceCase, patient, updatedAt: Math.max(now, workspaceCase.updatedAt) }
}

export const replaceCasePatient = (workspaceCase: WorkspaceCase, patient: PatientInfo, now: number): WorkspaceCase => {
  const next = { ...emptyPatient(), ...patient }
  if (JSON.stringify(next) === JSON.stringify(workspaceCase.patient)) return workspaceCase
  return { ...workspaceCase, patient: next, updatedAt: Math.max(now, workspaceCase.updatedAt) }
}

export const updateCaseCalculator = (
  workspaceCase: WorkspaceCase,
  calculatorId: string,
  values: Record<string, unknown>,
  now: number,
): WorkspaceCase => {
  const previous = workspaceCase.calculators[calculatorId]
  if (previous && JSON.stringify(previous) === JSON.stringify(values)) return workspaceCase
  return {
    ...workspaceCase,
    calculators: { ...workspaceCase.calculators, [calculatorId]: values },
    updatedAt: Math.max(now, workspaceCase.updatedAt),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const sanitizePatient = (value: unknown): PatientInfo | null => {
  if (!isRecord(value)) return null
  const patient = emptyPatient()
  for (const key of Object.keys(patient) as (keyof PatientInfo)[]) {
    const field = value[key]
    if (field === undefined || field === null) continue
    if (typeof field !== "string" && typeof field !== "number") return null
    ;(patient as Record<string, string>)[key] = String(field)
  }
  if (patient.sex !== "M" && patient.sex !== "F") patient.sex = ""
  return patient
}

export const parseStoredCase = (
  raw: string | null,
  now: number,
  ttlMs: number = WORKSPACE_TTL_MS,
): StoredCaseResult => {
  if (raw === null || raw === "") return { status: "none" }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { status: "invalid" }
  }
  if (!isRecord(data) || data.version !== WORKSPACE_VERSION) return { status: "invalid" }
  const { id, createdAt, updatedAt, calculators } = data
  if (typeof id !== "string" || id === "") return { status: "invalid" }
  if (typeof createdAt !== "number" || typeof updatedAt !== "number") return { status: "invalid" }
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return { status: "invalid" }
  const patient = sanitizePatient(data.patient)
  if (!patient) return { status: "invalid" }
  const workspaceCase: WorkspaceCase = {
    version: WORKSPACE_VERSION,
    id,
    createdAt,
    updatedAt,
    patient,
    calculators: isRecord(calculators)
      ? Object.fromEntries(Object.entries(calculators).filter(([, v]) => isRecord(v))) as WorkspaceCase["calculators"]
      : {},
  }
  // A clock moved backwards (updatedAt in the future) is treated as active
  // but still expires TTL after the stored updatedAt.
  if (isCaseExpired(workspaceCase, now, ttlMs)) return { status: "expired", case: workspaceCase }
  return { status: "active", case: workspaceCase }
}

export const serializeCase = (workspaceCase: WorkspaceCase): string => JSON.stringify(workspaceCase)

export const formatClock = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0")
}

export const formatElapsed = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours + ":" + minutes.toString().padStart(2, "0")
}
