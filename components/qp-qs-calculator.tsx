"use client"

import { useMemo, useState } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SaturationInputProps = {
  id: string
  label: string
  description: string
  value: string
  onChange: (value: string) => void
  error?: string
}

const RANGE_ERROR = "Enter a saturation between 0 and 100%."
const DENOMINATOR_ERROR = "Qp/Qs cannot be calculated when PA/MPA saturation is 100%."

const parseSaturation = (value: string): number | null => {
  if (value.trim() === "") return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const isInSaturationRange = (value: number): boolean => value >= 0 && value <= 100

const formatInputForFormula = (value: number): string => Number.parseFloat(value.toFixed(1)).toString()

const getInterpretation = (qpQs: number): string => {
  if (qpQs > 1.05) return "Net left-to-right shunt"
  if (qpQs < 0.95) return "Net right-to-left shunt or reduced pulmonary flow"
  return "Pulmonary and systemic flow are approximately balanced"
}

function SaturationInput({ id, label, description, value, onChange, error }: SaturationInputProps) {
  const errorId = `${id}-error`

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-sm font-semibold">
          {label}
        </Label>
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <Input
        id={id}
        type="number"
        min="0"
        max="100"
        step="0.1"
        inputMode="decimal"
        placeholder="Enter saturation"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className="h-11 text-lg"
      />
      <p className="text-xs text-muted-foreground">{description}</p>
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default function QpQsCalculator() {
  const [raSvcSat, setRaSvcSat] = useState("")
  const [paMpaSat, setPaMpaSat] = useState("")

  const result = useMemo(() => {
    const raSvcValue = parseSaturation(raSvcSat)
    const paMpaValue = parseSaturation(paMpaSat)
    const raSvcError = raSvcValue !== null && !isInSaturationRange(raSvcValue) ? RANGE_ERROR : ""
    const paMpaRangeError = paMpaValue !== null && !isInSaturationRange(paMpaValue) ? RANGE_ERROR : ""

    if (raSvcError || paMpaRangeError || raSvcValue === null || paMpaValue === null) {
      return { raSvcError, paMpaError: paMpaRangeError, qpQs: null, formula: "", interpretation: "" }
    }

    if (paMpaValue === 100) {
      return { raSvcError, paMpaError: DENOMINATOR_ERROR, qpQs: null, formula: "", interpretation: "" }
    }

    // Qp/Qs = (100 - RA/SVC saturation) / (100 - PA/MPA saturation).
    // This simplified saturation-based formula assumes arterial and pulmonary venous saturation are 100%.
    const numerator = 100 - raSvcValue
    const denominator = 100 - paMpaValue
    const qpQs = numerator / denominator

    if (!Number.isFinite(qpQs)) {
      return { raSvcError, paMpaError: DENOMINATOR_ERROR, qpQs: null, formula: "", interpretation: "" }
    }

    const roundedQpQs = qpQs.toFixed(2)
    const formula = `(100 − ${formatInputForFormula(raSvcValue)}) ÷ (100 − ${formatInputForFormula(paMpaValue)}) = ${roundedQpQs}`

    return {
      raSvcError,
      paMpaError: "",
      qpQs: roundedQpQs,
      formula,
      interpretation: getInterpretation(qpQs),
    }
  }, [paMpaSat, raSvcSat])

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Card className="shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold tracking-tight">Qp/Qs</CardTitle>
          <CardDescription>Simplified saturation-based pulmonary-to-systemic flow ratio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card className="border-muted/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Saturation inputs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <SaturationInput
                  id="ra-svc-saturation"
                  label="RA / SVC saturation"
                  description="Systemic venous saturation before the left-to-right shunt"
                  value={raSvcSat}
                  onChange={setRaSvcSat}
                  error={result.raSvcError}
                />
                <SaturationInput
                  id="pa-mpa-saturation"
                  label="PA / MPA saturation"
                  description="Pulmonary artery saturation after shunt mixing"
                  value={paMpaSat}
                  onChange={setPaMpaSat}
                  error={result.paMpaError}
                />
              </CardContent>
            </Card>

            <Card className="border-muted/60 bg-muted/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Qp/Qs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.qpQs ? (
                  <>
                    <div className="text-4xl font-extrabold tracking-tight text-foreground">{result.qpQs} : 1</div>
                    <div className="text-sm font-medium text-muted-foreground">{result.formula}</div>
                    <p className="text-xs text-muted-foreground">{result.interpretation}</p>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Enter valid RA/SVC and PA/MPA saturations to calculate Qp/Qs.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="font-semibold text-foreground">Simplified saturation-based calculation</div>
            <p className="mt-1">
              This calculation assumes systemic arterial and pulmonary venous saturation are both 100%. Use actual arterial and
              pulmonary venous oxygen content when this assumption is not appropriate.
            </p>
            <p className="mt-2">Interpret Qp/Qs together with echocardiography, pressure data, ventricular function, and systemic perfusion.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
