import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import {
  O2ER_LOG_MAX,
  O2ER_REFERENCE_PERCENT,
  addO2erRecord,
  clockOf,
  createO2erRecord,
  isValidClock,
  o2erLogToTsv,
  removeO2erRecord,
  resolveSampleTime,
  sanitizeO2erLog,
  summarizeO2erLog,
} from "../lib/o2er-log.ts"
import { computeO2er } from "../lib/o2er.ts"

const at = (h, m, day = 9) => new Date(2026, 10, day, h, m, 0, 0).getTime()
const inputs = (svo2, extra = {}) => ({ hgb: 8, sao2: 100, svo2, pao2: 250, pvo2: 40, flow: 4.8, bsa: 2, temperature: 34, ...extra })
const resultFor = (i) => {
  const r = computeO2er(i)
  assert.equal(r.ok, true)
  return { o2er: r.o2er, o2erSaturationOnly: r.o2erSaturationOnly, cao2: r.cao2, cvo2: r.cvo2, do2i: r.do2i, vo2i: r.vo2i }
}
const record = (svo2, sampledAt, savedAt = sampledAt) => {
  const i = inputs(svo2)
  let n = 0
  return createO2erRecord(i, resultFor(i), sampledAt, savedAt, () => (n += 0.1))
}

test("reference line is the 25% operational cut from Ahmad et al. 2026", () => {
  assert.equal(O2ER_REFERENCE_PERCENT, 25)
})

test("clock validation and formatting", () => {
  for (const ok of ["00:00", "9:05", "23:59", "07:30"]) assert.equal(isValidClock(ok), true, ok)
  for (const bad of ["24:00", "12:60", "1230", "", "ab:cd"]) assert.equal(isValidClock(bad), false, bad)
  assert.equal(clockOf(at(7, 5)), "07:05")
})

test("sample time resolves to today, or yesterday when it lies over 30 min in the future", () => {
  const now = at(10, 0)
  assert.equal(resolveSampleTime("09:40", now), at(9, 40))
  assert.equal(resolveSampleTime("10:25", now), at(10, 25))
  assert.equal(resolveSampleTime("23:50", at(0, 10)), at(23, 50, 8))
  assert.equal(resolveSampleTime("bad", now), null)
})

test("records are ordered by sample time and stored values match computeO2er", () => {
  const a = record(70, at(9, 0))
  const b = record(65, at(9, 30))
  const late = record(72, at(8, 45), at(9, 40))
  let log = addO2erRecord([], a)
  log = addO2erRecord(log, b)
  log = addO2erRecord(log, late)
  assert.deepEqual(log.map((r) => clockOf(r.sampledAt)), ["08:45", "09:00", "09:30"])
  // Hb 8, SaO2 100, PaO2 250, SvO2 70, PvO2 40 → 33.53% (same case as o2er.test)
  assert.ok(Math.abs(a.result.o2er - 33.53) < 0.01)
  assert.equal(removeO2erRecord(log, a.id).length, 2)
})

test("log is capped at the maximum length, dropping the oldest", () => {
  let log = []
  for (let k = 0; k < O2ER_LOG_MAX + 5; k++) log = addO2erRecord(log, record(70, at(0, 0) + k * 60000))
  assert.equal(log.length, O2ER_LOG_MAX)
  assert.equal(log[0].sampledAt, at(0, 5))
})

test("summary: latest, previous, min/max/mean and count above 25%", () => {
  assert.equal(summarizeO2erLog([]).count, 0)
  const log = [record(80, at(9, 0)), record(70, at(9, 30)), record(76, at(10, 0))].reduce(addO2erRecord, [])
  const s = summarizeO2erLog(log)
  const values = log.map((r) => r.result.o2er)
  assert.equal(s.count, 3)
  assert.equal(s.latest.id, log[2].id)
  assert.equal(s.previous.id, log[1].id)
  assert.equal(s.min, Math.min(...values))
  assert.equal(s.max, Math.max(...values))
  assert.ok(Math.abs(s.mean - values.reduce((a, b) => a + b) / 3) < 1e-12)
  assert.equal(s.aboveReference, values.filter((v) => v > 25).length)
})

test("sanitize keeps valid records in order and drops malformed ones", () => {
  const good = record(70, at(9, 0))
  const raw = JSON.parse(JSON.stringify([record(72, at(9, 30)), good, { id: "x" }, null, { ...good, id: "nan", inputs: { ...good.inputs, svo2: "70" } }]))
  const out = sanitizeO2erLog(raw)
  assert.deepEqual(out.map((r) => clockOf(r.sampledAt)), ["09:00", "09:30"])
  assert.deepEqual(sanitizeO2erLog("nope"), [])
  const withNull = JSON.parse(JSON.stringify([{ ...good, inputs: { ...good.inputs, pao2: null, flow: null }, result: { ...good.result, do2i: null } }]))
  assert.equal(sanitizeO2erLog(withNull)[0].result.do2i, null)
})

test("TSV export has a header and one line per record", () => {
  const log = [record(70, at(9, 0))]
  const lines = o2erLogToTsv(log).split("\n")
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^시각\tO2ER\(%\)/)
  assert.match(lines[1], /^09:00\t33\.5\t30\.0\t8\.0\t100\.0\t70\.0/)
})

test("GDP O2ER tab renders the log panel and saves it with the workspace case", () => {
  const gdp = readFileSync(new URL("../components/gdp-calculator.tsx", import.meta.url), "utf8")
  assert.match(gdp, /<O2erLogPanel records=\{o2erLog\} onChange=\{setO2erLog\} current=\{o2erCurrent\} persisted=\{workspaceActive\} \/>/)
  assert.match(gdp, /o2erLog: \{ value: o2erLog, set: \(saved: unknown\) => setO2erLog\(sanitizeO2erLog\(saved\)\) \}/)
})
