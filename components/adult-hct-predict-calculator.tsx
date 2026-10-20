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
          <CardTitle className="text-lg">On-pump · RBC + volume-neutral HF/UF</CardTitle>
          <p className="text-xs text-slate-600">
            CPB 진행 중 RBC 주입량과 HF/UF 제거량을 동일하게 적용합니다. HF/UF에서 적혈구 소실이 없다고 가정합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumericField id="ahd-current-hct" label="Current Hct (%)" value={currentHct} onChange={setCurrentHct} min="0.1" required />
            <NumericField
              id="ahd-net"
              label="Net volume change from CPB base (mL)"
              value={netVolumeChange}
              onChange={setNetVolumeChange}
              note="수액·출혈·UF 등 기존 순 volume 변화 (+ / −)"
            />
            <NumericField id="ahd-planned-rbc" label="Planned RBC addition (mL)" value={plannedRbc} onChange={setPlannedRbc} min="0" />
            <NumericField id="ahd-pump-desired" label="Desired Hct (%)" value={desiredOnPumpHct} onChange={setDesiredOnPumpHct} min="0.1" />
          </div>
          <p className="text-xs text-slate-600">
            Current total volume estimate: {currentEstimatedVolume === null ? "—" : format(currentEstimatedVolume, 0) + " mL"}
            {" · "}EBV + initial prime + net volume change
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ResultCard
              prominent
              label="Predicted Hct after RBC + HF (%)"
              value={onPumpResult?.plannedFeasible ? format(onPumpResult.predictedHctPercent) + "%" : "—"}
              caption="현재 측정 Hct를 기준으로 계산"
            />
            <ResultCard
              label="Matched HF/UF removal (mL)"
              value={onPumpResult?.plannedFeasible ? format(onPumpResult.matchedUfMl, 0) + " mL" : "—"}
              caption="주입하는 RBC 전체 용량과 동일"
            />
            <ResultCard
              label="Desired Hct를 위한 RBC (mL)"
              value={onPumpResult && onPumpResult.requiredRbcMl !== null ? format(onPumpResult.requiredRbcMl, 0) + " mL" : "—"}
              caption={onPumpResult && onPumpResult.requiredRbcUnits !== null ? format(onPumpResult.requiredRbcUnits, 2) + " unit" : undefined}
            />
            <ResultCard
              label="Target용 matched HF/UF (mL)"
              value={onPumpResult && onPumpResult.requiredMatchedUfMl !== null ? format(onPumpResult.requiredMatchedUfMl, 0) + " mL" : "—"}
            />
          </div>
          {!onPumpResult && <p className="text-sm text-amber-700" role="status">현재 Hct와 유효한 shared setup 값을 입력해주세요.</p>}
          {onPumpResult?.plannedFeasible === false && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              이 RBC/HF 조합은 추정 가능한 plasma volume을 초과합니다. 결과를 표시하지 않습니다.
            </p>
          )}
          {onPumpResult?.targetFeasible === false && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              목표 Hct는 추정 가능한 plasma volume 범위를 넘습니다. HF/UF 가능성과 실제 circulating volume을 재평가하세요.
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
