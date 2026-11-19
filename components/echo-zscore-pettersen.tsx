"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useWorkspaceSync } from "@/components/workspace/workspace-provider"
import { Separator } from "@/components/ui/separator"
import { Info } from "lucide-react"
import { EchoBsaDisplay } from "./echo-bsa-display"
import { ECHO_Z_LEVELS as Z_LEVELS, PETTERSEN_COEFF, pettersenSize, resolveEchoBsa } from "@/lib/echo-zscore"

// ──────────────────────────────────────────────────────────────────────────
// Pettersen 2008 (Detroit Data) Echo Z-Score Calculator
// Reference: Pettersen MD, Du W, Skeens ME, Humes RA.
// "Regression equations for calculation of z scores of cardiac structures
//  in a large cohort of healthy infants, children, and adolescents."
// J Am Soc Echocardiogr. 2008 Aug;21(8):922-34.
// ──────────────────────────────────────────────────────────────────────────

const primaryStructures = ["MPA", "RPA", "LPA", "PV", "AoV", "MV", "TV"] as const
const extraGroups = [
  { title: "Aorta · 대동맥", keys: ["SOV", "STJ", "ARCH", "ISTH", "ARCH_DIST", "AOD"] },
  { title: "Ventricle / atrium · 심실·심방", keys: ["RVDd", "IVSd", "IVSs", "LVIDd", "LVIDs", "LVPWd", "LVPWs", "LA"] },
]
const structures = [...primaryStructures, ...extraGroups.flatMap(g => g.keys)]

export default function EchoZScorePettersen() {
  const [height, setHeight] = useState<number | string>("")
  const [weight, setWeight] = useState<number | string>("")
  const [manualBsa, setManualBsa] = useState("")
  const [showFormulaGuide, setShowFormulaGuide] = useState(false)

  // Patient Workspace only: height and weight follow the active case. The BSA
  // field here stays calculator-specific (this tool's own formula notes apply).
  useWorkspaceSync("echo-pettersen", {
    height: { value: height, set: setHeight, patient: "heightCm" },
    weight: { value: weight, set: setWeight, patient: "weightKg" },
    manualDuBoisBsa: { value: manualBsa, set: setManualBsa },
  })

  const { bsa } = resolveEchoBsa(height, weight, manualBsa, "dubois")
  const isBlocked = bsa > 2.0 || (bsa > 0 && bsa < 0.1)

  // Compute results for a structure
  const compute = (s: string) => {
    if (isBlocked) {
      return {
        mean: 0,
        range: null as number[] | null,
        rmse: 0,
        ref: "BSA 범위 초과",
      }
    }
    if (!(bsa > 0)) {
      return {
        mean: 0,
        range: null as number[] | null,
        rmse: 0,
        ref: "입력 필요",
      }
    }

    const coeff = PETTERSEN_COEFF[s]
    const mean = pettersenSize(bsa, 0, coeff)
    const rmse = Math.sqrt(coeff.mse)
    const range = Z_LEVELS.map((z) => pettersenSize(bsa, z, coeff))

    return { mean, range, rmse, ref: "Pettersen 2008" }
  }

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeight(e.target.value)
    setManualBsa("")
  }

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWeight(e.target.value)
    setManualBsa("")
  }

  const renderStructures = (items: readonly string[]) => (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
      {items.map((s) => {
          const info = compute(s)
          const coeff = PETTERSEN_COEFF[s]
          return (
            <Card key={s} className="relative overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg break-words">{coeff.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {isBlocked ? (
                  <p className="text-sm text-destructive">
                    BSA 0.1–2.0 m² 밖: 결과를 표시하지 않습니다.
                  </p>
                ) : (
                  <>
                    <p className="text-xs mb-1 text-muted-foreground">{coeff.description}</p>
                    <p className="text-xs mb-2 text-muted-foreground">Source: {info.ref}</p>
                    {bsa > 0 ? (
                      <>
                        <p className="text-sm mb-2 font-semibold">
                          Mean: <span className="text-chart-1 font-bold">{info.mean.toFixed(1)} mm</span>
                        </p>
                        {info.range && (
                          <>
                            <Separator className="mb-2" />
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs font-semibold text-muted-foreground border-b pb-1">
                                <span>Z-Score</span>
                                <span>Size (mm)</span>
                              </div>
                              {info.range.map((v: number, i: number) => (
                                <div
                                  key={i}
                                  className={`flex justify-between text-xs ${Z_LEVELS[i] === 0 ? "font-bold" : ""}`}
                                >
                                  <span className={`font-mono ${Z_LEVELS[i] === 0 ? "text-chart-1 font-bold" : ""}`}>
                                    {Z_LEVELS[i] > 0 ? `+${Z_LEVELS[i]}` : `${Z_LEVELS[i]}`}
                                  </span>
                                  <span className={Z_LEVELS[i] === 0 ? "text-chart-1 font-bold" : ""}>
                                    {v.toFixed(1)} mm
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">키, 체중 또는 BSA를 입력하세요</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle>환자 정보 입력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col">
              <label htmlFor="h-pettersen" className="text-xs text-muted-foreground mb-1">
                키 (cm)
              </label>
              <Input 
                id="h-pettersen" 
                type="number" 
                min="30" 
                value={height} 
                onChange={handleHeightChange} 
                placeholder="" 
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label htmlFor="w-pettersen" className="text-xs text-muted-foreground mb-1">
                체중 (kg)
              </label>
              <Input 
                id="w-pettersen" 
                type="number" 
                min="1" 
                value={weight} 
                onChange={handleWeightChange} 
                placeholder="" 
              />
            </div>
          </div>

          <EchoBsaDisplay formula="dubois" id="bsa-pettersen" height={height} weight={weight} manual={manualBsa} onManualChange={setManualBsa} />

          {isBlocked && (
            <div className="mt-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
              BSA 0.1–2.0 m² 밖: 본 계산기의 소아 적용 범위를 벗어났습니다. 결과를 표시하지 않습니다.
            </div>
          )}
        </CardContent>
      </Card>

      {renderStructures(primaryStructures)}
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">추가 심장 구조물 · 14개 (Aorta, 심실·심방)</summary>
        <p className="mt-2 text-xs text-muted-foreground">원문 Table 1 측정 위치·시점에 맞춰 비교하세요. 동맥은 inner edge–inner edge, 심실 M-mode 치수는 leading edge–leading edge입니다.</p>
        {extraGroups.map(group => (
          <section key={group.title} className="mt-5 space-y-3">
            <h3 className="font-semibold text-sm">{group.title}</h3>
            {renderStructures(group.keys)}
          </section>
        ))}
      </details>

      {/* Formula Guide Card */}
      <Card className="w-full max-w-5xl mx-auto">
        <CardHeader className="cursor-pointer px-3 sm:px-6" onClick={() => setShowFormulaGuide(!showFormulaGuide)}>
          <CardTitle className="flex items-center justify-between gap-1 whitespace-nowrap text-xs sm:gap-3 sm:text-lg">
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden sm:gap-2">
              <Info className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
              <span className="truncate">Pettersen 2008 Z-score 계산식 안내</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground sm:text-sm">
              {showFormulaGuide ? "▲ 접기" : "▼ 펼치기"}
            </span>
          </CardTitle>
        </CardHeader>

        {showFormulaGuide && (
          <CardContent className="space-y-6">
            {/* Model Description */}
            <div>
              <h3 className="font-semibold text-base mb-3">Logarithmic Regression Model</h3>
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <p className="text-sm">
                  <span className="font-semibold">모델 형태:</span> 3차 다항식 회귀 (log-transformed)
                </p>
                <div className="font-mono text-sm space-y-2">
                  <p>
                    <span className="font-bold">ln(Y)</span> = β₀ + β₁×BSA + β₂×BSA² + β₃×BSA³
                  </p>
                  <p>
                    <span className="font-bold">예측값 (mm)</span> = exp(ln(Y)) × 10
                  </p>
                  <p>
                    <span className="font-bold">Z-score</span> = (ln(측정값<sub>cm</sub>) − ln(예측값<sub>cm</sub>)) / √MSE
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                * Y는 cm 단위, 최종 출력은 mm로 변환 (×10)
              </p>
            </div>

            <Separator />

            {/* Coefficient Table */}
            <div>
              <h3 className="font-semibold text-base mb-3">구조물별 회귀 계수 (Pettersen 2008, Table 2)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2">
                      <th className="text-left p-2">구조물</th>
                      <th className="text-center p-2">β₀</th>
                      <th className="text-center p-2">β₁</th>
                      <th className="text-center p-2">β₂</th>
                      <th className="text-center p-2">β₃</th>
                      <th className="text-center p-2">MSE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {structures.map((s) => {
                      const c = PETTERSEN_COEFF[s]
                      return (
                        <tr key={s} className="border-b">
                          <td className="p-2 font-semibold">{s}</td>
                          <td className="text-center p-2 font-mono">{c.beta0.toFixed(4)}</td>
                          <td className="text-center p-2 font-mono">{c.beta1.toFixed(4)}</td>
                          <td className="text-center p-2 font-mono">{c.beta2.toFixed(4)}</td>
                          <td className="text-center p-2 font-mono">{c.beta3.toFixed(4)}</td>
                          <td className="text-center p-2 font-mono">{c.mse.toFixed(4)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Separator />

            {/* Important Notes */}
            <div>
              <h3 className="font-semibold text-base mb-3">중요 참고사항</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">유효 범위:</span> BSA 0.1–2.0 m² (본 계산기 적용 범위, 소아 전용)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">BSA 공식:</span> Du Bois = 0.007184 × 키(cm)^0.725 × 체중(kg)^0.425. 원문에는 미명시, 2014년 저자 확인 보고 기준. Mosteller는 참고용입니다.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">대상:</span> Children's Hospital of Michigan, 782명 (1일~18세)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">정상 범위:</span> Z-score −2 ~ +2 (약 95% 참고구간)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive font-bold">•</span>
                  <span>
                    <span className="font-semibold">BSA 0.1–2.0 m² 밖:</span> 결과 차단. 해당 연령·체격에 적합한 참고모형을 확인하세요.
                  </span>
                </li>
              </ul>
            </div>

            <Separator />

            {/* Reference */}
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold mb-1">참고문헌:</p>
              <p>
                Pettersen MD, Du W, Skeens ME, Humes RA. "Regression equations for calculation of z scores of cardiac 
                structures in a large cohort of healthy infants, children, and adolescents: an echocardiographic study."
                <em> J Am Soc Echocardiogr.</em> 2008 Aug;21(8):922-34.
              </p>
              <a
                href="https://pubmed.ncbi.nlm.nih.gov/18406572/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-chart-1 hover:underline mt-1 inline-block"
              >
                → PubMed 보기
              </a>
              <p className="mt-2"><a href="https://thoracickey.com/authors-reply-37/" target="_blank" rel="noopener noreferrer" className="underline">BSA 산식 확인: Authors’ Reply (2014년 저자 교신 인용)</a></p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
