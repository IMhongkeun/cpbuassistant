"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Info } from "lucide-react"

// ──────────────────────────────────────────────────────────────────────────
// Pettersen 2008 (Detroit Data) Echo Z-Score Calculator
// Reference: Pettersen MD, Du W, Skeens ME, Humes RA.
// "Regression equations for calculation of z scores of cardiac structures
//  in a large cohort of healthy infants, children, and adolescents."
// J Am Soc Echocardiogr. 2008 Aug;21(8):922-34.
// ──────────────────────────────────────────────────────────────────────────

// Z-score levels to display
const Z_LEVELS = [-3, -2, -1, 0, 1, 2, 3] as const

// ──────────────────────────────────────────────────────────────────────────
// Pettersen 2008 Regression Coefficients (Detroit Data)
// Model: ln(Y) = β₀ + β₁×BSA + β₂×BSA² + β₃×BSA³
// Where Y is the measurement in cm
// The coefficients are from Table 3 of the original paper
// ──────────────────────────────────────────────────────────────────────────

interface PettersenCoeff {
  name: string           // Structure name
  beta0: number          // Intercept (β₀)
  beta1: number          // Linear coefficient (β₁)
  beta2: number          // Quadratic coefficient (β₂)
  beta3: number          // Cubic coefficient (β₃)
  mse: number            // Mean Squared Error
  description: string    // Measurement description
}

// Coefficients from Pettersen 2008, Table 2
// Reference: J Am Soc Echocardiogr 2008;21:922-34
// Original paper uses Haycock BSA formula
const PETTERSEN_COEFF: Record<string, PettersenCoeff> = {
  // Pulmonary Arteries
  MPA: {
    name: "MPA",
    beta0: -0.707,
    beta1: 2.746,
    beta2: -1.807,
    beta3: 0.424,
    mse: 0.024,
    description: "주폐동맥 (Main Pulmonary Artery)"
  },
  RPA: {
    name: "RPA",
    beta0: -1.360,
    beta1: 3.394,
    beta2: -2.508,
    beta3: 0.660,
    mse: 0.027,
    description: "우폐동맥 (Right Pulmonary Artery)"
  },
  LPA: {
    name: "LPA",
    beta0: -1.348,
    beta1: 2.884,
    beta2: -1.954,
    beta3: 0.466,
    mse: 0.028,
    description: "좌폐동맥 (Left Pulmonary Artery)"
  },
  // Valve Annuli
  PV: {
    name: "PV",
    beta0: -0.761,
    beta1: 2.774,
    beta2: -1.808,
    beta3: 0.436,
    mse: 0.023,
    description: "폐동맥판륜 (Pulmonary Valve Annulus)"
  },
  AoV: {
    name: "AoV",
    beta0: -0.874,
    beta1: 2.708,
    beta2: -1.841,
    beta3: 0.452,
    mse: 0.010,
    description: "대동맥판륜 (Aortic Valve Annulus)"
  },
  MV: {
    name: "MV",
    beta0: -0.271,
    beta1: 2.446,
    beta2: -1.700,
    beta3: 0.425,
    mse: 0.022,
    description: "승모판륜 (Mitral Valve Annulus)"
  },
  TV: {
    name: "TV",
    beta0: -0.164,
    beta1: 2.341,
    beta2: -1.596,
    beta3: 0.387,
    mse: 0.036,
    description: "삼첨판륜 (Tricuspid Valve Annulus)"
  },
}

// ──────────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────────

// Mosteller BSA formula: BSA (m²) = √((height(cm) × weight(kg)) / 3600)
const calcBSA = (heightCm: number, weightKg: number): number => {
  if (!(heightCm > 0 && weightKg > 0)) return 0
  return Math.sqrt((heightCm * weightKg) / 3600)
}

// Pettersen Model: ln(Y) = β₀ + β₁×BSA + β₂×BSA² + β₃×BSA³
// Returns ln(Y) in cm
const calcLnMean = (bsa: number, coeff: PettersenCoeff): number => {
  return coeff.beta0 + 
         coeff.beta1 * bsa + 
         coeff.beta2 * Math.pow(bsa, 2) + 
         coeff.beta3 * Math.pow(bsa, 3)
}

// Get predicted mean value in mm
const calcMean = (bsa: number, coeff: PettersenCoeff): number => {
  const lnY = calcLnMean(bsa, coeff)
  return Math.exp(lnY) * 10 // Convert cm to mm
}

// Get RMSE (standard deviation in log space)
const calcRMSE = (coeff: PettersenCoeff): number => {
  return Math.sqrt(coeff.mse)
}

// Calculate size at a given Z-score (in mm)
const calcSizeAtZ = (bsa: number, z: number, coeff: PettersenCoeff): number => {
  const lnMean = calcLnMean(bsa, coeff)
  const rmse = calcRMSE(coeff)
  const lnSize = lnMean + z * rmse
  return Math.exp(lnSize) * 10 // Convert cm to mm
}

// ──────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────

export default function EchoZScorePettersen() {
  const [height, setHeight] = useState<number | string>("")
  const [weight, setWeight] = useState<number | string>("")
  const [bsaValue, setBsaValue] = useState("")
  const [showFormulaGuide, setShowFormulaGuide] = useState(false)

  // Parse inputs
  const h = typeof height === "number" ? height : Number.parseFloat(height as string) || 0
  const w = typeof weight === "number" ? weight : Number.parseFloat(weight as string) || 0
  const bsaCalc = calcBSA(h, w)
  const bsa = (Number.parseFloat(bsaValue) || 0) > 0 ? Number.parseFloat(bsaValue) : bsaCalc

  // BSA limits for Pettersen 2008
  const BSA_LIMIT = 2.0
  const isBlocked = bsa > BSA_LIMIT

  const structures = ["MPA", "RPA", "LPA", "PV", "AoV", "MV", "TV"] as const

  // Compute results for a structure
  const compute = (s: string) => {
    if (isBlocked) {
      return {
        mean: 0,
        range: null as number[] | null,
        rmse: 0,
        ref: "BSA > 2.0: 범위 초과",
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
    const mean = calcMean(bsa, coeff)
    const rmse = calcRMSE(coeff)
    const range = Z_LEVELS.map((z) => calcSizeAtZ(bsa, z, coeff))

    return { mean, range, rmse, ref: "Pettersen 2008" }
  }

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val === "") {
      setHeight("")
      setBsaValue("")
      return
    }
    const nh = Number.parseFloat(val) || 0
    setHeight(nh)
    const currentWeight = typeof weight === "number" ? weight : Number.parseFloat(weight as string) || 0
    if (nh > 0 && currentWeight > 0) setBsaValue(calcBSA(nh, currentWeight).toFixed(2))
  }

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val === "") {
      setWeight("")
      setBsaValue("")
      return
    }
    const nw = Number.parseFloat(val) || 0
    setWeight(nw)
    const currentHeight = typeof height === "number" ? height : Number.parseFloat(height as string) || 0
    if (currentHeight > 0 && nw > 0) setBsaValue(calcBSA(currentHeight, nw).toFixed(2))
  }

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

          <div className="flex flex-col">
            <label htmlFor="bsa-pettersen" className="text-xs text-muted-foreground mb-1">
              BSA (m²) — Mosteller
            </label>
            <Input
              id="bsa-pettersen"
              type="number"
              step="0.001"
              min="0.1"
              value={bsaValue}
              onChange={(e) => setBsaValue(e.target.value)}
            />
          </div>

          {isBlocked && (
            <div className="mt-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
              BSA 2.0 m² 초과: Pettersen 2008 소아 기준 범위를 벗어났습니다. 성인 기준(WASE 등)을 사용해야 합니다.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result Cards Grid */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {structures.map((s) => {
          const info = compute(s)
          const coeff = PETTERSEN_COEFF[s]
          return (
            <Card key={s} className="relative overflow-hidden">
              <CardHeader>
                <CardTitle>{s}</CardTitle>
              </CardHeader>
              <CardContent>
                {isBlocked ? (
                  <p className="text-sm text-destructive">
                    BSA &gt; 2.0 m²: Pettersen 2008 소아 기준 범위를 벗어났습니다.
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

      {/* Formula Guide Card */}
      <Card className="w-full max-w-5xl mx-auto">
        <CardHeader className="cursor-pointer" onClick={() => setShowFormulaGuide(!showFormulaGuide)}>
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Pettersen 2008 Z-score 계산식 안내
            </span>
            <span className="text-muted-foreground text-sm">{showFormulaGuide ? "▲ 접기" : "▼ 펼치기"}</span>
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
                    <span className="font-bold">Z-score</span> = (ln(측정값<sub>cm</sub>) − ln(예측값)) / √MSE
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
                    <span className="font-semibold">유효 범위:</span> BSA ≤ 2.0 m² (소아 전용)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">원본 BSA 공식:</span> Haycock (본 계산기는 Mosteller 사용)
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
                    <span className="font-semibold">정상 범위:</span> Z-score -2 ~ +2 (95% 신뢰구간)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive font-bold">•</span>
                  <span>
                    <span className="font-semibold">BSA &gt; 2.0 m²:</span> 성인 기준 사용 필요 (예: WASE guideline)
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
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
