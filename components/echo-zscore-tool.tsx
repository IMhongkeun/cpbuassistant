"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useWorkspaceSync } from "@/components/workspace/workspace-provider"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import EchoZScorePettersen from "./echo-zscore-pettersen"
import { EchoBsaDisplay } from "./echo-bsa-display"
import { PHN_COEFF as COEFF, ECHO_Z_LEVELS as Z_LEVELS, phnBand, resolveEchoBsa } from "@/lib/echo-zscore"

// PHN 2017 Table 2; model BSA is Haycock. Department lookup is separate.
// All calculations use the original units and alpha; display conversions are per parameter.
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
const primaryStructures = ["MPA", "RPA", "LPA", "PV", "AoV", "MV", "TV"] as const
const extraGroups = [
  { title: "Aorta · 대동맥", keys: ["ROOT", "STJ", "AAO", "ARCH_PROX", "ARCH_DIST", "ISTH"] },
  { title: "Coronary arteries · 관상동맥", keys: ["LMCA", "LAD", "RCA"] },
  { title: "Valve / ventricle · 판막·심실 치수", keys: ["MV_AP", "TV_AP", "PV_LAX", "LVEDD", "LVPWT", "LVST", "LVEDL", "LVEDL_EPI"] },
  { title: "Area / volume / mass / ratio · 면적·용적·질량·비율", keys: ["MVA", "TVA", "LVEDA", "LVEDA_EPI", "LVEDV", "LVEDV_EPI", "LVM", "LVMTV", "LVTTD", "LVSI"] },
]
const structures = [...primaryStructures, ...extraGroups.flatMap(g=>g.keys)]

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

export default function EchoZScoreTool() {
  const [height, setHeight] = useState<number | string>("")
  const [weight, setWeight] = useState<number | string>("")
  const [manualBsa, setManualBsa] = useState("")
  const [showFormulaGuide, setShowFormulaGuide] = useState(false)

  // Patient Workspace only: height and weight follow the active case. The BSA
  // field here stays calculator-specific (this tool's own formula notes apply).
  useWorkspaceSync("echo-lopez", {
    height: { value: height, set: setHeight, patient: "heightCm" },
    weight: { value: weight, set: setWeight, patient: "weightKg" },
    manualHaycockBsa: { value: manualBsa, set: setManualBsa },
  })

  const { bsa, mosteller } = resolveEchoBsa(height, weight, manualBsa, "haycock")
  const BSA_LIMIT = 2.3
  const BSA_WARN = 2.0
  const isBlocked = bsa > BSA_LIMIT || (bsa > 0 && bsa < 0.1)
  const isHighBSA = !isBlocked && bsa >= BSA_WARN

  // Single anthropometric input state, shared across both nomogram tabs.
  const updateHeight = (value: string) => {
    setHeight(value)
    setManualBsa("")
  }
  const updateWeight = (value: string) => {
    setWeight(value)
    setManualBsa("")
  }
  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => updateHeight(e.target.value)
  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => updateWeight(e.target.value)

  // Preserve legacy department lookup values separately; old automatic BSA used two-decimal Mosteller.
  const departmentBsa = Number(mosteller.toFixed(2))
  const hasDepartment = departmentBsa >= 0.1 && departmentBsa <= 0.7
  const renderStructures = (items: readonly string[]) => (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
      {items.map(s => {
        const c = COEFF[s]
        const info = !isBlocked && bsa > 0 ? phnBand(bsa, c) : null
        const digits = c.unit === "ratio" || c.unit === "g/mL" ? 2 : 1
        const unit = c.unit === "ratio" ? "" : c.unit
        return (
          <Card key={s} className="relative overflow-hidden">
            <CardHeader><CardTitle className="text-lg break-words">{s}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs mb-1 text-muted-foreground">{c.description}</p>
              <p className="text-xs mb-2 text-muted-foreground">Source: {c.ref}{c.alpha === 0 ? " · BSA 보정 없음" : ""}</p>
              {isBlocked ? <p className="text-sm text-destructive">BSA 0.1–2.3 m² 밖: 결과 미표시</p> : info ? (
                <>
                  <p className="text-sm mb-2 font-semibold">Mean: <span className="text-chart-1 font-bold">{info.mean.toFixed(digits)} {unit}</span></p>
                  <Separator className="mb-2" />
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground border-b pb-1"><span>Z-Score</span><span>Value {unit ? "(" + unit + ")" : ""}</span></div>
                    {info.range.map((v,i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className={Z_LEVELS[i] === 0 ? "font-bold text-chart-1 font-mono" : "font-mono"}>{Z_LEVELS[i] > 0 ? "+" : ""}{Z_LEVELS[i]}</span>
                        <span className={Z_LEVELS[i] === 0 ? "font-bold text-chart-1" : ""}>{v.toFixed(digits)} {unit}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="text-sm text-muted-foreground italic">키·체중 또는 Haycock BSA를 입력하세요</p>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )

  return (
    <div className="rounded-xl bg-background p-3 shadow-lg sm:p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">Echo Z‑Score Calculator</h2>
        <p className="text-muted-foreground">소아 심장초음파 Z-score 계산기</p>
      </div>

      <Tabs defaultValue="pettersen" className="w-full">
        <TabsList className="grid h-auto min-h-16 w-full max-w-md mx-auto grid-cols-2 items-stretch mb-6">
          <TabsTrigger value="pettersen" className="h-auto min-w-0 whitespace-normal">Pettersen (2008)</TabsTrigger>
          <TabsTrigger value="phn" className="h-auto min-w-0 flex-col gap-0.5 py-2 whitespace-normal">
            <span>PHN (Lopez 2017)</span>
            <span className="text-center text-[10px] leading-tight text-muted-foreground sm:text-xs">
              Haycock · 부서 참고표 별도
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phn" className="space-y-6">
          <p className="text-center text-sm text-muted-foreground mb-4">
            PHN Table 2 • 기본 MV/TV = LAT(4C) • Z-range −3…+3 • BSA 0.1–2.3 m²
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

          <EchoBsaDisplay formula="haycock" id="bsa" height={height} weight={weight} manual={manualBsa} onManualChange={setManualBsa} />

          {isBlocked && (
            <div className="mt-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded p-2">
              BSA 0.1–2.3 m² 밖: 본 계산기 적용 범위를 벗어나 <b>결과가 표시되지 않습니다</b>.
            </div>
          )}

          {!isBlocked && isHighBSA && (
            <div className="mt-2 text-xs text-chart-5 bg-chart-5/10 border border-chart-5/20 rounded p-2">
              BSA ≥ 2.0 m²: PHN 소아 nomogram의 상단 경계 영역입니다. 결과 해석 시 임상/카테 소견과 교차 확인하세요.
            </div>
          )}

          {!isBlocked && bsa > 0 && bsa <= 0.7 && (
            <div className="mt-2 text-xs text-chart-4 bg-chart-4/10 border border-chart-4/20 rounded p-2">
              BSA ≤ 0.7 m²: 체격이 작은 소아 영역입니다. 측정 오차가 Z-score에 크게 반영될 수 있습니다.
            </div>
          )}
        </CardContent>
      </Card>

      {renderStructures(primaryStructures)}
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">추가 심장 구조물 · 27개 (Aorta, 관상동맥, 판막·심실 등)</summary>
        <p className="mt-2 text-xs text-muted-foreground">PHN Table 2 기준. 관상동맥은 원문부터 mm, 면적은 cm², 용적은 mL, 질량은 g입니다. 대동맥궁의 측정 위치를 다른 모델과 혼동하지 마세요.</p>
        {extraGroups.map(group => (
          <section key={group.title} className="mt-5 space-y-3">
            <h3 className="font-semibold text-sm">{group.title}</h3>
            {renderStructures(group.keys)}
          </section>
        ))}
      </details>

      <details className="rounded-xl border bg-muted/30 p-4">
        <summary className="cursor-pointer font-semibold">부서 참고표 · MPA / RPA / LPA (기존 방식)</summary>
        <p className="mt-2 text-xs text-muted-foreground">논문 PHN 순수 회귀식과 별도입니다. 기존 부서 보간 평균 + PHN SD 혼합 방식이며, 기존 두 자리 반올림 Mosteller BSA(0.10–0.70 m²)를 사용합니다. 검증된 PHN Z-score로 해석하지 마세요.</p>
        {hasDepartment && !isBlocked ? (
          <div className="mt-3 overflow-x-auto">
            <p className="text-xs mb-2">부서 참고표 BSA (Mosteller): {departmentBsa.toFixed(2)} m²</p>
            <table className="w-full text-xs border-collapse">
              <thead><tr className="border-b"><th className="text-left p-2">Z / mm</th>{(["MPA","RPA","LPA"] as const).map(s=><th key={s} className="p-2">{s}</th>)}</tr></thead>
              <tbody>{Z_LEVELS.map(z=><tr key={z} className={z===0?"border-b font-semibold":"border-b"}><td className="p-2">{z>0?"+":""}{z}</td>{(["MPA","RPA","LPA"] as const).map(s=><td key={s} className="p-2 text-center">{(interpLookup(LOOKUP_PEDS[s],departmentBsa)+z*COEFF[s].sd*Math.sqrt(departmentBsa)*10).toFixed(1)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">키·체중 입력 및 Mosteller BSA 0.10–0.70 m² 범위에서만 표시됩니다.</p>}
      </details>

      <Card className="w-full max-w-5xl mx-auto mt-6">
        <CardHeader className="cursor-pointer px-3 sm:px-6" onClick={() => setShowFormulaGuide(!showFormulaGuide)}>
          <CardTitle className="flex items-center justify-between gap-2 whitespace-nowrap text-xs sm:gap-3 sm:text-lg">
            <span className="min-w-0 truncate">PHN Z-score 계산식 안내</span>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground sm:text-sm">
              {showFormulaGuide ? "▲ 접기" : "▼ 펼치기"}
            </span>
          </CardTitle>
        </CardHeader>

        {showFormulaGuide && (
          <CardContent className="space-y-6">
            {/* 기본 공식 */}
            <div>
              <h3 className="font-semibold text-base mb-3">기본 계산 공식 (Power Law Model)</h3>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-mono text-sm">
                  <span className="font-bold">예측값 (원문 단위)</span> = μ × BSA<sup>α</sup>
                </p>
                <p className="font-mono text-sm">
                  <span className="font-bold">표준편차 (원문 단위)</span> = σ × BSA<sup>α</sup>
                </p>
                <p className="font-mono text-sm">
                  <span className="font-bold">Z-score</span> = (측정값 - 예측값) / 표준편차
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                * 원문 cm 치수만 mm로 변환(×10). 관상동맥 mm, 면적 cm², 용적 mL, 질량 g 및 비율은 원문 단위 그대로 표시. α=0은 BSA 보정 없음.
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
                      <th className="text-center p-2">μ</th>
                      <th className="text-center p-2">σ</th>
                      <th className="text-center p-2">α</th>
                    </tr>
                  </thead>
                  <tbody>
                    {structures.map(s => {
                      const c = COEFF[s]
                      return <tr key={s} className="border-b">
                        <td className="p-2 font-semibold">{s}</td>
                        <td className="p-2 text-muted-foreground">{c.description} ({c.sourceUnit})</td>
                        <td className="text-center p-2 font-mono">{c.indexed_mean.toFixed(2)}</td>
                        <td className="text-center p-2 font-mono">{c.sd.toFixed(2)}</td>
                        <td className="text-center p-2 font-mono">{c.alpha.toFixed(2)}</td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                * α는 구조물별로 다릅니다. Table 2의 해당 계수와 원문 단위를 사용합니다.
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
                    4. Z-score (반올림 전 값 적용) = <span className="font-bold text-chart-1">+1.26</span>
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
                    <span className="font-semibold">BSA 계산:</span> Haycock = 0.024265 × 키(cm)^0.3964 × 체중(kg)^0.5378 (원문 명시). Mosteller는 병원 참고값으로만 표시합니다.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-1 font-bold">•</span>
                  <span>
                    <span className="font-semibold">정상 범위:</span> Z-score −2 ~ +2 (약 95% 참고구간)
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
                    <span className="font-semibold">BSA 0.1–2.3 m² 밖:</span> 결과 차단. 해당 연령·체격에 적합한 참고모형을 확인하세요.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-chart-2 font-bold">•</span>
                  <span>
                    <span className="font-semibold">기본 MV/TV:</span> Apical 4-chamber LAT 측정. AP는 추가 구조물에 별도 표시합니다.
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
          <EchoZScorePettersen height={height} weight={weight} onHeightChange={updateHeight} onWeightChange={updateWeight} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
