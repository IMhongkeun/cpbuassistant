"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Droplets, FlaskConical, HeartPulse, MinusCircle, PlusCircle, Syringe } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CALCULATOR_STORAGE_KEY = "cpbuassistant:bloodHemodilutionCalculator"
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

const formatPercentFromFraction = (value: number) => {
  if (!Number.isFinite(value)) return "-"
  return formatNumber(value * 100, 0)
}

const isPositiveNumber = (value: number) => Number.isFinite(value) && value > 0
const isNonNegativeNumber = (value: number) => Number.isFinite(value) && value >= 0

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
      rbcTransfusionVolume: number
      rbcUnitCount: number
      fluidAdjustmentVolume: number
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
    <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
  const [additionalCrystalloidVolume, setAdditionalCrystalloidVolume] = useState("0")
  const [desiredHct, setDesiredHct] = useState("")
  const [rbcProductHct, setRbcProductHct] = useState("0.66")
  const [rbcUnitVolume, setRbcUnitVolume] = useState("200")
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false)

  useEffect(() => {
    const savedState = window.localStorage.getItem(CALCULATOR_STORAGE_KEY)

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState) as StoredCalculatorState
        setWeightKg(parsedState.weightKg ?? "")
        setBloodVolumeCoefficient(parsedState.bloodVolumeCoefficient ?? "55")
        setSelectedPresetId(parsedState.selectedPresetId ?? "")
        setPrimeVolume(parsedState.primeVolume ?? "")
        setPreHct(parsedState.preHct ?? "")
        setAdditionalCrystalloidVolume(parsedState.additionalCrystalloidVolume ?? "0")
        setDesiredHct(parsedState.desiredHct ?? "")
        setRbcProductHct(parsedState.rbcProductHct ?? "0.66")
        setRbcUnitVolume(parsedState.rbcUnitVolume ?? "200")
      } catch {
        window.localStorage.removeItem(CALCULATOR_STORAGE_KEY)
      }
    }

    setHasLoadedSavedState(true)
  }, [])

  useEffect(() => {
    if (!hasLoadedSavedState) return

    const stateToSave: StoredCalculatorState = {
      weightKg,
      bloodVolumeCoefficient,
      selectedPresetId,
      primeVolume,
      preHct,
      additionalCrystalloidVolume,
      desiredHct,
      rbcProductHct,
      rbcUnitVolume,
    }

    window.localStorage.setItem(CALCULATOR_STORAGE_KEY, JSON.stringify(stateToSave))
  }, [
    additionalCrystalloidVolume,
    bloodVolumeCoefficient,
    desiredHct,
    hasLoadedSavedState,
    preHct,
    primeVolume,
    rbcProductHct,
    rbcUnitVolume,
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
    const crystalloid = parseInputNumber(additionalCrystalloidVolume)
    const targetPercent = parseInputNumber(desiredHct)
    const rbcHct = parseInputNumber(rbcProductHct)
    const unitVolume = parseInputNumber(rbcUnitVolume)

    if (
      !isPositiveNumber(weight) ||
      !isPositiveNumber(coefficient) ||
      !isPositiveNumber(prime) ||
      !isPositiveNumber(patientPreHct) ||
      !isNonNegativeNumber(crystalloid) ||
      !isPositiveNumber(targetPercent) ||
      !isPositiveNumber(rbcHct) ||
      !isPositiveNumber(unitVolume)
    ) {
      return {
        status: "message",
        message:
          "Enter valid positive values for patient, prime, target, RBC product Hct, and RBC-LF unit volume. Additional crystalloid can be 0 mL or greater.",
      }
    }

    const target = targetPercent / 100

    if (target >= rbcHct) {
      return {
        status: "message",
        message: "Desired Hct must be lower than RBC product Hct.",
      }
    }

    // Patient volume = Weight × Blood volume coefficient
    const patientVolume = weight * coefficient

    // Patient RBC volume = Patient volume × Pre-Hct / 100
    // Prime volume and crystalloid do not increase RBC volume.
    const patientRbcVolume = patientVolume * (patientPreHct / 100)

    // Total volume = Patient volume + Prime volume + Additional crystalloid volume
    const totalVolume = patientVolume + prime + crystalloid

    // Expected Hct (%) = Patient RBC volume / Total volume × 100
    const expectedHct = (patientRbcVolume / totalVolume) * 100

    // RBC transfusion volume mL = max(0, (Target × Total volume - Patient RBC volume) / (RBC_Hct - Target))
    const rbcTransfusionVolume = Math.max(0, (target * totalVolume - patientRbcVolume) / (rbcHct - target))

    // RBC unit count = RBC transfusion volume mL / RBC leukocyte-filtered unit volume
    const rbcUnitCount = rbcTransfusionVolume / unitVolume

    // Target total volume = Patient RBC volume / Target
    // Fluid adjustment volume = Target total volume - Total volume
    const targetTotalVolume = patientRbcVolume / target
    const fluidAdjustmentVolume = targetTotalVolume - totalVolume

    let fluidAdjustmentAction: "remove" | "add" | "none" = "none"
    if (fluidAdjustmentVolume < -FLUID_ADJUSTMENT_THRESHOLD_ML) {
      fluidAdjustmentAction = "remove"
    } else if (fluidAdjustmentVolume > FLUID_ADJUSTMENT_THRESHOLD_ML) {
      fluidAdjustmentAction = "add"
    }

    return {
      status: "ready",
      patientVolume,
      patientRbcVolume,
      totalVolume,
      expectedHct,
      desiredHct: targetPercent,
      rbcProductHct: rbcHct,
      rbcUnitVolume: unitVolume,
      rbcTransfusionVolume,
      rbcUnitCount,
      fluidAdjustmentVolume,
      targetProgress: Math.min(100, Math.max(0, (expectedHct / targetPercent) * 100)),
      expectedHctAtTarget: expectedHct >= targetPercent,
      fluidAdjustmentAction,
    }
  }, [additionalCrystalloidVolume, bloodVolumeCoefficient, desiredHct, preHct, primeVolume, rbcProductHct, rbcUnitVolume, weightKg])

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
                Crystalloid only for added volume
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 md:p-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
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
                        <SelectItem key={`${preset.name}-${preset.oxygenator}-${preset.configuration}-${preset.primeVolumeMl}`} value={String(index)} className="whitespace-normal py-2">
                          {getPresetLabel(preset)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
                  <InputBlock id="prime-volume" label="Prime volume mL" value={primeVolume} onChange={setPrimeVolume} />
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SectionCard title="Intraoperative volume" icon={<Droplets className="h-4 w-4" />}>
                  <InputBlock
                    id="additional-crystalloid-volume"
                    label="Additional crystalloid volume mL"
                    value={additionalCrystalloidVolume}
                    onChange={setAdditionalCrystalloidVolume}
                    helperText="cardioplegia, crystalloid, and added fluid only"
                  />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Additional crystalloid volume should include cardioplegia and crystalloid fluid only. Do not include blood products here.
                  </p>
                </SectionCard>

                <SectionCard title="Target" icon={<Syringe className="h-4 w-4" />}>
                  <InputBlock id="desired-hct" label="Desired Hct %" value={desiredHct} onChange={setDesiredHct} step="0.1" />
                  <InputBlock id="rbc-product-hct" label="RBC product Hct" value={rbcProductHct} onChange={setRbcProductHct} step="0.01" />
                  <InputBlock
                    id="rbc-unit-volume"
                    label="RBC leukocyte-filtered unit volume"
                    value={rbcUnitVolume}
                    onChange={setRbcUnitVolume}
                    helperText="Department default: RBC-LF 1 unit = 200 mL"
                  />
                </SectionCard>
              </div>

              <p className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                For PCS CPB use. Prime volume can be selected from institutional tubing set presets. RBC-LF is calculated as 200 mL per unit by default.
              </p>
            </div>

            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              {result.status === "message" ? (
                <Card className="border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                  <CardContent className="p-5">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">Calculation unavailable</div>
                    <p className="mt-2 text-sm leading-relaxed text-amber-800 dark:text-amber-100">{result.message}</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4">
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
                      </CardContent>
                    </Card>
                  </div>

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
                        <span className="text-muted-foreground">RBC-LF unit volume</span>
                        <span className="font-medium">{formatNumber(result.rbcUnitVolume)} mL/unit</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">RBC product Hct</span>
                        <span className="font-medium">{formatPercentFromFraction(result.rbcProductHct)}%</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Prime source</span>
                        <span className="max-w-[55%] text-right font-medium">{primeSourceLabel}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Additional volume</span>
                        <span className="font-medium">crystalloid only</span>
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
