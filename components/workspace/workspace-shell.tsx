"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Activity, Clock3, History, Info, PencilLine, RotateCcw, Timer, UserRound, X, Zap } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  caseExpiresAt,
  effectiveBsa,
  emptyPatient,
  formatBsa,
  formatClock,
  formatElapsed,
  isBsaManual,
  type PatientBindingKey,
  type PatientInfo,
  type WorkspaceCase,
} from "@/lib/patient-workspace"
import { PatientForm } from "./patient-form"
import { usePatientWorkspace, type WorkspaceMode } from "./workspace-provider"

const useNow = (intervalMs: number) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

const sexLabel = (sex: PatientInfo["sex"]) => (sex === "M" ? "남" : sex === "F" ? "여" : "–")

// ---------------------------------------------------------------------------
// Header mode switch

export function WorkspaceModeSwitch() {
  const ws = usePatientWorkspace()
  if (!ws) return null
  const options: { value: WorkspaceMode; label: string; short: string; icon: ReactNode }[] = [
    { value: "quick", label: "Quick Calc", short: "Quick Calc", icon: <Zap className="h-3.5 w-3.5" aria-hidden /> },
    { value: "workspace", label: "Patient Workspace", short: "Workspace", icon: <UserRound className="h-3.5 w-3.5" aria-hidden /> },
  ]
  const hasCase = ws.status === "active" || ws.status === "pending-resume"
  return (
    <div className="cpbu-ws-mode" role="radiogroup" aria-label="사용 모드" data-ready={ws.ready ? "true" : undefined}>
      <span className="cpbu-ws-mode-thumb" data-position={ws.mode === "workspace" ? "1" : "0"} aria-hidden />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={ws.mode === option.value}
          data-active={ws.mode === option.value}
          className="cpbu-ws-mode-item"
          onClick={() => ws.setMode(option.value)}
        >
          {option.icon}
          {option.short === option.label ? (
            <span>{option.label}</span>
          ) : (
            <>
              <span className="hidden sm:inline">{option.label}</span>
              <span className="sm:hidden">{option.short}</span>
            </>
          )}
          {option.value === "workspace" && hasCase ? (
            <span className="cpbu-ws-live-dot" aria-label="진행 중인 케이스 있음" />
          ) : null}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gate: intake form or resume prompt (shown in workspace mode without an active case)

export function WorkspaceGate() {
  const ws = usePatientWorkspace()
  const [confirmNew, setConfirmNew] = useState(false)
  if (!ws) return null

  if (ws.status === "pending-resume" && ws.activeCase) {
    const c = ws.activeCase
    return (
      <section className="cpbu-ws-card cpbu-ws-enter mx-auto max-w-2xl" aria-labelledby="ws-resume-title">
        <div className="mb-5 flex items-start gap-3">
          <span className="cpbu-ws-badge-icon" aria-hidden>
            <History className="h-5 w-5" />
          </span>
          <div>
            <h2 id="ws-resume-title" className="text-xl font-bold text-[var(--cpbu-ink)]">진행 중인 케이스가 있습니다</h2>
            <p className="mt-1 text-sm text-[var(--cpbu-muted)]">
              마지막 입력 {formatClock(c.updatedAt)} · 자동 삭제 예정 {formatClock(caseExpiresAt(c))}
            </p>
          </div>
        </div>
        <PatientChips patient={c.patient} wrap />
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="cpbu-ws-secondary" onClick={() => setConfirmNew(true)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> 새 환자로 시작
          </button>
          <button type="button" className="cpbu-ws-primary" onClick={ws.resumeCase} autoFocus>
            이어하기
          </button>
        </div>
        <ResetConfirm
          open={confirmNew}
          onOpenChange={setConfirmNew}
          onConfirm={() => {
            ws.resetCase()
            toast.success("이전 케이스를 삭제했습니다.")
          }}
        />
      </section>
    )
  }

  return (
    <section className="cpbu-ws-enter mx-auto max-w-3xl space-y-4" aria-labelledby="ws-intake-title">
      {ws.notice ? <Notice text={ws.notice} onClose={ws.dismissNotice} /> : null}
      <div className="cpbu-ws-card">
        <div className="mb-6 flex items-start gap-3">
          <span className="cpbu-ws-badge-icon" aria-hidden>
            <UserRound className="h-5 w-5" />
          </span>
          <div>
            <h2 id="ws-intake-title" className="text-xl font-bold text-[var(--cpbu-ink)]">새 환자 시작</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--cpbu-muted)]">
              한 번 입력하면 Hct, GDP, MICS, LBM, Echo, SCMP 계산기에 자동으로 채워집니다. 계산기에서 값을 고치면 케이스 전체에 반영됩니다.
            </p>
          </div>
        </div>
        <PatientForm
          initial={emptyPatient()}
          submitLabel="Workspace 시작"
          autoFocus
          onSubmit={(patient) => {
            ws.startCase(patient)
            toast.success("Patient Workspace를 시작했습니다.")
          }}
        />
      </div>
    </section>
  )
}

function Notice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="cpbu-ws-notice" role="status">
      <Info className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} className="cpbu-ws-icon-button" aria-label="알림 닫기">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Patient chips (summary bar and resume card)

function PatientChips({ patient, flashKey, wrap = false }: { patient: PatientInfo; flashKey?: PatientBindingKey | null; wrap?: boolean }) {
  const bsa = effectiveBsa(patient)
  const chips: { key: string; flash: PatientBindingKey[]; label: string; value: string; unit?: string; tag?: string }[] = [
    {
      key: "sex",
      flash: ["sex"],
      label: "성별·나이",
      value: sexLabel(patient.sex) + (patient.ageYears.trim() ? " · " + patient.ageYears.trim() + "세" : ""),
    },
    { key: "height", flash: ["heightCm"], label: "키", value: patient.heightCm || "–", unit: "cm" },
    { key: "weight", flash: ["weightKg"], label: "체중", value: patient.weightKg || "–", unit: "kg" },
    {
      key: "bsa",
      flash: ["bsa", "heightCm", "weightKg"],
      label: "BSA",
      value: formatBsa(bsa) || "–",
      unit: "m²",
      tag: isBsaManual(patient) ? "수동" : undefined,
    },
    { key: "hct", flash: ["preHct"], label: "Pre Hct", value: patient.preHct || "–", unit: "%" },
  ]
  return (
    <ul className={"cpbu-ws-chips" + (wrap ? " flex-wrap" : "")} aria-label="환자 정보">
      {chips.map((chip) => (
        <li
          key={chip.key + ":" + chip.value}
          className="cpbu-ws-chip"
          data-flash={flashKey && chip.flash.includes(flashKey) ? "true" : undefined}
        >
          <span className="cpbu-ws-chip-label">{chip.label}</span>
          <span className="cpbu-ws-chip-value">
            {chip.value}
            {chip.unit && chip.value !== "–" ? <span className="cpbu-ws-chip-unit">{chip.unit}</span> : null}
            {chip.tag ? <span className="cpbu-ws-chip-tag">{chip.tag}</span> : null}
          </span>
        </li>
      ))}
      {patient.procedure.trim() || patient.note.trim() ? (
        <li className="cpbu-ws-chip cpbu-ws-chip-text">
          <span className="cpbu-ws-chip-label">수술·메모</span>
          <span className="cpbu-ws-chip-value truncate">
            {[patient.procedure.trim(), patient.note.trim()].filter(Boolean).join(" · ")}
          </span>
        </li>
      ) : null}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Sticky summary bar for the active case

export function WorkspaceSummaryBar() {
  const ws = usePatientWorkspace()
  const now = useNow(15000)
  const [editing, setEditing] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  if (!ws || !ws.workspaceActive || !ws.activeCase) return null
  const c: WorkspaceCase = ws.activeCase
  const recentEdit = ws.lastPatientEdit && now - ws.lastPatientEdit.at < 4000 ? ws.lastPatientEdit.key : null

  return (
    <div className="cpbu-ws-bar" role="region" aria-label="현재 환자 요약">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="cpbu-ws-pulse" aria-hidden>
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <PatientChips patient={c.patient} flashKey={recentEdit} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <div className="flex items-center gap-3 text-xs text-[var(--cpbu-muted)]">
            <span className="hidden items-center gap-1.5 xl:inline-flex" title="이 표시가 있는 입력칸은 환자값과 연동됩니다">
              <span className="cpbu-ws-legend" aria-hidden /> 환자값 연동
            </span>
            <span className="inline-flex items-center gap-1" title={"시작 " + formatClock(c.createdAt)}>
              <Timer className="h-3.5 w-3.5" aria-hidden />
              경과 <b className="tabular-nums text-[var(--cpbu-ink)]">{formatElapsed(now - c.createdAt)}</b>
            </span>
            <span className="inline-flex items-center gap-1" title="마지막 사용 후 12시간이 지나면 자동 삭제">
              <Clock3 className="h-3.5 w-3.5" aria-hidden />
              자동 삭제 <b className="tabular-nums text-[var(--cpbu-ink)]">{formatClock(caseExpiresAt(c))}</b>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" className="cpbu-ws-ghost" onClick={() => setEditing(true)}>
              <PencilLine className="h-3.5 w-3.5" aria-hidden /> 수정
            </button>
            <button type="button" className="cpbu-ws-ghost cpbu-ws-ghost-danger" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> 새 환자
            </button>
          </div>
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>환자 정보 수정</DialogTitle>
            <DialogDescription>수정한 값은 연결된 모든 계산기에 바로 반영됩니다.</DialogDescription>
          </DialogHeader>
          <PatientForm
            initial={c.patient}
            submitLabel="저장"
            onSubmit={(patient) => {
              ws.replacePatient(patient)
              setEditing(false)
              toast.success("환자 정보를 수정했습니다.")
            }}
            secondaryAction={
              <button type="button" className="cpbu-ws-secondary" onClick={() => setEditing(false)}>
                취소
              </button>
            }
          />
        </DialogContent>
      </Dialog>

      <ResetConfirm
        open={confirmReset}
        onOpenChange={setConfirmReset}
        onConfirm={() => {
          ws.resetCase()
          toast.success("케이스를 초기화했습니다. 다음 환자 정보를 입력하세요.")
        }}
      />
    </div>
  )
}

function ResetConfirm({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>새 환자로 시작할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            현재 케이스의 환자 정보, 계산기 입력값, 이식 시간 기록이 모두 삭제되며 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction className="bg-[#b4483f] text-white hover:bg-[#9c3c34]" onClick={onConfirm}>
            삭제하고 새로 시작
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
