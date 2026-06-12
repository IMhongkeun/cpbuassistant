"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PRIME_VOLUME_STORAGE_KEY = "cpbuassistant:bloodHemodilutionPrimeVolume"
const FLUID_ADJUSTMENT_THRESHOLD_ML = 0.5

const parseInputNumber = (value: string) => Number.parseFloat(value)

const formatNumber = (value: number, decimals = 0) => {
  if (!Number.isFinite(value)) return "-"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const isPositiveNumber = (value: number) => Number.isFinite(value) && value > 0
const isNonNegativeNumber = (value: number) => Number.isFinite(value) && value >= 0

type CalculationResult =
  | {
      status: "ready"
      expectedHct: number
      rbcTransfusionVolume: number
      fluidAdjustmentVolume: number
      fluidAdjustmentLabel: string
      fluidAdjustmentTone: string
    }
  | {
      status: "message"
      message: string
    }

export default function BloodHemodilutionCalculator() {
  const [weightKg, setWeightKg] = useState("")
  const [bloodVolumeCoefficient, setBloodVolumeCoefficient] = useState("55")
  const [primeVolume, setPrimeVolume] = useState("")
  const [preHct, setPreHct] = useState("")
  const [additionalCrystalloidVolume, setAdditionalCrystalloidVolume] = useState("0")
  const [desiredHct, setDesiredHct] = useState("")
  const [rbcProductHct, setRbcProductHct] = useState("0.66")

  useEffect(() => {
    const savedPrimeVolume = window.localStorage.getItem(PRIME_VOLUME_STORAGE_KEY)
    if (savedPrimeVolume !== null) {
      setPrimeVolume(savedPrimeVolume)
    }
  }, [])

  useEffect(() => {
    if (primeVolume.trim() !== "") {
      window.localStorage.setItem(PRIME_VOLUME_STORAGE_KEY, primeVolume)
    }
  }, [primeVolume])

  const result = useMemo<CalculationResult>(() => {
    const weight = parseInputNumber(weightKg)
    const coefficient = parseInputNumber(bloodVolumeCoefficient)
    const prime = parseInputNumber(primeVolume)
    const patientPreHct = parseInputNumber(preHct)
    const crystalloid = parseInputNumber(additionalCrystalloidVolume)
    const targetPercent = parseInputNumber(desiredHct)
    const rbcHct = parseInputNumber(rbcProductHct)

    if (
      !isPositiveNumber(weight) ||
      !isPositiveNumber(coefficient) ||
      !isPositiveNumber(prime) ||
      !isPositiveNumber(patientPreHct) ||
      !isNonNegativeNumber(crystalloid) ||
      !isPositiveNumber(targetPercent) ||
      !isPositiveNumber(rbcHct)
    ) {
      return {
        status: "message",
        message: "Weight, coefficient, prime volume, Pre-Hct, Desired Hct, RBC product Hct를 올바른 양수로 입력해주세요. Additional crystalloid는 0 mL 이상이어야 합니다.",
      }
    }

    const target = targetPercent / 100

    if (target >= rbcHct) {
      return {
        status: "message",
        message: "Desired Hct가 RBC product Hct 이상이면 RBC 수혈 필요량 계산이 불가합니다. Desired Hct 또는 RBC product Hct를 확인해주세요.",
      }
    }

    // Patient volume = Weight × Blood volume coefficient
    const patientVolume = weight * coefficient

    // Patient RBC volume = Patient volume × Pre-Hct / 100
    // Prime volume과 additional crystalloid는 RBC volume을 증가시키지 않는다.
    const patientRbcVolume = patientVolume * (patientPreHct / 100)

    // Total volume = Patient volume + Prime volume + Additional crystalloid volume
    const totalVolume = patientVolume + prime + crystalloid

    // Expected Hct (%) = Patient RBC volume / Total volume × 100
    const expectedHct = (patientRbcVolume / totalVolume) * 100

    // RBC transfusion volume = max(0, (Target × Total volume - Patient RBC volume) / (RBC_Hct - Target))
    const rbcTransfusionVolume = Math.max(0, (target * totalVolume - patientRbcVolume) / (rbcHct - target))

    // Target total volume = Patient RBC volume / Target
    // Fluid adjustment volume = Target total volume - Total volume
    const targetTotalVolume = patientRbcVolume / target
    const fluidAdjustmentVolume = targetTotalVolume - totalVolume

    let fluidAdjustmentLabel = "조절 불필요"
    let fluidAdjustmentTone = "text-slate-700"

    if (fluidAdjustmentVolume < -FLUID_ADJUSTMENT_THRESHOLD_ML) {
      fluidAdjustmentLabel = `수액 제거 ${formatNumber(Math.abs(fluidAdjustmentVolume))} mL`
      fluidAdjustmentTone = "text-rose-700"
    } else if (fluidAdjustmentVolume > FLUID_ADJUSTMENT_THRESHOLD_ML) {
      fluidAdjustmentLabel = `수액 추가 ${formatNumber(fluidAdjustmentVolume)} mL`
      fluidAdjustmentTone = "text-blue-700"
    }

    return {
      status: "ready",
      expectedHct,
      rbcTransfusionVolume,
      fluidAdjustmentVolume,
      fluidAdjustmentLabel,
      fluidAdjustmentTone,
    }
  }, [additionalCrystalloidVolume, bloodVolumeCoefficient, desiredHct, preHct, primeVolume, rbcProductHct, weightKg])

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Card className="shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl">Blood / Hemodilution Calculator</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            CPB prime volume과 crystalloid 추가량에 따른 예상 Hct, 목표 Hct까지 필요한 RBC 수혈량, 목표 Hct 달성을 위한 수액 제거/추가량을 계산합니다.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="blood-weight">Weight kg</Label>
              <Input id="blood-weight" type="number" min="0" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blood-volume-coefficient">Blood volume coefficient mL/kg</Label>
              <Input
                id="blood-volume-coefficient"
                type="number"
                min="0"
                step="1"
                value={bloodVolumeCoefficient}
                onChange={(event) => setBloodVolumeCoefficient(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="prime-volume">Prime volume mL</Label>
              <Input id="prime-volume" type="number" min="0" step="1" value={primeVolume} onChange={(event) => setPrimeVolume(event.target.value)} />
              <p className="text-xs text-muted-foreground">Entered prime volume is saved on this device.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pre-hct">Pre-Hct %</Label>
              <Input id="pre-hct" type="number" min="0" step="0.1" value={preHct} onChange={(event) => setPreHct(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="additional-crystalloid-volume">Additional crystalloid volume mL</Label>
              <Input
                id="additional-crystalloid-volume"
                type="number"
                min="0"
                step="1"
                value={additionalCrystalloidVolume}
                onChange={(event) => setAdditionalCrystalloidVolume(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Cardioplegia and crystalloid fluids only.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="desired-hct">Desired Hct %</Label>
              <Input id="desired-hct" type="number" min="0" step="0.1" value={desiredHct} onChange={(event) => setDesiredHct(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rbc-product-hct">RBC product Hct</Label>
              <Input
                id="rbc-product-hct"
                type="number"
                min="0"
                step="0.01"
                value={rbcProductHct}
                onChange={(event) => setRbcProductHct(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Default 0.66. Adjust according to hospital blood product.</p>
            </div>
          </div>

          {result.status === "message" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm font-medium text-amber-900">
              {result.message}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-green-200 bg-green-50/70">
                <CardContent className="p-6 text-center">
                  <div className="text-sm font-medium text-green-800">예상 Hct</div>
                  <div className="mt-3 text-4xl font-bold text-green-900">{formatNumber(result.expectedHct, 1)}</div>
                  <div className="mt-1 text-lg font-semibold text-green-800">%</div>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-red-50/70">
                <CardContent className="p-6 text-center">
                  <div className="text-sm font-medium text-red-800">수혈 필요량</div>
                  <div className="mt-3 text-4xl font-bold text-red-900">{formatNumber(result.rbcTransfusionVolume)}</div>
                  <div className="mt-1 text-lg font-semibold text-red-800">mL</div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-blue-50/70">
                <CardContent className="p-6 text-center">
                  <div className="text-sm font-medium text-blue-800">수액 제거/추가 용량</div>
                  <div className="mt-3 text-4xl font-bold text-blue-900">{formatNumber(Math.abs(result.fluidAdjustmentVolume))}</div>
                  <div className="mt-1 text-lg font-semibold text-blue-800">mL</div>
                  <div className={`mt-2 text-sm font-semibold ${result.fluidAdjustmentTone}`}>{result.fluidAdjustmentLabel}</div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
