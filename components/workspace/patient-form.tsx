"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { ArrowRight, Calculator, PencilLine, ShieldCheck } from "lucide-react"
import {
  computedBsa,
  effectiveBsa,
  formatBsa,
  isBsaManual,
  validatePatient,
  type PatientInfo,
} from "@/lib/patient-workspace"
import { AnimatedNumber } from "./animated-number"

type PatientFormProps = {
  initial: PatientInfo
  submitLabel: string
  onSubmit: (patient: PatientInfo) => void
  secondaryAction?: ReactNode
  autoFocus?: boolean
}

type NumericField = "heightCm" | "weightKg" | "preHct" | "ageYears"

const NUMERIC_FIELDS: { key: NumericField; label: string; unit: string; required: boolean; placeholder: string }[] = [
  { key: "heightCm", label: "키", unit: "cm", required: true, placeholder: "170" },
  { key: "weightKg", label: "체중", unit: "kg", required: true, placeholder: "68" },
  { key: "preHct", label: "Pre Hct", unit: "%", required: true, placeholder: "38" },
  { key: "ageYears", label: "나이", unit: "세", required: false, placeholder: "선택" },
]

export function PatientForm({ initial, submitLabel, onSubmit, secondaryAction, autoFocus = false }: PatientFormProps) {
  const formId = useId()
  const [patient, setPatient] = useState<PatientInfo>(initial)
  const [touched, setTouched] = useState<Partial<Record<keyof PatientInfo, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [manualBsa, setManualBsa] = useState(isBsaManual(initial))
  const firstFieldRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (autoFocus) firstFieldRef.current?.focus()
  }, [autoFocus])

  const validation = useMemo(() => validatePatient(manualBsa ? patient : { ...patient, bsaOverride: "" }), [patient, manualBsa])
  const autoBsa = computedBsa(patient)
  const shownBsa = manualBsa ? effectiveBsa(patient) : autoBsa

  const set = (key: keyof PatientInfo, value: string) => setPatient((prev) => ({ ...prev, [key]: value }))
  const showError = (key: keyof PatientInfo) => (submitted || touched[key]) && validation.errors[key]

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!validation.valid) return
    onSubmit({
      ...patient,
      procedure: patient.procedure.trim(),
      note: patient.note.trim(),
      bsaOverride: manualBsa ? patient.bsaOverride.trim() : "",
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-describedby={formId + "-privacy"}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-[var(--cpbu-ink)]">
          성별 <span className="text-[var(--cpbu-brand)]">*</span>
        </legend>
        <div className="cpbu-ws-segment" role="radiogroup" aria-label="성별">
          {([
            ["M", "남"],
            ["F", "여"],
          ] as const).map(([value, label], index) => (
            <button
              key={value}
              ref={index === 0 ? firstFieldRef : undefined}
              type="button"
              role="radio"
              aria-checked={patient.sex === value}
              data-active={patient.sex === value}
              className="cpbu-ws-segment-item"
              onClick={() => set("sex", value)}
            >
              {label}
            </button>
          ))}
          <span className="cpbu-ws-segment-thumb" data-position={patient.sex === "F" ? "1" : patient.sex === "M" ? "0" : "none"} aria-hidden />
        </div>
        {showError("sex") ? <p className="cpbu-ws-error">{validation.errors.sex}</p> : null}
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUMERIC_FIELDS.map((field) => {
          const error = showError(field.key)
          const warning = !error && patient[field.key].trim() !== "" ? validation.warnings[field.key] : undefined
          const inputId = formId + "-" + field.key
          return (
            <div key={field.key} className="min-w-0">
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-[var(--cpbu-ink)]">
                {field.label} {field.required ? <span className="text-[var(--cpbu-brand)]">*</span> : null}
              </label>
              <div className="cpbu-ws-input-wrap" data-invalid={error ? "true" : undefined} data-warn={warning ? "true" : undefined}>
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={field.placeholder}
                  value={patient[field.key]}
                  onChange={(event) => set(field.key, event.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, [field.key]: true }))}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error || warning ? inputId + "-msg" : undefined}
                  className="cpbu-ws-input"
                />
                <span className="cpbu-ws-unit">{field.unit}</span>
              </div>
              {error ? (
                <p id={inputId + "-msg"} className="cpbu-ws-error">{error}</p>
              ) : warning ? (
                <p id={inputId + "-msg"} className="cpbu-ws-warning">{warning}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="cpbu-ws-bsa" data-manual={manualBsa ? "true" : undefined}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="cpbu-ws-bsa-icon" aria-hidden>
            <Calculator className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--cpbu-muted)]">
              BSA {manualBsa ? "· 직접 입력" : "· Mosteller"}
            </p>
            <p className="text-2xl font-bold tabular-nums text-[var(--cpbu-brand-deep)]">
              {shownBsa === null ? <span className="text-[#9db3b1]">–</span> : <AnimatedNumber value={shownBsa} decimals={2} />}
              <span className="ml-1 text-sm font-semibold text-[var(--cpbu-muted)]">m²</span>
            </p>
          </div>
        </div>
        {manualBsa ? (
          <div className="flex items-end gap-2">
            <div className="cpbu-ws-input-wrap w-28" data-invalid={showError("bsaOverride") ? "true" : undefined}>
              <input
                aria-label="BSA 직접 입력"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={formatBsa(autoBsa) || "1.80"}
                value={patient.bsaOverride}
                onChange={(event) => set("bsaOverride", event.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, bsaOverride: true }))}
                className="cpbu-ws-input"
              />
              <span className="cpbu-ws-unit">m²</span>
            </div>
            <button
              type="button"
              className="cpbu-ws-link"
              onClick={() => {
                setManualBsa(false)
                set("bsaOverride", "")
              }}
            >
              자동 계산
            </button>
          </div>
        ) : (
          <button type="button" className="cpbu-ws-link" onClick={() => setManualBsa(true)}>
            <PencilLine className="h-3.5 w-3.5" aria-hidden /> 직접 입력
          </button>
        )}
      </div>
      {manualBsa && showError("bsaOverride") ? <p className="cpbu-ws-error -mt-3">{validation.errors.bsaOverride}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={formId + "-procedure"} className="mb-1.5 block text-sm font-semibold text-[var(--cpbu-ink)]">
            수술명 <span className="font-normal text-[var(--cpbu-muted)]">(선택)</span>
          </label>
          <input
            id={formId + "-procedure"}
            type="text"
            autoComplete="off"
            maxLength={60}
            placeholder="예: CABG, AVR, Lung Tx"
            value={patient.procedure}
            onChange={(event) => set("procedure", event.target.value)}
            className="cpbu-ws-input cpbu-ws-input-plain"
          />
        </div>
        <div>
          <label htmlFor={formId + "-note"} className="mb-1.5 block text-sm font-semibold text-[var(--cpbu-ink)]">
            메모 <span className="font-normal text-[var(--cpbu-muted)]">(선택)</span>
          </label>
          <input
            id={formId + "-note"}
            type="text"
            autoComplete="off"
            maxLength={40}
            placeholder="예: 3번방"
            value={patient.note}
            onChange={(event) => set("note", event.target.value)}
            className="cpbu-ws-input cpbu-ws-input-plain"
          />
        </div>
      </div>

      <p id={formId + "-privacy"} className="flex items-start gap-2 text-xs leading-5 text-[var(--cpbu-muted)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cpbu-brand)]" aria-hidden />
        이름·등록번호는 입력하지 마세요. 값은 이 기기 브라우저에만 저장되며, 마지막 사용 후 12시간이 지나면 자동 삭제됩니다.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {secondaryAction}
        <button type="submit" className="cpbu-ws-primary group">
          {submitLabel}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </button>
      </div>
    </form>
  )
}
