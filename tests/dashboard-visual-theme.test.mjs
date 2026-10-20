import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

const root = new URL("../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")
const page = read("app/page.tsx")
const css = read("app/globals.css")
const logo = read("public/asan-foundation-mark.svg")

test("brand mark appears beside the site name with transparent, grid-free source asset", () => {
  assert.match(page, /<img src="\/asan-foundation-mark\.svg" alt="아산재단 로고"/)
  assert.match(page, /CPBU assistant<\/h1>/)
  assert.match(logo, /^<svg /)
  assert.match(logo, /data:image\/png;base64,/)
  assert.ok(!logo.includes("grid"), "no visible background grid layer")
})

test("primary nav is compact, underlined, and keeps all six calculator labels", () => {
  const tabs = [...page.matchAll(/\{ id: "(.*?)", label: "(.*?)" \}/g)]
    .map((match) => match[2])
  assert.deepEqual(tabs, ["이식관리", "Hct", "PCS", "GDP", "MICS", "LBM"])
  assert.match(page, /cpbu-nav-tab-active/)
  assert.match(page, /cpbu-subtab-active/)
  assert.match(css, /border-bottom: 2px solid transparent/)
  assert.match(css, /--cpbu-brand: #006b6e;/)
})

test("time controls use a single restrained brand palette and preserve focus semantics", () => {
  assert.match(page, /className="cpbu-time-input"/)
  assert.match(page, /className="cpbu-clock-button"/)
  assert.match(page, /className="cpbu-duration"/)
  assert.match(page, /className="cpbu-time-section"/)
  assert.match(page, /tabIndex=\{readOnly \|\| skipTab \? -1 : 0\}/)
  assert.match(page, /tabIndex=\{-1\}/)
  assert.match(css, /\.cpbu-time-input:read-only/)
  assert.match(css, /\.cpbu-clock-button:focus-visible/)
  assert.ok(!page.includes('bg-green-500'), "avoid bright green clock buttons")
})

test("transplant sections keep clinical headings and preserve original logic hooks", () => {
  for (const text of [
    "폐이식 시간 관리", "심장이식 시간 관리",
    "Donor ACC Time", "Left Lung (1st lung)", "Right Lung (2nd lung)",
    "Cold Ischemic Time", "Warm Ischemic Time", "Anastomosis Time",
    "Total Ischemic Time (Left)", "Total Ischemic Time (Right)", "Pump Time",
  ]) assert.ok(page.includes(text), text + " remains visible")
  assert.match(page, /lungData\.warmIschemicTime\.lt\.start/)
  assert.match(page, /heartData\.coldIschemicTime\.end/)
  assert.match(page, /calculateDuration\(/)
})
