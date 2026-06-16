"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Droplets, FlaskConical, HeartPulse } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CALCULATOR_STORAGE_KEY = "cpbuassistant:bloodHemodilutionCalculator"
const PRIME_VOLUME_STORAGE_KEY = "cpbuassistant:bloodHemodilutionPrimeVolume"
const LEGACY_CURRENT_ESTIMATED_TOTAL_VOLUME_STORAGE_KEY = "cpbuassistant:bloodHemodilutionCurrentEstimatedTotalVolume"
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

const normalizeStoredNumericString = (value: unknown, allowSigned = false): string | null => {
  if (value === null || value === undefined) return null

  const stringValue = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : ""
  if (stringValue === "") return null

  const numericValue = allowSigned ? parseStrictSignedNumber(stringValue) : parseStrictNumber(stringValue)
  return numericValue === null ? null : stringValue
}

const formatInputNumber = (value: number) => {
  if (!Number.isFinite(value)) return ""
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(2)))
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
  weightKg?: string | number
  bloodVolumeCoefficient?: string | number
  selectedPresetId?: string
  primeVolume?: string | number
  preHct?: string | number
  preDesiredHct?: string | number
  rbcProductHct?: string | number
  rbcUnitVolume?: string | number
  intraCurrentHct?: string | number
  intraNetVolumeChangeFromBase?: string | number
  plannedRbcAddition?: string | number
  addedCrystalloidVolume?: string | number
  removedFluidVolume?: string | number
  intraDesiredHct?: string | number
  currentHct?: string | number
  currentEstimatedTotalVolume?: string | number
}

const getMigratedIntraoperativeValues = (
  parsedState: StoredCalculatorState,
  savedPrimeVolume: string | null,
  legacyCurrentVolume: string | null,
) => {
  const migratedCurrentHct =
    normalizeStoredNumericString(parsedState.intraCurrentHct) ?? normalizeStoredNumericString(parsedState.currentHct) ?? ""

  const savedNetVolumeChange = normalizeStoredNumericString(parsedState.intraNetVolumeChangeFromBase, true)
  const legacyCurrentTotalVolume =
    normalizeStoredNumericString(parsedState.currentEstimatedTotalVolume) ?? normalizeStoredNumericString(legacyCurrentVolume)

  if (savedNetVolumeChange !== null) {
    return {
      currentHct: migratedCurrentHct,
      netVolumeChangeFromBase: savedNetVolumeChange,
      legacyCurrentEstimatedTotalVolumeToPreserve: null,
    }
  }
  const weight = parseStrictNumber(normalizeStoredNumericString(parsedState.weightKg) ?? "")
  const coefficient = parseStrictNumber(
    normalizeStoredNumericString(parsedState.bloodVolumeCoefficient) ?? DEFAULT_BLOOD_VOLUME_COEFFICIENT,
  )
  const prime = parseStrictNumber(normalizeStoredNumericString(parsedState.primeVolume) ?? normalizeStoredNumericString(savedPrimeVolume) ?? "")

  // Legacy migration uses the same base definition as intraoperative calculation:
  // Base volume = Weight × Blood volume coefficient + Prime volume.
  if (legacyCurrentTotalVolume === null || weight === null || coefficient === null || prime === null) {
    return {
      currentHct: migratedCurrentHct,
      netVolumeChangeFromBase: "",
      legacyCurrentEstimatedTotalVolumeToPreserve: legacyCurrentTotalVolume,
    }
  }

  const legacyTotal = parseStrictNumber(legacyCurrentTotalVolume)
  const baseVolume = weight * coefficient + prime
  if (legacyTotal === null || !isPositiveNumericValue(baseVolume)) {
    return {
      currentHct: migratedCurrentHct,
      netVolumeChangeFromBase: "",
      legacyCurrentEstimatedTotalVolumeToPreserve: legacyCurrentTotalVolume,
    }
  }

  return {
    currentHct: migratedCurrentHct,
    netVolumeChangeFromBase: formatInputNumber(legacyTotal - baseVolume),
    legacyCurrentEstimatedTotalVolumeToPreserve: null,
  }
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
      volumeNeutralRbcVolume: number | null
      volumeNeutralRbcUnitCount: number | null
      volumeNeutralFinalVolume: number | null
      volumeNeutralExpectedHct: number | null
      rbcOnlyVolume: number | null
      rbcOnlyUnitCount: number | null
      rbcOnlyFinalVolume: number | null
      rbcOnlyExpectedHct: number | null
      fluidAdjustmentToTarget: number | null
      fluidAdjustmentFinalVolume: number | null
      fluidAdjustmentExpectedHct: number | null
      fluidAdjustmentAction: "remove" | "add" | "none" | null
      whatIfScenario: string | null
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
  const legacyCurrentVolumeToPreserveRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const savedState = safeLocalStorageGetItem(CALCULATOR_STORAGE_KEY)
      const savedPrimeVolume = safeLocalStorageGetItem(PRIME_VOLUME_STORAGE_KEY)
      const legacyCurrentVolume = safeLocalStorageGetItem(LEGACY_CURRENT_ESTIMATED_TOTAL_VOLUME_STORAGE_KEY)

      if (savedState) {
        const parsedState = JSON.parse(savedState) as StoredCalculatorState
        const migratedIntraoperativeValues = getMigratedIntraoperativeValues(parsedState, savedPrimeVolume, legacyCurrentVolume)
        legacyCurrentVolumeToPreserveRef.current = migratedIntraoperativeValues.legacyCurrentEstimatedTotalVolumeToPreserve

        setWeightKg(normalizeStoredNumericString(parsedState.weightKg) ?? "")
        setBloodVolumeCoefficient(
          defaultIfBlank(normalizeStoredNumericString(parsedState.bloodVolumeCoefficient), DEFAULT_BLOOD_VOLUME_COEFFICIENT),
        )
        setSelectedPresetId(parsedState.selectedPresetId ?? "")
        setPrimeVolume(normalizeStoredNumericString(parsedState.primeVolume) ?? normalizeStoredNumericString(savedPrimeVolume) ?? "")
        setPreHct(normalizeStoredNumericString(parsedState.preHct) ?? "")
        setPreDesiredHct(normalizeStoredNumericString(parsedState.preDesiredHct) ?? "")
        setRbcProductHct(defaultIfBlank(normalizeStoredNumericString(parsedState.rbcProductHct), DEFAULT_RBC_PRODUCT_HCT))
        setRbcUnitVolume(defaultIfBlank(normalizeStoredNumericString(parsedState.rbcUnitVolume), DEFAULT_RBC_UNIT_VOLUME))
        setCurrentHct(migratedIntraoperativeValues.currentHct)
        setIntraNetVolumeChangeFromBase(migratedIntraoperativeValues.netVolumeChangeFromBase)
        setPlannedRbcAddition(normalizeStoredNumericString(parsedState.plannedRbcAddition) ?? "")
        setAddedCrystalloidVolume(normalizeStoredNumericString(parsedState.addedCrystalloidVolume) ?? "")
        setRemovedFluidVolume(normalizeStoredNumericString(parsedState.removedFluidVolume) ?? "")
        setIntraDesiredHct(normalizeStoredNumericString(parsedState.intraDesiredHct) ?? "")
      } else {
        legacyCurrentVolumeToPreserveRef.current = normalizeStoredNumericString(legacyCurrentVolume)
        setPrimeVolume(normalizeStoredNumericString(savedPrimeVolume) ?? "")
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

    if (intraNetVolumeChangeFromBase.trim() === "" && legacyCurrentVolumeToPreserveRef.current !== null) {
      stateToSave.currentEstimatedTotalVolume = legacyCurrentVolumeToPreserveRef.current
    } else {
      legacyCurrentVolumeToPreserveRef.current = null
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

    // Target helper is optional and uses the current baseline only.
    // It is intentionally separate from what-if planned changes/results.
    // Option A: volume-neutral RBC + HF = max(0, (Target × Current total volume - Current RBC volume) / RBC product Hct).
    // The same net volume is suggested for HF/UF removal, so final total volume remains approximately currentTotalVolume.
    const volumeNeutralRbcVolume = target === null ? null : Math.max(0, (target * currentTotalVolume - currentRbcVolume) / rbcHct)
    const volumeNeutralRbcUnitCount = volumeNeutralRbcVolume === null ? null : volumeNeutralRbcVolume / unitVolume
    const volumeNeutralFinalVolume = volumeNeutralRbcVolume === null ? null : currentTotalVolume
    const volumeNeutralExpectedHct =
      volumeNeutralRbcVolume === null ? null : ((currentRbcVolume + volumeNeutralRbcVolume * rbcHct) / currentTotalVolume) * 100

    // Option B: RBC only without HF = max(0, (Target × Current total volume - Current RBC volume) / (RBC product Hct - Target)).
    // The full pRBC product volume is added to the circuit total volume.
    const rbcOnlyVolume = target === null ? null : Math.max(0, (target * currentTotalVolume - currentRbcVolume) / (rbcHct - target))
    const rbcOnlyUnitCount = rbcOnlyVolume === null ? null : rbcOnlyVolume / unitVolume
    const rbcOnlyFinalVolume = rbcOnlyVolume === null ? null : currentTotalVolume + rbcOnlyVolume
    const rbcOnlyExpectedHct =
      rbcOnlyVolume === null || rbcOnlyFinalVolume === null
        ? null
        : ((currentRbcVolume + rbcOnlyVolume * rbcHct) / rbcOnlyFinalVolume) * 100

    // Option C: fluid-only adjustment. Target total volume = Current RBC volume / Target.
    // Fluid adjustment = Target total volume - Current total volume; negative means HF/UF removal.
    const targetTotalVolume = target === null ? null : currentRbcVolume / target
    const fluidAdjustmentToTarget = targetTotalVolume === null ? null : targetTotalVolume - currentTotalVolume
    const fluidAdjustmentFinalVolume = targetTotalVolume
    const fluidAdjustmentExpectedHct = targetTotalVolume === null ? null : (currentRbcVolume / targetTotalVolume) * 100
    const fluidAdjustmentAction =
      fluidAdjustmentToTarget === null
        ? null
        : fluidAdjustmentToTarget < -FLUID_ADJUSTMENT_THRESHOLD_ML
          ? "remove"
          : fluidAdjustmentToTarget > FLUID_ADJUSTMENT_THRESHOLD_ML
            ? "add"
            : "none"

    const volumeNeutralTolerance = Math.max(5, plannedRbc * 0.05, removedFluid * 0.05)
    const whatIfScenario =
      plannedRbc > 0 && removedFluid === 0
        ? "RBC-only scenario: pRBC 전체 volume이 total volume에 추가됩니다."
        : plannedRbc > 0 && Math.abs(removedFluid - plannedRbc) <= volumeNeutralTolerance
          ? "Volume-neutral scenario: RBC 추가량과 HF/UF 제거량이 비슷하여 total volume이 거의 유지됩니다."
          : removedFluid > plannedRbc + addedCrystalloid
            ? "Net volume removal scenario: total volume이 감소하여 Hct가 더 상승할 수 있습니다."
            : addedCrystalloid >= Math.max(50, plannedRbc + removedFluid)
              ? "Net dilution scenario: crystalloid addition으로 Hct가 낮아질 수 있습니다."
              : null

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
      volumeNeutralRbcVolume,
      volumeNeutralRbcUnitCount,
      volumeNeutralFinalVolume,
      volumeNeutralExpectedHct,
      rbcOnlyVolume,
      rbcOnlyUnitCount,
      rbcOnlyFinalVolume,
      rbcOnlyExpectedHct,
      fluidAdjustmentToTarget,
      fluidAdjustmentFinalVolume,
      fluidAdjustmentExpectedHct,
      fluidAdjustmentAction,
      whatIfScenario,
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
                Pre-CPB prime planning과 수술 중 Hct 변화를 계산합니다.
              </p>
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
              <InputBlock id="blood-weight" label="Weight kg" value={weightKg} onChange={setWeightKg} />
              <InputBlock
                id="blood-volume-coefficient"
                label="Blood volume coefficient mL/kg"
                value={bloodVolumeCoefficient}
                onChange={setBloodVolumeCoefficient}
              />
              <InputBlock id="pre-hct" label="Pre-Hct %" value={preHct} onChange={setPreHct} />
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
              <InputBlock id="prime-volume" label="Prime volume mL" value={primeVolume} onChange={setPrimeVolume} />
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
                helperText="Department default: 200 mL/unit."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="bg-background/80">
                {primeSourceLabel}
              </Badge>
              {selectedPreset && <span className="text-muted-foreground">{getPresetLabel(selectedPreset)}</span>}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-4">
            <SectionCard
              title="Pre-CPB prime planning"
              icon={<FlaskConical className="h-4 w-4" />}
              description="목표 Hct를 맞추기 위해 prime에 섞을 RBC volume을 계산합니다."
            >
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(180px,220px)_1fr] lg:items-start">
                <InputBlock
                  id="pre-desired-hct"
                  label="Desired Hct %"
                  value={preDesiredHct}
                  onChange={setPreDesiredHct}
                />

                <div className="space-y-3">
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
                          RBC-LF {rbcUnitVolume || "-"} mL/unit 기준
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
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Intraoperative Hct simulation"
              icon={<Droplets className="h-4 w-4" />}
              description="현재 Hct와 base volume 대비 net volume 변화만 입력합니다. 현재 Hct에는 이전 희석, 수혈, HF/UF 효과가 이미 반영된 것으로 간주합니다."
            >

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current baseline</div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.15fr]">
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InputBlock
                        id="current-hct"
                        label="Current Hct %"
                        value={currentHct}
                        onChange={setCurrentHct}
                        placeholder="0"
                      />
                      <InputBlock
                        id="intra-net-volume-change-from-base"
                        label="Net volume change from base mL"
                        value={intraNetVolumeChangeFromBase}
                        onChange={setIntraNetVolumeChangeFromBase}
                        placeholder="0"
                        helperText="Base 대비 증가량은 양수, 감소량은 음수로 입력하세요."
                      />
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
                    </div>
                  </div>

                  {intraoperativeResult.status === "ready" && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/25 p-3 text-xs sm:grid-cols-3">
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
                      </div>
                      <div>
                        <div className="text-muted-foreground">Current total</div>
                        <div className="font-semibold">{formatNumber(intraoperativeResult.currentTotalVolume)} mL</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Current RBC</div>
                        <div className="font-semibold">{formatNumber(intraoperativeResult.currentRbcVolume)} mL</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Net from base</div>
                        <div className="font-semibold">{formatSignedMl(intraoperativeResult.netVolumeChangeFromBase)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Target Hct helper</div>
                    <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                      <p>목표 Hct에 도달하는 서로 다른 volume-management 옵션입니다. 세 결과를 동시에 시행하는 용량이 아닙니다.</p>
                      <p>pRBC는 적혈구 외 volume도 포함하므로 HF 없이 주입하면 pRBC 전체 용량이 total volume에 추가됩니다. RBC 주입 후 증가한 net volume을 HF로 제거할 계획이라면 Volume-neutral 결과를 참고하세요.</p>
                    </div>
                  </div>
                  <div className="w-full md:w-56">
                    <InputBlock
                      id="intra-desired-hct"
                      label="Intraoperative desired Hct %"
                      value={intraDesiredHct}
                      onChange={setIntraDesiredHct}
                      placeholder="0"
                      helperText="선택 입력입니다."
                    />
                  </div>
                </div>

                {intraoperativeResult.status !== "ready" ? null : !hasIntraoperativeTarget ? (
                  <Card className="border-border/70 bg-background/70 shadow-sm">
                    <CardContent className="p-3 text-sm text-muted-foreground">
                      Target Hct를 입력하면 baseline 기준의 세 가지 대안 전략을 표시합니다.
                    </CardContent>
                  </Card>
                ) : intraoperativeResult.desiredHct !== null &&
                  intraoperativeResult.volumeNeutralRbcVolume !== null &&
                  intraoperativeResult.volumeNeutralRbcUnitCount !== null &&
                  intraoperativeResult.volumeNeutralExpectedHct !== null &&
                  intraoperativeResult.rbcOnlyVolume !== null &&
                  intraoperativeResult.rbcOnlyUnitCount !== null &&
                  intraoperativeResult.rbcOnlyFinalVolume !== null &&
                  intraoperativeResult.rbcOnlyExpectedHct !== null &&
                  intraoperativeResult.fluidAdjustmentToTarget !== null &&
                  intraoperativeResult.fluidAdjustmentFinalVolume !== null &&
                  intraoperativeResult.fluidAdjustmentExpectedHct !== null ? (
                  <div className="space-y-3">
                    <ResultCard
                      label="RBC + volume-neutral HF"
                      value={
                        intraoperativeResult.volumeNeutralRbcVolume <= FLUID_ADJUSTMENT_THRESHOLD_ML
                          ? "RBC 불필요"
                          : formatNumber(intraoperativeResult.volumeNeutralRbcVolume, 1)
                      }
                      unit={intraoperativeResult.volumeNeutralRbcVolume <= FLUID_ADJUSTMENT_THRESHOLD_ML ? undefined : "mL"}
                      tone="green"
                      detail={
                        <>
                          Assumes net HF approximately equals the pRBC volume added, keeping total volume nearly unchanged.<br />
                          + net HF approximately {formatNumber(intraoperativeResult.volumeNeutralRbcVolume, 1)} mL · Final total volume approximately {formatNumber(intraoperativeResult.volumeNeutralFinalVolume ?? intraoperativeResult.currentTotalVolume)} mL · Expected Hct {formatNumber(intraoperativeResult.volumeNeutralExpectedHct, 1)}% · ≈ {formatNumber(intraoperativeResult.volumeNeutralRbcUnitCount, 1)} unit
                        </>
                      }
                    />
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <ResultCard
                        label="RBC only · no HF"
                        value={intraoperativeResult.rbcOnlyVolume <= FLUID_ADJUSTMENT_THRESHOLD_ML ? "RBC 불필요" : formatNumber(intraoperativeResult.rbcOnlyVolume, 1)}
                        unit={intraoperativeResult.rbcOnlyVolume <= FLUID_ADJUSTMENT_THRESHOLD_ML ? undefined : "mL"}
                        tone="rose"
                        detail={
                          <>
                            HF 없이 pRBC만 추가하는 경우입니다. pRBC 전체 투여량이 total volume에 포함됩니다.<br />
                            Final volume {formatNumber(intraoperativeResult.rbcOnlyFinalVolume, 1)} mL · Expected Hct {formatNumber(intraoperativeResult.rbcOnlyExpectedHct, 1)}% · ≈ {formatNumber(intraoperativeResult.rbcOnlyUnitCount, 1)} unit
                          </>
                        }
                      />
                      <ResultCard
                        label="Fluid adjustment only"
                        value={getFluidAdjustmentCopy(intraoperativeResult.fluidAdjustmentToTarget).label}
                        tone="blue"
                        detail={
                          <>
                            RBC 추가 없이 RBC-free fluid를 조정하는 조건입니다.<br />
                            Final volume {formatNumber(intraoperativeResult.fluidAdjustmentFinalVolume, 1)} mL · Expected Hct {formatNumber(intraoperativeResult.fluidAdjustmentExpectedHct, 1)}%<br />
                            HF/UF removal is treated as RBC-free fluid removal. Do not use this calculation for mixed whole-blood removal.
                          </>
                        }
                      />
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      HF가 pRBC 내부의 비-RBC 성분만 선택적으로 제거한다는 뜻은 아닙니다. 혼합된 circuit에서 RBC mass는 유지하고 net fluid volume이 감소한다고 단순화한 계산입니다.
                    </p>
                  </div>
                ) : null}

              </div>

              <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">What-if planned changes</div>
                  <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                    <p>현재 baseline에 planned change만 적용한 별도 예측입니다. pRBC는 실제 RBC fraction뿐 아니라 전체 제품 volume이 total volume에 추가됩니다. HF/UF removal에는 circuit에서 실제로 감소시킬 net fluid volume을 입력하세요.</p>
                    <p>RBC 주입 후 total volume을 유지하려면 Planned RBC addition과 비슷한 양을 Planned HF/UF removal에 입력해 volume-neutral 조건을 시뮬레이션할 수 있습니다.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
                  <InputBlock
                    id="planned-rbc-addition"
                    label="Planned RBC addition mL"
                    value={plannedRbcAddition}
                    onChange={setPlannedRbcAddition}
                    placeholder="0"
                    helperText="앞으로 주입할 pRBC 전체 제품 volume입니다. RBC product Hct만큼 RBC volume이 증가하고, 입력한 전체 mL가 total volume에 추가됩니다."
                  />
                  <InputBlock
                    id="added-crystalloid-volume"
                    label="Planned crystalloid addition mL"
                    value={addedCrystalloidVolume}
                    onChange={setAddedCrystalloidVolume}
                    placeholder="0"
                    helperText="앞으로 추가할 crystalloid, cardioplegia, test saline 등의 volume입니다. RBC volume은 증가하지 않습니다."
                  />
                  <InputBlock
                    id="removed-fluid-volume"
                    label="Planned HF/UF fluid removal mL"
                    value={removedFluidVolume}
                    onChange={setRemovedFluidVolume}
                    placeholder="0"
                    helperText="Circuit에서 제거할 RBC-free net fluid volume입니다. Mixed whole-blood removal에는 사용하지 마세요. 동시에 들어오는 fluid가 있다면 별도의 crystalloid addition field에 입력하세요."
                  />
                </div>

                {intraoperativeResult.status === "message" ? (
                  <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                    <CardContent className="p-3 text-sm text-amber-900 dark:text-amber-100">{intraoperativeResult.message}</CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What-if results</div>
                      {intraoperativeResult.whatIfScenario && (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[11px] text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                          {intraoperativeResult.whatIfScenario}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs md:grid-cols-5">
                      <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100">
                        <div className="text-muted-foreground dark:text-rose-200/80">Predicted Hct</div>
                        <div className="text-xl font-extrabold">{formatNumber(intraoperativeResult.predictedHct, 1)}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Hct delta</div>
                        <div className="text-lg font-bold">{`${intraoperativeResult.hctDelta >= 0 ? "+" : ""}${formatNumber(intraoperativeResult.hctDelta, 1)}`}%p</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Net planned</div>
                        <div className="text-lg font-bold">{formatSignedMl(intraoperativeResult.netVolumeChange)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">New total</div>
                        <div className="text-lg font-bold">{formatNumber(intraoperativeResult.newTotalVolume)} mL</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">New RBC</div>
                        <div className="text-lg font-bold">{formatNumber(intraoperativeResult.newRbcVolume)} mL</div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                      RBC +{formatNumber(intraoperativeResult.plannedRbcAddition)} mL · Crystalloid +{formatNumber(intraoperativeResult.addedCrystalloidVolume)} mL · HF/UF −{formatNumber(intraoperativeResult.removedFluidVolume)} mL<br />
                      Net volume change {formatSignedMl(intraoperativeResult.netVolumeChange)}
                      {intraoperativeResult.whatIfScenario?.startsWith("Volume-neutral") ? " · Volume-neutral" : ""}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
