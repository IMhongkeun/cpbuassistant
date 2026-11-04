"use client"

import { useMemo, useState } from "react"
import { Check, Info, Search, X } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import sourceData from "@/data/cannula-medtronic-maquet.json"
import { buildCannulaChartRows, snapCannulaChartFlow, estimateCannulaCurvePressure, getCannulaChartMaxFlow, isCannulaEndpointApproximation, compareCannulaManufacturers, formatCannulaSize, groupSharedCannulaCurves, matchesCannulaSearch, toggleCannulaSelection } from "@/lib/cannula-estimate"

type CannulaCurve = {
  id: string
  manufacturer: string
  model: string
  category: string
  size: string
  orderCode: string
  nominalFr?: number
  connectorSize: string
  testMedium: string
  sourceLabel: string
  sourceUrl: string | null
  dataStatus: string
  seriesLabel: string
  semanticType: string
  sharedSizeCurve: boolean
  points: [number, number][]
}

const ALL_CURVES = sourceData.items as unknown as CannulaCurve[]
const CURVE_GROUPS = groupSharedCannulaCurves(ALL_CURVES)
  .sort((a, b) => compareCannulaManufacturers(a.item, b.item))
const GROUP_BY_ID = new Map(CURVE_GROUPS.map((group) => [group.item.id, group]))
const MAX_COMPARE = 4
// Variations on one teal hue, matching the existing CPBU dashboard.
const LINE_COLORS = ["#005559", "#087b80", "#31a3a4", "#8ac4c2"]

function isArterial(item: CannulaCurve) {
  return /arterial/i.test(item.category)
}

function brandName(item: CannulaCurve) {
  return item.manufacturer === "Getinge / Maquet" ? "Maquet" : "Medtronic"
}

function curveDisplaySize(item: CannulaCurve) {
  const group = GROUP_BY_ID.get(item.id)
  return group && group.variants.length > 1
    ? item.size + " · 공통 곡선"
    : formatCannulaSize(item)
}

function curveLabel(item: CannulaCurve) {
  return item.model + " · " + curveDisplaySize(item) + (
    item.semanticType === "drainage" ? " · Drainage" :
    item.semanticType === "infusion" ? " · Infusion" : ""
  )
}

function roundPressure(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1)
}

// Keep Fr for identification, but omit order code, length and connector details
// from the compact chart comparison (full metadata stays in the search list).
function compactCurveLabel(item: CannulaCurve) {
  const fr = typeof item.nominalFr === "number"
    ? item.nominalFr + " Fr"
    : item.size.match(/\b\d+(?:\/\d+)?(?:\.\d+)?\s*Fr\b/i)?.[0].replace(/\s+/g, " ") ?? ""
  const lumen = item.semanticType === "drainage" ? "Drainage · " :
    item.semanticType === "infusion" ? "Infusion · " : ""
  return lumen + item.model.replace(/\s+Cannulae?$/i, "") + (fr ? " · " + fr : "")
}

function PressurePathDiagram({ type }: { type: "arterial" | "venous" }) {
  const arterial = type === "arterial"
  const accent = arterial ? "#a32d38" : "#215d9c"
  const tint = arterial ? "#fff1f2" : "#eff6ff"
  const steps = arterial ? ["Pump", "Cannula", "Patient"] : ["Patient", "Cannula", "Reservoir"]
  return (
    <svg
      viewBox="0 0 520 98"
      className="h-auto w-full max-w-[520px]"
      role="img"
      aria-label={arterial ? "Pump에서 arterial cannula를 거쳐 환자로 흐름" : "환자에서 venous cannula를 거쳐 reservoir로 배액"}
    >
      <defs>
        <marker id={"cannula-arrow-" + type} viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
        </marker>
      </defs>
      {steps.map((name, index) => (
        <g key={name}>
          <rect x={index * 182 + 2} y="12" width="152" height="61" rx="14"
            fill={index === 1 ? tint : "#f7fbfa"}
            stroke={index === 1 ? accent : "#d3e4e2"} strokeWidth="1.5" />
          {index === 1 ? (
            <path d={"M " + (index * 182 + 39) + " 44 h 74"} stroke={accent}
              strokeWidth="9" strokeLinecap="round" />
          ) : (
            <circle cx={index * 182 + 78} cy="33" r="11" fill="#cce5e2" />
          )}
          <text x={index * 182 + 78} y="62" textAnchor="middle"
            fontSize="15" fontWeight="600" fill="#183a40">{name}</text>
          {index < 2 && (
            <line x1={index * 182 + 158} x2={index * 182 + 178} y1="43" y2="43"
              stroke={accent} strokeWidth="2.5"
              markerEnd={"url(#cannula-arrow-" + type + ")"} />
          )}
        </g>
      ))}
    </svg>
  )
}

export default function CannulaBrowser() {
  const [search, setSearch] = useState("")
  const [manufacturer, setManufacturer] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [flowText, setFlowText] = useState("4")
  const [previewFlow, setPreviewFlow] = useState<number | null>(null)

  const selected = useMemo(
    () => selectedIds.map((id) => ALL_CURVES.find((item) => item.id === id))
      .filter((item): item is CannulaCurve => Boolean(item)),
    [selectedIds],
  )

  const matches = useMemo(() => {
    return CURVE_GROUPS.filter(({ item, variants }) => {
      if (manufacturer !== "all" && brandName(item) !== manufacturer) return false
      if (typeFilter === "arterial" && !isArterial(item)) return false
      if (typeFilter === "venous" && isArterial(item)) return false
      return variants.some((variant) => matchesCannulaSearch(variant, search))
    })
  }, [manufacturer, typeFilter, search])

  const targetFlow = flowText.trim() === "" ? Number.NaN : Number(flowText)
  const validFlow = Number.isFinite(targetFlow) && targetFlow >= 0
  const chartFlow = previewFlow ?? (validFlow ? targetFlow : null)
  const displayedFlow = chartFlow === null ? "—" : chartFlow.toFixed(previewFlow === null ? 2 : 1)
  const maxFlow = selected.length
    ? Math.max(...selected.map(getCannulaChartMaxFlow))
    : 0

  // Recharts active labels now include an inspection grid at 0.1 L/min intervals.
  // Snap both mouse drag and touch movement to tenths for all selected curves.
  const handleChartMove = (state: { activeLabel?: string | number }) => {
    if (state?.activeLabel === undefined || state.activeLabel === null) return
    const flow = snapCannulaChartFlow(Number(state.activeLabel), maxFlow)
    if (flow !== null) setPreviewFlow(flow)
  }

  // Preserve original measured vertices and calculate additional plotting values
  // by piecewise linear interpolation, with explicitly approved tiny chart-end gaps.
  const chartRows = useMemo(() => buildCannulaChartRows(selected), [selected])
  const hasMixedTypes = selected.some(isArterial) && selected.some((item) => !isArterial(item))

  const toggle = (id: string) => {
    setSelectedIds((previous) => toggleCannulaSelection(previous, id, MAX_COMPARE))
    setPreviewFlow(null)
  }

  return (
    <div className="space-y-5">
      <section className="cpbu-panel space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-[#18323b] sm:text-2xl">Cannula</h2>
        <p className="text-sm text-[#52686d]">
          Medtronic · Maquet | 제조사 압력–유량 곡선으로 캐뉼라 압력손실(ΔP) 추정
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.07fr)] lg:items-start">
        <section className="cpbu-panel min-w-0 space-y-4" aria-label="캐뉼라 검색 및 선택">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-bold text-[#18323b]">제품 검색</h3>
            <span className="text-xs text-[#52686d]">곡선 {matches.length}개 · 최대 {MAX_COMPARE}개 비교</span>
          </div>

          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-[#657a7e]" />
            <input
              type="search" value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="예: venous 18, arterial 20Fr, 제품 코드"
              aria-label="캐뉼라 검색"
              className="h-11 w-full rounded-lg border border-[#d7e3e1] bg-white pl-10 pr-3 text-sm text-[#18323b] outline-none transition focus:border-[#087b80] focus:ring-2 focus:ring-[#c8e9e6]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "전체 제조사" },
              { id: "Medtronic", label: "Medtronic" },
              { id: "Maquet", label: "Maquet" },
            ].map((option) => (
              <button key={option.id} type="button"
                aria-pressed={manufacturer === option.id}
                onClick={() => setManufacturer(option.id)}
                className={"rounded-full border px-3 py-1.5 text-xs font-semibold transition " + (
                  manufacturer === option.id
                    ? "border-[#087b80] bg-[#e9f5f4] text-[#005559]"
                    : "border-[#dfe9e7] bg-white text-[#52686d] hover:bg-[#f3faf9]"
                )}>{option.label}</button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#dfe9e7] bg-[#f1f5f4] p-1">
            {[
              { id: "all", label: "전체" },
              { id: "arterial", label: "Arterial" },
              { id: "venous", label: "Venous" },
            ].map((option) => (
              <button key={option.id} type="button"
                aria-pressed={typeFilter === option.id}
                onClick={() => setTypeFilter(option.id)}
                className={"rounded-md px-2 py-2 text-sm font-semibold transition " + (
                  typeFilter === option.id ? "bg-white text-[#005559] shadow-sm" : "text-[#52686d] hover:bg-white/60"
                )}>{option.label}</button>
            ))}
          </div>

          <div role="region" aria-label="캐뉼라 목록" tabIndex={0}
             className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {matches.map((group) => {
              const item = group.item
              const variantCodes = group.variants.map((variant) => variant.orderCode).join(" / ")
              const checked = selectedIds.includes(item.id)
              const disabled = !checked && selectedIds.length >= MAX_COMPARE
              const arterial = isArterial(item)
              return (
                <button key={item.id} type="button" disabled={disabled} onClick={() => toggle(item.id)}
                  aria-pressed={checked}
                  aria-label={curveLabel(item) + (group.variants.length > 1 ? " · 제품 코드 " + variantCodes : "") +
                    (checked ? " 비교에서 제외" : " 비교에 추가")}
                  className={"flex w-full items-center gap-3 rounded-xl border border-l-4 p-3 text-left transition " + (
                    checked ? "border-[#087b80] bg-[#f0faf8]" :
                    disabled ? "cursor-not-allowed border-[#e7eeec] bg-[#fafbfb] opacity-55" :
                    arterial ? "border-[#efd4d8] bg-[#fffbfb] hover:border-[#dba3a9] hover:bg-[#fff4f5]" :
                    "border-[#d0e1f0] bg-[#f9fcff] hover:border-[#a6c5e2] hover:bg-[#f0f7ff]"
                  )}
                  style={{ borderLeftColor: arterial ? "#c34e5a" : "#3a79b8" }}>
                  <span aria-hidden="true"
                    className={"flex h-5 w-5 shrink-0 items-center justify-center rounded border " + (
                      checked ? "border-[#087b80] bg-[#087b80] text-white" : "border-[#9cadaa] bg-white"
                    )}>{checked && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className={"block text-[11px] font-semibold " + (
                      arterial ? "text-[#a32d38]" : "text-[#215d9c]"
                    )}>
                      {brandName(item)} · {arterial ? "Arterial" : "Venous"}
                    </span>
                    <span className={"block break-words text-sm font-semibold leading-5 " + (
                      arterial ? "text-[#a32d38]" : "text-[#215d9c]"
                    )}>{item.model}</span>
                    <span className="block break-words text-xs leading-5 text-[#52686d]">
                      {curveDisplaySize(item)}
                      {item.semanticType === "infusion" ? " · Infusion" :
                        item.semanticType === "drainage" ? " · Drainage" : ""}
                    </span>
                    {group.variants.length > 1 && (
                      <>
                        <span className="mt-1 block text-[11px] leading-4 text-[#087b80]">
                          커넥터 {group.variants.length}종 · 같은 Fr의 공통 압력–유량 곡선
                        </span>
                        <span className="block break-words text-[11px] leading-4 text-[#52686d]">
                          제품 코드: {variantCodes}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              )
            })}
            {matches.length === 0 && (
              <div className="rounded-lg bg-[#f3faf9] px-3 py-7 text-center text-sm text-[#52686d]">
                검색된 캐뉼라가 없습니다.
              </div>
            )}
          </div>
          {selectedIds.length === MAX_COMPARE && (
            <p role="status" className="text-xs text-[#52686d]">4개 선택됨 · 다른 제품을 추가하려면 기존 선택을 해제하세요.</p>
          )}
        </section>

        <section className="cpbu-panel min-w-0 space-y-4" aria-label="캐뉼라 압력 유량 비교">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#18323b]">압력–유량 그래프</h3>
            <button type="button" disabled={selected.length === 0}
              onClick={() => { setSelectedIds([]); setPreviewFlow(null) }}
              className="text-xs font-semibold text-[#087b80] hover:underline disabled:cursor-not-allowed disabled:opacity-40">
              선택 초기화
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor="cannula-target-flow" className="flex-1 text-sm font-semibold text-[#18323b]">
              목표 혈류량 (L/min)
              <input id="cannula-target-flow" type="number" inputMode="decimal"
                min="0" step="0.1" value={flowText}
                onChange={(event) => { setFlowText(event.target.value); setPreviewFlow(null) }}
                className="mt-2 h-11 w-full rounded-lg border border-[#d7e3e1] bg-white px-3 text-base font-semibold tabular-nums text-[#18323b] outline-none focus:border-[#087b80] focus:ring-2 focus:ring-[#c8e9e6]" />
            </label>
            <span className="pb-3 text-xs text-[#52686d]">선택 {selected.length} / {MAX_COMPARE}</span>
          </div>
          {!validFlow && <p role="alert" className="text-xs text-[#a34343]">0 이상의 혈류량을 입력하세요.</p>}
          {selected.length ? (
            <>
              <div className="flex flex-wrap gap-2" aria-label="선택한 캐뉼라">
                {selected.map((item, index) => (
                  <span key={item.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#dfe9e7] bg-[#f7fbfa] py-1 pl-2 pr-1 text-xs text-[#18323b]">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: LINE_COLORS[index] }} />
                    <span className="min-w-0 max-w-[180px] truncate sm:max-w-[230px]"
                      title={compactCurveLabel(item)}>{compactCurveLabel(item)}</span>
                    <button type="button" onClick={() => toggle(item.id)}
                      aria-label={curveLabel(item) + " 제외"}
                      className="rounded p-1 text-[#52686d] hover:bg-[#e9f5f4] hover:text-[#005559]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div role="img" aria-label="선택한 캐뉼라의 압력손실 크기 대 혈류량 비교 그래프"
                className="h-[300px] w-full min-w-0 touch-pan-y rounded-lg border border-[#e0eae8] bg-white px-1 pb-2 pt-4 sm:h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  {/* Recharts 2.15 maps touch-start to onMouseDown and touch-move to onMouseMove.
                      This also updates the selected Flow for an initial stationary touch. */}
                  <LineChart data={chartRows} margin={{ top: 8, right: 14, bottom: 18, left: 0 }}
                    onMouseDown={handleChartMove} onMouseMove={handleChartMove}
                    onClick={handleChartMove} onMouseLeave={() => setPreviewFlow(null)}>
                    <CartesianGrid stroke="#e6efed" strokeDasharray="3 5" />
                    <XAxis dataKey="flow" type="number" domain={[0, "dataMax"]}
                      tick={{ fontSize: 11, fill: "#52686d" }}
                      tickFormatter={(value: number) => String(Number(value.toFixed(1)))}
                      label={{ value: "Flow (L/min)", position: "insideBottom", offset: -10, fontSize: 11, fill: "#52686d" }} />
                    <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: "#52686d" }}
                      label={{ value: "|ΔP| (mmHg)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#52686d" }}
                      width={55} />
                    <Tooltip content={() => null}
                      cursor={{ stroke: "#94aaa6", strokeDasharray: "4 4" }} />
                    {validFlow && targetFlow <= maxFlow && (
                      <ReferenceLine x={targetFlow} stroke="#94aaa6" strokeDasharray="4 4" />
                    )}
                    {selected.map((item, index) => (
                      <Line key={item.id} name={compactCurveLabel(item)}
                        dataKey={item.id} type="linear" stroke={LINE_COLORS[index]}
                        strokeWidth={2.6} dot={false} activeDot={false}
                        connectNulls isAnimationActive={false} />
                    ))}
                    {chartFlow !== null && selected.map((item, index) => {
                      // Use the same 0.1 L/min Flow for every selected curve,
                      // even when original manufacturer samples do not align.
                      // The graph plots |ΔP|; the comparison retains the sign.
                      const pressure = estimateCannulaCurvePressure(item, chartFlow)
                      if (pressure === null) return null
                      return (
                        <ReferenceDot key={"selected-pressure-" + item.id}
                          x={chartFlow} y={Math.abs(pressure)} r={5}
                          fill={LINE_COLORS[index]} stroke="#ffffff" strokeWidth={2}
                          isFront ifOverflow="hidden" />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border border-[#e0eae8] bg-white px-3 py-2.5"
                aria-label="그래프 바로 아래 혈류량별 압력 비교">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#18323b]">
                    Flow <span className="ml-1 tabular-nums text-[#005559]">
                      {displayedFlow} L/min
                    </span>
                  </p>
                  <span className="text-[10px] text-[#657a7e]">
                    {previewFlow === null ? "목표 혈류량 기준" : "그래프 선택 지점"}
                  </span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_52px_72px] gap-1.5 border-b border-[#e6efed] pb-1.5 text-[10px] font-semibold text-[#657a7e]">
                  <span>Cannula · Fr</span>
                  <span className="text-right">Flow</span>
                  <span className="text-right">ΔP</span>
                </div>
                {selected.map((item, index) => {
                  const estimate = chartFlow === null ? null : estimateCannulaCurvePressure(item, chartFlow)
                  const isApproximate = chartFlow !== null && isCannulaEndpointApproximation(item, chartFlow)
                  return (
                    <div key={item.id}
                      className="grid grid-cols-[minmax(0,1fr)_52px_72px] items-center gap-1.5 border-b border-[#edf2f1] py-2 text-xs last:border-b-0">
                      <span className="flex min-w-0 items-center gap-1.5" title={compactCurveLabel(item)}>
                        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: LINE_COLORS[index] }} />
                        <span className="min-w-0 truncate text-[#18323b]">{compactCurveLabel(item)}</span>
                      </span>
                      <span className="text-right tabular-nums text-[#52686d]">
                        {displayedFlow}
                      </span>
                      <span className={"text-right font-semibold tabular-nums " +
                        (estimate === null ? "text-[#9b5d3e]" : "text-[#005559]")}
                        title={estimate === null ? "측정 범위 밖 · 추정 불가" :
                          isApproximate ? "≈ 디지털화 끝점 보정 (마지막 두 점을 이용한 제한적 외삽)" : "제조사 압력–유량 곡선 기준"}>
                        {estimate === null ? (chartFlow === null ? "—" : "범위 밖") :
                          (isApproximate ? "≈ " : "") + (estimate < 0 ? "−" : "") + roundPressure(Math.abs(estimate))}
                      </span>
                    </div>
                  )
                })}
                <p className="mt-1.5 text-[10px] text-[#657a7e]">
                  그래프 터치·드래그: 0.1 L/min 간격 · ΔP: mmHg (선형 보간, 일부 확인된 끝점은 ≈ 근사값)
                </p>
              </div>
              {hasMixedTypes && (
                <p className="text-xs text-[#9b5d3e]">
                  Arterial과 Venous 곡선은 측정 조건과 의미가 달라 직접적인 성능 우열 비교에 주의하세요.
                </p>
              )}
              <p className="text-xs leading-5 text-[#52686d]">
                그래프는 압력손실의 크기 |ΔP|를 표시합니다. Avalon Drainage의 실제 원본 부호는 음수(−)입니다.
              </p>
              <details className="rounded-lg border border-[#e0eae8] px-3 py-2 text-xs text-[#52686d]">
                <summary className="cursor-pointer font-semibold text-[#005559]">선택 제품의 데이터 출처</summary>
                <div className="mt-3 space-y-3">
                  {selected.map((item) => (
                    <div key={item.id} className="space-y-1 border-b border-[#e0eae8] pb-2 last:border-0">
                      <p className="font-semibold text-[#18323b]">{curveLabel(item)}</p>
                      <p>시험 유체: {item.testMedium || "별도 명시 없음"}</p>
                      <p>자료: {item.sourceLabel}</p>
                      {item.sharedSizeCurve && (
                        <p>같은 Fr 제품의 공통 제조사 곡선이며, 커넥터별 독립 측정값이 아닙니다.</p>
                      )}
                      {(GROUP_BY_ID.get(item.id)?.variants.length ?? 0) > 1 && (
                        <div className="space-y-1">
                          <p className="font-semibold text-[#18323b]">연결 가능한 커넥터별 제품 코드</p>
                          <ul className="list-disc space-y-0.5 pl-4">
                            {GROUP_BY_ID.get(item.id)?.variants.map((variant) => (
                              <li key={variant.id}>
                                {variant.orderCode} · {variant.connectorSize}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {item.sourceUrl && (
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-[#087b80] underline">제조사 원문 보기</a>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#cbdeda] bg-[#f8fcfa] px-4 text-center">
              <Info className="h-6 w-6 text-[#559f9c]" aria-hidden="true" />
              <p className="text-sm font-semibold text-[#18323b]">왼쪽에서 캐뉼라를 선택하세요</p>
              <p className="text-xs leading-5 text-[#52686d]">최대 4개 곡선을 같은 그래프에서 비교할 수 있습니다.</p>
            </div>
          )}
        </section>
      </div>

      <section className="cpbu-panel space-y-4" aria-label="캐뉼라 ΔP 활용 안내">
        <h3 className="text-base font-bold text-[#18323b]">ΔP, 이렇게 쓰세요</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <article className="space-y-3 rounded-xl border border-[#f0d8db] bg-[#fffbfb] p-3 sm:p-4" aria-label="Arterial 압력 해석">
            <h4 className="text-sm font-bold text-[#a32d38]">Arterial</h4>
            <PressurePathDiagram type="arterial" />
            <p className="text-sm font-semibold leading-6 text-[#18323b]">
              라인 압력 ≈ 환자 MAP + Cannula ΔP + 회로 ΔP
            </p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[#fff0f1] px-3 py-2.5 text-xs text-[#873843]">
              <span className="rounded bg-white px-2 py-1 font-semibold">MAP 60</span>
              <span>+</span>
              <span className="rounded bg-white px-2 py-1 font-semibold">Cannula ΔP 40</span>
              <span>→</span>
              <strong className="text-sm">100 mmHg + 회로 ΔP</strong>
            </div>
            <p className="text-xs leading-5 text-[#52686d]">
              라인 압력이 예상보다 높다면 캐뉼라 크기·위치와 회로 꼬임(kinking)을 확인하세요.
            </p>
          </article>

          <article className="space-y-3 rounded-xl border border-[#d3e3f4] bg-[#f9fcff] p-3 sm:p-4" aria-label="Venous 배액 해석">
            <h4 className="text-sm font-bold text-[#215d9c]">Venous</h4>
            <PressurePathDiagram type="venous" />
            <p className="text-sm font-semibold leading-6 text-[#18323b]">
              배액 구동 압력차 ≈ 낙차에 의한 압력 + VAVD 음압 크기
            </p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[#eaf4ff] px-3 py-2.5 text-xs text-[#215d9c]">
              <span className="rounded bg-white px-2 py-1 font-semibold">낙차 20</span>
              <span>+</span>
              <span className="rounded bg-white px-2 py-1 font-semibold">VAVD 40</span>
              <span>→</span>
              <strong className="text-sm">60 mmHg</strong>
            </div>
            <p className="text-xs leading-5 text-[#52686d]">
              이 압력차로 캐뉼라·정맥 라인의 저항(ΔP)을 극복합니다.
              VAVD 미사용 시 0, 설정값 −40 mmHg는 크기 40으로 계산합니다.
            </p>
            <p className="text-xs leading-5 text-[#52686d]">
              정맥 환류가 부족하거나 흡인이 과하면 chatter·collapse가 생길 수 있습니다.
              VAVD를 무조건 높이지 마세요.
            </p>
            <p className="text-[11px] leading-4 text-[#657a7e]">
              ※ Full drainage 상황을 가정해 정맥압 항을 생략한 설명용 근사식입니다(실제 RA압이 항상 0이라는 뜻은 아닙니다).
            </p>
          </article>
        </div>

        <p className="border-t border-[#e0eae8] pt-3 text-xs leading-5 text-[#52686d]">
          <strong className="text-[#18323b]">주의:</strong> 제조사 시험 유체·온도 기준의 참고값으로 실제 혈액(Hct 등)에서는 달라질 수 있습니다.
          이 값만으로 캐뉼라 선택이나 VAVD 설정을 결정하지 마세요.
        </p>
        <details className="text-xs text-[#657a7e]">
          <summary className="cursor-pointer font-semibold text-[#087b80]">데이터 출처 및 계산 기준</summary>
          <p className="mt-2 leading-5">
            기준:{" "}
            <a href={sourceData.sourceUrl} target="_blank" rel="noopener noreferrer"
              className="font-semibold underline">PerfusionTools 캐뉼라 데이터</a>
            {" "}({sourceData.updatedAt}). 측정점 사이 선형 보간, 검증된 일부 MC2 끝점(32/40·34/46 Fr의 6.0 L/min)은 ≈ 근사값으로 표시합니다.
            그 외 제조사 측정 범위 밖 계산은 차단합니다. 위 압력 예시는 원리 설명용으로 실제 환자 측정값이 아닙니다.
          </p>
        </details>
      </section>

    </div>
  )
}
