"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Activity, Droplets, AlertCircle, Info, Target, TrendingUp, Thermometer, Gauge } from "lucide-react"
import { computeO2er } from "@/lib/o2er"

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

  const n = (v: string, fallback = 0) => {
    const x = Number.parseFloat(String(v).replace(",", "."))
    return Number.isFinite(x) ? x : fallback
  }

  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)

  const handleInputChange = (field: string, value: string) => {
    setParams((prev) => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    const bsa = n(params.bsa)
    const hgb = n(params.hgb)
    const flow = n(params.currentFlow)
    const sao2 = clamp(n(params.sao2, 100), 0, 100)
    const pao2 = Math.max(n(params.pao2, 200), 0)

    if (bsa > 0 && hgb > 0) {
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-chart-1/10 p-2 rounded-lg">
                <Target className="w-6 h-6 text-chart-1" />
              </div>
              <div>
                <CardTitle className="text-xl">
                  {gdpSubTab === "do2i" ? "Goal-Directed Perfusion Calculator" : "Oxygen Extraction Ratio (O₂ER)"}
                </CardTitle>
                
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setShowInfo(!showInfo)}>
              <Info className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        {showInfo && gdpSubTab === "o2er" && (
          <CardContent>
            <div className="p-4 bg-chart-1/10 border border-chart-1/20 rounded-lg">
              <h3 className="font-semibold text-foreground mb-3">O₂ER 계산식</h3>
              <div className="text-foreground space-y-3 font-mono text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">산소함유량:</p>
                  <p>CaO₂ = (Hgb × 1.34 × SaO₂/100) + (0.003 × PaO₂)</p>
                  <p>CvO₂ = (Hgb × 1.34 × SvO₂/100) + (0.003 × PvO₂)</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">산소추출률 (Pump flow는 약분됨):</p>
                  <p>O₂ER = VO₂ / DO₂ = (CaO₂ − CvO₂) / CaO₂ × 100</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Flow·BSA 입력 시:</p>
                  <p>DO₂i = CI × CaO₂ × 10</p>
                  <p>VO₂i = CI × (CaO₂ − CvO₂) × 10</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">간편식 (용존산소 무시, 비교용):</p>
                  <p>O₂ER ≈ (SaO₂ − SvO₂) / SaO₂ × 100</p>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        {showInfo && gdpSubTab === "do2i" && (
          <CardContent>
            <div className="p-4 bg-chart-1/10 border border-chart-1/20 rounded-lg">
              <h3 className="font-semibold text-foreground mb-3">GDP 계산식</h3>
              <div className="text-foreground space-y-3 font-mono text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">CaO₂ (동맥혈 산소함유량):</p>
                  <p>CaO₂ = (Hgb × 1.34 × SaO₂/100) + (0.003 × PaO₂)</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">최소 필요 Flow:</p>
                  <p>Flow = (목표 DO₂i × BSA) / (CaO₂ × 10)</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">실제 DO₂i:</p>
                  <p>DO₂i = CI × CaO₂ × 10</p>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Target DO2i Settings */}
      {gdpSubTab === "do2i" && (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5 text-chart-4" />
            목표 DO₂i 설정
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
          <CardTitle className="text-lg">환자 정보 입력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bsa" className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-chart-1" />
                BSA (m²) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bsa"
                type="number"
                step="0.01"
                value={params.bsa}
                onChange={(e) => handleInputChange("bsa", e.target.value)}
                placeholder=""
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hgb" className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-destructive" />
                Hemoglobin (g/dL) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="hgb"
                type="number"
                step="0.1"
                value={params.hgb}
                onChange={(e) => handleInputChange("hgb", e.target.value)}
                placeholder=""
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pao2" className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-chart-1" />
                PaO₂ (mmHg)
              </Label>
              <Input
                id="pao2"
                type="number"
                step="1"
                value={params.pao2}
                onChange={(e) => handleInputChange("pao2", e.target.value)}
                placeholder=""
              />
            </div>
          </div>

          <Separator />

            <div className="space-y-2">
              <Label htmlFor="currentFlow" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-chart-2" />
                현재 Pump Flow (L/min) – 선택사항
              </Label>
              <Input
                id="currentFlow"
                type="number"
                step="0.1"
                value={params.currentFlow}
                onChange={(e) => handleInputChange("currentFlow", e.target.value)}
                placeholder=""
              />
            </div>

            {gdpSubTab === "do2i" && (
            <>
            <Separator />

            <div className="space-y-2">
              <Label htmlFor="temperature" className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-chart-5" />
                Temperature (°C) – VO₂ 추정용 (선택사항)
              </Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                value={params.temperature}
                onChange={(e) => handleInputChange("temperature", e.target.value)}
                placeholder=""
              />
              <p className="text-xs text-muted-foreground">체온 입력 시 하단에 대사율 추정 정보가 표시됩니다 (참고용)</p>
            </div>
            {n(params.sao2, 100) !== 100 && (
              <p className="text-xs text-chart-4">SaO₂ {n(params.sao2, 100)}% 적용 중 (O₂ER 탭 입력값)</p>
            )}
            </>
            )}


        </CardContent>
      </Card>

      {gdpSubTab === "o2er" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">산소포화도 입력</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sao2" className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-destructive" />
                    SaO₂ (%) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sao2"
                    type="number"
                    step="0.1"
                    value={params.sao2}
                    onChange={(e) => handleInputChange("sao2", e.target.value)}
                    placeholder=""
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="svo2" className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-chart-1" />
                    SvO₂ (%) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="svo2"
                    type="number"
                    step="0.1"
                    value={params.svo2}
                    onChange={(e) => handleInputChange("svo2", e.target.value)}
                    placeholder=""
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pvo2" className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-chart-1" />
                    PvO₂ (mmHg) – 선택사항
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
              <p className="text-xs text-muted-foreground">
                Hgb·PaO₂·Pump Flow·BSA는 위 환자 정보 입력값을 함께 사용합니다. SaO₂ 변경 시 DO₂i 탭 계산에도 반영됩니다.
              </p>
            </CardContent>
          </Card>

          {o2er && o2er.ok ? (
            <>
              <Card className="border-2 border-slate-300">
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-slate-900 flex items-center gap-2">
                        <Gauge className="w-5 h-5 text-chart-1" /> 산소추출률 O₂ER
                      </p>
                      <p className="text-sm text-slate-600 mt-1">(CaO₂ − CvO₂) / CaO₂</p>
                      <p className="text-sm text-slate-700 mt-1">
                        a–v O₂ 차이 <span className="font-semibold">{o2er.avDiff.toFixed(2)}</span> mL/dL
                      </p>
                    </div>
                    <p className="text-5xl font-extrabold tracking-tight text-slate-900 tabular-nums">
                      {o2er.o2er.toFixed(1)}
                      <span className="text-xl font-semibold text-slate-600 ml-1">%</span>
                    </p>
                  </div>

                  {/* Reference scale 0–60 %, physiologic reference band 20–30 % (no CPB threshold implied) */}
                  <div className="space-y-1.5">
                    <div className="relative h-3 rounded-full bg-slate-100 border border-slate-200">
                      <div
                        className="absolute top-0 bottom-0 bg-slate-300/80"
                        style={{ left: `${(20 / 60) * 100}%`, width: `${(10 / 60) * 100}%` }}
                      />
                      <div
                        className="absolute -top-1 -bottom-1 w-1 rounded-full bg-slate-900"
                        style={{ left: `calc(${Math.min(Math.max(o2er.o2er, 0), 60) / 60 * 100}% - 2px)` }}
                      />
                    </div>
                    <div className="relative h-4 text-xs text-slate-600 tabular-nums">
                      <span className="absolute left-0">0</span>
                      <span className="absolute -translate-x-1/2" style={{ left: `${(20 / 60) * 100}%` }}>20</span>
                      <span className="absolute -translate-x-1/2" style={{ left: `${(30 / 60) * 100}%` }}>30</span>
                      <span className="absolute right-0">60%</span>
                    </div>
                    <p className="text-xs text-slate-600">회색 구간: 정상 생리 참고 범위 20–30% (CPB 임계값 아님)</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
                    <span className="text-slate-700">간편식 (SaO₂ − SvO₂) / SaO₂</span>
                    <span className="font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {o2er.o2erSaturationOnly.toFixed(1)}%
                      <span className="font-normal text-slate-600 ml-1.5">
                        (차이 {(o2er.o2er - o2er.o2erSaturationOnly) >= 0 ? "+" : ""}
                        {(o2er.o2er - o2er.o2erSaturationOnly).toFixed(1)}%p)
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "CaO₂", sub: "동맥 산소함유량", value: o2er.cao2.toFixed(2), unit: "mL/dL", dot: "bg-violet-500" },
                  { label: "CvO₂", sub: "정맥 산소함유량", value: o2er.cvo2.toFixed(2), unit: "mL/dL", dot: "bg-indigo-500" },
                  {
                    label: "DO₂i",
                    sub: "산소 공급량",
                    value: o2er.do2i !== null ? o2er.do2i.toFixed(1) : "---",
                    unit: "mL/min/m²",
                    dot: "bg-emerald-500",
                  },
                  {
                    label: "VO₂i",
                    sub: "산소 소비량",
                    value: o2er.vo2i !== null ? o2er.vo2i.toFixed(1) : "---",
                    unit: "mL/min/m²",
                    dot: "bg-rose-500",
                  },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${m.dot}`} />
                      <p className="text-sm font-semibold text-slate-800">{m.label}</p>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{m.sub}</p>
                    <p className={`text-3xl font-bold tracking-tight mt-2 tabular-nums ${m.value === "---" ? "text-slate-400" : "text-slate-900"}`}>
                      {m.value}
                    </p>
                    <p className="text-sm text-slate-600">{m.unit}</p>
                  </div>
                ))}
              </div>
              {o2er.do2i === null && (
                <p className="text-sm text-slate-600">DO₂i·VO₂i는 Pump Flow와 BSA 입력 시 표시됩니다.</p>
              )}

              {o2er.warnings.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-800 space-y-1">
                  {o2er.warnings.map((w) => (
                    <p key={w}>⚠ {w}</p>
                  ))}
                </div>
              )}
            </>
          ) : o2er && !o2er.ok ? (
            <Card className="border-2 border-destructive/50 bg-destructive/5">
              <CardContent className="p-5 text-sm text-destructive space-y-1">
                {o2er.errors.map((e) => (
                  <p key={e} className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {e}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-12 text-muted-foreground">
                <Gauge className="w-20 h-20 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Hgb, SaO₂, SvO₂를 입력하면</p>
                <p className="text-lg">산소추출률(O₂ER)이 자동 계산됩니다</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <Info className="w-5 h-5 text-chart-1" />
                O₂ER 해석 – 요점
              </h3>
              <div className="text-sm text-slate-700 space-y-2 leading-relaxed">
                <p>
                  <strong>• 참고 범위:</strong> 정상 생리에서 약 20–30%. CPB 중 단일 임계값은 확립되어 있지 않음.
                </p>
                <p>
                  <strong>• 용존산소:</strong> 고 PaO₂·저 Hgb 상황에서는 간편식이 O₂ER을 과소평가할 수 있어 PaO₂/PvO₂ 포함 계산을 권장.
                </p>
                <p>
                  <strong>• 해석:</strong> 상승 시 DO₂i 부족 또는 대사 증가(재가온, 마취 심도) 고려. 낮은 값이 항상 적정 관류를 의미하지는 않음(shunt·국소 저관류). DO₂i, lactate, rSO₂, VCO₂와 함께 추세로 판단.
                </p>
                <p className="mt-3 text-muted-foreground italic">
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
          {results.minRequiredFlow && (
            <>
              <Card className="border-2 border-slate-300">
                <CardContent className="p-5">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-slate-900">현재 Flow 적정성</p>
                        <p className="text-sm text-slate-600 mt-0.5">기준 = 목표 DO₂i {results.targetDO2i} 달성 최소 Flow (100%)</p>
                      </div>
                      {n(params.currentFlow) > 0 && results.assessment && (
                        <div className="text-right">
                          <p className="text-sm text-slate-600">임상평가</p>
                          <p
                            className={`text-base font-bold ${
                              results.status === "optimal"
                                ? "text-emerald-700"
                                : results.status === "borderline"
                                  ? "text-amber-700"
                                  : "text-rose-700"
                            }`}
                          >
                            {results.assessment}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      {n(params.currentFlow) > 0 && results.flowPercentage && (
                        <div
                          className={`h-full transition-all duration-500 ${
                            Number.parseFloat(results.flowPercentage) >= 100
                              ? "bg-emerald-500"
                              : Number.parseFloat(results.flowPercentage) >= 90
                                ? "bg-amber-500"
                                : "bg-rose-500"
                          }`}
                          style={{
                            width: `${Math.min(Math.max(Number.parseFloat(results.flowPercentage), 0), 100)}%`,
                          }}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Min Required Flow - primary */}
                      <div className="p-3 bg-blue-50 border-2 border-blue-300 rounded-xl text-center">
                        <p className="text-sm font-semibold text-blue-800">최소 필요 Flow</p>
                        <p className="text-4xl font-bold text-blue-700 tabular-nums mt-1">{results.minRequiredFlow}</p>
                        <p className="text-sm text-blue-800">
                          L/min
                          {n(params.bsa) > 0 && (
                            <span> · CI {(Number.parseFloat(results.minRequiredFlow) / n(params.bsa)).toFixed(2)}</span>
                          )}
                        </p>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                        <p className="text-sm font-semibold text-slate-700">현재 Flow</p>
                        <p className={`text-3xl font-bold tabular-nums mt-1 ${n(params.currentFlow) > 0 ? "text-slate-900" : "text-slate-400"}`}>
                          {n(params.currentFlow) > 0 ? n(params.currentFlow).toFixed(2) : "---"}
                        </p>
                        <p className="text-sm text-slate-600">
                          L/min
                          {n(params.currentFlow) > 0 && results.actualCI && <span> · CI {results.actualCI}</span>}
                        </p>
                      </div>

                      <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                        <p className="text-sm font-semibold text-slate-700">차이</p>
                        {n(params.currentFlow) > 0 && results.flowDifference ? (
                          <p className={`text-3xl font-bold tabular-nums mt-1 ${Number.parseFloat(results.flowDifference) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                            {Number.parseFloat(results.flowDifference) >= 0 ? "+" : ""}{results.flowDifference}
                          </p>
                        ) : (
                          <p className="text-3xl font-bold text-slate-400 mt-1">---</p>
                        )}
                        <p className="text-sm text-slate-600">L/min</p>
                      </div>

                      <div className={`p-3 rounded-xl text-center border ${
                        n(params.currentFlow) > 0 && results.flowPercentage
                          ? Number.parseFloat(results.flowPercentage) >= 100
                            ? "bg-emerald-50 border-emerald-300"
                            : Number.parseFloat(results.flowPercentage) >= 90
                              ? "bg-amber-50 border-amber-300"
                              : "bg-rose-50 border-rose-300"
                          : "bg-white border-slate-200"
                      }`}>
                        <p className="text-sm font-semibold text-slate-700">적정성</p>
                        {n(params.currentFlow) > 0 && results.flowPercentage ? (
                          <>
                            <p className={`text-3xl font-bold tabular-nums mt-1 ${
                              Number.parseFloat(results.flowPercentage) >= 100
                                ? "text-emerald-700"
                                : Number.parseFloat(results.flowPercentage) >= 90
                                  ? "text-amber-700"
                                  : "text-rose-700"
                            }`}>
                              {results.flowPercentage}%
                            </p>
                            <p className="text-sm text-slate-600 tabular-nums">
                              {n(params.currentFlow).toFixed(2)} / {results.minRequiredFlow} L/min
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-3xl font-bold text-slate-400 mt-1">---</p>
                            <p className="text-sm text-slate-600">현재 / 최소 Flow</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Metrics: DO2i primary, CaO2 secondary (CI shown under 현재 Flow) */}
              <div className="grid md:grid-cols-3 gap-3">
                {results.actualDO2i && (
                  <div className="md:col-span-2 rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <p className="text-sm font-semibold text-slate-800">실제 DO₂i</p>
                    </div>
                    <div className="flex items-end justify-between gap-3 mt-2">
                      <p className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                        {results.actualDO2i}
                        <span className="text-sm font-medium text-slate-600 ml-1.5">mL/min/m²</span>
                      </p>
                      {results.do2iGap && (
                        <p className={`text-sm font-semibold tabular-nums ${Number.parseFloat(results.do2iGap) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          목표 {results.targetDO2i} 대비 {Number.parseFloat(results.do2iGap) >= 0 ? "+" : ""}{results.do2iGap}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {results.cao2 && (
                  <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                      <p className="text-sm font-semibold text-slate-800">CaO₂</p>
                    </div>
                    <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums mt-2">
                      {results.cao2}
                      <span className="text-sm font-medium text-slate-600 ml-1.5">mL/dL</span>
                    </p>
                    {!params.pao2 && <p className="text-xs text-slate-600 mt-1">PaO₂ 미입력: 200 mmHg 가정</p>}
                  </div>
                )}
              </div>

              {/* Recommendations - Only show critical recommendations */}
              {n(params.currentFlow) > 0 &&
                results.flowAdequacy &&
                (results.flowAdequacy === "insufficient" || results.flowAdequacy === "borderline") && (
                  <Card className="border-2 border-destructive/50 bg-destructive/5">
                    <CardContent className="p-5">
                      <p className="font-bold text-destructive mb-3 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" /> 우선 개선 권장 사항
                      </p>
                      <div className="space-y-2 text-sm text-destructive">
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
          )}
        </>
      ) : (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Target className="w-20 h-20 mx-auto mb-4 opacity-30" />
            <p className="text-lg">BSA와 Hgb를 입력하면 GDP 목표 달성을 위한</p>
            <p className="text-lg">최소 필요 Flow가 자동 계산됩니다</p>
          </CardContent>
        </Card>
      )}

      {vo2Estimate && (
        <Card className="border-dashed border-2 border-border bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Thermometer className="w-4 h-4" />
                Temperature-based metabolic estimate (info only)
              </h3>
              <button
                type="button"
                onClick={() => setShowVo2Info(!showVo2Info)}
                className="p-1 rounded-full hover:bg-muted transition-colors"
                aria-label="VO2 계산식 정보"
              >
                <Info className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            {showVo2Info && (
              <div className="mb-3 p-2 bg-background rounded-md border border-border text-xs text-muted-foreground">
                <p className="font-semibold mb-1">VO₂ Factor 계산식 (Q10 방식)</p>
                <p className="font-mono text-xs">Factor = Q10^((T - 37) / 10)</p>
                <p className="mt-1">Q10 = 2.0~2.3 (대사율 온도 계수)</p>
                <p>기준: CI 2.4 L/min/m² @ 37°C</p>
              </div>
            )}
            <p className="text-sm text-amber-800 font-medium mb-3">
              ⚠ 체온은 Flow를 줄이기 위한 지표가 아니라, 현재 관류 상태가 얼마나 안전한 영역에 있는지 확인하고, 향후 대사량 증가를 대비하기 위한 지표로 사용해야 합니다.
            </p>
            <div className="space-y-2 text-sm text-foreground">
              <div className="flex justify-between">
                <span>Estimated VO₂ factor (Q10 2.0–2.3):</span>
                <span>
                  {Math.round(vo2Estimate.factorHigh)}–{Math.round(vo2Estimate.factorLow)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Equivalent Flow:</span>
                <span className="font-bold leading-7 text-sm">
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
          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <Info className="w-5 h-5 text-chart-1" />
            근거 기반 GDP 적용 – 요점
          </h3>
          <div className="text-sm text-slate-700 space-y-2 leading-relaxed">
            <p>
              <strong>• 성인 GDP:</strong> DO₂i ≈ ≥280 mL/min/m²를 흔히 목표로 하며, 헤모글로빈/산소화에 따라 개별화.
            </p>
            <p>
              <strong>• 소아/영아:</strong> 더 높은 DO₂i 목표를 고려(센터/연령/수술 유형에 따른 차이 반영).
            </p>
            <p>
              <strong>• 해석:</strong> 단일 수치 대신 lactate, rSO₂를 함께 보며 추세 기반으로 판단.
            </p>
            <p className="mt-3 text-muted-foreground italic">
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
