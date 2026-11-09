"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  WORKSPACE_STORAGE_KEY,
  WORKSPACE_UI_STORAGE_KEY,
  createCase,
  isCaseExpired,
  parseStoredCase,
  readPatientBinding,
  replaceCasePatient,
  samePatientValue,
  serializeCase,
  touchCase,
  updateCaseCalculator,
  updateCasePatient,
  type PatientBindingKey,
  type PatientInfo,
  type WorkspaceCase,
} from "@/lib/patient-workspace"

export type WorkspaceMode = "quick" | "workspace"
type CaseStatus = "loading" | "none" | "pending-resume" | "active"

type WorkspaceContextValue = {
  ready: boolean
  mode: WorkspaceMode
  setMode: (mode: WorkspaceMode) => void
  status: CaseStatus
  activeCase: WorkspaceCase | null
  // True only in Patient Workspace mode with a confirmed, active case.
  workspaceActive: boolean
  // Changes whenever calculators must remount with fresh state.
  scopeKey: string
  notice: string | null
  dismissNotice: () => void
  startCase: (patient: PatientInfo) => void
  resumeCase: () => void
  resetCase: () => void
  replacePatient: (patient: PatientInfo) => void
  updatePatient: (key: PatientBindingKey, value: string) => void
  updateCalculator: (calculatorId: string, values: Record<string, unknown>) => void
  // Last patient field changed from a calculator, for summary-bar feedback.
  lastPatientEdit: { key: PatientBindingKey; at: number } | null
  uiPrefs: Record<string, unknown>
  setUiPref: (key: string, value: unknown) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

const ACTIVITY_TOUCH_INTERVAL_MS = 60 * 1000
const EXPIRY_CHECK_INTERVAL_MS = 30 * 1000
const EXPIRED_NOTICE = "12시간 동안 입력이 없어 이전 케이스를 자동 삭제했습니다."

const safeGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
const safeSet = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage may be full or disabled; the workspace keeps working in memory.
  }
}
const safeRemove = (key: string) => {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

const readUiPrefs = (): Record<string, unknown> => {
  const raw = safeGet(WORKSPACE_UI_STORAGE_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function PatientWorkspaceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [mode, setModeState] = useState<WorkspaceMode>("quick")
  const [status, setStatus] = useState<CaseStatus>("loading")
  const [activeCase, setActiveCase] = useState<WorkspaceCase | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastPatientEdit, setLastPatientEdit] = useState<WorkspaceContextValue["lastPatientEdit"]>(null)
  const [uiPrefs, setUiPrefs] = useState<Record<string, unknown>>({})
  const caseRef = useRef<WorkspaceCase | null>(null)
  caseRef.current = activeCase

  // Initial load: expiry is evaluated before anything can resume or touch the case.
  useEffect(() => {
    const prefs = readUiPrefs()
    setUiPrefs(prefs)
    setModeState(prefs.mode === "workspace" ? "workspace" : "quick")
    const stored = parseStoredCase(safeGet(WORKSPACE_STORAGE_KEY), Date.now())
    if (stored.status === "active") {
      setActiveCase(stored.case)
      setStatus("pending-resume")
    } else {
      if (stored.status === "expired") setNotice(EXPIRED_NOTICE)
      if (stored.status !== "none") safeRemove(WORKSPACE_STORAGE_KEY)
      setStatus("none")
    }
    setReady(true)
  }, [])

  // Persist every change of a confirmed case.
  useEffect(() => {
    if (status === "active" && activeCase) safeSet(WORKSPACE_STORAGE_KEY, serializeCase(activeCase))
  }, [status, activeCase])

  useEffect(() => {
    if (ready) safeSet(WORKSPACE_UI_STORAGE_KEY, JSON.stringify(uiPrefs))
  }, [ready, uiPrefs])

  const expireNow = useCallback(() => {
    safeRemove(WORKSPACE_STORAGE_KEY)
    setActiveCase(null)
    setStatus("none")
    setNotice(EXPIRED_NOTICE)
  }, [])

  // A tab left open is also cleaned up once the 12-hour window passes.
  useEffect(() => {
    if (status !== "active" && status !== "pending-resume") return
    const timer = window.setInterval(() => {
      const current = caseRef.current
      if (current && isCaseExpired(current, Date.now())) expireNow()
    }, EXPIRY_CHECK_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [status, expireNow])

  // Using the workspace (pointer or keyboard) keeps the case alive even without new values.
  useEffect(() => {
    if (mode !== "workspace" || status !== "active") return
    const onActivity = () => {
      const current = caseRef.current
      const now = Date.now()
      if (!current || now - current.updatedAt < ACTIVITY_TOUCH_INTERVAL_MS) return
      if (isCaseExpired(current, now)) return expireNow()
      setActiveCase((prev) => (prev ? touchCase(prev, now) : prev))
    }
    window.addEventListener("pointerdown", onActivity, { passive: true })
    window.addEventListener("keydown", onActivity)
    return () => {
      window.removeEventListener("pointerdown", onActivity)
      window.removeEventListener("keydown", onActivity)
    }
  }, [mode, status, expireNow])

  // Keep two tabs on the same laptop consistent.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WORKSPACE_STORAGE_KEY) return
      const stored = parseStoredCase(event.newValue, Date.now())
      if (stored.status === "active") {
        setActiveCase(stored.case)
        setStatus((prev) => (prev === "active" ? "active" : "pending-resume"))
      } else {
        setActiveCase(null)
        setStatus("none")
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setUiPref = useCallback((key: string, value: unknown) => {
    setUiPrefs((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }))
  }, [])

  const setMode = useCallback(
    (next: WorkspaceMode) => {
      setModeState(next)
      setUiPref("mode", next)
    },
    [setUiPref],
  )

  const startCase = useCallback((patient: PatientInfo) => {
    const created = createCase(patient, Date.now())
    safeSet(WORKSPACE_STORAGE_KEY, serializeCase(created))
    setActiveCase(created)
    setStatus("active")
    setNotice(null)
    setLastPatientEdit(null)
  }, [])

  const resumeCase = useCallback(() => {
    const current = caseRef.current
    if (!current) return
    if (isCaseExpired(current, Date.now())) return expireNow()
    setStatus("active")
    setNotice(null)
  }, [expireNow])

  const resetCase = useCallback(() => {
    safeRemove(WORKSPACE_STORAGE_KEY)
    setActiveCase(null)
    setStatus("none")
    setNotice(null)
    setLastPatientEdit(null)
  }, [])

  const replacePatient = useCallback((patient: PatientInfo) => {
    setActiveCase((prev) => (prev ? replaceCasePatient(prev, patient, Date.now()) : prev))
  }, [])

  const updatePatient = useCallback((key: PatientBindingKey, value: string) => {
    setActiveCase((prev) => (prev ? updateCasePatient(prev, key, value, Date.now()) : prev))
    setLastPatientEdit({ key, at: Date.now() })
  }, [])

  const updateCalculator = useCallback((calculatorId: string, values: Record<string, unknown>) => {
    setActiveCase((prev) => (prev ? updateCaseCalculator(prev, calculatorId, values, Date.now()) : prev))
  }, [])

  const workspaceActive = ready && mode === "workspace" && status === "active" && activeCase !== null
  const scopeKey = workspaceActive && activeCase ? "case:" + activeCase.id : mode === "workspace" ? "workspace-gate" : "quick"

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      mode,
      setMode,
      status,
      activeCase,
      workspaceActive,
      scopeKey,
      notice,
      dismissNotice: () => setNotice(null),
      startCase,
      resumeCase,
      resetCase,
      replacePatient,
      updatePatient,
      updateCalculator,
      lastPatientEdit,
      uiPrefs,
      setUiPref,
    }),
    [ready, mode, setMode, status, activeCase, workspaceActive, scopeKey, notice, startCase, resumeCase, resetCase, replacePatient, updatePatient, updateCalculator, lastPatientEdit, uiPrefs, setUiPref],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function usePatientWorkspace(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext)
}

export function useWorkspaceActive(): boolean {
  return useContext(WorkspaceContext)?.workspaceActive ?? false
}

// ---------------------------------------------------------------------------
// Calculator binding
//
// Calculators keep their own useState. This hook mirrors selected state into
// the active case (and back) only while Patient Workspace is active; in quick
// mode it does nothing, so the quick calculators behave exactly as before.
//
// - Bindings with `patient` are shared patient values. Hydrated from the case,
//   edits in the calculator update the case, and edits elsewhere (summary bar,
//   other calculators) update the calculator.
// - Other bindings are calculator-only values saved under calculatorId.

export type WorkspaceBinding = {
  value: unknown
  set: (value: any) => void
  patient?: PatientBindingKey
  // false: follow the case value but never write back (for controls that clamp
  // values to their own range, so a clamp can't silently change the patient).
  writePatient?: boolean
}

const toPatientString = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  return String(value)
}

const fromPatientString = (raw: string, current: unknown): unknown => {
  if (typeof current === "number") {
    const trimmed = raw.trim()
    if (trimmed === "") return undefined
    const parsed = Number(trimmed.replace(",", "."))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return raw
}

export function useWorkspaceSync(calculatorId: string, bindings: Record<string, WorkspaceBinding>) {
  const ctx = useContext(WorkspaceContext)
  const activeCase = ctx?.workspaceActive ? ctx.activeCase : null
  const scope = activeCase ? activeCase.id : null
  const [hydratedScope, setHydratedScope] = useState<string | null>(null)
  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings
  const caseRef = useRef(activeCase)
  caseRef.current = activeCase
  const previousRef = useRef<{ local: Record<string, string>; patient: Record<string, string>; snapshot: string } | null>(null)

  // Hydrate once per case. Calculator-only values first, then patient values,
  // so a patient value always wins over an older saved copy.
  useEffect(() => {
    if (!scope) {
      previousRef.current = null
      setHydratedScope(null)
      return
    }
    if (hydratedScope === scope) return
    const current = caseRef.current
    if (!current) return
    const saved = current.calculators[calculatorId] ?? {}
    const entries = Object.entries(bindingsRef.current)
    for (const [name, binding] of entries) {
      if (!binding.patient && Object.prototype.hasOwnProperty.call(saved, name)) binding.set(saved[name])
    }
    for (const [, binding] of entries) {
      if (!binding.patient) continue
      const raw = readPatientBinding(current.patient, binding.patient)
      if (raw.trim() === "") continue
      const next = fromPatientString(raw, binding.value)
      if (next !== undefined) binding.set(next)
    }
    previousRef.current = null
    setHydratedScope(scope)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, calculatorId])

  const ready = scope !== null && hydratedScope === scope

  // Runs after every render while ready and reconciles the calculator with the case.
  useEffect(() => {
    if (!ready || !ctx || !activeCase) return
    const local: Record<string, string> = {}
    const patient: Record<string, string> = {}
    const calculatorValues: Record<string, unknown> = {}
    for (const [name, binding] of Object.entries(bindings)) {
      if (binding.patient) {
        local[name] = toPatientString(binding.value)
        patient[name] = readPatientBinding(activeCase.patient, binding.patient)
      } else {
        calculatorValues[name] = binding.value
      }
    }
    const snapshot = JSON.stringify(calculatorValues)
    const previous = previousRef.current

    if (previous) {
      for (const [name, binding] of Object.entries(bindings)) {
        if (!binding.patient) continue
        const localChanged = local[name] !== previous.local[name]
        const patientChanged = patient[name] !== previous.patient[name]
        if (localChanged && binding.writePatient !== false && local[name].trim() !== "" && !samePatientValue(local[name], patient[name])) {
          // Edited in this calculator: becomes the case value. Clearing a field
          // in a calculator never clears the shared patient value.
          ctx.updatePatient(binding.patient, local[name])
        } else if (patientChanged && !samePatientValue(local[name], patient[name])) {
          // Edited elsewhere: follow the case.
          const next = fromPatientString(patient[name], binding.value)
          if (next !== undefined) binding.set(next)
        }
      }
    }
    if (!previous || snapshot !== previous.snapshot) {
      ctx.updateCalculator(calculatorId, JSON.parse(snapshot))
    }
    previousRef.current = { local, patient, snapshot }
  })

  // Lets a calculator's own Reset button refill shared patient values.
  const refillPatient = useCallback(() => {
    const current = caseRef.current
    if (!current) return
    for (const binding of Object.values(bindingsRef.current)) {
      if (!binding.patient) continue
      const raw = readPatientBinding(current.patient, binding.patient)
      if (raw.trim() === "") continue
      const next = fromPatientString(raw, binding.value)
      if (next !== undefined) binding.set(next)
    }
  }, [])

  return { ready, refillPatient }
}
