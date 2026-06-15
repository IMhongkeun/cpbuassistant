"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Droplets, FlaskConical, HeartPulse } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CALCULATOR_STORAGE_KEY = "cpbuassistant:bloodHemodilutionCalculator"
const PRIME_VOLUME_STORAGE_KEY = "cpbuassistant:bloodHemodilutionPrimeVolume"
const FLUID_ADJUSTMENT_THRESHOLD_ML = 0.5
const DEFAULT_BLOOD_VOLUME_COEFFICIENT = "55"
const DEFAULT_RBC_PRODUCT_HCT = "0.66"
const DEFAULT_RBC_UNIT_VOLUME = "200"

const safeLocalStorageGetItem = (key: string) => {
  if (typeof window === "undefined") return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeLocalStorageSetItem = (key: string, value: string) => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Persistence is optional. Ignore storage write failures.
  }
}

const safeLocalStorageRemoveItem = (key: string) => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.removeItem(key)
  } catch {
    // Persistence is optional. Ignore storage remove failures.
  }
}

const PRIMING_VOLUME_PRESETS = [
  { name: "Neo (1/8)", oxygenator: "Kids 100", configuration: "1/8-3/16-3/16", primeVolumeMl: 130 },
  { name: "Neo (3/16)", oxygenator: "FX-05", configuration: "3/16-3/16-3/16", primeVolumeMl: 180 },
  { name: "Neo (1/4)", oxygenator: "FX-05", configuration: "3/16-1/4-1/4", primeVolumeMl: 230 },
  { name: "Infant (1/4)", oxygenator: "FX-05", configuration: "1/4-1/4-1/4", primeVolumeMl: 250 },
  { name: "Infant (3/8)", oxygenator: "Pixie", configuration: "1/4-3/8-3/8", primeVolumeMl: 450 },
  { name: "Infant (3/8)", oxygenator: "Kids 101", configuration: "1/4-3/8-3/8", primeVolumeMl: 500 },
  { name: "Infant FX15", oxygenator: "FX-15", configuration: "1/4-3/8-3/8", primeVolumeMl: 650 },
  { name: "Pediatric", oxygenator: "FX-15", configuration: "3/8-3/8-3/8", primeVolumeMl: 800 },
  { name: "Pediatric", oxygenator: "FX-15", configuration: "3/8-1/2-3/8", primeVolumeMl: 850 },
  { name: "S adult (FX)", oxygenator: "FX-25", configuration: "3/8-1/2-1/2", primeVolumeMl: 1200 },
]

const getPresetLabel = (preset: (typeof PRIMING_VOLUME_PRESETS)[number]) =>
  `${preset.name} · ${preset.oxygenator} · ${preset.configuration} — ${preset.primeVolumeMl} mL`

const NUMERIC_ONLY_MESSAGE = "Enter numeric values only. Do not include units such as kg, mL, or %."

const parseStrictNumber = (value: string): number | null => {
  const trimmedValue = value.trim()

  if (trimmedValue === "") return null

  const numericPattern = /^(?:\d+(?:\.\d+)?|\.\d+)$/
  if (!numericPattern.test(trimmedValue)) return null

  const numericValue = Number(trimmedValue)
  return Number.isFinite(numericValue) ? numericValue : null
}

const parseStrictSignedNumber = (value: string): number | null => {
  const trimmedValue = value.trim()

  if (trimmedValue === "") return null

  const numericPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
  if (!numericPattern.test(trimmedValue)) return null

  const numericValue = Number(trimmedValue)
  return Number.isFinite(numericValue) ? numericValue : null
}

const parseOptionalVolume = (value: string) => (value.trim() === "" ? 0 : parseStrictNumber(value))
const parseOptionalSignedVolume = (value: string) => (value.trim() === "" ? 0 : parseStrictSignedNumber(value))
const hasOptionalValue = (value: string) => value.trim() !== ""
const defaultIfBlank = (value: string | null | undefined, defaultValue: string) =>
  value?.trim() ? value : defaultValue

const formatNumber = (value: number, decimals = 0) => {
  if (!Number.isFinite(value)) return "-"
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const formatSignedMl = (value: number) => {
  if (!Number.isFinite(value)) return "-"
  if (Math.abs(value) < FLUID_ADJUSTMENT_THRESHOLD_ML) return "0 mL"
  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))} mL`
}

const formatPercentFromFraction = (value: number) => {
  if (!Number.isFinite(value)) return "-"
  return formatNumber(value * 100, 0)
}

const isPositiveNumber = (value: string) => {
  const numericValue = parseStrictNumber(value)
  return numericValue !== null && numericValue > 0
}
const isNonNegativeNumber = (value: string) => {
  const numericValue = parseStrictNumber(value)
  return numericValue !== null && numericValue >= 0
}
const isPercentInRange = (value: string) => {
  const numericValue = parseStrictNumber(value)
  return numericValue !== null && numericValue > 0 && numericValue <= 100
}
const isFractionInRange = (value: string) => {
  const numericValue = parseStrictNumber(value)
  return numericValue !== null && numericValue > 0 && numericValue <= 1
}
const isPositiveNumericValue = (value: number) => Number.isFinite(value) && value > 0
const isNonNegativeNumericValue = (value: number) => Number.isFinite(value) && value >= 0
const isPercentNumericValue = (value: number) => Number.isFinite(value) && value > 0 && value <= 100
const isFractionNumericValue = (value: number) => Number.isFinite(value) && value > 0 && value <= 1

const getVolumeAction = (value: number): "add" | "remove" | "neutral" => {
  if (value > FLUID_ADJUSTMENT_THRESHOLD_ML) return "add"
  if (value < -FLUID_ADJUSTMENT_THRESHOLD_ML) return "remove"
  return "neutral"
}

const getBalancePillClass = (action: "add" | "remove" | "neutral") => {
  if (action === "add") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200"
  }
  if (action === "remove") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200"
}

const getResultTint = (tone: "green" | "amber" | "rose" | "blue" | "slate") => {
  if (tone === "green") return "border-emerald-200 bg-emerald-50/75 dark:border-emerald-900/60 dark:bg-emerald-950/20"
  if (tone === "amber") return "border-amber-200 bg-amber-50/75 dark:border-amber-900/60 dark:bg-amber-950/20"
  if (tone === "rose") return "border-rose-200 bg-rose-50/75 dark:border-rose-900/60 dark:bg-rose-950/20"
  if (tone === "blue") return "border-blue-200 bg-blue-50/75 dark:border-blue-900/60 dark:bg-blue-950/20"
  return "border-border/70 bg-card/95"
}
type StoredCalculatorState = {
  weightKg?: string
  bloodVolumeCoefficient?: string
  selectedPresetId?: string
  primeVolume?: string
  preHct?: string
  preDesiredHct?: string
  rbcProductHct?: string
  rbcUnitVolume?: string
  intraCurrentHct?: string
  intraNetVolumeChangeFromBase?: string
  plannedRbcAddition?: string
  addedCrystalloidVolume?: string
  removedFluidVolume?: string
  intraDesiredHct?: string
}

type PreCpbResult =
  | {
      status: "ready"
      patientVolume: number
      patientRbcVolume: number
      baseTotalVolume: number
      expectedHctWithoutRbc: number
      desiredHct: number
      rbcRequiredVolume: number
      rbcUnitCount: number
      estimatedFinalVolume: number
    }
  | { status: "message"; message: string }

type IntraoperativeResult =
  | {
      status: "ready"
      currentHct: number
      patientVolume: number
      primeVolume: number
      baseVolume: number
      netVolumeChangeFromBase: number
      currentTotalVolume: number
      currentRbcVolume: number
      plannedRbcAddition: number
      addedCrystalloidVolume: number
      removedFluidVolume: number
      netVolumeChange: number
      newRbcVolume: number
      newTotalVolume: number
      predictedHct: number
      hctDelta: number
      desiredHct: number | null
      rbcNeededVolume: number | null
      rbcNeededUnitCount: number | null
      fluidAdjustmentToTarget: number | null
      fluidAdjustmentAction: "remove" | "add" | "none" | null
    }
  | { status: "message"; message: string }

const InputBlock = ({
  id,
  label,
  value,
  onChange,
  helperText,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  helperText?: string
  placeholder?: string
}) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="flex min-h-6 items-end text-xs font-semibold tracking-wide text-muted-foreground">
      {label}
    </Label>
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 bg-background/80 text-sm font-medium"
    />
    {helperText && <p className="text-[11px] leading-relaxed text-muted-foreground">{helperText}</p>}
  </div>
)

const SectionCard = ({
  title,
  icon,
  children,
  description,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  description?: string
}) => (
  <Card className="h-full border-border/70 bg-card/95 shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300">
          {icon}
        </span>
        {title}
      </CardTitle>
      {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
)

const ResultCard = ({
  label,
  value,
  unit,
  detail,
  tone = "slate",
}: {
  label: string
  value: string
  unit?: string
  detail?: React.ReactNode
  tone?: "green" | "amber" | "rose" | "blue" | "slate"
}) => (
  <Card className={`${getResultTint(tone)} shadow-sm`}>
    <CardContent className="p-3">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-end gap-1.5">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {unit && <span className="pb-0.5 text-sm font-semibold text-muted-foreground">{unit}</span>}
      </div>
      {detail && <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detail}</div>}
    </CardContent>
  </Card>
)

export default function BloodHemodilutionCalculator() {
  const [weightKg, setWeightKg] = useState("")
  const [bloodVolumeCoefficient, setBloodVolumeCoefficient] = useState(DEFAULT_BLOOD_VOLUME_COEFFICIENT)
  const [selectedPresetId, setSelectedPresetId] = useState("")
  const [primeVolume, setPrimeVolume] = useState("")
  const [preHct, setPreHct] = useState("")
  const [preDesiredHct, setPreDesiredHct] = useState("")
  const [rbcProductHct, setRbcProductHct] = useState(DEFAULT_RBC_PRODUCT_HCT)
  const [rbcUnitVolume, setRbcUnitVolume] = useState(DEFAULT_RBC_UNIT_VOLUME)
  const [currentHct, setCurrentHct] = useState("")
  const [intraNetVolumeChangeFromBase, setIntraNetVolumeChangeFromBase] = useState("")
  const [plannedRbcAddition, setPlannedRbcAddition] = useState("")
  const [addedCrystalloidVolume, setAddedCrystalloidVolume] = useState("")
  const [removedFluidVolume, setRemovedFluidVolume] = useState("")
  const [intraDesiredHct, setIntraDesiredHct] = useState("")
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const savedState = safeLocalStorageGetItem(CALCULATOR_STORAGE_KEY)
      if (savedState) {
        const parsedState = JSON.parse(savedState) as StoredCalculatorState

        setWeightKg(parsedState.weightKg ?? "")
        setBloodVolumeCoefficient(defaultIfBlank(parsedState.bloodVolumeCoefficient, DEFAULT_BLOOD_VOLUME_COEFFICIENT))
        setSelectedPresetId(parsedState.selectedPresetId ?? "")
        setPrimeVolume(parsedState.primeVolume ?? safeLocalStorageGetItem(PRIME_VOLUME_STORAGE_KEY) ?? "")
        setPreHct(parsedState.preHct ?? "")
        setPreDesiredHct(parsedState.preDesiredHct ?? "")
        setRbcProductHct(defaultIfBlank(parsedState.rbcProductHct, DEFAULT_RBC_PRODUCT_HCT))
        setRbcUnitVolume(defaultIfBlank(parsedState.rbcUnitVolume, DEFAULT_RBC_UNIT_VOLUME))
        setCurrentHct(parsedState.intraCurrentHct ?? "")
        setIntraNetVolumeChangeFromBase(parsedState.intraNetVolumeChangeFromBase ?? "")
        setPlannedRbcAddition(parsedState.plannedRbcAddition ?? "")
        setAddedCrystalloidVolume(parsedState.addedCrystalloidVolume ?? "")
        setRemovedFluidVolume(parsedState.removedFluidVolume ?? "")
        setIntraDesiredHct(parsedState.intraDesiredHct ?? "")
      } else {
        setPrimeVolume(safeLocalStorageGetItem(PRIME_VOLUME_STORAGE_KEY) ?? "")
      }
    } catch {
      safeLocalStorageRemoveItem(CALCULATOR_STORAGE_KEY)
      safeLocalStorageRemoveItem(PRIME_VOLUME_STORAGE_KEY)
    }

    setHasLoadedSavedState(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedSavedState || typeof window === "undefined") return

    const trimmedPrimeVolume = primeVolume.trim()
    if (trimmedPrimeVolume === "") {
      safeLocalStorageRemoveItem(PRIME_VOLUME_STORAGE_KEY)
    } else {
      safeLocalStorageSetItem(PRIME_VOLUME_STORAGE_KEY, primeVolume)
    }

    const stateToSave: StoredCalculatorState = {
      weightKg,
      bloodVolumeCoefficient,
      selectedPresetId,
      primeVolume,
      preHct,
      preDesiredHct,
      rbcProductHct,
      rbcUnitVolume,
      intraCurrentHct: currentHct,
      intraNetVolumeChangeFromBase,
      plannedRbcAddition,
      addedCrystalloidVolume,
      removedFluidVolume,
      intraDesiredHct,
    }

    safeLocalStorageSetItem(CALCULATOR_STORAGE_KEY, JSON.stringify(stateToSave))
  }, [
    addedCrystalloidVolume,
    bloodVolumeCoefficient,
    currentHct,
    hasLoadedSavedState,
    intraDesiredHct,
    intraNetVolumeChangeFromBase,
    plannedRbcAddition,
    preDesiredHct,
    preHct,
    primeVolume,
    rbcProductHct,
    rbcUnitVolume,
    removedFluidVolume,
    selectedPresetId,
    weightKg,
  ])


  const selectedPreset = selectedPresetId ? PRIMING_VOLUME_PRESETS[Number.parseInt(selectedPresetId, 10)] : undefined
  const primeVolumeNumber = parseStrictNumber(primeVolume)
  const isManualPrimeOverride = Boolean(
    selectedPreset && primeVolumeNumber !== null && isPositiveNumericValue(primeVolumeNumber) && primeVolumeNumber !== selectedPreset.primeVolumeMl,
  )
  const primeSourceLabel = selectedPreset
    ? isManualPrimeOverride
      ? "Manual override"
      : "Selected preset"
    : primeVolume.trim()
      ? "Custom prime"
      : "No preset"

  const preCpbResult = useMemo<PreCpbResult>(() => {
    const weight = parseStrictNumber(weightKg)
    const coefficient = parseStrictNumber(bloodVolumeCoefficient)
    const prime = parseStrictNumber(primeVolume)
    const patientPreHct = parseStrictNumber(preHct)
    const targetPercent = parseStrictNumber(preDesiredHct)
    const rbcHct = parseStrictNumber(rbcProductHct)
    const unitVolume = parseStrictNumber(rbcUnitVolume)

    if (
      weight === null ||
      coefficient === null ||
      prime === null ||
      patientPreHct === null ||
      targetPercent === null ||
      rbcHct === null ||
      unitVolume === null
    ) {
      return {
        status: "message",
        message: NUMERIC_ONLY_MESSAGE,
      }
    }

    if (
      !isPositiveNumericValue(weight) ||
      !isPositiveNumericValue(coefficient) ||
      !isPositiveNumericValue(prime) ||
      !isPercentNumericValue(patientPreHct) ||
      !isPercentNumericValue(targetPercent) ||
      !isFractionNumericValue(rbcHct) ||
      !isPositiveNumericValue(unitVolume)
    ) {
      return {
        status: "message",
        message: "Shared setup과 Desired Hct를 입력하면 Pre-CPB 결과가 표시됩니다.",
      }
    }

    const target = targetPercent / 100
    if (target >= rbcHct) {
      return { status: "message", message: "Desired Hct는 RBC product Hct보다 낮아야 합니다." }
    }

    // Patient volume = Weight × Blood volume coefficient
    const patientVolume = weight * coefficient
    // Patient RBC volume = Patient volume × Pre-Hct / 100
    const patientRbcVolume = patientVolume * (patientPreHct / 100)
    // Base total volume = Patient volume + Prime volume
    const baseTotalVolume = patientVolume + prime

    if (!isPositiveNumericValue(baseTotalVolume)) {
      return { status: "message", message: "Base total volume이 0 이하입니다. 입력값을 확인해주세요." }
    }

    // Expected Hct without RBC = Patient RBC volume / Base total volume × 100
    const expectedHctWithoutRbc = (patientRbcVolume / baseTotalVolume) * 100
    if (!Number.isFinite(expectedHctWithoutRbc) || expectedHctWithoutRbc < 0 || expectedHctWithoutRbc > 100) {
      return { status: "message", message: "Expected Hct가 0-100% 범위를 벗어납니다. 입력값을 확인해주세요." }
    }

    // RBC required mL = max(0, (Target × Base total volume - Patient RBC volume) / RBC product Hct)
    // This targets the requested Hct against the patient + prime base volume,
    // without adding RBC volume to the target denominator.
    const rbcRequiredVolume = Math.max(0, (target * baseTotalVolume - patientRbcVolume) / rbcHct)
    const rbcUnitCount = rbcRequiredVolume / unitVolume
    const estimatedFinalVolume = baseTotalVolume + rbcRequiredVolume

    if (!isPositiveNumericValue(estimatedFinalVolume)) {
      return { status: "message", message: "Estimated final volume이 0 이하입니다. 입력값을 확인해주세요." }
    }

    return {
      status: "ready",
      patientVolume,
      patientRbcVolume,
      baseTotalVolume,
      expectedHctWithoutRbc,
      desiredHct: targetPercent,
      rbcRequiredVolume,
      rbcUnitCount,
      estimatedFinalVolume,
    }
  }, [bloodVolumeCoefficient, preDesiredHct, preHct, primeVolume, rbcProductHct, rbcUnitVolume, weightKg])


  const hasIntraoperativeTarget = hasOptionalValue(intraDesiredHct)

  const intraoperativeResult = useMemo<IntraoperativeResult>(() => {
    const weight = parseStrictNumber(weightKg)
    const coefficient = parseStrictNumber(bloodVolumeCoefficient)
    const prime = parseStrictNumber(primeVolume)
    const currentHctPercent = parseStrictNumber(currentHct)
    const netVolumeChangeFromBase = parseOptionalSignedVolume(intraNetVolumeChangeFromBase)
    const plannedRbc = parseOptionalVolume(plannedRbcAddition)
    const addedCrystalloid = parseOptionalVolume(addedCrystalloidVolume)
    const removedFluid = parseOptionalVolume(removedFluidVolume)
    const hasTarget = hasOptionalValue(intraDesiredHct)
    const targetPercent = hasTarget ? parseStrictNumber(intraDesiredHct) : null
    const rbcHct = parseStrictNumber(rbcProductHct)
    const unitVolume = parseStrictNumber(rbcUnitVolume)

    if (
      weight === null ||
      coefficient === null ||
      prime === null ||
      currentHctPercent === null ||
      netVolumeChangeFromBase === null ||
      plannedRbc === null ||
      addedCrystalloid === null ||
      removedFluid === null ||
      (hasTarget && targetPercent === null) ||
      rbcHct === null ||
      unitVolume === null
    ) {
      return {
        status: "message",
        message: NUMERIC_ONLY_MESSAGE,
      }
    }

    if (
      !isPositiveNumericValue(weight) ||
      !isPositiveNumericValue(coefficient) ||
      !isPositiveNumericValue(prime) ||
      !isPercentNumericValue(currentHctPercent) ||
      !isNonNegativeNumericValue(plannedRbc) ||
      !isNonNegativeNumericValue(addedCrystalloid) ||
      !isNonNegativeNumericValue(removedFluid) ||
      (targetPercent !== null && !isPercentNumericValue(targetPercent)) ||
      !isFractionNumericValue(rbcHct) ||
      !isPositiveNumericValue(unitVolume)
    ) {
      return {
        status: "message",
        message: "Current Hct와 shared setup 값을 입력하면 intraoperative 결과가 표시됩니다.",
      }
    }

    const target = targetPercent === null ? null : targetPercent / 100
    if (target !== null && target >= rbcHct) {
      return { status: "message", message: "Intraoperative desired Hct는 RBC product Hct보다 낮아야 합니다." }
    }

    // Patient volume = Weight × Blood volume coefficient; Base volume = Patient volume + Prime volume.
    const patientVolume = weight * coefficient
    const baseVolume = patientVolume + prime
    // Current estimated total volume = Base volume + Net volume change from base.
    const currentTotalVolume = baseVolume + netVolumeChangeFromBase

    if (!isPositiveNumericValue(currentTotalVolume)) {
      return { status: "message", message: "Current estimated total volume이 0 이하입니다. net volume change를 확인해주세요." }
    }

    // Current RBC volume = Current estimated total volume × Current Hct / 100.
    // Current Hct already reflects prior dilution, transfusion, or hemoconcentration.
    const currentRbcVolume = currentTotalVolume * (currentHctPercent / 100)
    // New RBC volume = Current RBC volume + Planned RBC addition × RBC product Hct.
    const newRbcVolume = currentRbcVolume + plannedRbc * rbcHct
    // New total volume = Current estimated total volume + Planned RBC addition + Added crystalloid - Removed fluid.
    const newTotalVolume = currentTotalVolume + plannedRbc + addedCrystalloid - removedFluid

    if (!isPositiveNumericValue(newTotalVolume)) {
      return { status: "message", message: "New total volume이 0 이하입니다. planned volume을 확인해주세요." }
    }

    const predictedHct = (newRbcVolume / newTotalVolume) * 100
    if (!Number.isFinite(predictedHct) || predictedHct < 0 || predictedHct > 100) {
      return { status: "message", message: "Predicted Hct가 0-100% 범위를 벗어납니다. 입력값을 확인해주세요." }
    }

    const netVolumeChange = plannedRbc + addedCrystalloid - removedFluid

    // Target helper is optional. When entered, it uses the post-planned-change RBC/total volume as baseline.
    // RBC needed to target = max(0, (Target × New total volume - New RBC volume) / (RBC product Hct - Target)).
    const rbcNeededVolume = target === null ? null : Math.max(0, (target * newTotalVolume - newRbcVolume) / (rbcHct - target))
    const rbcNeededUnitCount = rbcNeededVolume === null ? null : rbcNeededVolume / unitVolume
    // Target total volume = New RBC volume / Target; Fluid adjustment to target = Target total volume - New total volume.
    const targetTotalVolume = target === null ? null : newRbcVolume / target
    const fluidAdjustmentToTarget = targetTotalVolume === null ? null : targetTotalVolume - newTotalVolume
    const fluidAdjustmentAction =
      fluidAdjustmentToTarget === null
        ? null
        : fluidAdjustmentToTarget < -FLUID_ADJUSTMENT_THRESHOLD_ML
          ? "remove"
          : fluidAdjustmentToTarget > FLUID_ADJUSTMENT_THRESHOLD_ML
            ? "add"
            : "none"

    return {
      status: "ready",
      currentHct: currentHctPercent,
      patientVolume,
      primeVolume: prime,
      baseVolume,
      netVolumeChangeFromBase,
      currentTotalVolume,
      currentRbcVolume,
      plannedRbcAddition: plannedRbc,
      addedCrystalloidVolume: addedCrystalloid,
      removedFluidVolume: removedFluid,
      netVolumeChange,
      newRbcVolume,
      newTotalVolume,
      predictedHct,
      hctDelta: predictedHct - currentHctPercent,
      desiredHct: target === null ? null : targetPercent,
      rbcNeededVolume,
      rbcNeededUnitCount,
      fluidAdjustmentToTarget,
      fluidAdjustmentAction,
    }
  }, [
    addedCrystalloidVolume,
    bloodVolumeCoefficient,
    currentHct,
    intraDesiredHct,
    intraNetVolumeChangeFromBase,
    plannedRbcAddition,
    primeVolume,
    rbcProductHct,
    rbcUnitVolume,
    removedFluidVolume,
    weightKg,
  ])

  const handlePresetChange = (presetId: string) => {
    const preset = PRIMING_VOLUME_PRESETS[Number.parseInt(presetId, 10)]
    setSelectedPresetId(presetId)
    setPrimeVolume(String(preset.primeVolumeMl))
  }

  const applyPreCpbHct = () => {
    if (preCpbResult.status !== "ready") return
    setCurrentHct(formatNumber(preCpbResult.desiredHct, 1))
  }

  const getFluidAdjustmentCopy = (value: number) => {
    if (value < -FLUID_ADJUSTMENT_THRESHOLD_ML) return { label: `Remove ${formatNumber(Math.abs(value))} mL`, tone: "blue" as const }
    if (value > FLUID_ADJUSTMENT_THRESHOLD_ML) return { label: `Add ${formatNumber(value)} mL`, tone: "green" as const }
    return { label: "No adjustment needed", tone: "green" as const }
  }

  const primeChip = selectedPreset ? getPresetLabel(selectedPreset) : primeVolume.trim() ? `${primeVolume} mL custom` : "Prime not set"
  const rbcProductHctNumber = parseStrictNumber(rbcProductHct)

  return (
    <div className="mx-auto w-full max-w-6xl p-3 md:p-4">
      <Card className="overflow-hidden border-green-100 bg-gradient-to-br from-white via-white to-green-50/60 shadow-lg dark:border-green-950/60 dark:from-card dark:via-card dark:to-green-950/20">
        <CardHeader className="border-b border-green-100/80 bg-green-50/70 pb-4 dark:border-green-950/70 dark:bg-green-950/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="text-2xl font-bold tracking-tight">Hct predict</CardTitle>
              <div className="text-sm font-semibold text-green-800 dark:text-green-200">PCS CPB Hct 예측</div>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Pre-CPB prime planning과 수술 중 volume balance에 따른 Hct 변화를 계산합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Badge variant="outline" className="bg-white/80 text-slate-700 dark:bg-background/50 dark:text-slate-200">
                PCS CPB
              </Badge>
              <Badge variant="outline" className="bg-white/80 text-slate-700 dark:bg-background/50 dark:text-slate-200">
                RBC-LF 1 unit = 200 mL
              </Badge>
              <Badge variant="outline" className="bg-white/80 text-slate-700 dark:bg-background/50 dark:text-slate-200">
                Prime preset included
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-3 md:p-5">
          <SectionCard
            title="Shared setup"
            icon={<HeartPulse className="h-4 w-4" />}
            description="Pre-CPB planning과 intraoperative simulation에서 공통으로 사용하는 값입니다."
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
              <InputBlock id="blood-weight" label="Weight kg" value={weightKg} onChange={setWeightKg} helperText="Enter number only, without kg." />
              <InputBlock
                id="blood-volume-coefficient"
                label="Blood volume coefficient mL/kg"
                value={bloodVolumeCoefficient}
                onChange={setBloodVolumeCoefficient}
                helperText="Enter number only."
              />
              <InputBlock id="pre-hct" label="Pre-Hct %" value={preHct} onChange={setPreHct} helperText="Enter number only, e.g. 30 for 30%." />
              <div className="space-y-1.5 md:col-span-3 xl:col-span-4">
                <Label htmlFor="tubing-set" className="flex min-h-6 items-end text-xs font-semibold tracking-wide text-muted-foreground">
                  Tubing set selector
                </Label>
                <Select value={selectedPresetId} onValueChange={handlePresetChange}>
                  <SelectTrigger id="tubing-set" className="h-10 w-full bg-background/80 text-left text-sm">
                    <SelectValue placeholder="Select institutional tubing set preset" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(92vw,760px)]">
                    {PRIMING_VOLUME_PRESETS.map((preset, index) => (
                      <SelectItem
                        key={`${preset.name}-${preset.oxygenator}-${preset.configuration}-${preset.primeVolumeMl}`}
                        value={String(index)}
                        className="whitespace-normal py-2"
                      >
                        {getPresetLabel(preset)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <InputBlock id="prime-volume" label="Prime volume mL" value={primeVolume} onChange={setPrimeVolume} helperText="Enter number only, without mL." />
              <InputBlock
                id="rbc-product-hct"
                label="RBC product Hct"
                value={rbcProductHct}
                onChange={setRbcProductHct}
                helperText="Enter as fraction, e.g. 0.66 for 66%."
              />
              <InputBlock
                id="rbc-unit-volume"
                label="RBC-LF unit volume mL/unit"
                value={rbcUnitVolume}
                onChange={setRbcUnitVolume}
                helperText="Department default: 200 mL/unit. Enter number only."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="bg-background/80">
                {primeSourceLabel}
              </Badge>
              {selectedPreset && <span className="text-muted-foreground">{getPresetLabel(selectedPreset)}</span>}
            </div>
            <p className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">
              Patient RBC volume은 Patient volume × Pre-Hct / 100으로만 계산합니다. Prime과 crystalloid는 RBC volume을 증가시키지 않습니다.
            </p>
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionCard
              title="Pre-CPB prime planning"
              icon={<FlaskConical className="h-4 w-4" />}
              description="목표 Hct를 맞추기 위해 prime에 섞을 RBC volume을 계산합니다."
            >
              <InputBlock
                id="pre-desired-hct"
                label="Desired Hct %"
                value={preDesiredHct}
                onChange={setPreDesiredHct}
                helperText="Enter number only, e.g. 30 for 30%."
              />

              {preCpbResult.status === "message" ? (
                <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                  <CardContent className="p-3 text-sm text-amber-900 dark:text-amber-100">{preCpbResult.message}</CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ResultCard
                      label="Expected Hct without RBC"
                      value={formatNumber(preCpbResult.expectedHctWithoutRbc, 1)}
                      unit="%"
                      tone={preCpbResult.expectedHctWithoutRbc >= preCpbResult.desiredHct ? "green" : "amber"}
                    />
                    <ResultCard
                      label="RBC to prime"
                      value={formatNumber(preCpbResult.rbcRequiredVolume)}
                      unit="mL"
                      tone={preCpbResult.rbcRequiredVolume > FLUID_ADJUSTMENT_THRESHOLD_ML ? "rose" : "green"}
                      detail={
                        <>
                          ≈ {formatNumber(preCpbResult.rbcUnitCount, 1)} unit<br />
                          Based on RBC-LF {rbcUnitVolume || "-"} mL/unit
                        </>
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/25 p-3 text-xs md:grid-cols-5">
                    <div>
                      <div className="text-muted-foreground">Patient volume</div>
                      <div className="font-semibold">{formatNumber(preCpbResult.patientVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Prime volume</div>
                      <div className="font-semibold">{formatNumber(preCpbResult.baseTotalVolume - preCpbResult.patientVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Base total volume</div>
                      <div className="font-semibold">{formatNumber(preCpbResult.baseTotalVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Patient RBC volume</div>
                      <div className="font-semibold">{formatNumber(preCpbResult.patientRbcVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Final volume after RBC</div>
                      <div className="font-semibold">{formatNumber(preCpbResult.estimatedFinalVolume)} mL</div>
                    </div>
                  </div>
                </>
              )}
            </SectionCard>

            <SectionCard
              title="Intraoperative Hct simulation"
              icon={<Droplets className="h-4 w-4" />}
              description="현재 Hct와 환자 volume + prime volume 대비 net volume 변화를 입력하세요. 현재 Hct에는 이전의 희석, 수혈, HF/UF에 의한 농축 효과가 이미 반영되어 있다고 간주합니다."
            >
              <p className="rounded-md bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">
                Enter the current Hct and the net volume change from patient volume + prime volume. The current Hct already reflects prior dilution, transfusion, or hemoconcentration.
              </p>

              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="bg-background/80">RBC product Hct: {formatPercentFromFraction(rbcProductHctNumber ?? Number.NaN)}%</Badge>
                <Badge variant="outline" className="bg-background/80">RBC-LF: {rbcUnitVolume || "-"} mL/unit</Badge>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current baseline</div>
                {intraoperativeResult.status === "ready" && (
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-muted/25 p-3 text-xs md:grid-cols-3">
                    <div>
                      <div className="text-muted-foreground">Patient volume</div>
                      <div className="font-semibold">{formatNumber(intraoperativeResult.patientVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Prime volume</div>
                      <div className="font-semibold">{formatNumber(intraoperativeResult.primeVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Base volume</div>
                      <div className="font-semibold">{formatNumber(intraoperativeResult.baseVolume)} mL</div>
                      <div className="text-muted-foreground">Patient {formatNumber(intraoperativeResult.patientVolume)} mL + Prime {formatNumber(intraoperativeResult.primeVolume)} mL</div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <InputBlock
                    id="current-hct"
                    label="Current Hct %"
                    value={currentHct}
                    onChange={setCurrentHct}
                    placeholder="0"
                    helperText="Enter current ABGA/lab Hct. It already reflects prior RBC, crystalloid, and HF/UF effects."
                  />
                  <InputBlock
                    id="intra-net-volume-change-from-base"
                    label="Net volume change from base mL"
                    value={intraNetVolumeChangeFromBase}
                    onChange={setIntraNetVolumeChangeFromBase}
                    placeholder="0"
                    helperText="환자 volume + prime volume 대비 현재 총 volume이 얼마나 늘거나 줄었는지 net 값으로 입력하세요. 증가하면 양수, 감소하면 음수입니다."
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Current estimated total volume = patient volume + prime volume + net volume change from base. 현재 총 volume = 환자 volume + prime volume + net volume 변화량입니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyPreCpbHct}
                    disabled={preCpbResult.status !== "ready"}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Use Pre-CPB Hct
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What-if planned changes</div>
                <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
                  <InputBlock
                    id="planned-rbc-addition"
                    label="Planned RBC addition mL"
                    value={plannedRbcAddition}
                    onChange={setPlannedRbcAddition}
                    placeholder="0"
                    helperText="Enter number only, without mL."
                  />
                  <InputBlock
                    id="added-crystalloid-volume"
                    label="Planned crystalloid addition mL"
                    value={addedCrystalloidVolume}
                    onChange={setAddedCrystalloidVolume}
                    placeholder="0"
                    helperText="Crystalloid / cardioplegia / test saline. Enter number only, without mL."
                  />
                  <InputBlock
                    id="removed-fluid-volume"
                    label="Planned HF/UF fluid removal mL"
                    value={removedFluidVolume}
                    onChange={setRemovedFluidVolume}
                    placeholder="0"
                    helperText="Treated as RBC-free fluid removal. Do not use for mixed whole blood removal."
                  />
                </div>
              </div>

              {intraoperativeResult.status === "message" ? (
                <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                  <CardContent className="p-3 text-sm text-amber-900 dark:text-amber-100">{intraoperativeResult.message}</CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ResultCard
                      label="Current estimated total volume"
                      value={formatNumber(intraoperativeResult.currentTotalVolume)}
                      unit="mL"
                      tone="blue"
                      detail={`Base ${formatNumber(intraoperativeResult.baseVolume)} mL + Net change ${formatSignedMl(intraoperativeResult.netVolumeChangeFromBase)}`}
                    />
                    <ResultCard
                      label="Current RBC volume"
                      value={formatNumber(intraoperativeResult.currentRbcVolume)}
                      unit="mL"
                      tone="slate"
                      detail="Current estimated total volume × Current Hct / 100"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What-if results</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <ResultCard
                        label="Predicted Hct"
                        value={formatNumber(intraoperativeResult.predictedHct, 1)}
                        unit="%"
                        tone={hasIntraoperativeTarget && intraoperativeResult.desiredHct !== null && intraoperativeResult.predictedHct >= intraoperativeResult.desiredHct ? "green" : "amber"}
                      />
                      <ResultCard
                        label="Hct delta"
                        value={`${intraoperativeResult.hctDelta >= 0 ? "+" : ""}${formatNumber(intraoperativeResult.hctDelta, 1)}`}
                        unit="%p"
                        tone={intraoperativeResult.hctDelta >= 0 ? "green" : "amber"}
                        detail="from current Hct"
                      />
                      <ResultCard
                        label="Net planned volume change"
                        value={formatSignedMl(intraoperativeResult.netVolumeChange)}
                        tone={getVolumeAction(intraoperativeResult.netVolumeChange) === "remove" ? "blue" : getVolumeAction(intraoperativeResult.netVolumeChange) === "add" ? "amber" : "slate"}
                        detail={`RBC +${formatNumber(intraoperativeResult.plannedRbcAddition)} · Crystalloid +${formatNumber(intraoperativeResult.addedCrystalloidVolume)} · HF/UF ${formatNumber(intraoperativeResult.removedFluidVolume)}`}
                      />
                      <ResultCard label="New total volume" value={formatNumber(intraoperativeResult.newTotalVolume)} unit="mL" tone="slate" />
                      <ResultCard label="New RBC volume" value={formatNumber(intraoperativeResult.newRbcVolume)} unit="mL" tone="slate" />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Target Hct helper</div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          RBC needed and fluid adjustment are separate options, not simultaneous instructions.
                        </p>
                      </div>
                      <div className="w-full md:w-56">
                        <InputBlock
                          id="intra-desired-hct"
                          label="Intraoperative desired Hct %"
                          value={intraDesiredHct}
                          onChange={setIntraDesiredHct}
                          placeholder="0"
                          helperText="Enter number only, e.g. 30 for 30%."
                        />
                      </div>
                    </div>

                    {!hasIntraoperativeTarget ? (
                      <Card className="border-border/70 bg-background/70 shadow-sm">
                        <CardContent className="p-3 text-sm text-muted-foreground">
                          Enter target Hct to estimate RBC or HF/UF adjustment.
                        </CardContent>
                      </Card>
                    ) : intraoperativeResult.desiredHct !== null &&
                      intraoperativeResult.rbcNeededVolume !== null &&
                      intraoperativeResult.rbcNeededUnitCount !== null &&
                      intraoperativeResult.fluidAdjustmentToTarget !== null ? (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <ResultCard
                          label="RBC needed to target"
                          value={intraoperativeResult.rbcNeededVolume <= FLUID_ADJUSTMENT_THRESHOLD_ML ? "No RBC required" : formatNumber(intraoperativeResult.rbcNeededVolume)}
                          unit={intraoperativeResult.rbcNeededVolume <= FLUID_ADJUSTMENT_THRESHOLD_ML ? undefined : "mL"}
                          tone={intraoperativeResult.rbcNeededVolume > FLUID_ADJUSTMENT_THRESHOLD_ML ? "rose" : "green"}
                          detail={
                            <>
                              ≈ {formatNumber(intraoperativeResult.rbcNeededUnitCount, 1)} unit<br />
                              Based on RBC-LF {rbcUnitVolume || "-"} mL/unit
                            </>
                          }
                        />
                        <ResultCard
                          label="Fluid adjustment to target"
                          value={getFluidAdjustmentCopy(intraoperativeResult.fluidAdjustmentToTarget).label}
                          tone={getFluidAdjustmentCopy(intraoperativeResult.fluidAdjustmentToTarget).tone}
                          detail={`Target Hct ${formatNumber(intraoperativeResult.desiredHct, 1)}%`}
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </SectionCard>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
