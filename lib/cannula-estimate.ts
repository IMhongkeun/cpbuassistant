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
      return exactFr || codePrefix
    }
    return searchableText.includes(term)
  })
}

/** The fifth unique curve cannot be added; selected curves can always be removed. */
export function toggleCannulaSelection(ids: readonly string[], id: string, limit = 4): string[] {
  if (ids.includes(id)) return ids.filter((current) => current !== id)
  if (ids.length >= limit) return [...ids]
  return [...ids, id]
}
