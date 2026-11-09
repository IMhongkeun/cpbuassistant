// Serial O2ER records for one session (Quick Calc: memory only; Patient
// Workspace: saved with the active case). Values are stored as computed;
// rounding happens only for display.

export const O2ER_REFERENCE_PERCENT = 25 // operational line used by Ahmad et al., JTCVS 2026 (not a treatment target)
export const O2ER_NORMAL_LOW = 20
export const O2ER_NORMAL_HIGH = 30
export const O2ER_LOG_MAX = 200

export type O2erRecordInputs = {
  hgb: number
  sao2: number
  svo2: number
  pao2: number | null
  pvo2: number | null
  flow: number | null
  bsa: number | null
  temperature: number | null
}

export type O2erRecordResult = {
  o2er: number // %
  o2erSaturationOnly: number // %
  cao2: number
  cvo2: number
  do2i: number | null
  vo2i: number | null
}

export type O2erRecord = {
  id: string
  sampledAt: number // epoch ms (sample time chosen by the user)
  savedAt: number
  inputs: O2erRecordInputs
  result: O2erRecordResult
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/

export const isValidClock = (value: string): boolean => HHMM.test(value.trim())

export const clockOf = (timestamp: number): string => {
  const d = new Date(timestamp)
  return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0")
}

// Turns an "HH:MM" sample time into a timestamp near `now`. A time more than
// 30 minutes in the future is treated as the previous day (a sample drawn
// before midnight and saved after it).
export const resolveSampleTime = (clock: string, now: number): number | null => {
  const match = HHMM.exec(clock.trim())
  if (!match) return null
  const d = new Date(now)
  d.setHours(Number(match[1]), Number(match[2]), 0, 0)
  let ts = d.getTime()
  if (ts - now > 30 * 60 * 1000) ts -= 24 * 60 * 60 * 1000
  return ts
}

export const createO2erRecord = (
  inputs: O2erRecordInputs,
  result: O2erRecordResult,
  sampledAt: number,
  now: number,
  random: () => number = Math.random,
): O2erRecord => ({
  id: now.toString(36) + "-" + Math.floor(random() * 0x100000000).toString(36),
  sampledAt,
  savedAt: now,
  inputs: { ...inputs },
  result: { ...result },
})

// Ordered by sample time; equal times keep save order.
export const addO2erRecord = (records: O2erRecord[], record: O2erRecord): O2erRecord[] => {
  const next = [...records, record].sort((a, b) => a.sampledAt - b.sampledAt || a.savedAt - b.savedAt)
  return next.length > O2ER_LOG_MAX ? next.slice(next.length - O2ER_LOG_MAX) : next
}

export const removeO2erRecord = (records: O2erRecord[], id: string): O2erRecord[] => records.filter((r) => r.id !== id)

export type O2erLogSummary = {
  count: number
  latest: O2erRecord | null
  previous: O2erRecord | null
  min: number | null
  max: number | null
  mean: number | null
  aboveReference: number
}

export const summarizeO2erLog = (records: O2erRecord[], reference = O2ER_REFERENCE_PERCENT): O2erLogSummary => {
  if (records.length === 0) {
    return { count: 0, latest: null, previous: null, min: null, max: null, mean: null, aboveReference: 0 }
  }
  const values = records.map((r) => r.result.o2er)
  return {
    count: records.length,
    latest: records[records.length - 1],
    previous: records.length > 1 ? records[records.length - 2] : null,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    aboveReference: values.filter((v) => v > reference).length,
  }
}

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const numberOrNull = (v: unknown): number | null => (isFiniteNumber(v) ? v : null)

// Restores records saved in a Patient Workspace case; drops anything malformed.
export const sanitizeO2erLog = (value: unknown): O2erRecord[] => {
  if (!Array.isArray(value)) return []
  const out: O2erRecord[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, any>
    if (typeof r.id !== "string" || !isFiniteNumber(r.sampledAt) || !isFiniteNumber(r.savedAt)) continue
    const i = r.inputs ?? {}
    const res = r.result ?? {}
    if (!isFiniteNumber(i.hgb) || !isFiniteNumber(i.sao2) || !isFiniteNumber(i.svo2)) continue
    if (!isFiniteNumber(res.o2er) || !isFiniteNumber(res.o2erSaturationOnly) || !isFiniteNumber(res.cao2) || !isFiniteNumber(res.cvo2)) continue
    out.push({
      id: r.id,
      sampledAt: r.sampledAt,
      savedAt: r.savedAt,
      inputs: {
        hgb: i.hgb,
        sao2: i.sao2,
        svo2: i.svo2,
        pao2: numberOrNull(i.pao2),
        pvo2: numberOrNull(i.pvo2),
        flow: numberOrNull(i.flow),
        bsa: numberOrNull(i.bsa),
        temperature: numberOrNull(i.temperature),
      },
      result: {
        o2er: res.o2er,
        o2erSaturationOnly: res.o2erSaturationOnly,
        cao2: res.cao2,
        cvo2: res.cvo2,
        do2i: numberOrNull(res.do2i),
        vo2i: numberOrNull(res.vo2i),
      },
    })
  }
  return out.sort((a, b) => a.sampledAt - b.sampledAt || a.savedAt - b.savedAt)
}

const fmt = (v: number | null, digits: number) => (v === null ? "" : v.toFixed(digits))

// Tab-separated rows for pasting into a chart or spreadsheet.
export const o2erLogToTsv = (records: O2erRecord[]): string => {
  const header = ["시각", "O2ER(%)", "간편식(%)", "Hgb", "SaO2", "SvO2", "PaO2", "PvO2", "Flow", "BSA", "Temp", "CaO2", "CvO2", "DO2i", "VO2i"]
  const rows = records.map((r) => [
    clockOf(r.sampledAt),
    fmt(r.result.o2er, 1),
    fmt(r.result.o2erSaturationOnly, 1),
    fmt(r.inputs.hgb, 1),
    fmt(r.inputs.sao2, 1),
    fmt(r.inputs.svo2, 1),
    fmt(r.inputs.pao2, 0),
    fmt(r.inputs.pvo2, 0),
    fmt(r.inputs.flow, 2),
    fmt(r.inputs.bsa, 2),
    fmt(r.inputs.temperature, 1),
    fmt(r.result.cao2, 2),
    fmt(r.result.cvo2, 2),
    fmt(r.result.do2i, 0),
    fmt(r.result.vo2i, 0),
  ])
  return [header, ...rows].map((row) => row.join("\t")).join("\n")
}
