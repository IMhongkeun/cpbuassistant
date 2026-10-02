"use client"

import { useEffect, useMemo, useState } from "react"

const FV_CURVES: Record<number, number[]> = {
  19: [0, 4, 9, 16, 26, 38, 51, 67, 86, 106, 128, 153, 179],
  21: [0, 4, 7, 11, 17, 25, 32, 42, 53, 64, 78, 93, 110],
  23: [0, 4, 6, 10, 14, 18, 24, 31, 38, 47, 57, 68, 80],
  25: [0, 4, 5, 7, 9, 13, 17, 21, 26, 32, 40, 46, 53],
  27: [0, 4, 5, 6, 8, 11, 14, 18, 21, 26, 31, 35, 42],
  29: [0, 3, 4, 5, 6, 8, 11, 13, 15, 18, 23, 27, 31],
}
const SVC_CURVES: Record<number, number[]> = {
  15: [0, 5, 14, 26, 45, 88, 99, 137, 185],
  17: [0, 2, 5, 13, 24, 37, 54, 73, 96, 122, 152, 185],
  19: [0, 2, 5, 9, 15, 23, 32, 42, 55, 69, 85, 104, 125],
}

const fvSizes = [19, 21, 23, 25, 27, 29]
const strategies = [
  { value: 0, label: "FV 단독" },
  { value: 15, label: "FV + SVC 15 Fr" },
  { value: 17, label: "FV + SVC 17 Fr" },
  { value: 19, label: "FV + SVC 19 Fr" },
]
const tubeOptions = [
  { value: 0.375, label: '3/8"' },
  { value: 0.5, label: '1/2"' },
]

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const n = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
const fmt = (value: number | null, digits = 1) => (value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits))

function tubeLoss(flow: number, lengthM: number, diameterIn: number) {
  if (flow <= 0) return 0
  const rho = 1060
  const viscosity = 0.0035
  const diameter = diameterIn * 0.0254
  const q = flow / 1000 / 60
  const area = Math.PI * diameter ** 2 / 4
  const velocity = q / area
  const reynolds = rho * velocity * diameter / viscosity
  const relRoughness = 1.5e-6 / diameter
  const inner = (7 / reynolds) ** 0.9 + 0.27 * relRoughness
  const A = (2.457 * Math.log(1 / inner)) ** 16
  const B = (37530 / reynolds) ** 16
  const friction = 8 * ((8 / reynolds) ** 12 + 1 / (A + B) ** 1.5) ** (1 / 12)
  return (friction * (lengthM / diameter) * (rho * velocity ** 2 / 2)) / 133.322
}

function curveLoss(curve: number[], flow: number) {
  const maxFlow = (curve.length - 1) * 0.5
  if (flow < 0 || flow > maxFlow) return null
  const low = Math.floor(flow / 0.5)
  if (low >= curve.length - 1) return curve[curve.length - 1]
  const fraction = (flow - low * 0.5) / 0.5
  return curve[low] + fraction * (curve[low + 1] - curve[low])
}

function branchLoss(curve: number[], flow: number, lengthM: number, diameterIn: number) {
  const cannula = curveLoss(curve, flow)
  return cannula === null ? null : cannula + tubeLoss(flow, lengthM, diameterIn)
}

function invertBranch(curve: number[], pressure: number, lengthM: number, diameterIn: number) {
  const maxFlow = (curve.length - 1) * 0.5
  const maxPressure = branchLoss(curve, maxFlow, lengthM, diameterIn)
  if (maxPressure === null || pressure < 0 || pressure > maxPressure) return null
  let low = 0
  let high = maxFlow
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2
    if ((branchLoss(curve, mid, lengthM, diameterIn) ?? Infinity) < pressure) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function flowAtPressure(fv: number, tube: number, svc: number, pressure: number) {
  const fvFlow = invertBranch(FV_CURVES[fv], pressure, 2, tube)
  if (fvFlow === null) return null
  if (!svc) return { pressure, fvFlow, svcFlow: 0, totalFlow: fvFlow }
  const svcFlow = invertBranch(SVC_CURVES[svc], pressure, 1, 0.375)
  if (svcFlow === null) return null
  return { pressure, fvFlow, svcFlow, totalFlow: fvFlow + svcFlow }
}

function pressureForFlow(fv: number, tube: number, svc: number, target: number) {
  const fvMaxFlow = (FV_CURVES[fv].length - 1) * 0.5
  const fvMaxPressure = branchLoss(FV_CURVES[fv], fvMaxFlow, 2, tube)
  if (fvMaxPressure === null) return null
  let maxPressure = fvMaxPressure
  if (svc) {
    const svcMaxFlow = (SVC_CURVES[svc].length - 1) * 0.5
    const svcMaxPressure = branchLoss(SVC_CURVES[svc], svcMaxFlow, 1, 0.375)
    if (svcMaxPressure === null) return null
    maxPressure = Math.min(maxPressure, svcMaxPressure)
  }
  const maxResult = flowAtPressure(fv, tube, svc, maxPressure)
  if (!maxResult || target > maxResult.totalFlow) return null
  let low = 0
  let high = maxPressure
  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2
    const result = flowAtPressure(fv, tube, svc, mid)
    if (!result || result.totalFlow < target) low = mid
    else high = mid
  }
  return flowAtPressure(fv, tube, svc, (low + high) / 2)
}

function NumberField({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (value: number) => void; min: number; max: number; step: number; unit: string
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commitDraft = () => {
    if (draft.trim() === "") {
      setDraft(String(value))
      return
    }
    const parsed = Number.parseFloat(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const next = clamp(parsed, min, max)
    onChange(next)
    setDraft(String(next))
  }

  return <label className="grid gap-1.5 text-sm font-medium text-slate-700">
    {label}
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-teal-600" />
      <div className="flex w-32 items-center rounded-md border bg-white px-2 py-1.5 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
        <input type="number" inputMode="decimal" min={min} max={max} step={step} value={draft}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              setDraft(String(value))
              e.currentTarget.blur()
            }
          }}
          className="w-16 bg-transparent text-right outline-none" />
        <span className="ml-1 whitespace-nowrap text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  </label>
}

export default function MicsDrainageCalculator() {
  const [fv, setFv] = useState(25)
  const [tube, setTube] = useState(0.375)
  const [svc, setSvc] = useState(0)
  const [targetFlow, setTargetFlow] = useState(5)
  const [vavdLimit, setVavdLimit] = useState(60)
  const [cvp, setCvp] = useState(0)
  const [heightCm, setHeightCm] = useState(30)
  const [weight, setWeight] = useState(70)
  const [preHct, setPreHct] = useState(35)
  const [ebvPerKg, setEbvPerKg] = useState(55)
  const [otherPrime, setOtherPrime] = useState(1200)

  const passivePressure = Math.max(0, cvp) + Math.max(0, heightCm) * 0.7356

  const rows = useMemo(() => tubeOptions.flatMap((tubeOption) => strategies.map((strategy) => {
    const result = pressureForFlow(fv, tubeOption.value, strategy.value, targetFlow)
    if (!result) return { tube: tubeOption, strategy, result: null, requiredVacuum: null, within: false }
    const requiredVacuum = Math.max(0, result.pressure - passivePressure)
    return { tube: tubeOption, strategy, result, requiredVacuum, within: requiredVacuum <= vavdLimit }
  })), [fv, targetFlow, passivePressure, vavdLimit])

  const selected = rows.find((row) => row.tube.value === tube && row.strategy.value === svc)
  const hctRows = useMemo(() => tubeOptions.map((item) => {
    const fvPrime = item.value === 0.375 ? 142.5 : 253.4
    const svcPrime = svc ? 71.3 : 0
    const ebv = weight * ebvPerKg
    const totalPrime = otherPrime + svcPrime + fvPrime
    return { ...item, fvPrime, totalPrime, postHct: preHct * ebv / (ebv + totalPrime) }
  }), [weight, preHct, ebvPerKg, otherPrime, svc])
  const hctDifference = hctRows[0].postHct - hctRows[1].postHct
  const budget = passivePressure + vavdLimit
  const selectedResult = selected?.result ?? null
  const selectedBreakdown = selectedResult ? {
    fvCannula: curveLoss(FV_CURVES[fv], selectedResult.fvFlow),
    fvTube: tubeLoss(selectedResult.fvFlow, 2, tube),
    svcCannula: svc ? curveLoss(SVC_CURVES[svc], selectedResult.svcFlow) : 0,
    svcTube: svc ? tubeLoss(selectedResult.svcFlow, 1, 0.375) : 0,
  } : null
  const selectedHct = hctRows.find((row) => row.value === tube)
  const selectedEbv = weight * ebvPerKg
  const expectedSvcFlow = targetFlow * 0.35
  const expectedIvcFlow = targetFlow * 0.65
  const hydraulicSvcFraction = selectedResult && selectedResult.totalFlow > 0 ? selectedResult.svcFlow / selectedResult.totalFlow * 100 : null
  const hydraulicFvFraction = selectedResult && selectedResult.totalFlow > 0 ? selectedResult.fvFlow / selectedResult.totalFlow * 100 : null

  return <div className="space-y-5">
    <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-xl font-bold text-slate-900">MICS venous drainage simulator</h2><p className="mt-1 text-sm text-slate-600">Cannula·tubing·SVC 병렬 전략에 따른 회로 pressure gradient와 예상 drainage flow를 비교합니다.</p></div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div><p className="mb-2 text-sm font-medium text-slate-700">FV cannula</p><div className="flex flex-wrap gap-1">{fvSizes.map((size) => <button key={size} onClick={() => setFv(size)} className={"rounded-md border px-3 py-2 text-sm font-semibold " + (fv === size ? "border-teal-600 bg-teal-600 text-white" : "bg-white text-slate-600")}>{size} Fr</button>)}</div></div>
        <div><p className="mb-2 text-sm font-medium text-slate-700">FV tubing · 200 cm</p><div className="flex gap-2">{tubeOptions.map((item) => <button key={item.value} onClick={() => setTube(item.value)} className={"rounded-md border px-4 py-2 text-sm font-semibold " + (tube === item.value ? "border-teal-600 bg-teal-600 text-white" : "bg-white text-slate-600")}>{item.label}</button>)}</div></div>
        <div><p className="mb-2 text-sm font-medium text-slate-700">Drainage 전략</p><div className="flex flex-wrap gap-1">{strategies.map((item) => <button key={item.value} onClick={() => setSvc(item.value)} className={"rounded-md border px-3 py-2 text-sm font-semibold " + (svc === item.value ? "border-teal-600 bg-teal-600 text-white" : "bg-white text-slate-600")}>{item.label}</button>)}</div></div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative rounded-xl border-2 border-teal-500 bg-teal-50/80 p-4 shadow-md ring-4 ring-teal-100/70">
          <span className="absolute -top-3 left-3 rounded-full bg-teal-600 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow-sm">핵심 입력</span>
          <div className="pt-1 [&_input[type=number]]:text-lg [&_input[type=number]]:font-bold [&_input[type=number]]:text-teal-800">
            <NumberField label="목표 total flow" value={targetFlow} onChange={setTargetFlow} min={2} max={7} step={0.1} unit="L/min" />
          </div>
        </div>
        <NumberField label="total venous pressure " value={vavdLimit} onChange={setVavdLimit} min={0} max={80} step={1} unit="mmHg" />
        <NumberField label="CVP" value={cvp} onChange={setCvp} min={0} max={30} step={1} unit="mmHg" />
        <NumberField label="낙차 (RA/캐뉼라 → reservoir 수면)" value={heightCm} onChange={setHeightCm} min={0} max={100} step={1} unit="cm" />
      </div>
      <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-slate-700">
        <span className="font-semibold text-teal-900">자동 계산된 비진공 기여압: {fmt(passivePressure)} mmHg</span>
        <span className="ml-2 text-slate-600">= CVP {fmt(cvp)} + 낙차 {fmt(heightCm, 0)} cm × 0.736 mmHg/cm</span>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">선택 전략</p><p className="mt-2 text-base font-bold text-slate-900">FV {fv} Fr · {tube === 0.375 ? '3/8"' : '1/2"'} · {strategies.find((item) => item.value === svc)?.label}</p></div>
      <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">필요 pressure gradient</p><p className="mt-2 text-2xl font-bold text-teal-700">{selected?.result ? fmt(selected.result.pressure) + " mmHg" : "곡선 범위 밖"}</p><p className="mt-1 text-xs text-slate-500">{selected?.result ? "FV " + fmt(selected.result.fvFlow) + " + SVC " + fmt(selected.result.svcFlow) + " L/min" : "곡선 외삽을 하지 않음"}</p></div>
      <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">추정 VAVD 필요량</p><p className={"mt-2 text-2xl font-bold " + (selected?.within ? "text-emerald-700" : "text-rose-700")}>{selected?.requiredVacuum === null ? "—" : fmt(selected.requiredVacuum) + " mmHg"}</p><p className="mt-1 text-xs text-slate-500">가용 ΔP 기준 {fmt(budget, 0)} mmHg · 자연배액 {fmt(passivePressure)}</p></div>
    </div>

    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">FV tubing</th><th className="px-4 py-3">전략</th><th className="px-4 py-3 text-right">필요 ΔP</th><th className="px-4 py-3 text-right">FV flow</th><th className="px-4 py-3 text-right">SVC flow</th><th className="px-4 py-3 text-right">Total flow</th><th className="px-4 py-3 text-right">판정</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.tube.value + "-" + row.strategy.value} className={(row.tube.value === tube && row.strategy.value === svc ? "bg-teal-50 " : "") + "border-t"}><td className="px-4 py-3">{row.tube.label}</td><td className="px-4 py-3">{row.strategy.label}</td><td className="px-4 py-3 text-right">{row.result ? fmt(row.result.pressure) + " mmHg" : "범위 밖"}</td><td className="px-4 py-3 text-right">{fmt(row.result?.fvFlow ?? null)}</td><td className="px-4 py-3 text-right">{fmt(row.result?.svcFlow ?? null)}</td><td className="px-4 py-3 text-right">{fmt(row.result?.totalFlow ?? null)}</td><td className="px-4 py-3 text-right"><span className={"rounded-full px-2 py-1 text-xs font-semibold " + (row.within ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{row.result ? row.within ? "기준 이내" : "기준 초과" : "곡선 범위 밖"}</span></td></tr>)}</tbody>
      </table>
    </div>

    <div className="rounded-xl border bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4"><h3 className="text-lg font-bold text-slate-900">FV tubing prime에 따른 예상 Hct</h3><p className="mt-1 text-sm text-slate-600">3/8″와 1/2″ FV 200 cm tubing의 priming volume 차이를 같은 환자 조건에서 비교합니다.</p></div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid gap-4"><NumberField label="환자 체중" value={weight} onChange={setWeight} min={30} max={150} step={1} unit="kg" /><NumberField label="수술 전 Hct" value={preHct} onChange={setPreHct} min={15} max={55} step={0.1} unit="%" /><NumberField label="추정 혈액량 계수" value={ebvPerKg} onChange={setEbvPerKg} min={50} max={90} step={1} unit="mL/kg" /><NumberField label="기타 회로 prime" value={otherPrime} onChange={setOtherPrime} min={0} max={2500} step={10} unit="mL" /></div>
        <div className="grid content-start gap-3">{hctRows.map((row) => <div key={row.value} className={"rounded-lg border p-4 " + (row.value === tube ? "border-teal-400 bg-teal-50" : "bg-slate-50")}><div className="flex items-baseline justify-between"><span className="font-semibold text-slate-700">FV {row.label} · 200 cm</span><strong className="text-2xl text-slate-900">{fmt(row.postHct)}%</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-600" style={{ width: Math.min(100, (row.postHct / preHct) * 100) + "%" }} /></div><p className="mt-2 text-xs text-slate-500">FV tubing {fmt(row.fvPrime)} mL · total prime {fmt(row.totalPrime)} mL</p></div>)}<div className="rounded-lg bg-emerald-50 p-4 text-emerald-900"><p className="text-sm font-semibold">3/8″ 사용 시 예상 Hct 차이 <span className="ml-2 text-xl">+{fmt(hctDifference, 2)}%p</span></p><p className="mt-1 text-xs">1/2″ FV limb보다 prime이 110.9 mL 적은 효과입니다.</p></div></div>
      </div>
      <p className="mt-5 border-t pt-3 text-xs leading-5 text-slate-500">Cannula ΔP는 PerfusionTools에 digitize된 Medtronic NextGen curve를 선형 보간했고, tubing loss는 혈액 ρ 1,060 kg/m³·μ 3.5 mPa·s에서 Darcy–Weisbach/Churchill friction factor로 계산했습니다. 비진공 기여압은 CVP + 낙차(cm) × 0.736 mmHg/cm으로 계산한 추정치이며, 실제 정맥 허탈·캐뉼라 위치·reservoir 구조에 따라 달라질 수 있습니다. Hct는 단순 crystalloid dilution 모델이며 출혈, 수혈, ultrafiltration, fluid shift, cannula·connector prime은 별도 반영해야 합니다.</p>
    </div>

    <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 font-bold text-slate-800 transition-colors hover:bg-slate-50 sm:px-6">
        <span>계산방식 보기 · 현재 선택값으로 풀어보기</span>
        <span className="text-xl text-teal-600 transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="border-t bg-slate-50/60 px-4 py-5 sm:px-6">
        <p className="mb-4 text-sm leading-6 text-slate-600">현재 선택한 FV {fv} Fr · {tube === 0.375 ? '3/8″' : '1/2″'} · {strategies.find((item) => item.value === svc)?.label} · 목표 {fmt(targetFlow)} L/min을 기준으로 아래 순서로 계산합니다.</p>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-lg border bg-white p-4">
            <h4 className="font-bold text-slate-900">1. Cannula pressure loss</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">PerfusionTools에 digitize된 제조사 곡선의 인접 두 점 사이를 선형 보간합니다.</p>
            <p className="mt-2 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">ΔP = ΔP₁ + (Q − Q₁) / (Q₂ − Q₁) × (ΔP₂ − ΔP₁)</p>
            {selectedResult && selectedBreakdown ? <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>FV {fmt(selectedResult.fvFlow)} L/min → cannula <strong>{fmt(selectedBreakdown.fvCannula)} mmHg</strong></p>
              {svc ? <p>SVC {fmt(selectedResult.svcFlow)} L/min → cannula <strong>{fmt(selectedBreakdown.svcCannula)} mmHg</strong></p> : <p>SVC branch 없음</p>}
            </div> : <p className="mt-3 text-sm text-rose-700">선택 조건이 원자료 곡선 범위를 벗어나 계산하지 않았습니다.</p>}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h4 className="font-bold text-slate-900">2. Tubing pressure loss</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">혈액 밀도 1,060 kg/m³, 점도 3.5 mPa·s를 적용하고 Reynolds number에 따른 Churchill friction factor와 Darcy–Weisbach 식을 사용합니다.</p>
            <p className="mt-2 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">ΔP = f × (L / D) × (ρv² / 2),  v = Q / A</p>
            {selectedResult && selectedBreakdown ? <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>FV {tube === 0.375 ? '3/8″' : '1/2″'} · 200 cm → <strong>{fmt(selectedBreakdown.fvTube)} mmHg</strong></p>
              {svc ? <p>SVC 3/8″ · 100 cm → <strong>{fmt(selectedBreakdown.svcTube)} mmHg</strong></p> : null}
            </div> : null}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h4 className="font-bold text-slate-900">3. FV·SVC 병렬 flow 분배</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">두 branch가 같은 reservoir에 연결되므로 동일한 pressure gradient가 걸린다고 보고, 아래 조건을 만족하는 ΔP를 반복 계산합니다.</p>
            <p className="mt-2 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">QFV(ΔP) + QSVC(ΔP) = 목표 total flow</p>
            {selectedResult ? <div className="mt-3 text-sm text-slate-700">
              <p>필요 ΔP <strong>{fmt(selectedResult.pressure)} mmHg</strong></p>
              <p className="mt-1">FV {fmt(selectedResult.fvFlow)} + SVC {fmt(selectedResult.svcFlow)} = <strong>{fmt(selectedResult.totalFlow)} L/min</strong></p>
            </div> : null}
          </section>

          <section className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-4 lg:col-span-2">
            <h4 className="font-bold text-slate-900">4. SVC·IVC 예상 flow와 회로 분배의 해석</h4>
            <p className="mt-2 text-sm leading-6 text-slate-700">정상 성인 안정 시 참고값은 SVC 약 35%, IVC 약 65%로, SVC:IVC를 대략 1:1.9로 봅니다. 이는 환자 측 venous return의 생리적 분포이며 회로 저항으로 계산한 branch flow와는 다른 개념입니다.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-cyan-100 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-800">생리적 참고값</p>
                <p className="mt-2 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">QSVC,ref = Qtotal × 0.35</p>
                <p className="mt-1 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">QIVC,ref = Qtotal × 0.65</p>
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>Total {fmt(targetFlow)} L/min → SVC <strong>{fmt(expectedSvcFlow, 2)} L/min</strong></p>
                  <p>Total {fmt(targetFlow)} L/min → IVC <strong>{fmt(expectedIvcFlow, 2)} L/min</strong></p>
                </div>
              </div>
              <div className="rounded-lg border border-cyan-100 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-800">현재 회로의 hydraulic 분배</p>
                {selectedResult ? <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>SVC line {fmt(selectedResult.svcFlow)} L/min <strong>({fmt(hydraulicSvcFraction, 1)}%)</strong></p>
                  <p>FV line {fmt(selectedResult.fvFlow)} L/min <strong>({fmt(hydraulicFvFraction, 1)}%)</strong></p>
                  {svc ? <p className="pt-1 text-xs text-slate-500">SVC 회로 계산값과 생리적 SVC 참고값의 차이: {selectedResult.svcFlow >= expectedSvcFlow ? "+" : ""}{fmt(selectedResult.svcFlow - expectedSvcFlow, 2)} L/min</p> : <p className="pt-1 text-xs text-slate-500">별도 SVC line이 없으므로 상체 venous return도 RA/FV drainage 경로에서 함께 받아야 합니다.</p>}
                </div> : <p className="mt-3 text-sm text-rose-700">선택 조건이 곡선 범위를 벗어나 분배값을 계산하지 않았습니다.</p>}
              </div>
            </div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
              <p><strong>Snaring으로 caval return을 분리한 경우:</strong> SVC line의 실제 지속 flow는 상체에서 공급되는 venous return에 의해 제한됩니다. 회로 계산 능력이 이를 초과하면 추가 flow보다 SVC pressure 저하, vessel/RA collapse 또는 chatter로 나타날 수 있습니다.</p>
              <p><strong>Snaring하지 않았거나 RA에서 혼합되는 경우:</strong> 표시되는 FV·SVC 분배는 두 branch의 포획 능력이며 혈액의 해부학적 기원을 직접 뜻하지 않습니다. FV cannula도 tip·side-hole 위치에 따라 IVC뿐 아니라 RA 또는 SVC return 일부를 받을 수 있으므로 FV flow를 곧바로 IVC flow로 동일시하지 않습니다.</p>
              <p><strong>해석 기준:</strong> 35:65는 안정 시 참고선이며 고정 제한값이 아닙니다. 양압환기·호흡상·체위·혈액량·혈관긴장도·하체 관류 및 cannula 위치에 따라 실제 비율은 변합니다.</p>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4 lg:col-span-2">
            <h4 className="font-bold text-slate-900">5. 자연배액 기여와 필요 VAVD</h4>
            <p className="mt-2 text-sm leading-6 text-slate-700">목표 flow에 필요한 전체 압력차 중 <strong>CVP와 reservoir 낙차가 먼저 일부를 만들고</strong>, 부족한 만큼만 VAVD가 보충한다고 계산합니다.</p>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <p className="rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">비진공 ΔP = CVP + 낙차(cm) × 0.7356</p>
              <p className="rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">필요 VAVD = max(0, 필요 ΔP − 비진공 ΔP)</p>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-900">CVP</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">환자 정맥측에서 drainage line으로 미는 압력</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-900">낙차</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">RA/캐뉼라에서 reservoir 혈액면까지의 수직거리</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-900">필요 VAVD</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">회로 필요 압력에서 비진공 기여를 뺀 부족분</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 rounded-md border border-teal-200 bg-teal-50/60 p-3 sm:grid-cols-3">
              <div><p className="text-xs text-slate-600">회로 필요 ΔP</p><p className="mt-1 font-bold text-slate-900">{selectedResult ? fmt(selectedResult.pressure) : "—"} mmHg</p></div>
              <div><p className="text-xs text-slate-600">비진공 기여</p><p className="mt-1 font-bold text-slate-900">{fmt(cvp)} + {fmt(heightCm, 0)} × 0.7356 = {fmt(passivePressure)} mmHg</p></div>
              <div><p className="text-xs text-slate-600">추정 필요 VAVD</p><p className="mt-1 font-bold text-teal-900">{fmt(selected?.requiredVacuum ?? null)} mmHg <span className="text-xs font-normal text-slate-600">≈ −{fmt(selected?.requiredVacuum ?? null)} mmHg 설정</span></p></div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-600">비진공 ΔP는 자연배액의 <strong>flow가 아니라 이론적 구동압</strong>입니다. 실제 drainage는 CVP 변화, 정맥·RA collapse, cannula 위치, 호흡과 reservoir 혈액면에 따라 달라질 수 있습니다. 낙차는 tubing 길이가 아니며, 현재 0.7356 mmHg/cm은 물기둥 환산값입니다.</p>
            <p className="mt-2 text-xs text-slate-600">설정 기준 {fmt(vavdLimit, 0)} mmHg와 비교 → <strong className={selected?.within ? "text-emerald-700" : "text-rose-700"}>{selectedResult ? selected?.within ? "기준 이내" : "기준 초과" : "판정 불가"}</strong></p>
          </section>

          <section className="rounded-lg border bg-white p-4 lg:col-span-2">
            <h4 className="font-bold text-slate-900">6. Tubing prime과 예상 Hct</h4>
            <p className="mt-2 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">EBV = 체중 × 혈액량 계수</p>
            <p className="mt-2 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">예상 Hct = 수술 전 Hct × EBV / (EBV + total prime)</p>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>EBV = {fmt(weight, 0)} kg × {fmt(ebvPerKg, 0)} mL/kg = <strong>{fmt(selectedEbv, 0)} mL</strong></p>
              <p>선택 회로 total prime = 기타 {fmt(otherPrime, 0)} + FV tubing {fmt(selectedHct?.fvPrime ?? null)}{svc ? " + SVC tubing 71.3" : ""} = <strong>{fmt(selectedHct?.totalPrime ?? null)} mL</strong></p>
              <p>예상 Hct = {fmt(preHct)} × {fmt(selectedEbv, 0)} / ({fmt(selectedEbv, 0)} + {fmt(selectedHct?.totalPrime ?? null)}) = <strong>{fmt(selectedHct?.postHct ?? null)}%</strong></p>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
          이 계산은 회로 전략 비교를 위한 추정 모델입니다. Cannula 제조사 곡선은 주로 물 시험 자료이며, SVC에 사용하는 NextGen arterial cannula는 제조사 pressure-loss 곡선의 크기를 drainage 저항으로 적용했습니다. SVC 35%·IVC 65%는 안정 시 성인 생리의 참고값일 뿐 hydraulic solver의 제한조건으로 강제하지 않습니다. 실제 결과는 혈액 점도·온도·Hct·정맥 허탈·환자 혈액량·호흡·체위·캐뉼라 위치와 삽입 깊이·kink·connector·reservoir 구조에 따라 달라질 수 있습니다.
        </div>

        <section className="mt-4 rounded-lg border bg-white p-4 text-xs leading-5 text-slate-600">
          <h4 className="font-bold text-slate-900">근거 문헌</h4>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>Mohiaddin RH, et al. Vena caval flow: assessment with cine MR velocity mapping. <em>Radiology</em>. 1990;177:537–541. 건강한 성인에서 평균 SVC flow가 cardiac output의 약 35%로 보고되었습니다. <a className="font-semibold text-teal-700 underline" href="https://doi.org/10.1148/radiology.177.2.2217797" target="_blank" rel="noreferrer">DOI</a></li>
            <li>Kuzo RS, et al. Measurement of caval blood flow with MRI during respiratory maneuvers. <em>AJR Am J Roentgenol</em>. 2007;188:839–842. 자유호흡에서 SVC 38.9, IVC 74.3 mL/beat였으며 호흡에 따라, 특히 IVC flow가 더 크게 변했습니다. <a className="font-semibold text-teal-700 underline" href="https://doi.org/10.2214/AJR.06.5035" target="_blank" rel="noreferrer">DOI</a></li>
            <li>Miranda WR, et al. Catheterization in Adults With Congenital Heart Disease: A Primer for the Noncongenital Proceduralist. <em>JACC Cardiovasc Interv</em>. 2022;15(9). 성인 systemic venous return 중 약 2/3가 IVC에서 온다는 임상적 weighting을 기술합니다. <a className="font-semibold text-teal-700 underline" href="https://doi.org/10.1016/j.jcin.2021.12.020" target="_blank" rel="noreferrer">DOI</a></li>
            <li>American Society of ExtraCorporeal Technology (AmSECT). <em>Vacuum Assisted Venous Drainage (VAVD) Clinical Guideline</em>. 중력·siphon drainage가 부족할 때 조절된 reservoir vacuum으로 venous return을 보조하며, vacuum 적용 전 최대 gravity drainage 확인과 venous/reservoir pressure 감시를 권고합니다. <a className="font-semibold text-teal-700 underline" href="https://amsect.org/Portals/0/VAVD.pdf" target="_blank" rel="noreferrer">Protocol PDF</a></li>
          </ol>
        </section>
      </div>
    </details>
  </div>
}
