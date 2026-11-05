"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { solveMicsMaximum, solveMicsTarget, type MicsFlowResult } from "@/lib/mics-hydraulics"

const fvSizes = [19, 21, 23, 25, 27, 29]
const ijvSizes = [15, 17, 19]
const tubeOptions = [{ value: 0.375, label: '3/8"' }, { value: 0.5, label: '1/2"' }]
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const fmt = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits)

type NumericControlProps = {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit: string
  slider?: boolean
}

function NumericControl({ label, value, onChange, min, max, step = 1, unit, slider = false }: NumericControlProps) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  function commit() {
    const parsed = Number(draft)
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const next = clamp(parsed, min, max)
    onChange(next)
    setDraft(String(next))
  }

  return <label className="block">
    <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
    <span className="flex items-center gap-3">
      {slider ? <input
        aria-label={label + " 슬라이더"}
        type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-teal-600"
      /> : null}
      <span className={"flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100 " + (slider ? "w-36" : "w-full")}>
        <input
          aria-label={label}
          type="number" inputMode="decimal" min={min} max={max} step={step} value={draft}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") { setDraft(String(value)); event.currentTarget.blur() }
          }}
          className="min-w-0 w-full bg-transparent text-right font-semibold text-slate-900 outline-none"
        />
        <span className="shrink-0 text-xs text-slate-500">{unit}</span>
      </span>
    </span>
  </label>
}

function FlowSplit({ title, flow, snaring }: { title: string; flow: MicsFlowResult | null; snaring: boolean }) {
  if (!flow) return <div className="rounded-lg border border-dashed border-slate-200 p-3">
    <p className="text-sm font-semibold text-slate-700">{title}</p>
    <p className="mt-1 text-xs text-slate-500">제조사 곡선 범위 밖으로 분배를 계산할 수 없습니다.</p>
  </div>

  const fvPercent = flow.totalFlow > 0 ? flow.fvFlow / flow.totalFlow * 100 : 0
  const ijvPercent = flow.totalFlow > 0 ? flow.svcFlow / flow.totalFlow * 100 : 0
  return <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">{fmt(flow.totalFlow)} L/min</p>
    </div>
    <div
      className="flex h-3 overflow-hidden rounded-full bg-slate-100"
      role="img"
      aria-label={"상부 IJV " + fmt(flow.svcFlow) + " L/min " + fmt(ijvPercent, 0) + "%, 하부 FV " + fmt(flow.fvFlow) + " L/min " + fmt(fvPercent, 0) + "%"}
    >
      <div className="bg-sky-400" style={{ width: ijvPercent + "%" }} />
      <div className="bg-teal-600" style={{ width: fvPercent + "%" }} />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
      <div><span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> <span className="font-medium text-slate-600">상부 · IJV</span><p className="mt-1 font-bold tabular-nums text-slate-900">{fmt(flow.svcFlow)} L/min <span className="font-medium text-slate-500">({fmt(ijvPercent, 0)}%)</span></p></div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-teal-600" /> <span className="font-medium text-slate-600">하부 · FV</span><p className="mt-1 font-bold tabular-nums text-slate-900">{fmt(flow.fvFlow)} L/min <span className="font-medium text-slate-500">({fmt(fvPercent, 0)}%)</span></p></div>
    </div>
    {snaring ? <p className="mt-3 text-xs text-amber-700">Snaring: 지정한 정맥 환류 비율 가정으로 분배 (동일 ΔP 분배가 아님)</p> : null}
  </div>
}

export default function MicsDrainageCalculator() {
  const [fv, setFv] = useState(25)
  const [ijv, setIjv] = useState(0)
  const [selectedIjv, setSelectedIjv] = useState(17)
  const [tube, setTube] = useState(0.375)
  const [targetFlow, setTargetFlow] = useState(5)
  const [vavdLimit, setVavdLimit] = useState(60)
  const [heightCm, setHeightCm] = useState(30)
  const [fvLengthCm, setFvLengthCm] = useState(200)
  const [ijvLengthCm, setIjvLengthCm] = useState(120)
  const [snaring, setSnaring] = useState(false)
  const [ijvPercent, setIjvPercent] = useState(35)

  // Preserve the existing optional 200-cm tubing prime / Hct comparison.
  const [weight, setWeight] = useState(70)
  const [preHct, setPreHct] = useState(35)
  const [ebvPerKg, setEbvPerKg] = useState(55)
  const [otherPrime, setOtherPrime] = useState(1200)

  const dual = ijv !== 0
  const isSnaring = dual && snaring
  // Target changes frequently while dragging; max flow depends only on the
  // hydraulic configuration and VAVD limit, not on targetFlow.
  const targetResult = useMemo(() => solveMicsTarget({
    fv, ijv, tube, targetFlow, vavdLimit, heightCm, fvLengthCm, ijvLengthCm,
    snaring: isSnaring, ijvPercent,
  }), [fv, ijv, tube, targetFlow, vavdLimit, heightCm, fvLengthCm, ijvLengthCm, isSnaring, ijvPercent])
  const maximumResult = useMemo(() => solveMicsMaximum({
    fv, ijv, tube, targetFlow: 0, vavdLimit, heightCm, fvLengthCm, ijvLengthCm,
    snaring: isSnaring, ijvPercent,
  }), [fv, ijv, tube, vavdLimit, heightCm, fvLengthCm, ijvLengthCm, isSnaring, ijvPercent])
  const calculated = targetResult && maximumResult ? { ...targetResult, ...maximumResult } : null

  const required = calculated?.requiredVavd ?? null
  const ratio = required === null ? null : vavdLimit === 0 ? (required === 0 ? 0 : Infinity) : required / vavdLimit
  const level = ratio === null ? "unknown" : ratio < 0.9 ? "low" : ratio <= 1 ? "near" : "high"
  const isExceeded = level === "high"
  const difference = calculated ? Math.max(0, targetFlow - calculated.maxFlow) : 0

  const hctRows = tubeOptions.map((option) => {
    const fvPrime = option.value === 0.375 ? 142.5 : 253.4
    const totalPrime = otherPrime + (dual ? 85.5 : 0) + fvPrime
    const ebv = weight * ebvPerKg
    return { ...option, fvPrime, totalPrime, postHct: preHct * ebv / (ebv + totalPrime) }
  })

  return <div className="mx-auto max-w-3xl space-y-4 pb-4">
    <header className="pb-1">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">MICS venous drainage simulator</h2>
      <p className="mt-1 text-sm text-slate-500">목표 유량에 필요한 VAVD와 설정 제한에서 가능한 유량을 빠르게 확인합니다.</p>
    </header>

    <section aria-label="배액 조건 입력" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 text-sm font-bold text-slate-900">배액 조건</h3>
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Drainage 전략</p>
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Drainage 전략">
            <button type="button" aria-pressed={!dual} onClick={() => { setIjv(0); setSnaring(false) }}
              className={"rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors " + (!dual ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900")}>FV 단독</button>
            <button type="button" aria-pressed={dual} onClick={() => setIjv(selectedIjv)}
              className={"rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors " + (dual ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:text-slate-900")}>IJV + FV</button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {dual ? <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">상부 · IJV cannula</span>
            <select value={ijv} onChange={(event) => { setIjv(Number(event.target.value)); setSelectedIjv(Number(event.target.value)) }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100">
              {ijvSizes.map((size) => <option key={size} value={size}>{size} Fr</option>)}
            </select>
          </label> : null}
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">{dual ? "하부 · FV cannula" : "FV cannula"}</span>
            <select value={fv} onChange={(event) => setFv(Number(event.target.value))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100">
              {fvSizes.map((size) => <option key={size} value={size}>{size} Fr</option>)}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          {dual ? <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <span className="font-medium text-slate-700">상부 · IJV tubing</span>
            <span className="font-semibold text-slate-900">3/8″ <span className="text-xs font-normal text-slate-500">고정</span></span>
          </div> : null}
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">{dual ? "하부 · FV tubing" : "FV tubing"}</p>
            <div className="grid grid-cols-2 gap-2">
              {tubeOptions.map((option) => <button type="button" key={option.value} aria-pressed={tube === option.value} onClick={() => setTube(option.value)}
                className={"rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors " + (tube === option.value ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300")}>{option.label}</button>)}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 sm:p-4">
          <NumericControl label="목표 total flow" value={targetFlow} onChange={setTargetFlow} min={0} max={8} step={0.1} unit="L/min" slider />
        </div>

        <details className="group rounded-xl border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-700 marker:hidden">
            <span>고급 설정 <span className="ml-1 font-normal text-slate-400">· VAVD limit, 낙차, tubing 길이, snaring</span></span>
            <ChevronDown size={16} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
            <NumericControl label="VAVD limit" value={vavdLimit} onChange={setVavdLimit} min={0} max={120} unit="mmHg" />
            <NumericControl label="낙차 보조" value={heightCm} onChange={setHeightCm} min={0} max={150} unit="cm" />
            {dual ? <NumericControl label="상부 · IJV tubing 길이" value={ijvLengthCm} onChange={setIjvLengthCm} min={10} max={500} unit="cm" /> : null}
            <NumericControl label={dual ? "하부 · FV tubing 길이" : "FV tubing 길이"} value={fvLengthCm} onChange={setFvLengthCm} min={10} max={500} unit="cm" />
            {dual ? <div className="sm:col-span-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={snaring} onChange={(event) => setSnaring(event.target.checked)} className="h-4 w-4 accent-teal-600" />
                Snaring 적용 (환류 비율 가정)
              </label>
              {isSnaring ? <div className="mt-3 rounded-lg bg-amber-50 p-3">
                <NumericControl label="가정 IJV 경로 환류 비율" value={ijvPercent} onChange={setIjvPercent} min={25} max={45} step={5} unit="%" slider />
                <p className="mt-2 text-xs text-amber-900">Snaring 시 실제 상·하부 정맥 환류를 가정하는 기존 모델을 사용하며, 동일 ΔP 분배를 사용하지 않습니다.</p>
              </div> : null}
            </div> : null}
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2">낙차 보조 압력 = 낙차 × 0.7356 mmHg/cm (CVP 기여 0 mmHg 가정). IJV branch는 3/8″ tubing을 사용합니다.</p>
          </div>
        </details>
      </div>
    </section>

    <section aria-label="필요 VAVD" className={"rounded-2xl border bg-white p-4 shadow-sm sm:p-6 " + (level === "high" ? "border-rose-200" : level === "near" ? "border-amber-200" : "border-slate-200")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-900">A · 필요 VAVD</h3>
        <span className="text-xs text-slate-500">목표 {fmt(targetFlow)} L/min</span>
      </div>
      {required !== null ? <>
        <p className={"mt-3 text-4xl font-bold tracking-tight tabular-nums " + (level === "high" ? "text-rose-700" : level === "near" ? "text-amber-700" : "text-emerald-700")}>
          {fmt(required)} <span className="text-lg font-medium">mmHg</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">필요 ΔP {fmt(calculated?.target?.pressure)} − 낙차 보조 {fmt(calculated?.head)} mmHg (최소 0)</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={"h-full rounded-full " + (level === "high" ? "bg-rose-500" : level === "near" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: Math.min(100, (ratio ?? 0) * 100) + "%" }} />
        </div>
        {isExceeded ? <p className="mt-3 font-bold text-rose-700">−{fmt(vavdLimit, 0)} 초과 ({fmt(required - vavdLimit)} mmHg 오버)</p> :
          <p className={"mt-3 text-sm font-semibold " + (level === "near" ? "text-amber-700" : "text-emerald-700")}>{level === "near" ? "VAVD limit 90~100% 근접" : "VAVD limit 90% 미만"}</p>}
        <p className="mt-1 text-xs text-slate-500">설정 VAVD limit −{fmt(vavdLimit, 0)} mmHg</p>
      </> : <div className="mt-3 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-600">
        목표 유량이 제조사 cannula 곡선 범위를 벗어나 필요 VAVD를 계산할 수 없습니다. 외삽하지 않습니다.
      </div>}
    </section>

    <section aria-label="VAVD 제한에서 최대 유량" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-slate-900">B · 최대 total flow</h3>
        <span className="text-xs text-slate-500">VAVD limit −{fmt(vavdLimit, 0)} mmHg</span>
      </div>
      <p className="mt-3 text-4xl font-bold tracking-tight tabular-nums text-teal-800">
        {fmt(calculated?.maxFlow)} <span className="text-lg font-medium">L/min</span>
      </p>
      {difference > 1e-6 ? <p className="mt-3 font-bold text-rose-700">목표보다 {fmt(difference, difference < 0.05 ? 2 : 1)} L/min 부족</p> :
        <p className="mt-3 text-sm font-semibold text-emerald-700">설정 제한 내에서 목표 유량 도달 가능</p>}
      {calculated?.curveLimited ? <p className="mt-2 text-xs text-amber-700">제조사 곡선 끝점에 도달한 추정 상한입니다. 생리학적 최대 flow를 의미하지 않습니다.</p> :
        <p className="mt-2 text-xs text-slate-500">0~8 L/min 이분 탐색 · 원자료 곡선 범위만 계산</p>}
    </section>

    {dual ? <section aria-label="IJV FV 유량 분배" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-6">
      <div>
        <h3 className="font-bold text-slate-900">상·하부 drainage 분배</h3>
        <p className="mt-1 text-xs text-slate-500">{isSnaring ? "Snaring · 설정한 환류 비율 가정" : "IJV·FV 경로의 ΔP가 같아지는 수력학적 분배"}</p>
      </div>
      <FlowSplit title="목표 flow에서" flow={calculated?.target ?? null} snaring={isSnaring} />
      <FlowSplit title="최대 flow에서" flow={calculated?.maxResult ?? null} snaring={isSnaring} />
    </section> : null}

    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 text-sm font-semibold text-slate-700">
        참고 · FV tubing prime / 예상 Hct
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-4">
        <p className="text-xs text-slate-500">기존 비교 기능을 유지했습니다. 아래 값은 고급 설정의 길이와 별개로 FV 200 cm · IJV 120 cm 기준입니다.</p>
        <div className="grid grid-cols-2 gap-3">
          <NumericControl label="환자 체중" value={weight} onChange={setWeight} min={30} max={150} unit="kg" />
          <NumericControl label="수술 전 Hct" value={preHct} onChange={setPreHct} min={15} max={55} step={0.1} unit="%" />
          <NumericControl label="혈액량 계수" value={ebvPerKg} onChange={setEbvPerKg} min={50} max={90} unit="mL/kg" />
          <NumericControl label="기타 회로 prime" value={otherPrime} onChange={setOtherPrime} min={0} max={2500} step={10} unit="mL" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {hctRows.map((row) => <div key={row.value} className={"rounded-lg border p-3 " + (row.value === tube ? "border-teal-300 bg-teal-50" : "border-slate-200")}>
            <p className="text-xs font-medium text-slate-600">FV {row.label} · 200 cm</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{fmt(row.postHct)}%</p>
            <p className="mt-1 text-xs text-slate-500">FV prime {fmt(row.fvPrime)} mL · total {fmt(row.totalPrime)} mL</p>
          </div>)}
        </div>
        <p className="text-xs text-slate-500">예상 Hct = 수술 전 Hct × (체중 × 혈액량 계수) / (체중 × 혈액량 계수 + total prime)</p>
      </div>
    </details>

    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 text-sm font-semibold text-slate-700">
        계산 가정 및 참고 자료
        <ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-4 text-xs leading-5 text-slate-600">
        <p>필요 VAVD = max(0, cannula + tubing 경로 ΔP − 낙차 보조). IJV+FV, non-snaring에서는 두 branch의 ΔP가 동일한 지점에서 분배합니다.</p>
        <p>Snaring에서는 선택한 상·하부 환류 비율을 적용하여 두 branch loss 중 더 큰 값을 사용합니다. 실제 정맥압·혈관 허탈·chatter를 직접 예측하지 않습니다.</p>
        <p>IJV 접근 경로를 상부 branch로 표기하며, 상부 정맥 환류 전체와 동일하다는 뜻은 아닙니다. IJV 접근 경로의 제조사 곡선 데이터는 변경하지 않았습니다.</p>
        <a href="https://amsect.org/Portals/0/VAVD.pdf" target="_blank" rel="noreferrer" className="font-semibold text-teal-700 underline">AmSECT VAVD Clinical Guideline</a>
      </div>
    </details>

    <p className="px-1 text-xs leading-5 text-slate-500">※ 이상적 수력학 추정치이며, 실제 지속 가능한 flow는 정맥 허탈·혈액량·캐뉼라 위치 등으로 더 낮을 수 있습니다.</p>
  </div>
}
