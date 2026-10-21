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

test("primary nav is compact, underlined, and keeps all seven calculator labels", () => {
  const tabs = [...page.matchAll(/\{ id: "(.*?)", label: "(.*?)" \}/g)]
    .map((match) => match[2])
  assert.deepEqual(tabs, ["이식관리", "Hct", "PCS", "GDP", "MICS", "Cannula", "LBM"])
  assert.match(page, /cpbu-nav-tab-active/)
  assert.match(page, /cpbu-subtab-active/)
  assert.match(css, /border-bottom: 2px solid transparent/)
  assert.match(css, /--cpbu-brand: #006b6e;/)
  assert.match(css, /\.cpbu-nav-tab\s*\{[^}]*display: inline-flex;[^}]*justify-content: center;[^}]*text-align: center;/s)
  assert.match(css, /\.cpbu-subtab\s*\{[^}]*justify-content: center;[^}]*text-align: center;/s)
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

// Codex review regression coverage: WCAG contrast, iOS focus zoom, compact PCS tabs.
const luminance = (hex) => {
  const channels = hex.slice(1).match(/../g).map((pair) => Number.parseInt(pair, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
const contrast = (foreground, background) => {
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

test("focused clinical time inputs remain at least 16px for iOS Safari", () => {
  const inputStyle = css.match(/\.cpbu-time-input\s*\{([^}]*)\}/s)?.[1]
  assert.ok(inputStyle, "shared time field styles must exist")
  assert.match(inputStyle, /font-size:\s*1rem\s*;/)
  assert.doesNotMatch(css, /@media[^}]*\.cpbu-time-input[^}]*font-size:\s*\.(?:7|8|9)\d*rem/s)
})

test("muted subtabs and readonly time values meet 4.5:1 contrast against tinted controls", () => {
  const muted = css.match(/--cpbu-muted:\s*(#[a-f\d]{6})\s*;/i)?.[1]
  const readonly = css.match(/\.cpbu-time-input:read-only\s*\{[^}]*color:\s*(#[a-f\d]{6})\s*;/s)?.[1]
  assert.ok(muted && readonly)
  assert.ok(contrast(muted, "#f1f5f4") >= 4.5, "inactive subtab text contrast")
  assert.ok(contrast(readonly, "#f1f5f4") >= 4.5, "readonly time contrast")
})

test("three PCS subtabs fit mobile grid tracks without forced no-wrap", () => {
  assert.match(page, /cpbu-subtabs grid grid-cols-3 gap-1/)
  assert.match(css, /@media \(max-width:\s*639px\)/)
  const rules = css.match(/\.cpbu-subtabs\.grid-cols-3 \.cpbu-subtab\s*\{([^}]*)\}/s)?.[1]
  assert.ok(rules, "mobile PCS subtab override is required")
  assert.match(rules, /min-width:\s*0\s*;/)
  assert.match(rules, /white-space:\s*normal\s*;/)
  assert.match(rules, /overflow-wrap:\s*anywhere\s*;/)
  assert.match(rules, /padding:\s*\.6rem\s*\.25rem\s*;/)
})
