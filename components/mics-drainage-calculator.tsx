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
}

const fvSizes = [19, 21, 23, 25, 27, 29]
const strategies = [
  { value: 0, label: "FV 단독" },
  { value: 15, label: "FV + SVC 15 Fr" },
  { value: 17, label: "FV + SVC 17 Fr" },
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
  const [svc, setSvc] = useState(17)
  const [targetFlow, setTargetFlow] = useState(5)
  const [vavdLimit, setVavdLimit] = useState(60)
  const [passivePressure, setPassivePressure] = useState(0)
  const [weight, setWeight] = useState(70)
  const [preHct, setPreHct] = useState(35)
  const [ebvPerKg, setEbvPerKg] = useState(55)
  const [otherPrime, setOtherPrime] = useState(1000)

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

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <NumberField label="목표 total flow" value={targetFlow} onChange={setTargetFlow} min={2} max={7} step={0.1} unit="L/min" />
        <NumberField label="VAVD 기준값 (음압 크기)" value={vavdLimit} onChange={setVavdLimit} min={0} max={80} step={1} unit="mmHg" />
        <NumberField label="CVP + 낙차 등 비진공 기여" value={passivePressure} onChange={setPassivePressure} min={0} max={60} step={1} unit="mmHg" />
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">선택 전략</p><p className="mt-2 text-base font-bold text-slate-900">FV {fv} Fr · {tube === 0.375 ? '3/8"' : '1/2"'} · {strategies.find((item) => item.value === svc)?.label}</p></div>
      <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">"필요 pressure gradient"</p><p className="mt-2 text-2xl font-bold text-teal-700">{selected?.result ? fmt(selected.result.pressure) + " mmHg" : "곡선 범위 밖"}</p><p className="mt-1 text-xs text-slate-500">{selected?.result ? "FV " + fmt(selected.result.fvFlow) + " + SVC " + fmt(selected.result.svcFlow) + " L/min" : "곡선 외삽을 하지 않음"}</p></div>
      <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">추정 VAVD 필요량</p><p className={"mt-2 text-2xl font-bold " + (selected?.within ? "text-emerald-700" : "text-rose-700")}>{selected?.requiredVacuum === null ? "—" : fmt(selected.requiredVacuum) + " mmHg"}</p><p className="mt-1 text-xs text-slate-500">가용 ΔP 기준 {fmt(budget, 0)} mmHg</p></div>
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
      <p className="mt-5 border-t pt-3 text-xs leading-5 text-slate-500">Cannula ΔP는 PerfusionTools에 digitize된 Medtronic NextGen curve를 선형 보간했고, tubing loss는 혈액 ρ 1,060 kg/m³·μ 3.5 mPa·s에서 Darcy–Weisbach/Churchill friction factor로 계산했습니다. Hct는 단순 crystalloid dilution 모델이며 출혈, 수혈, ultrafiltration, fluid shift, cannula·connector prime은 별도 반영해야 합니다.</p>
    </div>
  </div>
}
