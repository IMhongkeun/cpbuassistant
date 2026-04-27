"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import EchoZScorePettersen from "./echo-zscore-pettersen"

// ──────────────────────────────────────────────────────────────────────────
// ✅ Pediatric‑only Echo Z‑Score Calculator (PHN Table 2 aligned)
//  - Only pediatric model (PHN, Lopez 2017). If BSA > 2.3 m² → results suppressed with warning.
//  - Linear dimensions use alpha = 0.5 (BSA^0.5).
//  - indexed_mean, sd are μ and σ in indexed space (X / BSA^α), units: cm.
//  - display (mm): mean = μ·BSA^α·10, Z-band(−3..+3) = (μ ± k·σ)·BSA^α·10.
//  - AoV: PLAX hinge‑to‑hinge; MV/TV: LAT (Apical 4C) only.
//  - BSA formula: Mosteller = sqrt((height(cm) × weight(kg)) / 3600).

// Z levels to show
const Z_LEVELS = [-3, -2, -1, 0, 1, 2, 3] as const

// ──────────────────────────────────────────────────────────────────────────
// 1) Lookup table for small BSA (MPA/RPA/LPA, BSA ≤ 0.70) — mean in mm
const LOOKUP_PEDS: Record<"MPA" | "RPA" | "LPA", [number, number][]> = {
  MPA: [
    [0.1, 5.8],
    [0.11, 6.1],
    [0.12, 6.3],
    [0.13, 6.6],
    [0.14, 6.9],
    [0.15, 7.0],
    [0.16, 7.1],
    [0.17, 7.4],
    [0.18, 7.7],
    [0.19, 8.0],
    [0.2, 8.2],
    [0.21, 8.5],
    [0.22, 8.9],
    [0.23, 9.0],
    [0.24, 9.1],
    [0.25, 9.4],
    [0.26, 9.6],
    [0.27, 9.9],
    [0.28, 10.0],
    [0.29, 10.1],
    [0.3, 10.2],
    [0.31, 10.5],
    [0.32, 10.7],
    [0.33, 10.9],
    [0.34, 11.0],
    [0.35, 11.1],
    [0.36, 11.2],
    [0.37, 11.3],
    [0.38, 11.6],
    [0.39, 11.9],
    [0.4, 12.0],
    [0.41, 12.1],
    [0.42, 12.3],
    [0.43, 12.5],
    [0.44, 12.6],
    [0.45, 12.7],
    [0.46, 12.8],
    [0.47, 12.9],
    [0.48, 13.0],
    [0.49, 13.1],
    [0.5, 13.3],
    [0.51, 13.4],
    [0.52, 13.5],
    [0.53, 13.7],
    [0.54, 13.9],
    [0.55, 14.0],
    [0.56, 14.1],
    [0.57, 14.2],
    [0.58, 14.3],
    [0.59, 14.5],
    [0.6, 14.7],
    [0.61, 14.9],
    [0.62, 15.0],
    [0.63, 15.1],
    [0.64, 15.2],
    [0.65, 15.3],
    [0.66, 15.5],
    [0.67, 15.6],
    [0.68, 15.7],
    [0.69, 15.8],
    [0.7, 16.0],
  ],
  RPA: [
    [0.1, 3.2],
    [0.11, 3.3],
    [0.12, 3.4],
    [0.13, 3.6],
    [0.14, 3.8],
    [0.15, 4.0],
    [0.16, 4.2],
    [0.17, 4.3],
    [0.18, 4.4],
    [0.19, 4.6],
    [0.2, 4.7],
    [0.21, 4.8],
    [0.22, 5.0],
    [0.23, 5.1],
    [0.24, 5.2],
    [0.25, 5.3],
    [0.26, 5.4],
    [0.27, 5.5],
    [0.28, 5.6],
    [0.29, 5.8],
    [0.3, 6.0],
    [0.31, 6.1],
    [0.32, 6.2],
    [0.33, 6.3],
    [0.34, 6.4],
    [0.35, 6.5],
    [0.36, 6.6],
    [0.37, 6.7],
    [0.38, 6.8],
    [0.39, 6.9],
    [0.4, 7.0],
    [0.41, 7.1],
    [0.42, 7.2],
    [0.43, 7.3],
    [0.44, 7.4],
    [0.45, 7.5],
    [0.46, 7.5],
    [0.47, 7.6],
    [0.48, 7.7],
    [0.49, 7.8],
    [0.5, 7.8],
    [0.51, 7.9],
    [0.52, 8.0],
    [0.53, 8.1],
    [0.54, 8.2],
    [0.55, 8.3],
    [0.56, 8.3],
    [0.57, 8.4],
    [0.58, 8.5],
    [0.59, 8.6],
    [0.6, 8.7],
    [0.61, 8.8],
    [0.62, 8.9],
    [0.63, 9.0],
    [0.64, 9.1],
    [0.65, 9.2],
    [0.66, 9.2],
    [0.67, 9.3],
    [0.68, 9.4],
    [0.69, 9.4],
    [0.7, 9.5],
  ],
  LPA: [
    [0.1, 3.0],
    [0.11, 3.2],
    [0.12, 3.3],
    [0.13, 3.4],
    [0.14, 3.6],
    [0.15, 3.8],
    [0.16, 3.9],
    [0.17, 4.0],
    [0.18, 4.2],
    [0.19, 4.3],
    [0.2, 4.5],
    [0.21, 4.6],
    [0.22, 4.8],
    [0.23, 4.9],
    [0.24, 5.0],
    [0.25, 5.2],
    [0.26, 5.3],
    [0.27, 5.4],
    [0.28, 5.5],
    [0.29, 5.7],
    [0.3, 5.9],
    [0.31, 6.0],
    [0.32, 6.1],
    [0.33, 6.2],
    [0.34, 6.3],
    [0.35, 6.5],
    [0.36, 6.6],
    [0.37, 6.7],
    [0.38, 6.8],
    [0.39, 7.0],
    [0.4, 7.2],
    [0.41, 7.1],
    [0.42, 7.2],
    [0.43, 7.3],
    [0.44, 7.4],
    [0.45, 7.5],
    [0.46, 7.6],
    [0.47, 7.7],
    [0.48, 7.9],
    [0.49, 8.0],
    [0.5, 8.1],
    [0.51, 8.2],
    [0.52, 8.3],
    [0.53, 8.3],
    [0.54, 8.4],
    [0.55, 8.5],
    [0.56, 8.6],
    [0.57, 8.7],
    [0.58, 8.8],
    [0.59, 8.9],
    [0.6, 9.0],
    [0.61, 9.1],
    [0.62, 9.2],
    [0.63, 9.3],
    [0.64, 9.4],
    [0.65, 9.5],
    [0.66, 9.6],
    [0.67, 9.7],
    [0.68, 9.8],
    [0.69, 9.8],
    [0.7, 9.9],
  ],
}

// ──────────────────────────────────────────────────────────────────────────
// 2) PHN Table 2 constants (indexed μ & σ in cm; α=0.5 for linear). MV/TV = LAT only

type ModelType = "power"
interface Coeff {
  type: ModelType
  indexed_mean: number // cm in indexed space
  alpha: number
  sd: number // cm in indexed space
  ref: string
}

const COEFF: Record<"MPA" | "RPA" | "LPA" | "PV" | "AoV" | "MV" | "TV", Coeff> = {
  // PA branches
  MPA: { type: "power", indexed_mean: 1.82, alpha: 0.5, sd: 0.24, ref: "Lopez 2017 PHN (Table 2)" },
  RPA: { type: "power", indexed_mean: 1.07, alpha: 0.5, sd: 0.18, ref: "Lopez 2017 PHN (Table 2)" },
  LPA: { type: "power", indexed_mean: 1.1, alpha: 0.5, sd: 0.18, ref: "Lopez 2017 PHN (Table 2)" },
  PV: { type: "power", indexed_mean: 1.91, alpha: 0.5, sd: 0.24, ref: "Lopez 2017 PHN (Table 2, PV SAX)" },
  // Annuli (LAT for MV/TV)
  AoV: { type: "power", indexed_mean: 1.48, alpha: 0.5, sd: 0.14, ref: "Lopez 2017 PHN (Table 2)" },
  MV: { type: "power", indexed_mean: 2.23, alpha: 0.5, sd: 0.22, ref: "Lopez 2017 PHN (Table 2, MV LAT)" },
  TV: { type: "power", indexed_mean: 2.36, alpha: 0.5, sd: 0.29, ref: "Lopez 2017 PHN (Table 2, TV LAT)" },
}

// ──────────────────────────────────────────────────────────────────────────
// 3) Helpers
const calcBSA = (heightCm: number, weightKg: number) => {
  // Mosteller BSA (m²): sqrt((height(cm) × weight(kg)) / 3600)
  if (!(heightCm > 0 && weightKg > 0)) return 0
  return Math.sqrt((heightCm * weightKg) / 3600)
}

const interpLookup = (table: [number, number][], bsa: number) => {
  if (bsa <= table[0][0]) return table[0][1]
  if (bsa >= table[table.length - 1][0]) return table[table.length - 1][1]
  for (let i = 0; i < table.length - 1; i++) {
    const [x1, y1] = table[i]
    const [x2, y2] = table[i + 1]
    if (bsa >= x1 && bsa <= x2) {
      const t = (bsa - x1) / (x2 - x1)
      return y1 + t * (y2 - y1)
    }
  }
  return Number.NaN
}

// PHN(power): mean(mm) = μ·BSA^α·10, band(mm) = (μ ± kσ)·BSA^α·10
const computePower = (bsa: number, c: Coeff) => {
  const pow = Math.pow(bsa, c.alpha)
  const mean = c.indexed_mean * pow * 10 // cm→mm
  const sdScaled = c.sd * pow * 10 // cm→mm with BSA^α scaling
  const range = Z_LEVELS.map((k) => mean + k * sdScaled)
  return { mean, sd: sdScaled, range }
}

// ──────────────────────────────────────────────────────────────────────────
// 4) Component
export default function EchoZScoreTool() {
  const [height, setHeight] = useState<number | string>("")
  const [weight, setWeight] = useState<number | string>("")
  const [bsaValue, setBsaValue] = useState("")
  const [showFormulaGuide, setShowFormulaGuide] = useState(false)

  const h = typeof height === "number" ? height : Number.parseFloat(height as string) || 0
  const w = typeof weight === "number" ? weight : Number.parseFloat(weight as string) || 0
  const bsaCalc = calcBSA(h, w)
  const bsa = (Number.parseFloat(bsaValue) || 0) > 0 ? Number.parseFloat(bsaValue) : bsaCalc

  const BSA_LIMIT = 2.3
  const BSA_WARN = 2.0
  const isBlocked = bsa > BSA_LIMIT
  const isHighBSA = !isBlocked && bsa >= BSA_WARN

  const structures = ["MPA", "RPA", "LPA", "PV", "AoV", "MV", "TV"] as const
  type Structure = (typeof structures)[number]

  const compute = (s: Structure) => {
    if (isBlocked) {
      return {
        mean: 0,
        sd: null as number | null,
        range: null as number[] | null,
        src: "차단",
        ref: "BSA>2.3: 성인 표준 필요",
      }
    }
    if (!(bsa > 0)) {
      return {
        mean: 0,
        sd: null as number | null,
        range: null as number[] | null,
        src: "데이터 없음",
        ref: "입력 필요",
      }
    }

    // BSA ≤ 0.70: PA mean from lookup(mm) + PHN SD scaled by BSA^α
    if (bsa <= 0.7 && (s === "MPA" || s === "RPA" || s === "LPA")) {
      const mean = interpLookup(LOOKUP_PEDS[s], bsa)
      const c = COEFF[s]
      const pow = Math.pow(bsa, c.alpha)
      const sd = c.sd * pow * 10
      const range = Z_LEVELS.map((k) => mean + k * sd)
      return { mean, sd, range, src: "LOOKUP + PHN SD(BSA^α)", ref: c.ref }
    }

    // Otherwise: PHN power model
    const c = COEFF[s]
    const result = computePower(bsa, c)
    return { ...result, src: "PHN 회귀식", ref: c.ref }
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
    const w = typeof weight === "number" ? weight : Number.parseFloat(weight as string) || 0
    if (nh > 0 && w > 0) setBsaValue(calcBSA(nh, w).toFixed(2))
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
    const h = typeof height === "number" ? height : Number.parseFloat(height as string) || 0
    if (h > 0 && nw > 0) setBsaValue(calcBSA(h, nw).toFixed(2))
  }

  return (
    <div className="bg-background rounded-xl shadow-lg p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Echo Z‑Score Calculator</h2>
        <p className="text-muted-foreground">소아 심장초음파 Z-score 계산기</p>
      </div>

      <Tabs defaultValue="pettersen" className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
          <TabsTrigger value="pettersen">Pettersen (2008)</TabsTrigger>
          <TabsTrigger value="phn">PHN (Lopez 2017)</TabsTrigger>
        </TabsList>

        <TabsContent value="phn" className="space-y-6">
          <p className="text-center text-sm text-muted-foreground mb-4">
            PHN Table 2 • MV/TV = LAT(4C) • Z-range −3…+3 • BSA ≤ 2.3 m²
          </p>

          {/* 입력 카드 */}
          <Card className="w-full max-w-md mx-auto mb-6">
        <CardHeader>
          <CardTitle>환자 정보 입력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col">
              <label htmlFor="h" className="text-xs text-muted-foreground mb-1">
                키 (cm)
              </label>
              <Input id="h" type="number" min="30" value={height} onChange={handleHeightChange} placeholder="" />
            </div>
            <div className="flex-1 flex flex-col">
              <label htmlFor="w" className="text-xs text-muted-foreground mb-1">
                체중 (kg)
              </label>
              <Input id="w" type="number" min="1" value={weight} onChange={handleWeightChange} placeholder="" />
            </div>
          </div>

          <div className="flex flex-col">
            <label htmlFor="bsa" className="text-xs text-muted-foreground mb-1">
              BSA (m²) — Mosteller
            </label>
            <Input
              id="bsa"
              type="number"
              step="0.001"
              min="0.1"
              value={bsaValue}
              onChange={(e) => setBsaValue(e.target.value)}
            />
          </div>

          {isBlocked && (
            <div className="mt-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
              BSA가 {BSA_LIMIT.toFixed(1)} m²를 초과했습니다. PHN 소아 nomogram의 유효 범위를 벗어나{" "}
              <b>결과가 표시되지 않습니다</b>. 성인 기준(WASE 등)을 사용해야 합니다.
            </div>
          )}

          {!isBlocked && isHighBSA && (
            <div className="mt-2 text-xs text-chart-5 bg-chart-5/10 border border-chart-5/20 rounded p-2">
              BSA ≥ 2.0 m²: PHN 소아 nomogram의 상단 경계 영역입니다. 결과 해석 시 임상/카테 소견과 교차 확인하세요.
            </div>
          )}

          {!isBlocked && bsa > 0 && bsa <= 0.7 && (
            <div className="mt-2 text-xs text-chart-4 bg-chart-4/10 border border-chart-4/20 rounded p-2">
              BSA ≤ 0.7 m²: 저체중 영아/신생아 영역입니다. 측정 오차가 Z-score에 크게 반영될 수 있습니다.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {(["MPA", "RPA", "LPA", "PV", "AoV", "MV", "TV"] as const).map((s) => {
          const info = compute(s)
          return (
            <Card key={s} className="relative overflow-hidden">
              <CardHeader>
                <CardTitle>{s}</CardTitle>
              </CardHeader>
              <CardContent>
                {isBlocked ? (
                  <p className="text-sm text-destructive">
                    BSA &gt; {BSA_LIMIT.toFixed(1)} m²: 소아 nomogram 범위 밖입니다. 결과 제공되지 않습니다.
                  </p>
                ) : (
                  <>
                    <p className="text-xs mb-1 text-muted-foreground">근거: {info.ref}</p>
                    <p className="text-xs mb-2 text-muted-foreground">Source: {info.src}</p>
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

      <Card className="w-full max-w-5xl mx-auto mt-6">
        <CardHeader className="cursor-pointer" onClick={() => setShowFormulaGuide(!showFormulaGuide)}>
          <CardTitle className="flex items-center justify-between text-lg">
            <span>PHN Z-score 계산식 안내</span>
            <span className="text-muted-foreground text-sm">{showFormulaGuide ? "▲ 접기" : "▼ 펼치기"}</span>
          </CardTitle>
        </CardHeader>

        {showFormulaGuide && (
          <CardContent className="space-y-6">
            {/* 기본 공식 */}
            <div>
              <h3 className="font-semibold text-base mb-3">기본 계산 공식 (Power Law Model)</h3>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-mono text-sm">
                  <span className="font-bold">예측값 (mm)</span> = μ × BSA<sup>α</sup> × 10
                </p>
                <p className="font-mono text-sm">
                  <span className="font-bold">표준편차 (mm)</span> = σ × BSA<sup>α</sup> × 10
                </p>
                <p className="font-mono text-sm">
                  <span className="font-bold">Z-score</span> = (측정값 - 예측값) / 표준편차
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                * μ, σ는 indexed space의 값 (cm 단위), α는 power exponent
              </p>
            </div>

            <Separator />

            {/* 계수표 */}
            <div>
              <h3 className="font-semibold text-base mb-3">구조물별 계수 (Lopez et al. 2017, PHN Table 2)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2">
                      <th className="text-left p-2">구조물</th>
                      <th className="text-left p-2">측정 부위</th>
                      <th className="text-center p-2">μ (cm)</th>
                      <th className="text-center p-2">σ (cm)</th>
                      <th className="text-center p-2">α</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-2 font-semibold">MPA</td>
                      <td className="p-2 text-muted-foreground">주폐동맥</td>
                      <td className="text-center p-2 font-mono">1.82</td>
                      <td className="text-center p-2 font-mono">0.24</td>
                      <td className="text-center p-2 font-mono">0.5</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 font-semibold">RPA</td>
                      <td className="p-2 text-muted-foreground">우폐동맥</td>
                      <td className="text-center p-2 font-mono">1.07</td>
                      <td className="text-center p-2 font-mono">0.18</td>
                      <td className="text-center p-2 font-mono">0.5</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 font-semibold">LPA</td>
                      <td className="p-2 text-muted-foreground">좌폐동맥</td>
                      <td className="text-center p-2 font-mono">1.10</td>
                      <td className="text-center p-2 font-mono">0.18</td>
                      <td className="text-center p-2 font-mono">0.5</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 font-semibold">PV</td>
                      <td className="p-2 text-muted-foreground">폐동맥판륜 (SAX)</td>
                      <td className="text-center p-2 font-mono">1.91</td>
                      <td className="text-center p-2 font-mono">0.24</td>
                      <td className="text-center p-2 font-mono">0.5</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 font-semibold">AoV</td>
                      <td className="p-2 text-muted-foreground">대동맥판 (PLAX, hinge-to-hinge)</td>
                      <td className="text-center p-2 font-mono">1.48</td>
                      <td className="text-center p-2 font-mono">0.14</td>
                      <td className="text-center p-2 font-mono">0.5</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 font-semibold">MV</td>
                      <td className="p-2 text-muted-foreground">승모판 (A4C, LAT)</td>
                      <td className="text-center p-2 font-mono">2.23</td>
                      <td className="text-center p-2 font-mono">0.22</td>
                      <td className="text-center p-2 font-mono">0.5</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-2 font-semibold">TV</td>
                      <td className="p-2 text-muted-foreground">삼첨판 (A4C, LAT)</td>
                      <td className="text-center p-2 font-mono">2.36</td>
                      <td className="text-center p-2 font-mono">0.29</td>
                      <td className="text-center p-2 font-mono">0.5</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                * α = 0.5: 선형 치수(linear dimension)에 대한 표준 scaling exponent
              </p>
            </div>

            <Separator />

            {/* 계산 예시 */}
            <div>
              <h3 className="font-semibold text-base mb-3">계산 예시</h3>
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <p className="text-sm">
                  <span className="font-semibold">환자:</span> BSA = 0.5 m²
                </p>
                <p className="text-sm">
                  <span className="font-semibold">측정:</span> MPA = 15.0 mm
                </p>

                <div className="space-y-1 text-sm mt-3">
                  <p className="font-semibold">단계별 계산:</p>
                  <p className="font-mono ml-4">
                    1. BSA<sup>0.5</sup> = 0.5<sup>0.5</sup> = 0.7071
                  </p>
                  <p className="font-mono ml-4">
                    2. 예측값 = 1.82 × 0.7071 × 10 = <span className="font-bold text-chart-1">12.9 mm</span>
                  </p>
                  <p className="font-mono ml-4">3. 표준편차 = 0.24 × 0.7071 × 10 = 1.7 mm</p>
                  <p className="font-mono ml-4">
                    4. Z-score = (15.0 - 12.9) / 1.7 = <span className="font-bold text-chart-1">+1.24</span>
                  </p>
                </div>

                <p className="text-sm text-muted-foreground mt-3">
                  → MPA가 예측값보다 약간 큰 편이지만 정상 범위 내 (Z = -2 ~ +2)
                </p>
              </div>
            </div>

            <Separator />

            {/* 중요 참고사항 */}
            <div>
              <h3 className="font-semibold text-base mb-3">중요 참고사항</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">유효 범위:</span> BSA 0.1 ~ 2.3 m² (소아 전용)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">BSA 계산:</span> Mosteller 공식 = √(키(cm) × 체중(kg) / 3600)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">정상 범위:</span> Z-score -2 ~ +2 (95% 신뢰구간)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-5 font-bold">•</span>
                  <span>
                    <span className="font-semibold">BSA ≥ 2.0 m²:</span> 소아 nomogram 상단 경계, 결과 해석 시 주의
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-destructive font-bold">•</span>
                  <span>
                    <span className="font-semibold">BSA &gt; 2.3 m²:</span> 성인 기준 사용 필요 (예: WASE guideline)
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-2 font-bold">•</span>
                  <span>
                    <span className="font-semibold">MV/TV:</span> 반드시 Apical 4-chamber view, LAT (lateral annulus)
                    측정
                  </span>
                </li>
              </ul>
            </div>

            <Separator />

            {/* 참고문헌 */}
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold mb-1">참고문헌:</p>
              <p>
                Lopez L, et al. "Relationship of Echocardiographic Z Scores Adjusted for Body Surface Area to Age, Sex,
                Race, and Ethnicity: The Pediatric Heart Network Normal Echocardiography Database."
                <em> Circ Cardiovasc Imaging.</em> 2017;10(11):e006979.
              </p>
              <a
                href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5812349/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-chart-1 hover:underline mt-1 inline-block"
              >
                → PMC 전문 보기
              </a>
            </div>
          </CardContent>
        )}
      </Card>
        </TabsContent>

        <TabsContent value="pettersen">
          <EchoZScorePettersen />
        </TabsContent>
      </Tabs>
    </div>
  )
}
