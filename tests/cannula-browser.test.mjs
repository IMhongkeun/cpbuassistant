import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { estimateCannulaPressure, toggleCannulaSelection } from "../lib/cannula-estimate.ts"

const source = JSON.parse(readFileSync(new URL("../data/cannula-medtronic-maquet.json", import.meta.url), "utf8"))
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
const browser = readFileSync(new URL("../components/cannula-browser.tsx", import.meta.url), "utf8")

test("imports only Medtronic and Getinge/Maquet and retains Avalon separate lumens", () => {
  assert.equal(source.sourceProductCount, 129)
  assert.equal(source.items.length, 136)
  assert.deepEqual(new Set(source.items.map((item) => item.manufacturer)),
    new Set(["Getinge / Maquet", "Medtronic"]))
  assert.equal(new Set(source.items.map((item) => item.id)).size, source.items.length)
  assert.equal(source.items.filter((item) => item.semanticType === "drainage").length, 7)
  assert.equal(source.items.filter((item) => item.semanticType === "infusion").length, 7)
  assert.ok(source.items.some((item) => item.model.includes("Pediatric") && item.sharedSizeCurve))
})

test("source curves are finite, ordered and keep signed Avalon drainage", () => {
  for (const item of source.items) {
    assert.ok(item.points.length >= 2, item.id)
    let previous = -Infinity
    for (const [flow, pressure] of item.points) {
      assert.ok(Number.isFinite(flow) && Number.isFinite(pressure), item.id)
      assert.ok(flow > previous, "flow order " + item.id)
      assert.ok(flow >= 0, "negative flow " + item.id)
      previous = flow
    }
  }
  assert.ok(source.items.filter((item) => item.semanticType === "drainage")
    .every((item) => item.points.some((point) => point[1] < 0)))
})

test("linear interpolation respects exact source values and NEVER extrapolates", () => {
  const points = [[1, 12], [3, 52], [5, 100]]
  assert.equal(estimateCannulaPressure(points, 1), 12)
  assert.equal(estimateCannulaPressure(points, 2), 32)
  assert.equal(estimateCannulaPressure(points, 3), 52)
  assert.equal(estimateCannulaPressure(points, 4), 76)
  assert.equal(estimateCannulaPressure(points, 5), 100)
  for (const flow of [0, 0.99, 5.01, 8, -1, Number.NaN, Infinity]) {
    assert.equal(estimateCannulaPressure(points, flow), null)
  }
  assert.equal(estimateCannulaPressure([[0, 0], [2, -50], [4, -100]], 3), -75)
  assert.equal(estimateCannulaPressure([[1, 20], [1, 25]], 1), null)
})

test("selection never adds a fifth curve and supports deselection", () => {
  const four = ["a", "b", "c", "d"]
  assert.deepEqual(toggleCannulaSelection(four, "e"), four)
  assert.deepEqual(toggleCannulaSelection(four, "b"), ["a", "c", "d"])
  assert.deepEqual(toggleCannulaSelection(["a", "c", "d"], "e"), ["a", "c", "d", "e"])
  assert.deepEqual(toggleCannulaSelection(["a"], "a"), [])
})

test("navigation, search, chart, ranges and dual diagrams stay integrated", () => {
  assert.match(page, /\{ id: "cannula", label: "Cannula" \}/)
  assert.match(page, /activeTab === "cannula" && <CannulaBrowser \/>/)
  assert.match(browser, /setSearch\(/)
  assert.match(browser, /toggleCannulaSelection\(previous, id, MAX_COMPARE\)/)
  assert.match(browser, /estimateCannulaPressure\(item.points, targetFlow\)/)
  assert.match(browser, /ResponsiveContainer/)
  assert.match(browser, /connectNulls/)
  assert.match(browser, /PressurePathDiagram type="arterial"/)
  assert.match(browser, /PressurePathDiagram type="venous"/)
  assert.match(browser, /측정 범위 밖 · 추정 불가/)
})
