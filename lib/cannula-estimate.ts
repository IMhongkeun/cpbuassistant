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

/** The fifth unique curve cannot be added; selected curves can always be removed. */
export function toggleCannulaSelection(ids: readonly string[], id: string, limit = 4): string[] {
  if (ids.includes(id)) return ids.filter((current) => current !== id)
  if (ids.length >= limit) return [...ids]
  return [...ids, id]
}
