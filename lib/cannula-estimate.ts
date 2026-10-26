/**
 * Manufacturer bench-curve interpolation for the Cannula panel.
 * Points are preserved in their original signed units (mmHg).
 * Never extrapolate beyond the visible source flow range.
 */
export type PressurePoint = readonly [flowLpm: number, pressureMmHg: number]

export function estimateCannulaPressure(points: readonly PressurePoint[], flowLpm: number): number | null {
  if (!Number.isFinite(flowLpm) || flowLpm < 0 || points.length < 2) return null
  if (points.some(([flow, pressure]) => !Number.isFinite(flow) || !Number.isFinite(pressure))) return null
  if (points.some(([flow], index) => index > 0 && flow <= points[index - 1][0])) return null

  const minimum = points[0][0]
  const maximum = points[points.length - 1][0]
  if (flowLpm < minimum || flowLpm > maximum) return null

  for (let index = 0; index < points.length; index++) {
    const [flow, pressure] = points[index]
    if (flowLpm === flow) return pressure
    if (index === 0 || flowLpm > flow) continue
    const [prevFlow, prevPressure] = points[index - 1]
    return prevPressure + ((flowLpm - prevFlow) / (flow - prevFlow)) * (pressure - prevPressure)
  }
  return null
}


/**
 * Preserve the manufacturer's exact chart vertices while adding a 0.1 L/min
 * inspection grid. Only fill values inside EACH selected cannula's measured
 * range; an absent value must never become an extrapolated pressure.
 * Drainage remains signed in the source and in estimateCannulaPressure;
 * chart coordinates display |ΔP| only.
 */
export type CannulaChartRow = { flow: number } & Record<string, number>

export function buildCannulaChartRows(
  curves: readonly { id: string; points: readonly PressurePoint[] }[],
): CannulaChartRow[] {
  const measuredFlows = curves.flatMap((curve) =>
    curve.points.map(([flow]) => flow).filter(Number.isFinite))
  if (measuredFlows.length === 0) return []

  const maxFlow = Math.max(...measuredFlows)
  if (maxFlow < 0) return []
  const flows = new Set(measuredFlows)
  for (let tenth = 0; tenth <= Math.floor(maxFlow * 10 + 1e-8); tenth++) {
    flows.add(tenth / 10)
  }

  return [...flows].sort((a, b) => a - b).map((flow) => {
    const row: CannulaChartRow = { flow }
    for (const curve of curves) {
      const pressure = estimateCannulaPressure(curve.points, flow)
      if (pressure !== null) row[curve.id] = Math.abs(pressure)
    }
    return row
  })
}

/** Snap chart pointer/touch to tenths, without selecting beyond the plotted domain. */
export function snapCannulaChartFlow(flow: number, maxFlow: number): number | null {
  if (!Number.isFinite(flow) || flow < 0 || !Number.isFinite(maxFlow) || maxFlow < 0) return null
  const maxTenth = Math.floor(maxFlow * 10 + 1e-8)
  return Math.min(Math.round(flow * 10), maxTenth) / 10
}



/**
 * Match every word across cannula fields, including category + French size.
 * Numbers target complete Fr sizes, or prefixes of catalog code components.
 */
export type CannulaSearchable = {
  manufacturer: string
  model: string
  category: string
  size: string
  orderCode?: string
  connectorSize?: string
  seriesLabel?: string
  nominalFr?: number
}

function normalizeCannulaSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase()
    .replace(/(\d+)\s*fr\b/g, "$1fr")
    .replace(/\s+/g, " ")
    .trim()
}

export function matchesCannulaSearch(item: CannulaSearchable, query: string): boolean {
  const normalizedQuery = normalizeCannulaSearchText(query)
  if (!normalizedQuery) return true

  const size = normalizeCannulaSearchText(item.size)
  const orderCode = normalizeCannulaSearchText(item.orderCode ?? "")
  const searchableText = [
    item.manufacturer, item.model, item.category, item.size,
    item.orderCode ?? "", item.connectorSize ?? "", item.seriesLabel ?? "",
  ].map(normalizeCannulaSearchText).join(" ")

  return normalizedQuery.split(/\s+/).every((term) => {
    if (/^\d+(?:fr)?$/.test(term)) {
      const frTerm = term.endsWith("fr") ? term : term + "fr"
      const exactFr = new RegExp("(?:^|[^0-9])" + frTerm + "(?![a-z0-9])").test(size)
      // A short Fr query (18) must not accidentally match code 66118.
      // At least three digits are needed for a prefix order-code search.
      const codePrefix = !term.endsWith("fr") && term.length >= 3 &&
        new RegExp("(?:^|[^0-9])" + term).test(orderCode)
      const verifiedNominalFr = Number(frTerm.slice(0, -2)) === item.nominalFr
      // Two-stage MC2 sizes use paired French diameters (e.g. 28/36 Fr).
      // Match either diameter without mistaking a catalog-code suffix for Fr.
      const pairedSize = size.match(/(?:^|[^0-9])(\d+)\s*\/\s*(\d+)fr\b/)
      const pairedFr = pairedSize !== null &&
        (frTerm === pairedSize[1] + "fr" || frTerm === pairedSize[2] + "fr")
      return exactFr || pairedFr || verifiedNominalFr || codePrefix
    }
    return searchableText.includes(term)
  })
}


/** Show verified nominal Fr and unique order code in every comparison label. */
export function formatCannulaSize(item: Pick<CannulaSearchable, "size" | "orderCode" | "nominalFr">): string {
  const hasFr = typeof item.nominalFr === "number" &&
    new RegExp("(?:^|[^0-9])" + item.nominalFr + "\\s*fr\\b", "i").test(item.size)
  const sized = Number.isInteger(item.nominalFr) && (item.nominalFr ?? 0) > 0 && !hasFr
    ? item.size + " · " + item.nominalFr + " Fr"
    : item.size
  return item.orderCode && !sized.includes(item.orderCode)
    ? sized + " · " + item.orderCode
    : sized
}


/**
 * Collapse products with a manufacturer-shared pressure curve into one
 * selectable curve. Every connector variant remains searchable and visible
 * in the group; curves with distinct measurement points remain separate.
 */
export type SharedCannulaCurve = {
  manufacturer: string
  model: string
  size: string
  sharedSizeCurve: boolean
  points: readonly PressurePoint[]
}

export type CannulaCurveGroup<T> = {
  item: T
  variants: T[]
}

export function groupSharedCannulaCurves<T extends SharedCannulaCurve>(
  items: readonly T[],
): CannulaCurveGroup<T>[] {
  const groups: CannulaCurveGroup<T>[] = []
  const sharedByCurve = new Map<string, CannulaCurveGroup<T>>()

  for (const item of items) {
    if (!item.sharedSizeCurve) {
      groups.push({ item, variants: [item] })
      continue
    }

    // Include full source points: do not collapse future models that have
    // multiple real curves for the same Fr.
    const key = JSON.stringify([item.manufacturer, item.model, item.size, item.points])
    const group = sharedByCurve.get(key)
    if (group) {
      group.variants.push(item)
    } else {
      const next = { item, variants: [item] }
      sharedByCurve.set(key, next)
      groups.push(next)
    }
  }
  return groups
}

/** Stable manufacturer priority: Medtronic curves first, Maquet/HLS afterward. */
export function compareCannulaManufacturers(
  a: Pick<CannulaSearchable, "manufacturer">,
  b: Pick<CannulaSearchable, "manufacturer">,
): number {
  return Number(b.manufacturer === "Medtronic") - Number(a.manufacturer === "Medtronic")
}

/** The fifth unique curve cannot be added; selected curves can always be removed. */
export function toggleCannulaSelection(ids: readonly string[], id: string, limit = 4): string[] {
  if (ids.includes(id)) return ids.filter((current) => current !== id)
  if (ids.length >= limit) return [...ids]
  return [...ids, id]
}
