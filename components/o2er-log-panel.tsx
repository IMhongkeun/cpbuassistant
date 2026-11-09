"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock, Copy, LineChart as LineChartIcon, Plus, Trash2, X } from "lucide-react"
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  O2ER_NORMAL_HIGH,
  O2ER_NORMAL_LOW,
  O2ER_REFERENCE_PERCENT,
  addO2erRecord,
  clockOf,
  createO2erRecord,
  isValidClock,
  o2erLogToTsv,
  removeO2erRecord,
  resolveSampleTime,
  summarizeO2erLog,
  type O2erRecord,
  type O2erRecordInputs,
  type O2erRecordResult,
} from "@/lib/o2er-log"

type Props = {
  records: O2erRecord[]
  onChange: (records: O2erRecord[]) => void
  current: { inputs: O2erRecordInputs; result: O2erRecordResult } | null
  persisted: boolean
}

type Series = "svo2" | "do2i"

const nowClock = () => clockOf(Date.now())
const f = (v: number | null | undefined, d: number) => (v === null || v === undefined ? "—" : v.toFixed(d))

export function O2erLogPanel({ records, onChange, current, persisted }: Props) {
  const [clock, setClock] = useState(nowClock)
  const [clockEdited, setClockEdited] = useState(false)
  const [series, setSeries] = useState<Record<Series, boolean>>({ svo2: false, do2i: false })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  // Follow the wall clock until the user types a sample time.
  useEffect(() => {
    if (clockEdited) return
    const timer = window.setInterval(() => setClock(nowClock()), 20000)
    return () => window.clearInterval(timer)
  }, [clockEdited])

  const summary = useMemo(() => summarizeO2erLog(records), [records])
  const clockValid = isValidClock(clock)
  const canSave = current !== null && clockValid

  const save = () => {
    if (!current || !clockValid) return
    const now = Date.now()
    const sampledAt = resolveSampleTime(clock, now)
    if (sampledAt === null) return
    const record = createO2erRecord(current.inputs, current.result, sampledAt, now)
    onChange(addO2erRecord(records, record))
    setLastAddedId(record.id)
    setClockEdited(false)
    setClock(nowClock())
    toast.success(`${clockOf(sampledAt)} O₂ER ${current.result.o2er.toFixed(1)}% 기록했습니다.`)
  }

  const remove = (record: O2erRecord) => {
    const before = records
    onChange(removeO2erRecord(records, record.id))
    toast(`${clockOf(record.sampledAt)} 기록을 삭제했습니다.`, {
      action: { label: "되돌리기", onClick: () => onChange(before) },
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(o2erLogToTsv(records))
      toast.success("표를 복사했습니다. 엑셀·기록지에 붙여넣을 수 있습니다.")
    } catch {
      toast.error("복사하지 못했습니다. 브라우저 권한을 확인하세요.")
    }
  }

  const chartData = records.map((r, index) => ({
    id: r.id,
    index: index + 1,
    t: r.sampledAt,
    o2er: r.result.o2er,
    svo2: r.inputs.svo2,
    do2i: r.result.do2i,
  }))
  const first = records[0]?.sampledAt ?? 0
  const last = records[records.length - 1]?.sampledAt ?? 0
  const pad = Math.max((last - first) * 0.06, 10 * 60 * 1000)
  const xDomain: [number, number] = [first - pad, last + pad]
  const leftMax = Math.max(60, ...chartData.map((d) => Math.ceil((series.svo2 ? Math.max(d.o2er, d.svo2) : d.o2er) / 10) * 10))
  const hovered = chartData.find((d) => d.id === hoverId) ?? null
  const delta = summary.latest && summary.previous ? summary.latest.result.o2er - summary.previous.result.o2er : null

  return (
    <section className="cpbu-o2er-log" aria-labelledby="o2er-log-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="cpbu-ws-badge-icon" aria-hidden>
            <LineChartIcon className="h-5 w-5" />
          </span>
          <div>
            <h3 id="o2er-log-title" className="text-base font-bold text-[var(--cpbu-ink)]">
              O₂ER 연속 기록 {summary.count > 0 ? <span className="cpbu-o2er-count">{summary.count}</span> : null}
            </h3>
            <p className="text-xs text-[var(--cpbu-muted)]">
              {persisted ? "Patient Workspace 케이스와 함께 저장됩니다." : "Quick Calc에서는 새로고침하면 지워집니다. 보관하려면 Patient Workspace를 사용하세요."}
            </p>
          </div>
        </div>
        {summary.count > 0 ? (
          <div className="flex gap-1.5">
            <button type="button" className="cpbu-ws-ghost" onClick={copy}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> 표 복사
            </button>
            <button type="button" className="cpbu-ws-ghost cpbu-ws-ghost-danger" onClick={() => setConfirmClear(true)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> 전체 삭제
            </button>
          </div>
        ) : null}
      </header>

      {/* Save bar */}
      <div className="cpbu-o2er-savebar">
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm font-semibold text-[var(--cpbu-ink)]">채혈 시각</span>
          <span className="cpbu-ws-input-wrap w-[7.5rem]" data-invalid={clockValid ? undefined : "true"}>
            <input
              aria-label="채혈 시각 (시:분)"
              inputMode="numeric"
              maxLength={5}
              placeholder="HH:MM"
              value={clock}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 4)
                setClock(digits.length >= 3 ? digits.slice(0, 2) + ":" + digits.slice(2) : digits)
                setClockEdited(true)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) save()
              }}
              className="cpbu-ws-input"
            />
            <button
              type="button"
              className="mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--cpbu-brand)] hover:bg-[var(--cpbu-brand-soft)]"
              onClick={() => {
                setClock(nowClock())
                setClockEdited(false)
              }}
              title="현재 시각"
              aria-label="현재 시각으로 설정"
            >
              <Clock className="h-4 w-4" />
            </button>
          </span>
        </label>
        <div className="min-w-0 flex-1 text-sm text-[var(--cpbu-muted)]">
          {current ? (
            <>
              저장할 값 <b className="tabular-nums text-[var(--cpbu-ink)]">O₂ER {current.result.o2er.toFixed(1)}%</b>
              <span className="hidden sm:inline">
                {" "}· SvO₂ {f(current.inputs.svo2, 1)}% · Hgb {f(current.inputs.hgb, 1)}
                {current.result.do2i !== null ? ` · DO₂i ${current.result.do2i.toFixed(0)}` : ""}
              </span>
            </>
          ) : (
            "Hgb, SaO₂, SvO₂를 입력하면 저장할 수 있습니다."
          )}
        </div>
        <button type="button" className="cpbu-ws-primary min-h-[44px]" disabled={!canSave} onClick={save}>
          <Plus className="h-4 w-4" aria-hidden /> 기록 저장
        </button>
      </div>

      {summary.count === 0 ? (
        <div className="cpbu-o2er-empty">
          <p className="font-semibold text-[var(--cpbu-ink)]">아직 기록이 없습니다</p>
          <p className="mt-1 text-sm text-[var(--cpbu-muted)]">가스 결과를 입력하고 기록 저장을 누를 때마다 아래 표와 그래프에 쌓입니다.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="cpbu-o2er-stat">
              <span className="cpbu-o2er-stat-label">최근 ({summary.latest ? clockOf(summary.latest.sampledAt) : ""})</span>
              <span className="cpbu-o2er-stat-value">
                {f(summary.latest?.result.o2er, 1)}
                <small>%</small>
                {delta !== null ? (
                  <span className="cpbu-o2er-delta" data-dir={delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat"}>
                    {delta > 0.05 ? <ArrowUpRight className="h-3.5 w-3.5" /> : delta < -0.05 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="cpbu-o2er-stat">
              <span className="cpbu-o2er-stat-label">평균</span>
              <span className="cpbu-o2er-stat-value">
                {f(summary.mean, 1)}
                <small>%</small>
              </span>
            </div>
            <div className="cpbu-o2er-stat">
              <span className="cpbu-o2er-stat-label">범위</span>
              <span className="cpbu-o2er-stat-value text-[1.05rem]">
                {f(summary.min, 1)}–{f(summary.max, 1)}
                <small>%</small>
              </span>
            </div>
            <div className="cpbu-o2er-stat">
              <span className="cpbu-o2er-stat-label">{O2ER_REFERENCE_PERCENT}% 초과 기록</span>
              <span className="cpbu-o2er-stat-value">
                {summary.aboveReference}
                <small>/ {summary.count}</small>
              </span>
            </div>
          </div>

          {/* Chart */}
          <div className="cpbu-o2er-chart">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--cpbu-muted)]">
                <span className="inline-flex items-center gap-1.5"><span className="cpbu-o2er-key" data-k="o2er" />O₂ER</span>
                <span className="inline-flex items-center gap-1.5"><span className="cpbu-o2er-key" data-k="ref" />{O2ER_REFERENCE_PERCENT}% 참고선</span>
                <span className="inline-flex items-center gap-1.5"><span className="cpbu-o2er-key" data-k="band" />정상 {O2ER_NORMAL_LOW}–{O2ER_NORMAL_HIGH}%</span>
              </div>
              <div className="flex gap-1.5" role="group" aria-label="함께 표시">
                {([
                  ["svo2", "SvO₂"],
                  ["do2i", "DO₂i"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={series[key]}
                    data-k={key}
                    className="cpbu-o2er-toggle"
                    onClick={() => setSeries((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: series.do2i ? 4 : 16, bottom: 4, left: -8 }}
                  onMouseMove={(state: any) => {
                    const id = state?.activePayload?.[0]?.payload?.id
                    if (id && id !== hoverId) setHoverId(id)
                  }}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <CartesianGrid stroke="#e7efed" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={xDomain}
                    tickFormatter={(v) => clockOf(v)}
                    tick={{ fontSize: 11, fill: "#52686d" }}
                    tickLine={false}
                    axisLine={{ stroke: "#dfe9e7" }}
                    minTickGap={28}
                  />
                  <YAxis
                    yAxisId="pct"
                    domain={[0, leftMax]}
                    tick={{ fontSize: 11, fill: "#52686d" }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    unit="%"
                  />
                  {series.do2i ? (
                    <YAxis
                      yAxisId="do2i"
                      orientation="right"
                      domain={[0, (max: number) => Math.max(400, Math.ceil(max / 50) * 50)]}
                      tick={{ fontSize: 11, fill: "#8a6a2a" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                  ) : null}
                  <ReferenceArea yAxisId="pct" y1={O2ER_NORMAL_LOW} y2={O2ER_NORMAL_HIGH} fill="#e9f5f4" fillOpacity={0.9} strokeOpacity={0} />
                  <ReferenceLine yAxisId="pct" y={O2ER_REFERENCE_PERCENT} stroke="#c0574c" strokeDasharray="5 4" strokeWidth={1.2} />
                  <Tooltip content={<O2erTooltip records={records} />} cursor={{ stroke: "#9fbfba", strokeDasharray: "3 3" }} />
                  {series.svo2 ? (
                    <Line yAxisId="pct" type="monotone" dataKey="svo2" stroke="#5b7fbf" strokeWidth={1.6} dot={{ r: 2.5 }} isAnimationActive animationDuration={450} />
                  ) : null}
                  {series.do2i ? (
                    <Line yAxisId="do2i" type="monotone" dataKey="do2i" stroke="#c99a3b" strokeWidth={1.6} strokeDasharray="4 3" dot={{ r: 2.5 }} connectNulls isAnimationActive animationDuration={450} />
                  ) : null}
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="o2er"
                    stroke="#006b6e"
                    strokeWidth={2.4}
                    dot={(props: any) => {
                      const above = props.payload.o2er > O2ER_REFERENCE_PERCENT
                      return (
                        <circle
                          key={props.payload.id}
                          cx={props.cx}
                          cy={props.cy}
                          r={4}
                          fill={above ? "#c0574c" : "#006b6e"}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      )
                    }}
                    activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                    isAnimationActive
                    animationDuration={500}
                  />
                  {hovered ? (
                    <ReferenceDot yAxisId="pct" x={hovered.t} y={hovered.o2er} r={9} fill="none" stroke="#006b6e" strokeWidth={2} />
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table: one row per saved sample, newest at the bottom */}
          <div className="cpbu-o2er-table-wrap">
            <table className="cpbu-o2er-table">
              <thead>
                <tr>
                  <th className="text-left">#</th>
                  <th className="text-left">시각</th>
                  <th>O₂ER</th>
                  <th>간편식</th>
                  <th>Hgb</th>
                  <th>SaO₂</th>
                  <th>SvO₂</th>
                  <th>PaO₂</th>
                  <th>PvO₂</th>
                  <th>Flow</th>
                  <th>DO₂i</th>
                  <th>VO₂i</th>
                  <th aria-label="삭제" />
                </tr>
              </thead>
              <tbody>
                {records.map((r, index) => {
                  const prev = index > 0 ? records[index - 1].result.o2er : null
                  const d = prev === null ? null : r.result.o2er - prev
                  return (
                    <tr
                      key={r.id}
                      data-hover={hoverId === r.id ? "true" : undefined}
                      data-new={lastAddedId === r.id ? "true" : undefined}
                      onMouseEnter={() => setHoverId(r.id)}
                      onMouseLeave={() => setHoverId(null)}
                    >
                      <td className="text-left text-[var(--cpbu-muted)]">{index + 1}</td>
                      <td className="text-left font-semibold">{clockOf(r.sampledAt)}</td>
                      <td>
                        <span className="cpbu-o2er-pill" data-above={r.result.o2er > O2ER_REFERENCE_PERCENT ? "true" : undefined}>
                          {r.result.o2er.toFixed(1)}
                        </span>
                        {d !== null && Math.abs(d) >= 0.05 ? (
                          <span className="ml-1 text-[11px] text-[var(--cpbu-muted)]">
                            {d > 0 ? "▲" : "▼"}
                            {Math.abs(d).toFixed(1)}
                          </span>
                        ) : null}
                      </td>
                      <td>{r.result.o2erSaturationOnly.toFixed(1)}</td>
                      <td>{f(r.inputs.hgb, 1)}</td>
                      <td>{f(r.inputs.sao2, 1)}</td>
                      <td>{f(r.inputs.svo2, 1)}</td>
                      <td>{f(r.inputs.pao2, 0)}</td>
                      <td>{f(r.inputs.pvo2, 0)}</td>
                      <td>{f(r.inputs.flow, 2)}</td>
                      <td>{f(r.result.do2i, 0)}</td>
                      <td>{f(r.result.vo2i, 0)}</td>
                      <td>
                        <button type="button" className="cpbu-ws-icon-button text-[var(--cpbu-muted)] hover:text-[#a2413a]" onClick={() => remove(r)} aria-label={clockOf(r.sampledAt) + " 기록 삭제"}>
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-[var(--cpbu-muted)]">
            O₂ER·간편식 단위 %, Hgb g/dL, PO₂ mmHg, Flow L/min, DO₂i·VO₂i mL/min/m². 붉은 점·값은 {O2ER_REFERENCE_PERCENT}% 초과입니다.
            {" "}{O2ER_REFERENCE_PERCENT}% 참고선은 Ahmad 등(JTCVS 2026)이 사용한 운영 기준선이며 치료 목표가 아닙니다.
            간헐 측정 기록이므로 논문의 연속 측정 &lsquo;CPB 시간 중 비율&rsquo;과 같은 지표가 아닙니다.
          </p>
        </>
      )}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>O₂ER 기록을 모두 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>저장된 {summary.count}개 기록이 삭제되며 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#b4483f] text-white hover:bg-[#9c3c34]"
              onClick={() => {
                onChange([])
                toast.success("O₂ER 기록을 모두 삭제했습니다.")
              }}
            >
              전체 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function O2erTooltip({ active, payload, records }: any) {
  if (!active || !payload?.length) return null
  const id = payload[0]?.payload?.id
  const r: O2erRecord | undefined = records.find((x: O2erRecord) => x.id === id)
  if (!r) return null
  const above = r.result.o2er > O2ER_REFERENCE_PERCENT
  return (
    <div className="cpbu-o2er-tooltip">
      <p className="text-xs font-semibold text-[var(--cpbu-muted)]">{clockOf(r.sampledAt)}</p>
      <p className="text-lg font-bold tabular-nums" style={{ color: above ? "#b4483f" : "#005559" }}>
        O₂ER {r.result.o2er.toFixed(1)}%
      </p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <dt className="text-[var(--cpbu-muted)]">SvO₂ / SaO₂</dt>
        <dd className="text-right">{f(r.inputs.svo2, 1)} / {f(r.inputs.sao2, 1)}%</dd>
        <dt className="text-[var(--cpbu-muted)]">Hgb</dt>
        <dd className="text-right">{f(r.inputs.hgb, 1)} g/dL</dd>
        <dt className="text-[var(--cpbu-muted)]">DO₂i / VO₂i</dt>
        <dd className="text-right">{f(r.result.do2i, 0)} / {f(r.result.vo2i, 0)}</dd>
      </dl>
    </div>
  )
}
