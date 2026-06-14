"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Droplets, FlaskConical, HeartPulse, MinusCircle, PlusCircle, Syringe } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CALCULATOR_STORAGE_KEY = "cpbuassistant:bloodHemodilutionCalculator"
const PRIME_VOLUME_STORAGE_KEY = "cpbuassistant:bloodHemodilutionPrimeVolume"
const CURRENT_ESTIMATED_TOTAL_VOLUME_STORAGE_KEY = "cpbuassistant:bloodHemodilutionCurrentEstimatedTotalVolume"
const CURRENT_TOTAL_VOLUME_EDITED_STORAGE_KEY = "cpbuassistant:bloodHemodilutionCurrentTotalVolumeEdited"
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

const parseOptionalVolume = (value: string) => (value.trim() === "" ? 0 : parseStrictNumber(value))
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
type CalculationResult =
  | {
      status: "ready"
      patientVolume: number
      patientRbcVolume: number
      totalVolume: number
      expectedHct: number
      desiredHct: number
      rbcProductHct: number
      rbcUnitVolume: number
      addedCrystalloidVolume: number
      removedFluidVolume: number
      netIntraoperativeVolume: number
      currentReservoirLevel: number | null
      projectedReservoirAfterBalance: number | null
      balanceReservoirWarning: string | null
      rbcTransfusionVolume: number
      rbcUnitCount: number
      fluidAdjustmentVolume: number
      projectedReservoirAfterTargetAdjustment: number | null
      targetReservoirWarning: string | null
      targetProgress: number
      expectedHctAtTarget: boolean
      fluidAdjustmentAction: "remove" | "add" | "none"
    }
  | {
      status: "message"
      message: string
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
  currentHct?: string
  currentEstimatedTotalVolume?: string
  currentReservoirLevel?: string
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
      projectedReservoirLevel: number | null
      projectedReservoirAfterTarget: number | null
      reservoirWarning: string | null
      targetReservoirWarning: string | null
    }
  | { status: "message"; message: string }

const InputBlock = ({
  id,
  label,
  value,
  onChange,
  helperText,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  helperText?: string
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
  const [currentEstimatedTotalVolume, setCurrentEstimatedTotalVolume] = useState("")
  const [currentReservoirLevel, setCurrentReservoirLevel] = useState("")
  const [plannedRbcAddition, setPlannedRbcAddition] = useState("0")
  const [addedCrystalloidVolume, setAddedCrystalloidVolume] = useState("0")
  const [removedFluidVolume, setRemovedFluidVolume] = useState("0")
  const [intraDesiredHct, setIntraDesiredHct] = useState("")
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false)
  const [currentTotalVolumeEdited, setCurrentTotalVolumeEdited] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const savedState = safeLocalStorageGetItem(CALCULATOR_STORAGE_KEY)
      const savedCurrentVolume = safeLocalStorageGetItem(CURRENT_ESTIMATED_TOTAL_VOLUME_STORAGE_KEY)
      const savedCurrentVolumeEdited = safeLocalStorageGetItem(CURRENT_TOTAL_VOLUME_EDITED_STORAGE_KEY)

      if (savedState) {
        const parsedState = JSON.parse(savedState) as StoredCalculatorState
        const restoredCurrentVolume = savedCurrentVolume ?? parsedState.currentEstimatedTotalVolume ?? ""

        setWeightKg(parsedState.weightKg ?? "")
        setBloodVolumeCoefficient(defaultIfBlank(parsedState.bloodVolumeCoefficient, DEFAULT_BLOOD_VOLUME_COEFFICIENT))
        setSelectedPresetId(parsedState.selectedPresetId ?? "")
        setPrimeVolume(parsedState.primeVolume ?? safeLocalStorageGetItem(PRIME_VOLUME_STORAGE_KEY) ?? "")
        setPreHct(parsedState.preHct ?? "")
        setPreDesiredHct(parsedState.preDesiredHct ?? "")
        setRbcProductHct(defaultIfBlank(parsedState.rbcProductHct, DEFAULT_RBC_PRODUCT_HCT))
        setRbcUnitVolume(defaultIfBlank(parsedState.rbcUnitVolume, DEFAULT_RBC_UNIT_VOLUME))
        setCurrentHct(parsedState.currentHct ?? "")
        setCurrentEstimatedTotalVolume(restoredCurrentVolume)
        setCurrentTotalVolumeEdited(savedCurrentVolumeEdited === "true" || Boolean(restoredCurrentVolume.trim()))
        setCurrentReservoirLevel(parsedState.currentReservoirLevel ?? "")
        setPlannedRbcAddition(parsedState.plannedRbcAddition ?? "0")
        setAddedCrystalloidVolume(parsedState.addedCrystalloidVolume ?? "0")
        setRemovedFluidVolume(parsedState.removedFluidVolume ?? "0")
        setIntraDesiredHct(parsedState.intraDesiredHct ?? "")
      } else {
        const restoredCurrentVolume = savedCurrentVolume ?? ""
        setPrimeVolume(safeLocalStorageGetItem(PRIME_VOLUME_STORAGE_KEY) ?? "")
        setCurrentEstimatedTotalVolume(restoredCurrentVolume)
        setCurrentTotalVolumeEdited(savedCurrentVolumeEdited === "true" || Boolean(restoredCurrentVolume.trim()))
      }
    } catch {
      safeLocalStorageRemoveItem(CALCULATOR_STORAGE_KEY)
      safeLocalStorageRemoveItem(PRIME_VOLUME_STORAGE_KEY)
      safeLocalStorageRemoveItem(CURRENT_ESTIMATED_TOTAL_VOLUME_STORAGE_KEY)
      safeLocalStorageRemoveItem(CURRENT_TOTAL_VOLUME_EDITED_STORAGE_KEY)
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
      currentHct,
      currentEstimatedTotalVolume,
      currentReservoirLevel,
      plannedRbcAddition,
      addedCrystalloidVolume,
      removedFluidVolume,
      intraDesiredHct,
    }

    safeLocalStorageSetItem(CALCULATOR_STORAGE_KEY, JSON.stringify(stateToSave))
  }, [
    addedCrystalloidVolume,
    bloodVolumeCoefficient,
    currentEstimatedTotalVolume,
    currentHct,
    currentReservoirLevel,
    hasLoadedSavedState,
    intraDesiredHct,
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

  useEffect(() => {
    if (!hasLoadedSavedState || typeof window === "undefined") return

    if (currentEstimatedTotalVolume.trim() === "") {
      safeLocalStorageRemoveItem(CURRENT_ESTIMATED_TOTAL_VOLUME_STORAGE_KEY)
      return
    }

    safeLocalStorageSetItem(CURRENT_ESTIMATED_TOTAL_VOLUME_STORAGE_KEY, currentEstimatedTotalVolume)
  }, [currentEstimatedTotalVolume, hasLoadedSavedState])

  useEffect(() => {
    if (!hasLoadedSavedState || typeof window === "undefined") return

    safeLocalStorageSetItem(
      CURRENT_TOTAL_VOLUME_EDITED_STORAGE_KEY,
      currentTotalVolumeEdited ? "true" : "false",
    )
  }, [currentTotalVolumeEdited, hasLoadedSavedState])

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

  const preCpbEstimatedFinalVolume = preCpbResult.status === "ready" ? preCpbResult.estimatedFinalVolume : null

  useEffect(() => {
    if (preCpbEstimatedFinalVolume === null || currentTotalVolumeEdited) return

    setCurrentEstimatedTotalVolume(String(Math.round(preCpbEstimatedFinalVolume)))
  }, [currentTotalVolumeEdited, preCpbEstimatedFinalVolume])

  const hasIntraoperativeTarget = hasOptionalValue(intraDesiredHct)

  const intraoperativeResult = useMemo<IntraoperativeResult>(() => {
    const currentTotalVolume = parseStrictNumber(currentEstimatedTotalVolume)
    const currentHctPercent = parseStrictNumber(currentHct)
    const plannedRbc = parseOptionalVolume(plannedRbcAddition)
    const addedCrystalloid = parseOptionalVolume(addedCrystalloidVolume)
    const removedFluid = parseOptionalVolume(removedFluidVolume)
    const hasTarget = hasOptionalValue(intraDesiredHct)
    const targetPercent = hasTarget ? parseStrictNumber(intraDesiredHct) : null
    const rbcHct = parseStrictNumber(rbcProductHct)
    const unitVolume = parseStrictNumber(rbcUnitVolume)
    const hasReservoirLevel = hasOptionalValue(currentReservoirLevel)
    const reservoirLevel = hasReservoirLevel ? parseStrictNumber(currentReservoirLevel) : null

    if (
      currentTotalVolume === null ||
      currentHctPercent === null ||
      plannedRbc === null ||
      addedCrystalloid === null ||
      removedFluid === null ||
      (hasTarget && targetPercent === null) ||
      rbcHct === null ||
      unitVolume === null ||
      (hasReservoirLevel && reservoirLevel === null)
    ) {
      return {
        status: "message",
        message: NUMERIC_ONLY_MESSAGE,
      }
    }

    if (
      !isPositiveNumericValue(currentTotalVolume) ||
      !isPercentNumericValue(currentHctPercent) ||
      !isNonNegativeNumericValue(plannedRbc) ||
      !isNonNegativeNumericValue(addedCrystalloid) ||
      !isNonNegativeNumericValue(removedFluid) ||
      (targetPercent !== null && !isPercentNumericValue(targetPercent)) ||
      !isFractionNumericValue(rbcHct) ||
      !isPositiveNumericValue(unitVolume) ||
      (reservoirLevel !== null && !isNonNegativeNumericValue(reservoirLevel))
    ) {
      return {
        status: "message",
        message: "Current Hct와 current total volume을 입력하면 intraoperative 결과가 표시됩니다.",
      }
    }

    const target = targetPercent === null ? null : targetPercent / 100
    if (target !== null && target >= rbcHct) {
      return { status: "message", message: "Intraoperative desired Hct는 RBC product Hct보다 낮아야 합니다." }
    }

    // Current RBC volume = Current estimated total volume × Current Hct / 100
    const currentRbcVolume = currentTotalVolume * (currentHctPercent / 100)
    // New RBC volume = Current RBC volume + Planned RBC addition × RBC product Hct
    const newRbcVolume = currentRbcVolume + plannedRbc * rbcHct
    // New total volume = Current estimated total volume + Planned RBC addition + Added crystalloid - Removed fluid
    const newTotalVolume = currentTotalVolume + plannedRbc + addedCrystalloid - removedFluid

    if (!isPositiveNumericValue(newTotalVolume)) {
      return { status: "message", message: "New total volume이 0 이하입니다. planned volume을 확인해주세요." }
    }

    const predictedHct = (newRbcVolume / newTotalVolume) * 100
    if (!Number.isFinite(predictedHct) || predictedHct < 0 || predictedHct > 100) {
      return { status: "message", message: "Predicted Hct가 0-100% 범위를 벗어납니다. 입력값을 확인해주세요." }
    }

    const netVolumeChange = plannedRbc + addedCrystalloid - removedFluid
    // Projected reservoir is an operational reference only:
    // Current reservoir level + Planned RBC addition + Added crystalloid - Removed fluid.
    // It is not included in the Hct denominator.
    const projectedReservoirLevel = reservoirLevel === null ? null : reservoirLevel + netVolumeChange
    const reservoirWarning =
      projectedReservoirLevel !== null && projectedReservoirLevel <= 0
        ? "Projected reservoir may be too low. Recheck circuit volume before removal."
        : null

    // Target helper is optional. When entered, it uses the post-planned-change RBC/total volume as baseline.
    const rbcNeededVolume = target === null ? null : Math.max(0, (target * newTotalVolume - newRbcVolume) / (rbcHct - target))
    const rbcNeededUnitCount = rbcNeededVolume === null ? null : rbcNeededVolume / unitVolume
    // Target total volume = New RBC volume / Target; Fluid adjustment to target = Target total volume - New total volume
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
    // Shows the operational reservoir estimate after target fluid adjustment only.
    // This value is not fed back into Hct calculation.
    const projectedReservoirAfterTarget =
      projectedReservoirLevel === null || fluidAdjustmentToTarget === null ? null : projectedReservoirLevel + fluidAdjustmentToTarget
    const targetReservoirWarning =
      projectedReservoirAfterTarget !== null && projectedReservoirAfterTarget <= 0
        ? "Projected reservoir may be too low. Recheck circuit volume before removal."
        : null

    return {
      status: "ready",
      currentHct: currentHctPercent,
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
      projectedReservoirLevel,
      projectedReservoirAfterTarget,
      reservoirWarning,
      targetReservoirWarning,
    }
  }, [
    addedCrystalloidVolume,
    currentEstimatedTotalVolume,
    currentHct,
    currentReservoirLevel,
    intraDesiredHct,
    plannedRbcAddition,
    rbcProductHct,
    rbcUnitVolume,
    removedFluidVolume,
  ])

  const handlePresetChange = (presetId: string) => {
    const preset = PRIMING_VOLUME_PRESETS[Number.parseInt(presetId, 10)]
    setSelectedPresetId(presetId)
    setPrimeVolume(String(preset.primeVolumeMl))
  }

  const handleCurrentVolumeChange = (value: string) => {
    setCurrentTotalVolumeEdited(true)
    setCurrentEstimatedTotalVolume(value)
  }

  const applyPreCpbVolume = () => {
    if (preCpbResult.status !== "ready") return
    setCurrentEstimatedTotalVolume(String(Math.round(preCpbResult.estimatedFinalVolume)))
    setCurrentTotalVolumeEdited(false)
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
              description="현재 Hct와 수술 중 planned volume change를 입력해 예상 Hct를 계산합니다."
            >
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="bg-background/80">Weight: {weightKg || "-"} kg</Badge>
                <Badge variant="outline" className="max-w-full bg-background/80">Prime: {primeChip}</Badge>
                <Badge variant="outline" className="bg-background/80">
                  Pre-CPB final volume: {preCpbResult.status === "ready" ? `${formatNumber(preCpbResult.estimatedFinalVolume)} mL` : "-"}
                </Badge>
                <Badge variant="outline" className="bg-background/80">RBC product Hct: {formatPercentFromFraction(rbcProductHctNumber ?? Number.NaN)}%</Badge>
                <Badge variant="outline" className="bg-background/80">RBC-LF: {rbcUnitVolume || "-"} mL/unit</Badge>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current baseline</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <InputBlock
                    id="current-hct"
                    label="Current Hct %"
                    value={currentHct}
                    onChange={setCurrentHct}
                    helperText="Enter number only, e.g. 30 for 30%."
                  />
                  <InputBlock
                    id="current-estimated-volume"
                    label="Current estimated total volume mL"
                    value={currentEstimatedTotalVolume}
                    onChange={handleCurrentVolumeChange}
                    helperText={
                      currentTotalVolumeEdited
                        ? "Edit this if crystalloid, RBC, UF, sampling, or circuit volume has changed during CPB."
                        : "Auto-filled from Pre-CPB estimate. Edit this if crystalloid, RBC, UF, sampling, or circuit volume has changed during CPB."
                    }
                  />
                  <InputBlock
                    id="current-reservoir-level"
                    label="Current reservoir level mL"
                    value={currentReservoirLevel}
                    onChange={setCurrentReservoirLevel}
                    helperText="Optional. Used only to estimate projected reservoir level after planned volume changes. Not added to total volume."
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyPreCpbHct}
                  disabled={preCpbResult.status !== "ready"}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use Pre-CPB Hct
                </button>
                <button
                  type="button"
                  onClick={applyPreCpbVolume}
                  disabled={preCpbResult.status !== "ready"}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use Pre-CPB estimate
                </button>
                <Badge variant="outline" className="bg-background/80 text-xs">
                  {currentTotalVolumeEdited ? "Manual intraoperative volume" : "Auto-filled from Pre-CPB estimate"}
                </Badge>
              </div>
              <p className="rounded-md bg-muted/30 p-2 text-xs leading-relaxed text-muted-foreground">
                Current estimated total volume is the Hct denominator. Reservoir level is an operational reference only and is not added to the Hct denominator.
              </p>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What-if planned changes</div>
                <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
                  <InputBlock
                    id="planned-rbc-addition"
                    label="Planned RBC addition mL"
                    value={plannedRbcAddition}
                    onChange={setPlannedRbcAddition}
                    helperText="Enter number only, without mL."
                  />
                  <InputBlock
                    id="added-crystalloid-volume"
                    label="Added crystalloid mL"
                    value={addedCrystalloidVolume}
                    onChange={setAddedCrystalloidVolume}
                    helperText="Enter number only, without mL."
                  />
                  <InputBlock
                    id="removed-fluid-volume"
                    label="Removed fluid mL"
                    value={removedFluidVolume}
                    onChange={setRemovedFluidVolume}
                    helperText="UF / hemoconcentration only. Not mixed whole blood removal. Enter number only, without mL."
                  />
                </div>
              </div>

              {intraoperativeResult.status === "message" ? (
                <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                  <CardContent className="p-3 text-sm text-amber-900 dark:text-amber-100">{intraoperativeResult.message}</CardContent>
                </Card>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What-if results</div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                        label="Net volume balance"
                        value={formatSignedMl(intraoperativeResult.netVolumeChange)}
                        tone={getVolumeAction(intraoperativeResult.netVolumeChange) === "remove" ? "blue" : getVolumeAction(intraoperativeResult.netVolumeChange) === "add" ? "amber" : "slate"}
                        detail={`RBC +${formatNumber(intraoperativeResult.plannedRbcAddition)} · Crystalloid +${formatNumber(intraoperativeResult.addedCrystalloidVolume)} · Removed ${formatNumber(intraoperativeResult.removedFluidVolume)}`}
                      />
                      {intraoperativeResult.projectedReservoirLevel !== null && (
                        <ResultCard
                          label="Projected reservoir"
                          value={formatNumber(intraoperativeResult.projectedReservoirLevel)}
                          unit="mL"
                          tone={intraoperativeResult.projectedReservoirLevel <= 0 ? "amber" : "blue"}
                          detail="Operational reference only. Not included in Hct denominator."
                        />
                      )}
                    </div>
                  </div>
                  {intraoperativeResult.reservoirWarning && (
                    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{intraoperativeResult.reservoirWarning}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/25 p-3 text-xs md:grid-cols-4">
                    <div>
                      <div className="text-muted-foreground">Current RBC volume</div>
                      <div className="font-semibold">{formatNumber(intraoperativeResult.currentRbcVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">New total volume</div>
                      <div className="font-semibold">{formatNumber(intraoperativeResult.newTotalVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">New RBC volume</div>
                      <div className="font-semibold">{formatNumber(intraoperativeResult.newRbcVolume)} mL</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Projected reservoir</div>
                      <div className="font-semibold">
                        {intraoperativeResult.projectedReservoirLevel === null
                          ? "Enter reservoir level to estimate"
                          : `${formatNumber(intraoperativeResult.projectedReservoirLevel)} mL`}
                      </div>
                      <div className="text-muted-foreground">Operational reference only</div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Target helper</div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Optional target. If entered, the calculator estimates RBC needed or fluid adjustment needed to reach this Hct.
                          Reservoir projection remains an operational reference only.
                        </p>
                      </div>
                      <div className="w-full md:w-56">
                        <InputBlock
                          id="intra-desired-hct"
                          label="Intraoperative desired Hct %"
                          value={intraDesiredHct}
                          onChange={setIntraDesiredHct}
                          helperText="Enter number only, e.g. 30 for 30%."
                        />
                      </div>
                    </div>

                    {!hasIntraoperativeTarget ? (
                      <Card className="border-border/70 bg-background/70 shadow-sm">
                        <CardContent className="p-3 text-sm text-muted-foreground">
                          Enter intraoperative target Hct to calculate RBC or fluid adjustment needed.
                        </CardContent>
                      </Card>
                    ) : intraoperativeResult.desiredHct !== null &&
                      intraoperativeResult.rbcNeededVolume !== null &&
                      intraoperativeResult.rbcNeededUnitCount !== null &&
                      intraoperativeResult.fluidAdjustmentToTarget !== null ? (
                      <>
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
                            detail={
                              <>
                                Target Hct {formatNumber(intraoperativeResult.desiredHct, 1)}%
                                {intraoperativeResult.projectedReservoirAfterTarget !== null && (
                                  <>
                                    <br />Projected reservoir after target adjustment: {formatNumber(intraoperativeResult.projectedReservoirAfterTarget)} mL
                                    <br />Not included in Hct denominator.
                                  </>
                                )}
                              </>
                            }
                          />
                        </div>
                        {intraoperativeResult.targetReservoirWarning && (
                          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{intraoperativeResult.targetReservoirWarning}</span>
                          </div>
                        )}
                      </>
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
