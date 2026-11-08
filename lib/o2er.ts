// Oxygen extraction ratio (O2ER) during CPB.
// CaO2 = 1.34 × Hb × SaO2/100 + 0.003 × PaO2
// CvO2 = 1.34 × Hb × SvO2/100 + 0.003 × PvO2
// O2ER = (CaO2 − CvO2) / CaO2  (= VO2 / DO2; pump flow cancels out)
// DO2i = CI × CaO2 × 10, VO2i = CI × (CaO2 − CvO2) × 10 (only when flow and BSA are given)

export const HB_O2_CAPACITY = 1.34
export const O2_SOLUBILITY = 0.003

export type O2erInput = {
  hgb: number // g/dL
  sao2: number // %
  svo2: number // %
  pao2?: number | null // mmHg, optional
  pvo2?: number | null // mmHg, optional
  flow?: number | null // L/min, optional
  bsa?: number | null // m², optional
}

export type O2erResult =
  | { ok: false; errors: string[] }
  | {
      ok: true
      cao2: number
      cvo2: number
      avDiff: number
      o2er: number // %
      o2erSaturationOnly: number // % (simplified, dissolved O2 ignored)
      ci: number | null
      do2i: number | null
      vo2i: number | null
      dissolvedArterialIncluded: boolean
      dissolvedVenousIncluded: boolean
      warnings: string[]
    }

const isPos = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0

export function computeO2er(input: O2erInput): O2erResult {
  const errors: string[] = []
  const { hgb, sao2, svo2 } = input

  if (!isPos(hgb)) errors.push("Hemoglobin을 입력하세요")
  if (!Number.isFinite(sao2) || sao2 <= 0 || sao2 > 100) errors.push("SaO₂는 0 초과 100 이하로 입력하세요")
  if (!Number.isFinite(svo2) || svo2 < 0 || svo2 > 100) errors.push("SvO₂는 0–100 범위로 입력하세요")
  if (input.pao2 != null && (!Number.isFinite(input.pao2) || input.pao2 < 0)) errors.push("PaO₂는 0 이상이어야 합니다")
  if (input.pvo2 != null && (!Number.isFinite(input.pvo2) || input.pvo2 < 0)) errors.push("PvO₂는 0 이상이어야 합니다")
  if (errors.length) return { ok: false, errors }

  const dissolvedArterialIncluded = isPos(input.pao2)
  const dissolvedVenousIncluded = isPos(input.pvo2)
  const pao2 = dissolvedArterialIncluded ? (input.pao2 as number) : 0
  const pvo2 = dissolvedVenousIncluded ? (input.pvo2 as number) : 0

  const cao2 = HB_O2_CAPACITY * hgb * (sao2 / 100) + O2_SOLUBILITY * pao2
  const cvo2 = HB_O2_CAPACITY * hgb * (svo2 / 100) + O2_SOLUBILITY * pvo2
  const avDiff = cao2 - cvo2

  if (avDiff <= 0) {
    return { ok: false, errors: ["CvO₂가 CaO₂ 이상입니다 — SaO₂/SvO₂/PO₂ 입력값을 확인하세요"] }
  }

  const warnings: string[] = []
  if (!dissolvedArterialIncluded) warnings.push("PaO₂ 미입력: 동맥 용존산소 제외 (O₂ER 과소평가 가능)")
  if (dissolvedArterialIncluded && !dissolvedVenousIncluded)
    warnings.push("PvO₂ 미입력: 정맥 용존산소 제외 (O₂ER 소폭 과대평가 가능)")
  if (dissolvedVenousIncluded && !dissolvedArterialIncluded)
    warnings.push("PaO₂ 없이 PvO₂만 반영되어 결과가 왜곡될 수 있습니다")
  if (svo2 > sao2) warnings.push("SvO₂가 SaO₂보다 높습니다 — 센서/샘플 확인")

  const o2er = (avDiff / cao2) * 100
  const o2erSaturationOnly = ((sao2 - svo2) / sao2) * 100

  let ci: number | null = null
  let do2i: number | null = null
  let vo2i: number | null = null
  if (isPos(input.flow) && isPos(input.bsa)) {
    ci = input.flow / input.bsa
    do2i = ci * cao2 * 10
    vo2i = ci * avDiff * 10
  }

  return {
    ok: true,
    cao2,
    cvo2,
    avDiff,
    o2er,
    o2erSaturationOnly,
    ci,
    do2i,
    vo2i,
    dissolvedArterialIncluded,
    dissolvedVenousIncluded,
    warnings,
  }
}
