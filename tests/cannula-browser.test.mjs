import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { buildCannulaChartRows, snapCannulaChartFlow, compareCannulaManufacturers, estimateCannulaPressure, formatCannulaSize, groupSharedCannulaCurves, matchesCannulaSearch, toggleCannulaSelection } from "../lib/cannula-estimate.ts"

const source = JSON.parse(readFileSync(new URL("../data/cannula-medtronic-maquet.json", import.meta.url), "utf8"))
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")
const browser = readFileSync(new URL("../components/cannula-browser.tsx", import.meta.url), "utf8")

test("imports only Medtronic and Getinge/Maquet and retains Avalon separate lumens", () => {
  assert.equal(source.sourceProductCount, 101)
  assert.equal(source.items.length, 108)
  assert.deepEqual(new Set(source.items.map((item) => item.manufacturer)),
    new Set(["Getinge / Maquet", "Medtronic"]))
  assert.equal(new Set(source.items.map((item) => item.id)).size, source.items.length)
  assert.equal(source.items.filter((item) => item.semanticType === "drainage").length, 7)
  assert.equal(source.items.filter((item) => item.semanticType === "infusion").length, 7)
  assert.ok(source.items.some((item) => item.model.includes("Pediatric") && item.sharedSizeCurve))
  assert.ok(source.items.some((item) => item.model === "EOPA Arterial Cannulae"))
  assert.ok(!source.items.some((item) => item.model === "EOPA 3D Arterial Cannulae"))
  for (const model of [
    "DLP Right Angle Single Stage Venous Cannulae",
    "Select 3D II Arterial Cannulae",
  ]) {
    assert.ok(!source.items.some((item) => item.model === model), model)
  }
  assert.ok(!source.items.some((item) => /^PAL\b/.test(item.orderCode)))
  assert.ok(!source.items.some((item) => /^PVS\b/.test(item.orderCode)))
  for (const code of ["PAS 1315", "PVL 2155", "69318", "67318", "66118"]) {
    assert.ok(source.items.some((item) => item.orderCode === code), code)
  }
  assert.equal(source.items.filter((item) =>
    item.model === "DLP Single Stage Venous Cannulae with Right Angle Metal Tip").length, 14)
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

test("multi-term search matches Venous 18 Fr independent of word order and spacing", () => {
  const venous18 = source.items.filter((item) =>
    /venous/i.test(item.category) && /^18\s*Fr\b/i.test(item.size))
  assert.equal(venous18.length, 3)
  const expectedIds = venous18.map((item) => item.id).sort()
  for (const query of [
    "venous 18", "18 venous", "VENOUS   18FR", "venous 18 Fr",
    "Medtronic venous 18", "DLP 18Fr venous",
  ]) {
    assert.deepEqual(
      source.items.filter((item) => matchesCannulaSearch(item, query)).map((item) => item.id).sort(),
      expectedIds, "query: " + query,
    )
  }
  const item = venous18.find((curve) => curve.orderCode === "66118")
  assert.ok(item)
  for (const query of ["DLP 66118", "DLP 661", "  "]) {
    assert.ok(matchesCannulaSearch(item, query), query)
  }
  for (const query of ["arterial 18", "venous 118", "venous 8Fr", "maquet 18"]) {
    assert.ok(!matchesCannulaSearch(item, query), query)
  }
})


test("HLS PVL codes expose verified nominal Fr without false partial matches", () => {
  const expected = new Map([
    ["PVL 2155", 21], ["PVL 2355", 23],
    ["PVL 2555", 25], ["PVL 2955", 29],
  ])
  const venous = source.items.filter((item) => item.model === "HLS Venous Cannula")
  assert.equal(venous.length, 4)
  for (const item of venous) {
    const nominalFr = expected.get(item.orderCode)
    assert.ok(nominalFr, item.orderCode)
    assert.equal(item.nominalFr, nominalFr)
    for (const term of [String(nominalFr), nominalFr + "Fr", "Maquet venous " + nominalFr]) {
      assert.equal(matchesCannulaSearch(item, term), true, term + ": " + item.orderCode)
    }
    assert.ok(formatCannulaSize(item).includes(nominalFr + " Fr"))
    assert.ok(matchesCannulaSearch(item, item.orderCode))
    assert.equal(matchesCannulaSearch(item, String(nominalFr) + "0Fr"), false)
    assert.equal(matchesCannulaSearch(item, "18Fr"), false)
    for (const different of expected.values()) {
      if (different !== nominalFr) assert.equal(matchesCannulaSearch(item, different + "Fr"), false)
    }
  }
})

test("NextGen femoral arterial and jugular venous share verified catalog codes by Fr", () => {
  const bySize = new Map([
    ["15 Fr", "96570-115"], ["17 Fr", "96570-117"],
    ["19 Fr", "96570-119"], ["21 Fr", "96570-121"],
    ["23 Fr", "96570-123"], ["25 Fr", "96570-125"],
  ])
  const femoral = source.items.filter((item) => item.model === "Bio-Medicus NextGen Femoral Arterial Cannula")
  const jugular = source.items.filter((item) => item.model === "Bio-Medicus NextGen Jugular Venous Cannula")
  assert.equal(femoral.length, bySize.size)
  assert.equal(jugular.length, bySize.size)
  for (const arterial of femoral) {
    const code = bySize.get(arterial.size)
    assert.ok(code, arterial.size)
    assert.equal(arterial.orderCode, code)
    const venous = jugular.find((item) => item.size === arterial.size)
    assert.ok(venous)
    assert.equal(venous.orderCode, code)
    assert.ok(matchesCannulaSearch(arterial, code))
    assert.ok(matchesCannulaSearch(venous, code))
    assert.ok(matchesCannulaSearch(arterial, "arterial " + code))
    assert.ok(matchesCannulaSearch(venous, "venous " + code))
    assert.ok(!matchesCannulaSearch(arterial, "venous " + code))
    assert.ok(!matchesCannulaSearch(venous, "arterial " + code))
  }
  const sharedCode = source.items.filter((item) => matchesCannulaSearch(item, "96570-119"))
  assert.deepEqual(new Set(sharedCode.map((item) => item.model)),
    new Set(["Bio-Medicus NextGen Femoral Arterial Cannula", "Bio-Medicus NextGen Jugular Venous Cannula"]))
})

test("variant-specific order codes appear in selected cards and chart series", () => {
  const metalTip = source.items.filter((item) =>
    item.model === "DLP Single Stage Venous Cannulae with Right Angle Metal Tip" &&
    item.size.startsWith("18 Fr"))
  assert.deepEqual(new Set(metalTip.map((item) => item.orderCode)), new Set(["67318", "69318"]))
  const labels = metalTip.map(formatCannulaSize)
  assert.equal(new Set(labels).size, 2)
  for (const item of metalTip) assert.ok(formatCannulaSize(item).includes(item.orderCode))
  const hls = source.items.find((item) => item.orderCode === "PVL 2155")
  assert.ok(hls)
  assert.equal(formatCannulaSize(hls), "PVL 2155 · 21 Fr")
  assert.ok(browser.includes('return item.model + " · " + curveDisplaySize(item) + ('))
  assert.ok(browser.includes('{curveDisplaySize(item)}'))
  assert.ok(browser.includes('<Line key={item.id} name={compactCurveLabel(item)}'))
})


test("shared pediatric DLP cannula curves appear once per Fr without deleting connector variants", () => {
  const pediatric = source.items.filter((item) =>
    item.model === "DLP Pediatric One-piece Arterial Cannula")
  assert.equal(pediatric.length, 20)
  const grouped = groupSharedCannulaCurves(source.items)
  assert.equal(grouped.length, 94)
  assert.equal(grouped.flatMap((group) => group.variants).length, source.items.length)
  const pediatricGroups = grouped.filter((group) =>
    group.item.model === "DLP Pediatric One-piece Arterial Cannula")
  assert.equal(pediatricGroups.length, 6)
  const expected = new Map([
    ["6 Fr", ["77006", "77106", "77206", "77306"]],
    ["8 Fr", ["77008", "77108", "77208", "77308"]],
    ["10 Fr", ["77010", "77110", "77210", "77310"]],
    ["12 Fr", ["77012", "77112", "77212", "77312"]],
    ["14 Fr", ["77014", "77114"]],
    ["16 Fr", ["77016", "77116"]],
  ])
  for (const group of pediatricGroups) {
    const expectedCodes = expected.get(group.item.size)
    assert.ok(expectedCodes, group.item.size)
    assert.deepEqual(group.variants.map((item) => item.orderCode), expectedCodes)
    assert.ok(group.variants.every((item) =>
      JSON.stringify(item.points) === JSON.stringify(group.item.points)))
    for (const code of expectedCodes) {
      const found = grouped.filter(({ variants }) =>
        variants.some((variant) => matchesCannulaSearch(variant, code)))
      assert.equal(found.length, 1, code)
      assert.equal(found[0].item.id, group.item.id)
    }
  }
  for (const query of ["8", "8Fr", "arterial 8", "77308", "DLP 77208"]) {
    const found = grouped.filter(({ variants }) =>
      variants.some((variant) => matchesCannulaSearch(variant, query)))
    const onlyEight = found.filter((group) =>
      group.item.model === "DLP Pediatric One-piece Arterial Cannula")
    assert.equal(onlyEight.length, 1, query)
    assert.equal(onlyEight[0].item.size, "8 Fr")
  }
  const distinctMetalTip = grouped.filter(({ item }) =>
    item.model === "DLP Single Stage Venous Cannulae with Right Angle Metal Tip" &&
    item.size.startsWith("18 Fr"))
  assert.equal(distinctMetalTip.length, 2, "different nonshared connector curves must stay separate")

  const first = pediatricGroups.find((group) => group.item.size === "8 Fr").item
  const altered = { ...first, id: "different-pressure-curve",
    points: first.points.map(([flow, pressure], index) =>
      index === 0 ? [flow, pressure + 1] : [flow, pressure]) }
  assert.equal(groupSharedCannulaCurves([first, altered]).length, 2,
    "same Fr with distinct measured points must not be merged")
  assert.ok(browser.includes("CURVE_GROUPS.filter"))
  assert.ok(browser.includes("variants.some((variant) => matchesCannulaSearch(variant, search))"))
  assert.ok(browser.includes("제품 코드: {variantCodes}"))
  assert.ok(browser.includes("variant.orderCode} · {variant.connectorSize}"))
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
  assert.match(browser, /matchesCannulaSearch\(variant, search\)/)
  assert.match(browser, /toggleCannulaSelection\(previous, id, MAX_COMPARE\)/)
  assert.match(browser, /estimateCannulaPressure\(item.points, chartFlow\)/)
  assert.match(browser, /ResponsiveContainer/)
  assert.match(browser, /connectNulls/)
  assert.match(browser, /PressurePathDiagram type="arterial"/)
  assert.match(browser, /PressurePathDiagram type="venous"/)
  assert.match(browser, /측정된 arterial line P/)
  assert.match(browser, /환자 MAP/)
  assert.match(browser, /센서 이후 회로 ΔP/)
  assert.ok(browser.includes("Reservoir 압력 (VAVD)"))
  assert.match(browser, /배액 구동 압력차/)
  assert.match(browser, /VAVD는 캐뉼라 압력손실에 더하는 값이 아니라/)
  assert.ok(browser.includes("chatter/collapse"))
  assert.match(browser, /안전한 음압 한계/)
  assert.match(browser, /측정 범위 밖 · 추정 불가/)
})


test("all-manufacturer cannula catalog prioritizes Medtronic over Maquet/HLS", () => {
  const grouped = groupSharedCannulaCurves(source.items)
    .sort((a, b) => compareCannulaManufacturers(a.item, b.item))
  const firstMaquetIndex = grouped.findIndex(({ item }) => item.manufacturer !== "Medtronic")
  assert.ok(firstMaquetIndex > 0, "some Medtronic entries should be first")
  assert.ok(grouped.slice(0, firstMaquetIndex).every(({ item }) => item.manufacturer === "Medtronic"))
  assert.ok(grouped.slice(firstMaquetIndex).every(({ item }) => item.manufacturer !== "Medtronic"))
  const hls = grouped.filter(({ item }) => item.model.includes("HLS"))
  assert.ok(hls.length > 0)
  assert.ok(hls.every(({ item }) => item.manufacturer === "Getinge / Maquet"))
  // Filtering by type and a matching query preserves the manufacturer priority.
  const matchingArterial = grouped.filter(({ item }) =>
    /arterial/i.test(item.category) && matchesCannulaSearch(item, "arterial"))
  const firstOther = matchingArterial.findIndex(({ item }) => item.manufacturer !== "Medtronic")
  assert.ok(firstOther > 0)
  assert.ok(matchingArterial.slice(0, firstOther).every(({ item }) => item.manufacturer === "Medtronic"))
  assert.ok(browser.includes(".sort((a, b) => compareCannulaManufacturers(a.item, b.item))"))
})

test("chart preview displays four compact, synchronized flow/pressure rows below the graph", () => {
  assert.ok(browser.includes("const [previewFlow, setPreviewFlow] = useState<number | null>(null)"))
  assert.ok(browser.includes("const chartFlow = previewFlow ?? (validFlow ? targetFlow : null)"))
  // Recharts 2.15 invokes onMouseDown when touch-start begins, even without movement.
  // It invokes onMouseMove for touch-move; direct touch handlers are replaced internally.
  for (const handler of ["onMouseDown={handleChartMove}", "onMouseMove={handleChartMove}",
    "onClick={handleChartMove}"]) {
    assert.ok(browser.includes(handler), handler)
  }
  assert.ok(!browser.includes("onTouchStart={handleChartMove}"), "Recharts overrides direct touch-start handlers")
  assert.ok(!browser.includes("onTouchMove={handleChartMove}"), "Recharts overrides direct touch-move handlers")
  assert.ok(browser.includes("Recharts 2.15 maps touch-start to onMouseDown"))
  assert.ok(browser.includes('<Tooltip content={() => null}'), "floating popup no longer obscures graph")
  assert.ok(browser.includes('aria-label="그래프 바로 아래 혈류량별 압력 비교"'))
  assert.ok(browser.includes("estimateCannulaPressure(item.points, chartFlow)"))
  assert.ok(browser.includes("compactCurveLabel(item)"))
  assert.ok(browser.includes('item.model.replace(/\\s+Cannulae?$/i, "")'), "full model remains identifiable")
  assert.ok(browser.includes('item.nominalFr + " Fr"'), "Fr is retained")
  assert.ok(browser.includes('title={estimate === null ? "측정 범위 밖 · 추정 불가"'))
  assert.ok(browser.indexOf('aria-label="그래프 바로 아래 혈류량별 압력 비교"') >
    browser.indexOf('aria-label="선택한 캐뉼라의 압력손실 크기 대 혈류량 비교 그래프"'))
  // Each chosen device is interpolated independently at exactly the same pointer flow.
  const arterial = source.items.find((item) => item.orderCode === "PAS 2315")
  const medtronic = source.items.find((item) => item.manufacturer === "Medtronic" &&
    /arterial/i.test(item.category) && item.points[0][0] <= 2 &&
    item.points.at(-1)[0] >= 2)
  assert.ok(arterial && medtronic)
  for (const item of [arterial, medtronic]) {
    assert.ok(estimateCannulaPressure(item.points, 2) !== null)
    assert.equal(estimateCannulaPressure(item.points, item.points.at(-1)[0] + 0.01), null)
  }
})

test("selected-curve markers share flow and plot signed Drainage magnitude", () => {
  assert.ok(browser.includes("ReferenceDot"))
  assert.ok(browser.includes('activeDot={false}'), "disable native dots based on sparse raw points")
  assert.ok(browser.includes('chartFlow !== null && selected.map((item, index) => {'))
  assert.ok(browser.includes('estimateCannulaPressure(item.points, chartFlow)'))
  assert.ok(browser.includes('if (pressure === null) return null'), "out-of-range curves must not have dots")
  assert.ok(browser.includes('x={chartFlow} y={Math.abs(pressure)}'), "one x shared by all curves and magnitude on graph")
  assert.ok(browser.includes('fill={LINE_COLORS[index]}'), "dot color follows its selected curve")
  assert.ok(browser.includes('isFront ifOverflow="hidden"'))
  assert.ok(browser.includes('item.semanticType === "drainage" ? "Drainage · "'))
  assert.ok(browser.includes('item.semanticType === "infusion" ? "Infusion · "'))

  const drain = source.items.find((item) =>
    item.model.startsWith("Avalon Elite") && item.semanticType === "drainage")
  const infusion = source.items.find((item) =>
    item.model.startsWith("Avalon Elite") && item.semanticType === "infusion" &&
    item.size === drain?.size)
  assert.ok(drain && infusion, "two lumens for the same Avalon Fr should be identifiable")
  const sharedMin = Math.max(drain.points[0][0], infusion.points[0][0])
  const sharedMax = Math.min(drain.points.at(-1)[0], infusion.points.at(-1)[0])
  assert.ok(sharedMin < sharedMax)
  const flow = (sharedMin + sharedMax) / 2
  const dP = estimateCannulaPressure(drain.points, flow)
  const iP = estimateCannulaPressure(infusion.points, flow)
  assert.ok(dP !== null && iP !== null)
  assert.ok(dP < 0, "Drainage must preserve signed manufacturer result")
  assert.ok(iP > 0, "Infusion must preserve signed manufacturer result")
  assert.ok(Math.abs(dP) > 0 && Math.abs(iP) > 0)
  assert.notEqual(Math.abs(dP), Math.abs(iP), "the two magnitudes should plot at different heights")
})

test("chart has every 0.1 L/min inspection point and keeps exact off-grid manufacturer vertices", () => {
  const curves = [
    { id: "arterial", points: [[0.15, 15], [0.35, 35]] },
    { id: "drainage", points: [[0, -3], [0.4, -43]] },
  ]
  const rows = buildCannulaChartRows(curves)
  assert.deepEqual(rows.map((row) => row.flow), [0, 0.1, 0.15, 0.2, 0.3, 0.35, 0.4])
  const byFlow = new Map(rows.map((row) => [row.flow, row]))
  // Exact source readings have priority over interpolation and are never overwritten.
  assert.equal(byFlow.get(0.15).arterial, 15)
  assert.equal(byFlow.get(0.35).arterial, 35)
  // All selected cannulas share the same flow even with different sampling points.
  assert.equal(byFlow.get(0.2).arterial, 20)
  assert.equal(byFlow.get(0.2).drainage, 23)
  assert.equal(byFlow.get(0.3).arterial, 30)
  assert.equal(byFlow.get(0.3).drainage, 33)
  // A curve has no invented pressure before its first or after its last measurement.
  assert.equal(byFlow.get(0.1).arterial, undefined)
  assert.equal(byFlow.get(0.4).arterial, undefined)
  assert.equal(byFlow.get(0).drainage, 3)
  assert.equal(byFlow.get(0.4).drainage, 43)
  assert.deepEqual(buildCannulaChartRows([]), [])
})

test("0.1 L/min mouse/touch snapping is stable at endpoints and source off-grid flow values", () => {
  assert.equal(snapCannulaChartFlow(2.04, 5.06), 2)
  assert.equal(snapCannulaChartFlow(2.05, 5.06), 2.1)
  assert.equal(snapCannulaChartFlow(2.26, 5.06), 2.3)
  assert.equal(snapCannulaChartFlow(5.06, 5.06), 5.0,
    "a source endpoint at 5.06 must not snap to an extrapolated 5.1")
  for (const flow of [-0.1, Number.NaN, Infinity]) {
    assert.equal(snapCannulaChartFlow(flow, 4), null)
  }
  assert.equal(snapCannulaChartFlow(0.1, -1), null)
  assert.ok(browser.includes("buildCannulaChartRows(selected)"), "chart must contain interpolated inspection points")
  assert.ok(browser.includes("snapCannulaChartFlow(Number(state.activeLabel), maxFlow)"),
    "drag and stationary touches should select a 0.1 L/min common flow")
  assert.ok(browser.includes("touch-pan-y"), "retain vertical page scrolling while dragging horizontally on mobile")
  assert.ok(browser.includes("previewFlow === null ? 2 : 1"), "preview flow is displayed to tenths")
  assert.ok(browser.includes("0.1 L/min 간격"), "explain interpolation step in UI")
  assert.ok(browser.includes("estimateCannulaPressure(item.points, chartFlow)"),
    "comparison table and points must use the same interpolated flow")
})

test("real chart data interpolates for four selected source curves without modifying signed sources", () => {
  const candidates = source.items.filter((item) => item.points[0][0] <= 1 &&
    item.points.at(-1)[0] >= 2)
  const chosen = candidates.slice(0, 4)
  assert.equal(chosen.length, 4)
  const originalPoints = chosen.map((item) => JSON.stringify(item.points))
  const rows = buildCannulaChartRows(chosen)
  for (const tenth of [10, 11, 12, 15, 18, 20]) {
    const flow = tenth / 10
    const row = rows.find((point) => point.flow === flow)
    assert.ok(row, "missing 0.1 L/min sample " + flow)
    for (const curve of chosen) {
      const signed = estimateCannulaPressure(curve.points, flow)
      assert.equal(row[curve.id], Math.abs(signed), "mismatched pressure at " + flow)
    }
  }
  assert.deepEqual(chosen.map((item) => JSON.stringify(item.points)), originalPoints,
    "sampling must never edit manufacturer measurements")
})
