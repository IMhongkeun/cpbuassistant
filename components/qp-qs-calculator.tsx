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

const formatFormulaOperand = (rawValue: string, parsedValue: number): string => {
  if (!Number.isFinite(parsedValue)) return "—"
  if (Object.is(parsedValue, -0)) return "0"

  const trimmedValue = rawValue.trim()
  if (trimmedValue !== "" && Number.isFinite(Number(trimmedValue)) && Number(trimmedValue) === parsedValue) {
    return trimmedValue
  }

  return parsedValue.toString()
}

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
    const formula = `(100 − ${formatFormulaOperand(raSvcSat, raSvcValue)}) ÷ (100 − ${formatFormulaOperand(paMpaSat, paMpaValue)}) = ${roundedQpQs}`

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
            <div className="font-semibold text-foreground">Qp/Qs 계산 안내</div>

            <div className="mt-3 space-y-3">
              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">개요</h3>
                <p>
                  Qp/Qs는 폐혈류량(Qp)과 체혈류량(Qs)의 비율입니다. 심장 내 단락의 방향과 크기를 간단히 추정하는 데
                  도움을 줍니다.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">공식</h3>
                <div className="overflow-x-auto rounded-lg border bg-background/60 px-3 py-2 font-mono text-xs text-foreground">
                  Qp/Qs = (100 − RA/SVC saturation) ÷ (100 − PA/MPA saturation)
                </div>
                <p>
                  RA 또는 SVC 산소포화도는 좌우 단락 혼합 이전의 전신 정맥 산소포화도 추정값으로 사용합니다. PA 또는 MPA
                  산소포화도는 단락 혼합 이후의 폐동맥 혈액을 나타냅니다.
                </p>
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">해석</h3>
                <ul className="space-y-1">
                  <li>Qp/Qs ≈ 1.0 — 폐혈류와 체혈류가 대체로 균형을 이룹니다.</li>
                  <li>Qp/Qs &gt; 1.0 — 순 좌우 단락을 시사합니다.</li>
                  <li>Qp/Qs &lt; 1.0 — 순 우좌 단락 또는 폐혈류 감소를 시사합니다.</li>
                </ul>
                <p>1.0보다 약간 높은 값만으로 임상적으로 의미 있는 잔여 단락이라고 판단해서는 안 됩니다.</p>
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">가정과 한계</h3>
                <p>
                  이 간이 계산은 전신 동맥 산소포화도와 폐정맥 산소포화도가 모두 100%라고 가정합니다. 이 가정이 적절하지
                  않은 경우에는 실제 동맥 및 폐정맥 산소 함량을 사용한 전체 Fick 공식을 사용해야 합니다.
                </p>
                <p>
                  결과는 심초음파, 산소포화도 step-up, 압력 자료, 심실 기능, 전신 관류 상태와 함께 해석해야 합니다.
                  Qp/Qs만으로 수술적 재교정 필요성을 결정해서는 안 됩니다.
                </p>
              </section>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
