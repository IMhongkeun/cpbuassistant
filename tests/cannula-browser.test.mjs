import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { estimateCannulaPressure, formatCannulaSize, groupSharedCannulaCurves, matchesCannulaSearch, toggleCannulaSelection } from "../lib/cannula-estimate.ts"

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
  assert.ok(browser.includes('<Line key={item.id} name={(index + 1) + ". " + curveDisplaySize(item) +'))
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
  assert.match(browser, /estimateCannulaPressure\(item.points, targetFlow\)/)
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
