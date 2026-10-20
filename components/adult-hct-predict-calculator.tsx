"use client"

import { useMemo, useState } from "react"
import { Droplets, HeartPulse, RefreshCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  predictAdultOnPumpHct,
  predictAdultPreCpbHct,
  ADULT_BLOOD_VOLUME_ML_PER_KG,
  KRC_VOLUME_ML_PER_UNIT,
} from "@/lib/adult-hct"

type NumericFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  note?: string
  step?: string
  min?: string
}

function NumericField({
  id,
  label,
  value,
  onChange,
  required = false,
  note,
  step = "any",
  min,
}: NumericFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="block min-h-5 text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-600" aria-hidden="true">*</span>}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-required={required}
        className="h-11 text-base"
      />
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  )
}

function ResultCard({
  label,
  value,
  caption,
  prominent = false,
}: {
  label: string
  value: string
  caption?: string
  prominent?: boolean
}) {
  return (
    <div className={"rounded-xl border p-4 " + (prominent ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-slate-50")}>
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <p className={"mt-1 font-bold tabular-nums text-slate-900 " + (prominent ? "text-3xl" : "text-2xl")}>{value}</p>
      {caption && <p className="mt-1 text-xs text-slate-500">{caption}</p>}
    </div>
  )
}

function asNumber(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value)
}

const format = (value: number, digits = 1) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })

export default function AdultHctPredictCalculator() {
  const [weight, setWeight] = useState("")
  const [preHct, setPreHct] = useState("")
  const [prime, setPrime] = useState("1200")
  const [desiredPreHct, setDesiredPreHct] = useState("")
  const [productHct, setProductHct] = useState("66")
  const [currentHct, setCurrentHct] = useState("")
  const [crystalloidAdded, setCrystalloidAdded] = useState("0")
  const [fluidRemoved, setFluidRemoved] = useState("0")
  const [plannedKrcUnits, setPlannedKrcUnits] = useState("0")
  const [desiredOnPumpHct, setDesiredOnPumpHct] = useState("")

  const preResult = useMemo(() => {
    try {
      return predictAdultPreCpbHct({
        weightKg: asNumber(weight),
        preCpbHctPercent: asNumber(preHct),
        primeVolumeMl: asNumber(prime),
        productHctPercent: asNumber(productHct),
        desiredHctPercent: desiredPreHct.trim() ? asNumber(desiredPreHct) : undefined,
      })
    } catch {
      return null
    }
  }, [weight, preHct, prime, productHct, desiredPreHct])

  const currentEstimatedVolume = useMemo(() => {
    const patientVolume = asNumber(weight) * ADULT_BLOOD_VOLUME_ML_PER_KG
    const startingPrime = asNumber(prime)
    const total = patientVolume + startingPrime
    return Number.isFinite(total) && patientVolume > 0 && startingPrime >= 0 && total > 0
      ? total
      : null
  }, [weight, prime])

  const onPumpResult = useMemo(() => {
    if (currentEstimatedVolume === null) return null
    try {
      return predictAdultOnPumpHct({
        currentTotalVolumeMl: currentEstimatedVolume,
        currentHctPercent: asNumber(currentHct),
        krcUnits: asNumber(plannedKrcUnits),
        crystalloidAddedMl: asNumber(crystalloidAdded),
        fluidRemovedMl: asNumber(fluidRemoved),
        productHctPercent: asNumber(productHct),
        desiredHctPercent: desiredOnPumpHct.trim() ? asNumber(desiredOnPumpHct) : undefined,
      })
    } catch {
      return null
    }
  }, [currentEstimatedVolume, currentHct, plannedKrcUnits, crystalloidAdded, fluidRemoved, productHct, desiredOnPumpHct])

  const reset = () => {
    setWeight("")
    setPreHct("")
    setPrime("1200")
    setDesiredPreHct("")
    setProductHct("66")
    setCurrentHct("")
    setCrystalloidAdded("0")
    setFluidRemoved("0")
    setPlannedKrcUnits("0")
    setDesiredOnPumpHct("")
  }

  return (
    <div className="space-y-5 text-slate-900">
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <HeartPulse className="size-5 text-teal-600" /> Adult CPB Hct Predict
            </CardTitle>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw className="size-4" /> Reset
            </button>
          </div>
          <p className="text-sm text-slate-600">
            성인 전용 · EBV 55 mL/kg 고정 · KRC 250 mL/unit. Priming은 동량 대체, 수술 중 KRC 주입은 동일량 HF/UF를 적용합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <h3 className="border-b pb-2 text-base font-semibold">Shared setup</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:col-span-2">
              <span className="font-semibold text-slate-700">Blood volume coefficient (mL/kg)</span>
              <span className="ml-2 font-bold text-slate-900">{ADULT_BLOOD_VOLUME_ML_PER_KG} (고정)</span>
            </div>
            <NumericField id="ahd-weight" label="Weight (kg)" value={weight} onChange={setWeight} min="0.1" required />
            <NumericField id="ahd-pre-hct" label="Pre-CPB Hct (%)" value={preHct} onChange={setPreHct} min="0.1" required />
            <NumericField
              id="ahd-prime"
              label="Priming volume (mL)"
              value={prime}
              onChange={setPrime}
              min="0"
              required
              note="기본값 1,200 mL · tubing set에 따라 수정 가능"
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold">RBC (KRC) 설정</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <p className="text-xs font-semibold text-slate-600">RBC (KRC) volume (mL/unit)</p>
                <p className="mt-1 text-base font-bold">{KRC_VOLUME_ML_PER_UNIT} (고정)</p>
              </div>
              <NumericField id="ahd-product-hct" label="KRC product Hct (%)" value={productHct} onChange={setProductHct} min="0.1" required />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              AHD는 leukocyte filter를 별도로 사용하지 않는 KRC 기준입니다. KRC는 250 mL/unit로 고정하며, product Hct 가정(기본 66%)은 실제 제제에 맞게 변경 가능합니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Droplets className="size-5 text-teal-600" /> Pre-CPB · Prime replacement
          </CardTitle>
          <p className="text-xs text-slate-600">
            RBC를 투입하는 만큼 기존 crystalloid를 제거하므로 최종 priming volume은 변하지 않습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResultCard
            label="CPB 시작 후 예상 Hct (%)"
            value={preResult ? format(preResult.predictedNoRbcHctPercent) + "%" : "—"}
            prominent
          />
          <NumericField
            id="ahd-pre-desired"
            label="Desired Hct (%)"
            value={desiredPreHct}
            onChange={setDesiredPreHct}
            min="0.1"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ResultCard
              label="priming에 필요한 RBC (KRC) 양 (mL)"
              value={preResult && preResult.requiredRbcMl !== null ? format(preResult.requiredRbcMl, 0) + " mL" : "—"}
            />
            <ResultCard
              label="KRC 환산량 (unit)"
              value={preResult && preResult.requiredRbcUnits !== null ? format(preResult.requiredRbcUnits, 2) : "—"}
            />
          </div>
          {preResult && preResult.feasible && preResult.minimumWholeKrcUnits !== null && (
            <p className="text-xs text-slate-600">
              KRC를 1 unit씩 사용할 경우: {preResult.minimumWholeKrcUnits} unit
              {preResult.wholeKrcProjectedHctPercent !== null
                ? " → 예상 Hct " + format(preResult.wholeKrcProjectedHctPercent) + "%"
                : " — 완전한 unit 용량이 priming volume을 초과함"}
            </p>
          )}
          {!preResult && <p className="text-sm text-amber-700" role="status">Shared setup의 유효한 값을 입력해주세요.</p>
          {preResult && !desiredPreHct.trim() && (
            <p className="text-sm text-slate-500">Desired Hct를 입력하면 필요한 RBC 대체 용량을 계산합니다.</p>
          )}
          {preResult && preResult.feasible === false && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              목표 Hct에 필요한 RBC가 priming volume을 초과합니다. 고정된 prime 내 RBC 대체만으로는 달성할 수 없습니다.
              가능한 최대 예측 Hct는 {format(preResult.maximumHctWithPrimeReplacementPercent)}%입니다.
            </p>
          )}
          {preResult && (
            <p className="text-xs text-slate-500">
              Estimated blood volume: {format(preResult.patientVolumeMl, 0)} mL ·
              Final volume: {format(preResult.totalVolumeMl, 0)} mL (RBC 대체 전후 동일)
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">수술 중 Hct 계산</CardTitle>
          <p className="text-xs text-slate-600">
            실측 Hct를 기준으로 Crystalloid 추가·제거 및 KRC 주입 후 예상 Hct를 계산합니다. KRC는 1 unit당 250 mL이며 동량 HF/UF를 자동 적용합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumericField id="ahd-current-hct" label="Current Hct (%)" value={currentHct} onChange={setCurrentHct} min="0.1" required />
            <NumericField id="ahd-crystalloid-added" label="Crystalloid 추가 (mL)" value={crystalloidAdded} onChange={setCrystalloidAdded} min="0" />
            <NumericField id="ahd-fluid-removed" label="Crystalloid/수분 제거 (mL)" value={fluidRemoved} onChange={setFluidRemoved} min="0" note="KRC에 대응하는 HF/UF 외에 추가로 제거할 수분량" />
            <div className="space-y-2 sm:col-span-2 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
              <NumericField id="ahd-krc-units" label="RBC (KRC) 주입 (unit)" value={plannedKrcUnits} onChange={setPlannedKrcUnits} min="0" step="1" note="정수 unit만 허용 · 1 unit = 250 mL" />
              <div className="flex flex-wrap gap-2" aria-label="KRC unit 빠른 선택">
                {[0, 1, 2, 3, 4].map((unit) => (
                  <button key={unit} type="button" onClick={() => setPlannedKrcUnits(String(unit))}
                    aria-pressed={plannedKrcUnits === String(unit)}
                    className={"min-h-10 min-w-12 rounded-lg border px-3 font-semibold " +
                    (plannedKrcUnits === String(unit) ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-700")}
                  >{unit}</button>
                ))}
              </div>
            </div>
            <NumericField id="ahd-pump-desired" label="Desired Hct (%)" value={desiredOnPumpHct} onChange={setDesiredOnPumpHct} min="0.1" />
          </div>
          <p className="text-xs text-slate-600">
            Current volume estimate: {currentEstimatedVolume === null ? "—" : format(currentEstimatedVolume, 0) + " mL"}
            {" · "}Weight × 55 mL/kg + initial priming (실제 circulating volume과 다를 수 있음)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-live="polite">
            <ResultCard prominent label="수술 중 예상 Hct (%)"
              value={onPumpResult?.plannedFeasible && onPumpResult.predictedHctPercent !== null ? format(onPumpResult.predictedHctPercent) + "%" : "—"}
              caption={onPumpResult?.hctChangePoints !== null && onPumpResult?.hctChangePoints !== undefined
                ? "현재 Hct 대비 " + (onPumpResult.hctChangePoints >= 0 ? "+" : "") + format(onPumpResult.hctChangePoints) + " %p" : undefined} />
            <ResultCard label="예상 최종 Volume (mL)"
              value={onPumpResult?.plannedFeasible ? format(onPumpResult.finalVolumeMl, 0) + " mL" : "—"}
              caption="Crystalloid 추가 − 별도 수분 제거 (KRC 주입과 동량 HF/UF는 상쇄)" />
            <ResultCard label="KRC 주입에 따른 HF/UF (mL)"
              value={onPumpResult?.plannedFeasible ? format(onPumpResult.matchedKrcUfMl, 0) + " mL" : "—"}
              caption="KRC 주입량과 동일한 수분량" />
            <ResultCard label="총 수분 제거 (mL)"
              value={onPumpResult?.plannedFeasible ? format(onPumpResult.totalUfMl, 0) + " mL" : "—"}
              caption="KRC 동량 HF/UF + 별도로 입력한 제거량" />
          </div>
          {onPumpResult && onPumpResult.requiredKrcUnits !== null && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold">Desired Hct에 필요한 KRC (정수 unit 기준)</p>
              {onPumpResult.targetFeasible ? (
                <p className="mt-2 text-sm">
                  <strong>{onPumpResult.requiredKrcUnits} unit</strong>
                  {" ("}{format(onPumpResult.requiredKrcMl ?? 0, 0)} mL{")"}
                  {" · "}동량 HF/UF {format(onPumpResult.requiredMatchedUfMl ?? 0, 0)} mL
                  {" · "}예상 Hct {format(onPumpResult.projectedTargetHctPercent ?? 0)}%
                </p>
              ) : <p className="mt-2 text-sm text-amber-800" role="alert">정수 unit로 목표 달성이 불가능한 추정 volume입니다.</p>}
              <p className="mt-1 text-xs text-slate-500">Crystalloid 추가·제거량을 반영한 독립적인 목표 계산입니다.</p>
            </div>
          )}
          {plannedKrcUnits.trim() && !Number.isSafeInteger(asNumber(plannedKrcUnits)) && (
            <p className="text-sm text-amber-800" role="alert">KRC는 0, 1, 2, 3 ... 정수 unit로 입력해주세요.</p>
          )}
          {!onPumpResult && <p className="text-sm text-amber-700" role="status">현재 Hct, Crystalloid 추가·제거량, KRC 주입 unit를 확인해주세요.</p>}
          {onPumpResult?.plannedFeasible === false && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              수분 제거 후 적혈구량이 전체 volume보다 많아 계산 조건이 성립하지 않습니다.
            </p>
          )}
          {onPumpResult?.targetFeasible === false && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              목표 Hct에 필요한 KRC unit가 추정 volume에서 성립하지 않습니다.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <strong>Clinical limitations:</strong> 예상 Hct는 균일 혼합과 적혈구량 보존을 전제로 한 추정치입니다.
        EBV, 실제 circuit/reservoir volume, 혈액제제 Hct, 출혈, hemolysis, fluid shift 및 HF 효율에 따라
        실제 결과가 달라집니다. 수혈 결정 및 CPB 산소전달 평가는 실측 Hct/Hb, DO₂, 관류 상태와 임상 상황을 우선하세요.
      </p>
    </div>
  )
}
