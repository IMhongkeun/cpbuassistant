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
const FLUID_ADJUSTMENT_THRESHOLD_ML = 0.5

const PRIMING_VOLUME_PRESETS = [
  {
    name: "Neo (1/8)",
    oxygenator: "Kids 100",
    configuration: "1/8-3/16-3/16",
    primeVolumeMl: 130,
  },
  {
    name: "Neo (3/16)",
    oxygenator: "FX-05",
    configuration: "3/16-3/16-3/16",
    primeVolumeMl: 180,
  },
  {
    name: "Neo (1/4)",
    oxygenator: "FX-05",
    configuration: "3/16-1/4-1/4",
    primeVolumeMl: 230,
  },
  {
    name: "Infant (1/4)",
    oxygenator: "FX-05",
    configuration: "1/4-1/4-1/4",
    primeVolumeMl: 250,
  },
  {
    name: "Infant (3/8)",
    oxygenator: "Pixie",
    configuration: "1/4-3/8-3/8",
    primeVolumeMl: 450,
  },
  {
    name: "Infant (3/8)",
    oxygenator: "Kids 101",
    configuration: "1/4-3/8-3/8",
    primeVolumeMl: 500,
  },
  {
    name: "Infant FX15",
    oxygenator: "FX-15",
    configuration: "1/4-3/8-3/8",
    primeVolumeMl: 650,
  },
  {
    name: "Pediatric",
    oxygenator: "FX-15",
    configuration: "3/8-3/8-3/8",
    primeVolumeMl: 800,
  },
  {
    name: "Pediatric",
    oxygenator: "FX-15",
    configuration: "3/8-1/2-3/8",
    primeVolumeMl: 850,
  },
  {
    name: "S adult (FX)",
    oxygenator: "FX-25",
    configuration: "3/8-1/2-1/2",
    primeVolumeMl: 1200,
  },
]
const getPresetLabel = (preset: (typeof PRIMING_VOLUME_PRESETS)[number]) =>
  `${preset.name} · ${preset.oxygenator} · ${preset.configuration} — ${preset.primeVolumeMl} mL`

const parseInputNumber = (value: string) => Number.parseFloat(value)

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

const isPositiveNumber = (value: number) => Number.isFinite(value) && value > 0
const isNonNegativeNumber = (value: number) => Number.isFinite(value) && value >= 0
const isPercentInRange = (value: string) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 && numericValue <= 100
}
const isFractionInRange = (value: string) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 && numericValue <= 1
}
const hasOptionalValue = (value: string) => value.trim() !== ""

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
  additionalCrystalloidVolume?: string
  addedCrystalloidVolume?: string
  removedFluidVolume?: string
  reservoirLevel?: string
  desiredHct?: string
  rbcProductHct?: string
  rbcUnitVolume?: string
}

const InputBlock = ({
  id,
  label,
  value,
  onChange,
  step = "1",
  helperText,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  step?: string
  helperText?: string
}) => (
  <div className="space-y-2">
    <Label htmlFor={id} className="flex min-h-8 items-end text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </Label>
    <Input
      id={id}
      type="number"
      min="0"
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 bg-background/80 text-base font-medium"
    />
    {helperText && <p className="text-xs leading-relaxed text-muted-foreground">{helperText}</p>}
  </div>
)

const SectionCard = ({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) => (
  <Card className="border-border/70 bg-card/95 shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300">
          {icon}
        </span>
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
)

export default function BloodHemodilutionCalculator() {
  const [weightKg, setWeightKg] = useState("")
  const [bloodVolumeCoefficient, setBloodVolumeCoefficient] = useState("55")
  const [selectedPresetId, setSelectedPresetId] = useState("")
  const [primeVolume, setPrimeVolume] = useState("")
  const [preHct, setPreHct] = useState("")
  const [addedCrystalloidVolume, setAddedCrystalloidVolume] = useState("0")
  const [removedFluidVolume, setRemovedFluidVolume] = useState("0")
  const [reservoirLevel, setReservoirLevel] = useState("")
  const [desiredHct, setDesiredHct] = useState("")
  const [rbcProductHct, setRbcProductHct] = useState("0.66")
  const [rbcUnitVolume, setRbcUnitVolume] = useState("200")
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const savedState = window.localStorage.getItem(CALCULATOR_STORAGE_KEY)
    const savedPrimeVolume = window.localStorage.getItem(PRIME_VOLUME_STORAGE_KEY)

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState) as StoredCalculatorState
        setWeightKg(parsedState.weightKg ?? "")
        setBloodVolumeCoefficient(parsedState.bloodVolumeCoefficient ?? "55")
        setSelectedPresetId(parsedState.selectedPresetId ?? "")
        setPrimeVolume(parsedState.primeVolume ?? savedPrimeVolume ?? "")
        setPreHct(parsedState.preHct ?? "")
        setAddedCrystalloidVolume(parsedState.addedCrystalloidVolume ?? parsedState.additionalCrystalloidVolume ?? "0")
        setRemovedFluidVolume(parsedState.removedFluidVolume ?? "0")
        setReservoirLevel(parsedState.reservoirLevel ?? "")
        setDesiredHct(parsedState.desiredHct ?? "")
        setRbcProductHct(parsedState.rbcProductHct ?? "0.66")
        setRbcUnitVolume(parsedState.rbcUnitVolume ?? "200")
      } catch {
        window.localStorage.removeItem(CALCULATOR_STORAGE_KEY)
      }
    } else if (savedPrimeVolume !== null) {
      setPrimeVolume(savedPrimeVolume)
    }

    setHasLoadedSavedState(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedSavedState || typeof window === "undefined") return

    const trimmedPrimeVolume = primeVolume.trim()

    if (trimmedPrimeVolume === "") {
      window.localStorage.removeItem(PRIME_VOLUME_STORAGE_KEY)
    } else {
      window.localStorage.setItem(PRIME_VOLUME_STORAGE_KEY, primeVolume)
    }

    const stateToSave: StoredCalculatorState = {
      weightKg,
      bloodVolumeCoefficient,
      selectedPresetId,
      primeVolume,
      preHct,
      addedCrystalloidVolume,
      removedFluidVolume,
      reservoirLevel,
      desiredHct,
      rbcProductHct,
      rbcUnitVolume,
    }

    window.localStorage.setItem(CALCULATOR_STORAGE_KEY, JSON.stringify(stateToSave))
  }, [
    addedCrystalloidVolume,
    bloodVolumeCoefficient,
    desiredHct,
    hasLoadedSavedState,
    preHct,
    primeVolume,
    rbcProductHct,
    rbcUnitVolume,
    removedFluidVolume,
    reservoirLevel,
    selectedPresetId,
    weightKg,
  ])

  const selectedPreset = selectedPresetId ? PRIMING_VOLUME_PRESETS[Number.parseInt(selectedPresetId, 10)] : undefined
  const primeVolumeNumber = parseInputNumber(primeVolume)
  const isManualPrimeOverride = Boolean(
    selectedPreset && isPositiveNumber(primeVolumeNumber) && primeVolumeNumber !== selectedPreset.primeVolumeMl,
  )
  const primeSourceLabel = selectedPreset
    ? isManualPrimeOverride
      ? "Selected tubing set · manual override"
      : "Selected tubing set preset"
    : primeVolume.trim()
      ? "Custom prime volume"
      : "Not selected"

  const result = useMemo<CalculationResult>(() => {
    const weight = parseInputNumber(weightKg)
    const coefficient = parseInputNumber(bloodVolumeCoefficient)
    const prime = parseInputNumber(primeVolume)
    const patientPreHct = parseInputNumber(preHct)
    const addedVolume = parseInputNumber(addedCrystalloidVolume)
    const removedVolume = parseInputNumber(removedFluidVolume)
    const targetPercent = parseInputNumber(desiredHct)
    const rbcHct = parseInputNumber(rbcProductHct)
    const unitVolume = parseInputNumber(rbcUnitVolume)
    const hasReservoirLevel = hasOptionalValue(reservoirLevel)
    const currentReservoir = hasReservoirLevel ? parseInputNumber(reservoirLevel) : null

    if (
      !isPositiveNumber(weight) ||
      !isPositiveNumber(coefficient) ||
      !isPositiveNumber(prime) ||
      !isPercentInRange(preHct) ||
      !isNonNegativeNumber(addedVolume) ||
      !isNonNegativeNumber(removedVolume) ||
      !isPercentInRange(desiredHct) ||
      !isFractionInRange(rbcProductHct) ||
      !isPositiveNumber(unitVolume) ||
      (hasReservoirLevel && !isNonNegativeNumber(currentReservoir as number))
    ) {
      return {
        status: "message",
        message:
          "Enter valid values: Pre-Hct and Desired Hct must be 0-100%, RBC product Hct must be a fraction from 0-1, and added/removed fluid must be 0 mL or greater.",
      }
    }

    const targetFraction = targetPercent / 100

    if (targetFraction >= rbcHct) {
      return {
        status: "message",
        message: "Desired Hct must be lower than RBC product Hct.",
      }
    }

    // Patient volume = Weight × Blood volume coefficient
    const patientVolume = weight * coefficient

    // Patient RBC volume = Patient volume × Pre-Hct / 100
    // Prime volume, added crystalloid, and reservoir level do not increase RBC volume.
    const patientRbcVolume = patientVolume * (patientPreHct / 100)

    // Net intraoperative volume change = Added crystalloid volume - Removed crystalloid / fluid volume
    const netIntraoperativeVolume = addedVolume - removedVolume

    // Total volume = Patient volume + Prime volume + Current reservoir level + Added crystalloid volume - Removed crystalloid / fluid volume
    // Current reservoir level is included only when entered; otherwise it is treated as 0 mL.
    const reservoirVolume = currentReservoir ?? 0
    const totalVolume = patientVolume + prime + reservoirVolume + netIntraoperativeVolume

    if (!isPositiveNumber(totalVolume)) {
      return {
        status: "message",
        message: "Total volume is 0 mL or lower after entered add/remove balance. Recheck prime, added volume, and removed volume before calculating Hct.",
      }
    }

    // Expected Hct (%) = Patient RBC volume / Total volume × 100
    const expectedHct = (patientRbcVolume / totalVolume) * 100

    if (!Number.isFinite(expectedHct) || expectedHct < 0 || expectedHct > 100) {
      return {
        status: "message",
        message: "Expected Hct could not be calculated as a clinically valid 0-100% value. Please recheck the entered Hct and volume inputs.",
      }
    }

    // RBC transfusion volume mL = max(0, (Target × Total volume - Patient RBC volume) / (RBC_Hct - Target))
    const rbcTransfusionVolume = Math.max(0, (targetFraction * totalVolume - patientRbcVolume) / (rbcHct - targetFraction))

    // RBC unit count = RBC transfusion volume mL / RBC leukocyte-filtered unit volume
    const rbcUnitCount = rbcTransfusionVolume / unitVolume

    // Target total volume = Patient RBC volume / Target
    // Fluid adjustment volume = Target total volume - Total volume
    const targetTotalVolume = patientRbcVolume / targetFraction
    const fluidAdjustmentVolume = targetTotalVolume - totalVolume

    let fluidAdjustmentAction: "remove" | "add" | "none" = "none"
    if (fluidAdjustmentVolume < -FLUID_ADJUSTMENT_THRESHOLD_ML) {
      fluidAdjustmentAction = "remove"
    } else if (fluidAdjustmentVolume > FLUID_ADJUSTMENT_THRESHOLD_ML) {
      fluidAdjustmentAction = "add"
    }

    const projectedReservoirAfterBalance = currentReservoir === null ? null : currentReservoir + netIntraoperativeVolume
    const projectedReservoirAfterTargetAdjustment =
      currentReservoir === null ? null : currentReservoir + fluidAdjustmentVolume

    const getReservoirWarning = (projectedLevel: number | null) => {
      if (projectedLevel === null) return null
      if (projectedLevel <= 0) return "Check reservoir level before removing volume."
      return null
    }

    const targetReservoirWarning = getReservoirWarning(projectedReservoirAfterTargetAdjustment)
    const removalLimitedWarning =
      fluidAdjustmentAction === "remove" && targetReservoirWarning
        ? "Target Hct requires volume removal, but current reservoir level may limit safe removal."
        : targetReservoirWarning

    return {
      status: "ready",
      patientVolume,
      patientRbcVolume,
      totalVolume,
      expectedHct,
      desiredHct: targetPercent,
      rbcProductHct: rbcHct,
      rbcUnitVolume: unitVolume,
      addedCrystalloidVolume: addedVolume,
      removedFluidVolume: removedVolume,
      netIntraoperativeVolume,
      currentReservoirLevel: currentReservoir,
      projectedReservoirAfterBalance,
      balanceReservoirWarning: getReservoirWarning(projectedReservoirAfterBalance),
      rbcTransfusionVolume,
      rbcUnitCount,
      fluidAdjustmentVolume,
      projectedReservoirAfterTargetAdjustment,
      targetReservoirWarning: removalLimitedWarning,
      targetProgress: Math.min(100, Math.max(0, (expectedHct / targetPercent) * 100)),
      expectedHctAtTarget: expectedHct >= targetPercent,
      fluidAdjustmentAction,
    }
  }, [
    addedCrystalloidVolume,
    bloodVolumeCoefficient,
    desiredHct,
    preHct,
    primeVolume,
    rbcProductHct,
    rbcUnitVolume,
    removedFluidVolume,
    reservoirLevel,
    weightKg,
  ])

  const addedVolumePreview = parseInputNumber(addedCrystalloidVolume)
  const removedVolumePreview = parseInputNumber(removedFluidVolume)
  const reservoirLevelPreview = parseInputNumber(reservoirLevel)
  const canShowBalancePreview = isNonNegativeNumber(addedVolumePreview) && isNonNegativeNumber(removedVolumePreview)
  const netBalancePreview = canShowBalancePreview ? addedVolumePreview - removedVolumePreview : 0
  const netBalanceAction = getVolumeAction(netBalancePreview)
  const canShowReservoirPreview = canShowBalancePreview && hasOptionalValue(reservoirLevel) && isNonNegativeNumber(reservoirLevelPreview)
  const projectedReservoirPreview = canShowReservoirPreview ? reservoirLevelPreview + netBalancePreview : null

  const handlePresetChange = (presetId: string) => {
    const preset = PRIMING_VOLUME_PRESETS[Number.parseInt(presetId, 10)]
    setSelectedPresetId(presetId)
    setPrimeVolume(String(preset.primeVolumeMl))
  }

  const fluidAdjustmentCopy = (() => {
    if (result.status !== "ready") {
      return { label: "No adjustment needed", badge: "Ready", className: "text-slate-700", icon: MinusCircle }
    }

    if (result.fluidAdjustmentAction === "remove") {
      return {
        label: `Remove ${formatNumber(Math.abs(result.fluidAdjustmentVolume))} mL`,
        badge: "Remove",
        className: "text-rose-700 dark:text-rose-300",
        icon: MinusCircle,
      }
    }

    if (result.fluidAdjustmentAction === "add") {
      return {
        label: `Add ${formatNumber(result.fluidAdjustmentVolume)} mL`,
        badge: "Add",
        className: "text-blue-700 dark:text-blue-300",
        icon: PlusCircle,
      }
    }

    return {
      label: "No adjustment needed",
      badge: "Balanced",
      className: "text-emerald-700 dark:text-emerald-300",
      icon: HeartPulse,
    }
  })()

  const FluidIcon = fluidAdjustmentCopy.icon

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Card className="overflow-hidden border-green-100 bg-gradient-to-br from-white via-white to-green-50/60 shadow-lg dark:border-green-950/60 dark:from-card dark:via-card dark:to-green-950/20">
        <CardHeader className="border-b border-green-100/80 bg-green-50/70 pb-5 dark:border-green-950/70 dark:bg-green-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-2xl font-bold tracking-tight">Blood / Hemodilution Calculator</CardTitle>
                <Badge variant="secondary" className="bg-white text-green-700 shadow-sm dark:bg-green-950/70 dark:text-green-200">
                  PCS · Pediatric cardiac surgery
                </Badge>
              </div>
              <div className="text-sm font-semibold text-green-800 dark:text-green-200">PCS CPB volume & RBC estimation</div>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Estimate dilutional Hct, RBC requirement, and fluid adjustment during pediatric CPB.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Badge variant="outline" className="bg-white/80 text-slate-700 dark:bg-background/50 dark:text-slate-200">
                RBC-LF 1 unit = {rbcUnitVolume || "200"} mL
              </Badge>
              <Badge variant="outline" className="bg-white/80 text-slate-700 dark:bg-background/50 dark:text-slate-200">
                Crystalloid balance affects total volume
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 md:p-6">
          <div className="space-y-5">
            <div className="space-y-4">
              <SectionCard title="Patient & baseline" icon={<HeartPulse className="h-4 w-4" />}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  <InputBlock id="blood-weight" label="Weight kg" value={weightKg} onChange={setWeightKg} step="0.1" />
                  <InputBlock
                    id="blood-volume-coefficient"
                    label="Blood volume coefficient mL/kg"
                    value={bloodVolumeCoefficient}
                    onChange={setBloodVolumeCoefficient}
                  />
                  <InputBlock id="pre-hct" label="Pre-Hct %" value={preHct} onChange={setPreHct} step="0.1" />
                </div>
                <p className="rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  Patient RBC volume is calculated only from patient volume × Pre-Hct. Prime and crystalloid do not increase RBC volume.
                </p>
              </SectionCard>

              <SectionCard title="Circuit / prime" icon={<FlaskConical className="h-4 w-4" />}>
                <div className="space-y-2">
                  <Label htmlFor="tubing-set" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tubing set selector
                  </Label>
                  <Select value={selectedPresetId} onValueChange={handlePresetChange}>
                    <SelectTrigger id="tubing-set" className="h-auto min-h-11 w-full bg-background/80 text-left">
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                  <InputBlock id="prime-volume" label="Prime volume mL" value={primeVolume} onChange={setPrimeVolume} />
                  <InputBlock
                    id="current-reservoir-level"
                    label="Current reservoir level mL"
                    value={reservoirLevel}
                    onChange={setReservoirLevel}
                    helperText="Optional. Added to total circulating volume when entered."
                  />
                  <Badge variant="outline" className="w-fit bg-background/80 text-xs">
                    {primeSourceLabel}
                  </Badge>
                </div>

                {selectedPreset && (
                  <div className="rounded-md border border-green-100 bg-green-50/60 p-3 text-xs text-green-900 dark:border-green-950 dark:bg-green-950/20 dark:text-green-100">
                    Selected: {getPresetLabel(selectedPreset)}
                    {isManualPrimeOverride && <span className="ml-2 font-semibold text-amber-700 dark:text-amber-300">Manual override</span>}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Target" icon={<Syringe className="h-4 w-4" />}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <InputBlock id="desired-hct" label="Desired Hct %" value={desiredHct} onChange={setDesiredHct} step="0.1" />
                  <InputBlock
                    id="rbc-product-hct"
                    label="RBC product Hct"
                    value={rbcProductHct}
                    onChange={setRbcProductHct}
                    step="0.01"
                    helperText="Enter as fraction, e.g. 0.66 for 66%."
                  />
                  <InputBlock
                    id="rbc-unit-volume"
                    label="RBC leukocyte-filtered unit volume"
                    value={rbcUnitVolume}
                    onChange={setRbcUnitVolume}
                    helperText="Department default: RBC-LF 1 unit = 200 mL"
                  />
                </div>
              </SectionCard>

              <SectionCard title="Intraoperative volume balance" icon={<Droplets className="h-4 w-4" />}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InputBlock
                    id="added-crystalloid-volume"
                    label="Added crystalloid volume mL"
                    value={addedCrystalloidVolume}
                    onChange={setAddedCrystalloidVolume}
                    helperText="Cardioplegia, crystalloid, and added fluid only."
                  />
                  <InputBlock
                    id="removed-fluid-volume"
                    label="Removed crystalloid / fluid volume mL"
                    value={removedFluidVolume}
                    onChange={setRemovedFluidVolume}
                    helperText="Ultrafiltration, hemoconcentration, or fluid removed from the circuit/reservoir. Enter removal as a positive number."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={getBalancePillClass(netBalanceAction)}>
                    Net balance: {canShowBalancePreview ? formatSignedMl(netBalancePreview) : "-"}
                  </Badge>
                  {projectedReservoirPreview !== null && (
                    <Badge
                      variant="outline"
                      className={
                        projectedReservoirPreview <= 0
                          ? getBalancePillClass("remove")
                          : "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200"
                      }
                    >
                      Projected reservoir: {formatNumber(projectedReservoirPreview)} mL
                    </Badge>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Initial total volume starts from patient volume, circuit prime, and current reservoir level when entered. Added/removed crystalloid then adjusts that volume balance.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Hct estimate depends on accurate reservoir and added/removed volume entry. Do not include blood products in added crystalloid volume.
                </p>
              </SectionCard>

              <p className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                For PCS CPB use. Prime volume can be selected from institutional tubing set presets. RBC-LF is calculated as 200 mL per unit by default.
              </p>
            </div>

            <div className="space-y-4">
              {result.status === "message" ? (
                <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                  <CardContent className="p-5">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Calculation unavailable</div>
                    <p className="mt-2 text-sm leading-relaxed text-amber-800 dark:text-amber-100">{result.message}</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <Card
                      className={`shadow-sm ${
                        result.expectedHctAtTarget
                          ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                          : "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20"
                      }`}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground">Expected Hct</div>
                            <div className="mt-2 flex items-end gap-2">
                              <span className="text-4xl font-bold tracking-tight">{formatNumber(result.expectedHct, 1)}</span>
                              <span className="pb-1 text-lg font-semibold text-muted-foreground">%</span>
                            </div>
                          </div>
                          <Badge variant={result.expectedHctAtTarget ? "default" : "secondary"}>
                            Target {formatNumber(result.desiredHct, 1)}%
                          </Badge>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/80 dark:bg-background/60">
                          <div
                            className={`h-full rounded-full ${result.expectedHctAtTarget ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${result.targetProgress}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {result.expectedHctAtTarget ? "At or above desired Hct" : "Below desired Hct"}
                        </div>
                        <div className="mt-3 rounded-md bg-white/65 p-3 text-xs text-muted-foreground dark:bg-background/40">
                          <div className="font-semibold text-foreground">Net balance: {formatSignedMl(result.netIntraoperativeVolume)}</div>
                          <div className="mt-1">
                            Added {formatNumber(result.addedCrystalloidVolume)} mL · Removed {formatNumber(result.removedFluidVolume)} mL
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-red-100 bg-red-50/70 shadow-sm dark:border-red-950/60 dark:bg-red-950/20">
                      <CardContent className="p-5">
                        <div className="text-sm font-semibold text-muted-foreground">RBC required</div>
                        {result.rbcTransfusionVolume <= FLUID_ADJUSTMENT_THRESHOLD_ML ? (
                          <div className="mt-3 text-3xl font-bold text-red-900 dark:text-red-100">No RBC required</div>
                        ) : (
                          <>
                            <div className="mt-2 flex items-end gap-2">
                              <span className="text-4xl font-bold tracking-tight text-red-900 dark:text-red-100">
                                {formatNumber(result.rbcTransfusionVolume)}
                              </span>
                              <span className="pb-1 text-lg font-semibold text-red-700 dark:text-red-200">mL</span>
                            </div>
                            <div className="mt-2 text-base font-semibold text-red-700 dark:text-red-200">≈ {formatNumber(result.rbcUnitCount, 1)} unit</div>
                          </>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">Based on RBC-LF {formatNumber(result.rbcUnitVolume)} mL/unit</p>
                      </CardContent>
                    </Card>

                    <Card className="border-blue-100 bg-blue-50/70 shadow-sm dark:border-blue-950/60 dark:bg-blue-950/20">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground">Fluid adjustment</div>
                            <div className={`mt-3 flex items-center gap-2 text-3xl font-bold tracking-tight ${fluidAdjustmentCopy.className}`}>
                              <FluidIcon className="h-7 w-7 shrink-0" />
                              <span>{fluidAdjustmentCopy.label}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-white/70 dark:bg-background/50">
                            {fluidAdjustmentCopy.badge}
                          </Badge>
                        </div>
                        {result.fluidAdjustmentAction !== "none" && (
                          <p className="mt-3 text-xs text-muted-foreground">To reach target Hct {formatNumber(result.desiredHct, 1)}%</p>
                        )}
                        {result.projectedReservoirAfterTargetAdjustment !== null && (
                          <div className="mt-3 rounded-md bg-white/65 p-3 text-xs text-muted-foreground dark:bg-background/40">
                            <div className="font-semibold text-foreground">
                              Projected reservoir: {formatNumber(result.projectedReservoirAfterTargetAdjustment)} mL
                            </div>
                            {result.targetReservoirWarning && (
                              <div className="mt-2 flex items-start gap-2 font-medium text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{result.targetReservoirWarning}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {result.currentReservoirLevel !== null && (
                    <Card
                      className={`shadow-sm ${
                        result.balanceReservoirWarning
                          ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20"
                          : "border-cyan-100 bg-cyan-50/70 dark:border-cyan-950/60 dark:bg-cyan-950/20"
                      }`}
                    >
                      <CardContent className="p-4 text-sm">
                        <div className="font-semibold text-foreground">Reservoir balance reference</div>
                        <div className="mt-2 grid gap-1 text-muted-foreground">
                          <div>Current reservoir level: {formatNumber(result.currentReservoirLevel)} mL</div>
                          <div>Net volume change: {formatSignedMl(result.netIntraoperativeVolume)}</div>
                          <div>Projected reservoir level: {formatNumber(result.projectedReservoirAfterBalance ?? 0)} mL</div>
                        </div>
                        {result.balanceReservoirWarning && (
                          <div className="mt-3 flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{result.balanceReservoirWarning}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-border/70 bg-card/95 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Calculation basis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Patient blood volume</span>
                        <span className="font-medium">{bloodVolumeCoefficient || "-"} mL/kg</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Patient volume</span>
                        <span className="font-medium">{formatNumber(result.patientVolume)} mL</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Patient RBC volume</span>
                        <span className="font-medium">{formatNumber(result.patientRbcVolume)} mL</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Total volume</span>
                        <span className="font-medium">{formatNumber(result.totalVolume)} mL</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Prime source</span>
                        <span className="max-w-[55%] text-right font-medium">{primeSourceLabel}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Added crystalloid</span>
                        <span className="font-medium">{formatNumber(result.addedCrystalloidVolume)} mL</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Removed fluid</span>
                        <span className="font-medium">{formatNumber(result.removedFluidVolume)} mL</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Net intraoperative volume</span>
                        <span className="font-medium">{formatSignedMl(result.netIntraoperativeVolume)}</span>
                      </div>
                      {result.currentReservoirLevel !== null && (
                        <>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Current reservoir level</span>
                            <span className="font-medium">{formatNumber(result.currentReservoirLevel)} mL</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Projected reservoir level</span>
                            <span className="font-medium">{formatNumber(result.projectedReservoirAfterBalance ?? 0)} mL</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">RBC-LF unit volume</span>
                        <span className="font-medium">{formatNumber(result.rbcUnitVolume)} mL/unit</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">RBC product Hct</span>
                        <span className="font-medium">{formatPercentFromFraction(result.rbcProductHct)}%</span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
