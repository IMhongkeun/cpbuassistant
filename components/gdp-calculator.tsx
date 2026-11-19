"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { computeO2er, parseSaO2 } from "@/lib/o2er"
import { useWorkspaceActive, useWorkspaceSync } from "@/components/workspace/workspace-provider"
import { O2erLogPanel, O2erResponseGuide } from "@/components/o2er-log-panel"
import { sanitizeO2erLog, type O2erRecord } from "@/lib/o2er-log"
import { CompactEquation, MathFraction } from "@/components/ui/compact-equation"

type Tone = "default" | "good" | "warn" | "bad" | "muted"
const TONE_TEXT: Record<Tone, string> = {
  default: "text-slate-900",
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-rose-700",
  muted: "text-slate-400",
}

// Flat utility-style stat cell; used inside StatGrid (1px divider grid)
function StatCell({
  label,
  caption,
  value,
  unit,
  tone = "default",
  primary = false,
}: {
  label: string
  caption?: string
  value: string
  unit?: React.ReactNode
  tone?: Tone
  primary?: boolean
}) {
  return (
    <div className={`p-4 ${primary ? "bg-slate-50" : "bg-white"}`}>
      <p className={`text-sm ${primary ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>{label}</p>
      {caption && <p className="text-xs text-slate-500">{caption}</p>}
      <p className={`mt-1.5 ${primary ? "text-4xl" : "text-3xl"} font-semibold tracking-tight tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </p>
      {unit && <p className="mt-0.5 text-sm text-slate-600 tabular-nums">{unit}</p>}
    </div>
  )
}

function StatGrid({ cols, children }: { cols: 2 | 4; children: React.ReactNode }) {
  return (
    <div
      className={`grid grid-cols-2 ${cols === 4 ? "md:grid-cols-4" : ""} gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden`}
    >
      {children}
    </div>
  )
}

function Notice({ title = "주의", children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-slate-800 rounded-r-md">
      <p className="font-semibold text-amber-800 mb-0.5">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

// Helper functions
const computeCao2 = (hgb: number, sao2: number, pao2: number) => {
  return hgb * 1.34 * (sao2 / 100) + 0.003 * pao2
}

const computeMinFlow = (bsa: number, cao2: number, targetDO2i: number) => {
  const denom = cao2 * 10
  return denom > 0 ? (targetDO2i * bsa) / denom : Number.NaN
}

const computeActualDO2i = (flow: number, bsa: number, cao2: number) => {
  if (bsa <= 0) return Number.NaN
  const ci = flow / bsa
  return ci * cao2 * 10
}

const computeVO2Estimate = (temperature: number, bsa: number) => {
  const Q10_LOW = 2.0
  const Q10_HIGH = 2.3
  const REFERENCE_TEMP = 37
  const REFERENCE_CI = 2.4

  const factorLow = Math.pow(Q10_LOW, (temperature - REFERENCE_TEMP) / 10)
  const factorHigh = Math.pow(Q10_HIGH, (temperature - REFERENCE_TEMP) / 10)

  const ciLow = REFERENCE_CI * factorLow
  const ciHigh = REFERENCE_CI * factorHigh

  const flowLow = bsa > 0 ? ciLow * bsa : null
  const flowHigh = bsa > 0 ? ciHigh * bsa : null

  return {
    factorLow: factorLow * 100,
    factorHigh: factorHigh * 100,
    ciLow,
    ciHigh,
    flowLow,
    flowHigh,
  }
}

export default function GDPCalculator() {
  const [params, setParams] = useState({
    bsa: "",
    hgb: "",
    currentFlow: "",
    sao2: "100",
    pao2: "",
    temperature: "", // Added temperature field for VO2 estimate only
    svo2: "", // O2ER sub-tab only
    pvo2: "", // O2ER sub-tab only (optional)
  })
  const [gdpSubTab, setGdpSubTab] = useState<"do2i" | "o2er">("do2i")

  const [results, setResults] = useState<any>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [showVo2Info, setShowVo2Info] = useState(false)
  const [targetDO2i, setTargetDO2i] = useState("280")
  // Serial O2ER records (memory only in Quick Calc; saved with the case in Patient Workspace).
  const [o2erLog, setO2erLog] = useState<O2erRecord[]>([])
  const workspaceActive = useWorkspaceActive()

  // Patient Workspace only: BSA follows the case; other inputs are saved with it.
  useWorkspaceSync("gdp", {
    params: { value: params, set: setParams },
    gdpSubTab: { value: gdpSubTab, set: setGdpSubTab },
    targetDO2i: { value: targetDO2i, set: setTargetDO2i },
    o2erLog: { value: o2erLog, set: (saved: unknown) => setO2erLog(sanitizeO2erLog(saved)) },
    bsa: {
      value: params.bsa,
      set: (bsa: string) => setParams((prev) => ({ ...prev, bsa: String(bsa) })),
      patient: "bsa",
    },
  })

  const n = (v: string, fallback = 0) => {
    const x = Number.parseFloat(String(v).replace(",", "."))
    return Number.isFinite(x) ? x : fallback
  }

  const handleInputChange = (field: string, value: string) => {
    setParams((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    const bsa = n(params.bsa)
    const hgb = n(params.hgb)
    const flow = n(params.currentFlow)
    const sao2 = parseSaO2(params.sao2)
    const pao2 = Math.max(n(params.pao2, 200), 0)

    if (bsa > 0 && hgb > 0 && sao2 !== null) {
      const cao2 = computeCao2(hgb, sao2, pao2)
      const baseTarget = n(targetDO2i, 280)
      const minRequiredFlow = computeMinFlow(bsa, cao2, baseTarget)

      let actualCI = null
      let actualDO2i = null
      let flowAdequacy = null
      let flowDifference = null
      let flowPercentage = null
      let do2iGap = null

      if (flow > 0) {
        actualCI = bsa > 0 ? flow / bsa : Number.NaN
        actualDO2i = Number.isFinite(actualCI) ? actualCI * cao2 * 10 : Number.NaN

        if (Number.isFinite(minRequiredFlow) && minRequiredFlow > 0) {
          flowDifference = flow - minRequiredFlow
          flowPercentage = (flow / minRequiredFlow) * 100
          if (flowPercentage >= 100) flowAdequacy = "adequate"
          else if (flowPercentage >= 90) flowAdequacy = "borderline"
          else flowAdequacy = "insufficient"
        }

        if (Number.isFinite(actualDO2i)) {
          do2iGap = actualDO2i - baseTarget
        }
      }

      let assessment = ""
      let status = ""
      if (Number.isFinite(actualDO2i)) {
        if (actualDO2i >= Math.max(300, baseTarget)) {
          assessment = "최적 산소 공급"
          status = "optimal"
        } else if (actualDO2i >= Math.min(260, baseTarget)) {
          assessment = "적정 범위"
          status = "borderline"
        } else {
          assessment = "부족 – 개선 필요"
          status = "critical"
        }
      }

      setResults({
        cao2: Number.isFinite(cao2) ? cao2.toFixed(2) : null,
        minRequiredFlow: Number.isFinite(minRequiredFlow) ? minRequiredFlow.toFixed(2) : null,
        actualCI: Number.isFinite(actualCI) ? actualCI.toFixed(2) : null,
        actualDO2i: Number.isFinite(actualDO2i) ? actualDO2i.toFixed(1) : null,
        targetDO2i: Number.isFinite(baseTarget) ? baseTarget.toFixed(0) : null,
        do2iGap: Number.isFinite(do2iGap) ? do2iGap.toFixed(1) : null,
        flowDifference: Number.isFinite(flowDifference) ? flowDifference.toFixed(2) : null,
        flowPercentage: Number.isFinite(flowPercentage) ? flowPercentage.toFixed(0) : null,
        flowAdequacy: flowAdequacy || null,
        assessment: assessment || null,
        status: status || null,
        sao2,
        pao2,
      })
    } else {
      setResults(null)
    }
  }, [params, targetDO2i])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "optimal":
        return "bg-chart-2/10 border-chart-2/30 text-chart-2"
      case "borderline":
        return "bg-chart-4/10 border-chart-4/30 text-chart-4"
      case "critical":
        return "bg-destructive/10 border-destructive/30 text-destructive"
      default:
        return ""
    }
  }

  const getFlowColor = (adequacy: string) => {
    switch (adequacy) {
      case "adequate":
        return "bg-chart-2/10 border-chart-2/20 text-chart-2"
      case "borderline":
        return "bg-chart-4/10 border-chart-4/20 text-chart-4"
      case "insufficient":
        return "bg-destructive/10 border-destructive/20 text-destructive"
      default:
        return ""
    }
  }

  const temperature = n(params.temperature, 0)
  const bsa = n(params.bsa, 0)
  const vo2Estimate = temperature > 0 ? computeVO2Estimate(temperature, bsa) : null
  const sao2Shared = parseSaO2(params.sao2)

  const optionalNumber = (v: string) => {
    if (String(v).trim() === "") return null
    const x = Number.parseFloat(String(v).replace(",", "."))
    return Number.isFinite(x) ? x : Number.NaN
  }
  const o2erReady = n(params.hgb) > 0 && String(params.svo2).trim() !== ""
  const o2er = o2erReady
    ? computeO2er({
        hgb: n(params.hgb),
        sao2: n(params.sao2, Number.NaN),
        svo2: n(params.svo2, Number.NaN),
        pao2: optionalNumber(params.pao2),
        pvo2: optionalNumber(params.pvo2),
        flow: optionalNumber(params.currentFlow),
        bsa: optionalNumber(params.bsa),
      })
    : null
  const finiteOrNull = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null)
  const o2erCurrent =
    o2er && o2er.ok
      ? {
          inputs: {
            hgb: n(params.hgb),
            sao2: n(params.sao2, Number.NaN),
            svo2: n(params.svo2, Number.NaN),
            pao2: finiteOrNull(optionalNumber(params.pao2)),
            pvo2: finiteOrNull(optionalNumber(params.pvo2)),
            flow: finiteOrNull(optionalNumber(params.currentFlow)),
            bsa: finiteOrNull(optionalNumber(params.bsa)),
            temperature: finiteOrNull(optionalNumber(params.temperature)),
          },
          result: {
            o2er: o2er.o2er,
            o2erSaturationOnly: o2er.o2erSaturationOnly,
            cao2: o2er.cao2,
            cvo2: o2er.cvo2,
            do2i: o2er.do2i,
            vo2i: o2er.vo2i,
          },
        }
      : null

  return (
    <div className="space-y-6">
      <div className="cpbu-subtabs grid grid-cols-2 gap-1" role="tablist" aria-label="GDP calculator type">
        <button
          type="button"
          role="tab"
          aria-selected={gdpSubTab === "do2i"}
          onClick={() => setGdpSubTab("do2i")}
          className={"cpbu-subtab " + (gdpSubTab === "do2i" ? "cpbu-subtab-active" : "")}
        >
          DO₂i · Flow
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={gdpSubTab === "o2er"}
          onClick={() => setGdpSubTab("o2er")}
          className={"cpbu-subtab " + (gdpSubTab === "o2er" ? "cpbu-subtab-active" : "")}
        >
          O₂ER · 산소추출률
        </button>
      </div>

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-slate-900">
                {gdpSubTab === "do2i" ? "Goal-Directed Perfusion Calculator" : "Oxygen Extraction Ratio (O₂ER)"}
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {gdpSubTab === "do2i" ? "목표 DO₂i 달성을 위한 최소 Pump Flow" : "CPB 중 산소 공급 대비 소비 비율"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowInfo(!showInfo)} aria-expanded={showInfo}>
              계산식
            </Button>
          </div>
        </CardHeader>

        {showInfo && (
          <CardContent>
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
              {gdpSubTab === "o2er" ? (
                <>
                  <h3 className="text-sm font-semibold text-slate-900">O₂ER 계산식</h3>
                  <section className="space-y-1.5">
                    <p className="text-xs text-slate-600">동·정맥 산소함량 (mL/dL)</p>
                    <div className="grid gap-1.5 lg:grid-cols-2">
                      <CompactEquation label="CaO2 = 1.34 곱하기 Hb 곱하기 SaO2 나누기 100 더하기 0.003 곱하기 PaO2">
                      <span>CaO₂ = 1.34 × Hb ×</span>
                      <MathFraction numerator="SaO₂" denominator="100" />
                      <span>+ 0.003 × PaO₂</span>
                    </CompactEquation>
                    <CompactEquation label="CvO2 = 1.34 곱하기 Hb 곱하기 SvO2 나누기 100 더하기 0.003 곱하기 PvO2">
                      <span>CvO₂ = 1.34 × Hb ×</span>
                      <MathFraction numerator="SvO₂" denominator="100" />
                      <span>+ 0.003 × PvO₂</span>
                    </CompactEquation>
                    </div>
                  </section>
                  <section className="space-y-1.5">
                    <p className="text-xs text-slate-600">산소추출률 (Pump Flow는 비율에서 약분)</p>
                    <CompactEquation label="O2ER = CaO2 빼기 CvO2 나누기 CaO2 곱하기 100 퍼센트">
                      <span>O₂ER =</span>
                      <MathFraction numerator="CaO₂ − CvO₂" denominator="CaO₂" />
                      <span>× 100%</span>
                    </CompactEquation>
                  </section>
                  <section className="space-y-1.5">
                    <p className="text-xs text-slate-600">Pump Flow·BSA 입력 시 (mL/min/m²)</p>
                    <div className="grid gap-1.5 lg:grid-cols-3">
                      <CompactEquation label="CI = Pump Flow 나누기 BSA">
                      <span>CI =</span>
                      <MathFraction numerator="Pump Flow" denominator="BSA" />
                    </CompactEquation>
                    <CompactEquation label="DO2i = CI 곱하기 CaO2 곱하기 10">
                      <span>DO₂i = CI × CaO₂ × 10</span>
                    </CompactEquation>
                    <CompactEquation label="VO2i = CI 곱하기 CaO2 빼기 CvO2 곱하기 10">
                      <span>VO₂i = CI × (CaO₂ − CvO₂) × 10</span>
                    </CompactEquation>
                    </div>
                  </section>
                  <section className="space-y-1.5">
                    <p className="text-xs text-slate-600">간편식 (용존산소 제외, 비교용)</p>
                    <CompactEquation label="O2ER 약식 = SaO2 빼기 SvO2 나누기 SaO2 곱하기 100 퍼센트">
                      <span>O₂ER ≈</span>
                      <MathFraction numerator="SaO₂ − SvO₂" denominator="SaO₂" />
                      <span>× 100%</span>
                    </CompactEquation>
                  </section>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-slate-900">GDP · DO₂i 계산식</h3>
                  <section className="space-y-1.5">
                    <p className="text-xs text-slate-600">동맥 산소함량 (mL/dL)</p>
                    <CompactEquation label="CaO2 = 1.34 곱하기 Hb 곱하기 SaO2 나누기 100 더하기 0.003 곱하기 PaO2">
                      <span>CaO₂ = 1.34 × Hb ×</span>
                      <MathFraction numerator="SaO₂" denominator="100" />
                      <span>+ 0.003 × PaO₂</span>
                    </CompactEquation>
                  </section>
                  <section className="space-y-1.5">
                    <p className="text-xs text-slate-600">목표 DO₂i를 위한 최소 Pump Flow (L/min)</p>
                    <CompactEquation label="최소 Pump Flow = 목표 DO2i 곱하기 BSA 나누기 CaO2 곱하기 10">
                      <span>Flow<sub>min</sub> =</span>
                      <MathFraction numerator="목표 DO₂i × BSA" denominator="CaO₂ × 10" />
                    </CompactEquation>
                  </section>
                  <section className="space-y-1.5">
                    <p className="text-xs text-slate-600">현재 DO₂i (mL/min/m²)</p>
                    <CompactEquation label="DO2i = Pump Flow 나누기 BSA 곱하기 CaO2 곱하기 10">
                      <span>DO₂i =</span>
                      <MathFraction numerator="Pump Flow" denominator="BSA" />
                      <span>× CaO₂ × 10</span>
                    </CompactEquation>
                  </section>
                </>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Target DO2i Settings */}
      {gdpSubTab === "do2i" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            목표 DO₂i (mL/min/m²)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {[
              { val: "260", label: "260 (최소)" },
              { val: "280", label: "280 (권장)" },
              { val: "300", label: "300 (보수적)" },
              { val: "360", label: "360 (소아)" },
            ].map(({ val, label }) => (
              <Button key={val} onClick={() => setTargetDO2i(val)} variant={targetDO2i === val ? "default" : "outline"}>
                {label}
              </Button>
            ))}
          </div>


        </CardContent>
      </Card>
      )}

      {/* Input Card (shared by DO2i and O2ER sub-tabs) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">환자 정보 입력 <span className="ml-2 text-xs font-medium text-slate-500">(<span className="font-bold text-rose-700">* 필수</span> 항목 우선 입력)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bsa" className={gdpSubTab === "do2i" ? "text-sm font-bold text-slate-900" : "text-sm font-medium text-slate-800"}>
                BSA (m²) {gdpSubTab === "do2i" ? (
                  <span className="ml-1 text-xs font-bold text-rose-700">* 필수</span>
                ) : (
                  <span className="font-normal text-slate-500">(선택)</span>
                )}
              </Label>
              <Input
                id="bsa"
                aria-required={gdpSubTab === "do2i"}
                data-ws-patient="bsa"
                type="number"
                step="0.01"
                value={params.bsa}
                onChange={(e) => handleInputChange("bsa", e.target.value)}
                placeholder=""
              />
              {gdpSubTab === "o2er" && (
                <p className="text-xs text-slate-500">O₂ER 비율에는 필요하지 않으며, Pump Flow와 함께 입력하면 체격 대비 DO₂i·VO₂i를 확인합니다.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hgb" className="text-sm font-bold text-slate-900">
                Hemoglobin (g/dL) <span className="ml-1 text-xs font-bold text-rose-700">* 필수</span>
              </Label>
              <Input
                id="hgb"
                aria-required="true"
                type="number"
                step="0.1"
                value={params.hgb}
                onChange={(e) => handleInputChange("hgb", e.target.value)}
                placeholder=""
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pao2" className="text-sm font-medium text-slate-800">
                PaO₂ (mmHg) <span className="font-normal text-slate-500">(선택)</span>
              </Label>
              <Input
                id="pao2"
                type="number"
                step="1"
                value={params.pao2}
                onChange={(e) => handleInputChange("pao2", e.target.value)}
                placeholder=""
              />
              {gdpSubTab === "do2i" ? (
                <p className="text-xs text-slate-500">미입력 시 DO₂i 계산에는 PaO₂ 200 mmHg를 가정합니다.</p>
              ) : (
                <p className="text-xs text-slate-500">입력 시 동맥혈 용존산소를 CaO₂에 반영합니다.</p>
              )}
            </div>
          </div>

          <Separator />

            <div className="space-y-2">
              <Label htmlFor="currentFlow" className="text-sm font-medium text-slate-800">
                현재 Pump Flow (L/min) <span className="font-normal text-slate-500">(선택)</span>
              </Label>
              <Input
                id="currentFlow"
                type="number"
                step="0.1"
                value={params.currentFlow}
                onChange={(e) => handleInputChange("currentFlow", e.target.value)}
                placeholder=""
              />
              {gdpSubTab === "o2er" && (
                <p className="text-xs text-slate-500">BSA와 함께 입력하면 체표면적당 산소전달량(DO₂i)과 추정 산소소비량(VO₂i)을 확인합니다. O₂ER 비율은 바뀌지 않습니다.</p>
              )}
            </div>

            {gdpSubTab === "do2i" && (
            <>
            <Separator />

            <div className="space-y-2">
              <Label htmlFor="temperature" className="text-sm font-medium text-slate-800">
                Temperature (°C) <span className="font-normal text-slate-500">(선택, VO₂ 추정용)</span>
              </Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                value={params.temperature}
                onChange={(e) => handleInputChange("temperature", e.target.value)}
                placeholder=""
              />
              <p className="text-xs text-slate-500">체온 입력 시 하단에 대사율 추정 정보가 표시됩니다 (참고용)</p>
            </div>
            {gdpSubTab === "do2i" && (
              <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm">
                <summary className="cursor-pointer font-medium text-slate-800">
                  선택 항목을 입력하면 무엇이 달라지나요?
                </summary>
                <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-700">
                  <p><strong>PaO₂ (동맥 산소분압):</strong> 비우면 PaO₂ 200 mmHg를 가정합니다. 측정값이 200보다 높으면 CaO₂·DO₂i는 증가하고 필요한 최소 Flow는 감소합니다(다른 조건 동일 시). 낮으면 반대이므로 실제값 입력을 권장합니다.</p>
                  <p><strong>Pump Flow (실제 펌프 유량):</strong> 입력하면 현재 CI·DO₂i, 목표 대비 부족한 유량과 달성률이 표시됩니다. 미입력 시 목표 DO₂i를 위한 최소 Flow만 계산합니다.</p>
                  <p><strong>Temperature (체온):</strong> 입력하면 Q₁₀ 기반 대사율 변화와 참고용 환산 Flow가 표시됩니다. 측정한 VO₂가 아니며 Flow 감량 기준으로 사용하지 않습니다.</p>
                </div>
              </details>
            )}
            {sao2Shared !== null && sao2Shared !== 100 && (
              <p className="text-xs text-amber-700">SaO₂ {sao2Shared}% 적용 중 (O₂ER 탭 입력값)</p>
            )}
            {sao2Shared === null && (
              <Notice title="입력 확인">
                SaO₂가 비어 있거나 0 초과 100 이하 범위를 벗어났습니다. O₂ER 탭에서 SaO₂를 입력해야 DO₂i가 계산됩니다.
              </Notice>
            )}
            </>
            )}


        </CardContent>
      </Card>

      {gdpSubTab === "o2er" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">산소포화도 입력 <span className="ml-2 text-xs font-medium text-slate-500">SaO₂·SvO₂ 필수</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sao2" className="text-sm font-bold text-slate-900">
                    SaO₂ (%) <span className="ml-1 text-xs font-bold text-rose-700">* 필수</span>
                  </Label>
                  <Input
                    id="sao2"
                    aria-required="true"
                    type="number"
                    step="0.1"
                    value={params.sao2}
                    onChange={(e) => handleInputChange("sao2", e.target.value)}
                    placeholder=""
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="svo2" className="text-sm font-bold text-slate-900">
                    SvO₂ (%) <span className="ml-1 text-xs font-bold text-rose-700">* 필수</span>
                  </Label>
                  <Input
                    id="svo2"
                    aria-required="true"
                    type="number"
                    step="0.1"
                    value={params.svo2}
                    onChange={(e) => handleInputChange("svo2", e.target.value)}
                    placeholder=""
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pvo2" className="text-sm font-medium text-slate-800">
                    PvO₂ (mmHg) <span className="font-normal text-slate-500">(선택)</span>
                  </Label>
                  <Input
                    id="pvo2"
                    type="number"
                    step="1"
                    value={params.pvo2}
                    onChange={(e) => handleInputChange("pvo2", e.target.value)}
                    placeholder=""
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Hgb·PaO₂·Pump Flow·BSA는 위 환자 정보 입력값을 함께 사용합니다. SaO₂ 변경 시 DO₂i 탭 계산에도 반영됩니다.
              </p>
              <details className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm">
                <summary className="cursor-pointer font-medium text-slate-800">
                  선택 항목 입력 시 O₂ER 결과는 어떻게 달라지나요?
                </summary>
                <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-700">
                  <p><strong>PaO₂ (동맥 산소분압):</strong> 동맥혈 용존산소를 CaO₂에 더합니다. 다른 값이 같다면 O₂ER은 상승 방향으로 변하며, Flow·BSA 입력 시 DO₂i도 증가합니다.</p>
                  <p><strong>PvO₂ (정맥 산소분압):</strong> 정맥혈 용존산소를 CvO₂에 더합니다. 다른 값이 같다면 O₂ER은 감소 방향으로 변하며, Flow·BSA 입력 시 VO₂i도 감소합니다. 정확한 비교를 위해 PaO₂와 PvO₂를 함께 입력하는 편이 좋습니다.</p>
                  <p><strong>Pump Flow + BSA (체표면적):</strong> O₂ER 비율 자체는 변하지 않습니다. 둘 다 입력하면 CI와 체표면적당 산소전달량(DO₂i)·추정 산소소비량(VO₂i)을 추가로 확인할 수 있습니다.</p>
                  <p className="text-slate-600">PaO₂·PvO₂를 비우면 해당 용존산소는 계산에서 제외됩니다. 한쪽만 입력하면 양쪽 산소함량에 서로 다른 기준이 적용되어 O₂ER이 왜곡될 수 있습니다.</p>
                  <p className="text-slate-600">예: Hb 8, SaO₂ 100%, SvO₂ 70%에서는 용존산소 제외 시 O₂ER 30.0%, PaO₂ 250·PvO₂ 40 mmHg까지 입력 시 약 33.5%입니다.</p>
                </div>
              </details>
            </CardContent>
          </Card>

          {o2er && o2er.ok ? (
            <>
              {/* Step 1: oxygen extraction fraction from contents, independent of pump flow and BSA. */}
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">① CaO₂·CvO₂ 기준 — 산소추출 비율</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      동·정맥혈 100 mL당 산소함량(CaO₂·CvO₂)을 비교하여 공급된 산소 중 혈액에서 추출된 비율을 확인합니다.
                      Pump Flow·BSA가 없어도 계산하지만, 이 비율만으로 환자의 산소전달량이 충분한지는 판단할 수 없습니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">O₂ER · 산소함량 기반</p>
                      <p className="mt-1 text-xs text-slate-600">(CaO₂ − CvO₂) / CaO₂ × 100</p>
                    </div>
                    <p className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-5xl">
                      {o2er.o2er.toFixed(1)}<span className="ml-1 text-xl font-medium text-slate-500">%</span>
                    </p>
                  </div>
                  <StatGrid cols={2}>
                    <StatCell label="CaO₂" caption="동맥 산소함량" value={o2er.cao2.toFixed(2)} unit="mL O₂/dL" />
                    <StatCell label="CvO₂" caption="정맥 산소함량" value={o2er.cvo2.toFixed(2)} unit="mL O₂/dL" />
                  </StatGrid>
                  <p className="text-sm text-slate-700">
                    동·정맥 산소함량 차이(A–V O₂ difference): <strong className="font-semibold tabular-nums text-slate-900">{o2er.avDiff.toFixed(2)} mL O₂/dL</strong>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                      혈액 100 mL당 추출된 산소량입니다. 분당 산소소비량(VO₂)을 뜻하지는 않습니다.
                    </span>
                  </p>
                  <div className="space-y-1.5">
                    <div className="relative h-2 rounded-full bg-slate-100">
                      <div className="absolute inset-y-0 bg-slate-300" style={{ left: "33.3333%", width: "16.6667%" }} />
                      <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-slate-900" style={{ left: String((Math.min(Math.max(o2er.o2er, 0), 60) / 60) * 100) + "%" }} />
                    </div>
                    <div className="relative h-4 text-xs text-slate-500 tabular-nums">
                      <span className="absolute left-0">0</span>
                      <span className="absolute -translate-x-1/2" style={{ left: "33.3333%" }}>20</span>
                      <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>30</span>
                      <span className="absolute right-0">60%</span>
                    </div>
                    <p className="text-xs text-slate-500">회색 구간 = 정상 생리 참고 범위 20–30% (CPB 임계값 아님)</p>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-sm">
                    <span className="text-slate-600">간편식 · 포화도만 비교 (용존산소 제외)</span>
                    <span className="whitespace-nowrap text-slate-900 tabular-nums">
                      <span className="font-semibold">{o2er.o2erSaturationOnly.toFixed(1)}%</span>
                      <span className="ml-1.5 text-slate-500">
                        (차이 {o2er.o2er - o2er.o2erSaturationOnly >= 0 ? "+" : ""}
                        {(o2er.o2er - o2er.o2erSaturationOnly).toFixed(1)}%p)
                      </span>
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">
                    PaO₂·PvO₂ 입력 시 해당 용존산소를 CaO₂·CvO₂에 반영합니다. 두 값을 모두 비우면 용존산소를 제외한 계산값이 표시됩니다.
                  </p>
                </CardContent>
              </Card>

              {/* Step 2: indexed delivery and Fick-based estimated consumption, not a separate O2ER measurement. */}
              <Card>
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">② DO₂i·VO₂i 기준 — 환자 체격 대비 산소 공급·소비</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Pump Flow와 BSA를 함께 입력하면 체표면적 1 m²당 분당 산소전달량(DO₂i)과 Fick 방식의 추정 산소소비량(VO₂i)을 계산합니다.
                      산소추출 비율이 같아도 공급되는 산소량은 다를 수 있어 함께 확인하는 의미가 있습니다.
                    </p>
                  </div>
                  {o2er.do2i !== null && o2er.vo2i !== null && o2er.ci !== null ? (
                    <>
                      <p className="text-sm text-slate-700">
                        현재 Pump CI: <strong className="font-semibold tabular-nums text-slate-900">{o2er.ci.toFixed(2)} L/min/m²</strong>
                      </p>
                      <StatGrid cols={2}>
                        <StatCell label="DO₂i" caption="체표면적당 산소전달량" value={o2er.do2i.toFixed(1)} unit="mL O₂/min/m²" />
                        <StatCell label="VO₂i" caption="체표면적당 추정 산소소비량" value={o2er.vo2i.toFixed(1)} unit="mL O₂/min/m²" />
                      </StatGrid>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">O₂ER · DO₂i/VO₂i로 표현한 동일 비율</p>
                          <p className="mt-1 text-xs text-slate-600">VO₂i / DO₂i × 100</p>
                        </div>
                        <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                          {((o2er.vo2i / o2er.do2i) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-600">
                        이 O₂ER은 ①의 CaO₂·CvO₂ 기반 O₂ER과 수학적으로 같습니다. 독립적인 두 측정값이 아닙니다.
                        BSA나 Pump Flow를 추가해도 비율은 변하지 않지만, DO₂i·VO₂i로 산소 공급·추정 소비량의 크기까지 비교할 수 있습니다.
                      </p>
                      <p className="text-xs leading-relaxed text-slate-600">
                        VO₂i는 Pump Flow와 동·정맥 산소함량 차이로 계산한 추정치이며 조직 산소소비량을 직접 측정한 값이 아닙니다.
                        정맥혈 채혈 위치·혼합 상태와 CPB 회로 조건에 따라 실제 소비량과 다를 수 있습니다.
                      </p>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">추가 분석을 위한 입력: BSA + Pump Flow</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        지금은 ① 산소함량 기준 O₂ER만 확인할 수 있습니다. BSA만 입력해서는 분당 산소 공급·추정 소비량을 산출할 수 없으며 Pump Flow도 함께 필요합니다.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              {o2er.warnings.length > 0 && (
                <Notice>
                  {o2er.warnings.map((w) => (<p key={w}>{w}</p>))}
                </Notice>
              )}
            </>
          ) : o2er && !o2er.ok ? (
            <div className="border-l-4 border-rose-600 bg-rose-50 px-4 py-3 text-sm text-slate-800 rounded-r-md">
              <p className="font-semibold text-rose-800 mb-0.5">입력 확인</p>
              {o2er.errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-base text-slate-600">
                <p>Hgb, SaO₂, SvO₂를 입력하면 O₂ER이 계산됩니다.</p>
              </CardContent>
            </Card>
          )}

          <O2erLogPanel records={o2erLog} onChange={setO2erLog} current={o2erCurrent} persisted={workspaceActive} />

          <O2erResponseGuide />

          <Card>
            <CardContent className="p-5">
              <h3 className="text-base font-semibold text-slate-900 mb-2">
                O₂ER 해석 – 요점
              </h3>
              <div className="text-sm text-slate-700 space-y-2 leading-relaxed">
                <p>
                  <strong>참고 범위:</strong> 정상 생리에서 약 20–30%. CPB 중 단일 임계값은 확립되어 있지 않음.
                </p>
                <p>
                  <strong>용존산소:</strong> 고 PaO₂·저 Hgb 상황에서는 간편식이 O₂ER을 과소평가할 수 있어 PaO₂/PvO₂ 포함 계산을 권장.
                </p>
                <p>
                  <strong>해석:</strong> 상승 시 DO₂i 부족 또는 대사 증가(재가온, 마취 심도) 고려. 낮은 값이 항상 적정 관류를 의미하지는 않음(shunt·국소 저관류). DO₂i, lactate, rSO₂, VCO₂와 함께 추세로 판단.
                </p>
                <p className="mt-3 pt-3 border-t border-slate-200 text-slate-500">
                  이 계산기는 임상 판단을 보조하는 도구입니다. 환자‑/수술‑특이적 상황과 기관 프로토콜을 항상 우선하십시오.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {gdpSubTab === "do2i" && (
      <>
      {/* Results */}
      {results ? (
        <>
          {/* Flow Adequacy */}
          {results.minRequiredFlow && (() => {
            const hasFlow = n(params.currentFlow) > 0 && !!results.flowPercentage
            const pct = hasFlow ? Number.parseFloat(results.flowPercentage) : 0
            const flowTone: Tone = !hasFlow ? "muted" : pct >= 100 ? "good" : pct >= 90 ? "warn" : "bad"
            const statusTone: Tone =
              results.status === "optimal" ? "good" : results.status === "borderline" ? "warn" : "bad"
            const diff = results.flowDifference ? Number.parseFloat(results.flowDifference) : 0
            return (
            <>
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-slate-900">현재 Flow 적정성</p>
                      <p className="text-sm text-slate-600 mt-0.5">
                        기준 = 목표 DO₂i {results.targetDO2i} 달성 최소 Flow (100%)
                      </p>
                    </div>
                    {n(params.currentFlow) > 0 && results.assessment && (
                      <span
                        className={`shrink-0 rounded-md border px-2.5 py-1 text-sm font-semibold ${TONE_TEXT[statusTone]} ${
                          statusTone === "good"
                            ? "border-emerald-300"
                            : statusTone === "warn"
                              ? "border-amber-300"
                              : "border-rose-300"
                        }`}
                      >
                        {results.assessment}
                      </span>
                    )}
                  </div>

                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    {hasFlow && (
                      <div
                        className={`h-full transition-all duration-500 ${
                          flowTone === "good" ? "bg-emerald-600" : flowTone === "warn" ? "bg-amber-500" : "bg-rose-600"
                        }`}
                        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                      />
                    )}
                  </div>

                  <StatGrid cols={4}>
                    <StatCell
                      primary
                      label="최소 필요 Flow"
                      value={results.minRequiredFlow}
                      unit={
                        <>
                          L/min
                          {n(params.bsa) > 0 &&
                            ` · CI ${(Number.parseFloat(results.minRequiredFlow) / n(params.bsa)).toFixed(2)}`}
                        </>
                      }
                    />
                    <StatCell
                      label="현재 Flow"
                      value={n(params.currentFlow) > 0 ? n(params.currentFlow).toFixed(2) : "—"}
                      tone={n(params.currentFlow) > 0 ? "default" : "muted"}
                      unit={<>L/min{n(params.currentFlow) > 0 && results.actualCI && ` · CI ${results.actualCI}`}</>}
                    />
                    <StatCell
                      label="차이"
                      value={hasFlow && results.flowDifference ? `${diff >= 0 ? "+" : ""}${results.flowDifference}` : "—"}
                      tone={!hasFlow ? "muted" : diff >= 0 ? "good" : "bad"}
                      unit="L/min"
                    />
                    <StatCell
                      label="적정성"
                      value={hasFlow ? `${results.flowPercentage}%` : "—"}
                      tone={flowTone}
                      unit={
                        hasFlow
                          ? `${n(params.currentFlow).toFixed(2)} / ${results.minRequiredFlow} L/min`
                          : "현재 / 최소 Flow"
                      }
                    />
                  </StatGrid>
                </CardContent>
              </Card>

              {results.actualDO2i && (
                <StatGrid cols={2}>
                  <StatCell
                    primary
                    label="실제 DO₂i"
                    value={results.actualDO2i}
                    tone={results.do2iGap && Number.parseFloat(results.do2iGap) < 0 ? "bad" : "default"}
                    unit={
                      <>
                        mL/min/m²
                        {results.do2iGap &&
                          ` · 목표 ${results.targetDO2i} 대비 ${Number.parseFloat(results.do2iGap) >= 0 ? "+" : ""}${results.do2iGap}`}
                      </>
                    }
                  />
                  <StatCell
                    label="CaO₂"
                    value={results.cao2}
                    unit={<>mL/dL{!params.pao2 && " · PaO₂ 200 가정"}</>}
                  />
                </StatGrid>
              )}

              {/* Recommendations - Only show critical recommendations */}
              {n(params.currentFlow) > 0 &&
                results.flowAdequacy &&
                (results.flowAdequacy === "insufficient" || results.flowAdequacy === "borderline") && (
                  <Card className="border-l-4 border-l-rose-600">
                    <CardContent className="p-5">
                      <p className="text-base font-semibold text-rose-800 mb-2">우선 개선 권장 사항</p>
                      <div className="space-y-2 text-sm text-slate-800">
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>펌프 유량을 {results.minRequiredFlow} L/min 이상으로 증량 고려</li>
                          <li>헤모글로빈 최적화(예: 9–11 g/dL 범위 등, 센터 프로토콜/환자상태에 따라 판단)</li>
                          <li>캐뉼라 위치/kinking/저항 요소 확인</li>
                          <li>관류압 최적화(일반적으로 MAP 50–70 mmHg 범위에서 개별화)</li>
                          <li>Lactate, rSO₂ 등 다변량 지표 추세 모니터링</li>
                        </ol>
                      </div>
                    </CardContent>
                  </Card>
                )}
            </>
            )
          })()}
        </>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-base text-slate-600">
            <p>
              {sao2Shared === null
                ? "SaO₂ 입력값을 확인하세요 (O₂ER 탭)."
                : "BSA와 Hgb를 입력하면 목표 DO₂i 달성을 위한 최소 Flow가 계산됩니다."}
            </p>
          </CardContent>
        </Card>
      )}

      {vo2Estimate && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-slate-900">
                체온 기반 대사율 추정 <span className="text-sm font-normal text-slate-500">(참고용)</span>
              </h3>
              <Button variant="outline" size="sm" onClick={() => setShowVo2Info(!showVo2Info)} aria-expanded={showVo2Info}>
                계산식
              </Button>
            </div>
            {showVo2Info && (
              <div className="my-3 p-3 bg-slate-50 rounded-md border border-slate-200 text-sm text-slate-700">
                <p className="font-semibold mb-1">VO₂ Factor 계산식 (Q10 방식)</p>
                <CompactEquation label="Factor = Q10 의 (T 빼기 37) 나누기 10 제곱">
                  <span>Factor = Q₁₀<sup className="text-[0.8em]">(T − 37) / 10</sup></span>
                </CompactEquation>
                <p className="mt-1">Q10 = 2.0~2.3 (대사율 온도 계수)</p>
                <p>기준: CI 2.4 L/min/m² @ 37°C</p>
              </div>
            )}
            <div className="my-3">
              <Notice>
                체온은 Flow를 줄이기 위한 지표가 아니라, 현재 관류 상태가 얼마나 안전한 영역에 있는지 확인하고, 향후 대사량 증가를 대비하기 위한 지표로 사용해야 합니다.
              </Notice>
            </div>
            <div className="divide-y divide-slate-200 text-sm text-slate-700 tabular-nums">
              <div className="flex justify-between py-2">
                <span>Estimated VO₂ factor (Q10 2.0–2.3):</span>
                <span>
                  {Math.round(vo2Estimate.factorHigh)}–{Math.round(vo2Estimate.factorLow)}%
                </span>
              </div>
              <div className="flex justify-between gap-3 py-2">
                <span>Equivalent Flow:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {vo2Estimate.flowLow !== null && vo2Estimate.flowHigh !== null
                    ? `${vo2Estimate.flowHigh.toFixed(2)}–${vo2Estimate.flowLow.toFixed(2)} L/min (CI ${vo2Estimate.ciHigh.toFixed(2)}–${vo2Estimate.ciLow.toFixed(2)})`
                    : "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-2">
                근거 기반 GDP 적용 – 요점
          </h3>
          <div className="text-sm text-slate-700 space-y-2 leading-relaxed">
            <p>
              <strong>성인 GDP:</strong> DO₂i ≈ ≥280 mL/min/m²를 흔히 목표로 하며, 헤모글로빈/산소화에 따라 개별화.
            </p>
            <p>
              <strong>소아/영아:</strong> 더 높은 DO₂i 목표를 고려(센터/연령/수술 유형에 따른 차이 반영).
            </p>
            <p>
              <strong>해석:</strong> 단일 수치 대신 lactate, rSO₂를 함께 보며 추세 기반으로 판단.
            </p>
            <p className="mt-3 pt-3 border-t border-slate-200 text-slate-500">
              이 계산기는 임상 판단을 보조하는 도구입니다. 환자‑/수술‑특이적 상황과 기관 프로토콜을 항상 우선하십시오.
            </p>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}
