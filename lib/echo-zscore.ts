// BSA in m²; height in cm and weight in kg. Never round before calculating nomogram values.
export type EchoBsaFormula = "mosteller" | "dubois" | "haycock"
export const ECHO_Z_LEVELS = [-3, -2, -1, 0, 1, 2, 3] as const

export function echoBsa(h: number, w: number, formula: EchoBsaFormula): number {
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return 0
  const value = formula === "mosteller" ? Math.sqrt(h * w / 3600)
    : formula === "dubois" ? 0.007184 * h ** 0.725 * w ** 0.425
    : 0.024265 * h ** 0.3964 * w ** 0.5378
  return Number.isFinite(value) ? value : 0
}

// Manual BSA is a fallback only when BOTH anthropometric fields are empty.
// The caller must explicitly identify the manual value with the model's BSA formula.
export function resolveEchoBsa(height: number | string, weight: number | string, manual: string, formula: EchoBsaFormula) {
  const h = Number(height), w = Number(weight)
  const auto = echoBsa(h, w, formula)
  const canUseManual = String(height).trim() === "" && String(weight).trim() === ""
  const entered = Number(manual)
  const manualValid = canUseManual && Number.isFinite(entered) && entered > 0
  return { bsa: auto || (manualValid ? entered : 0), mosteller: echoBsa(h,w,"mosteller"), auto, canUseManual, manualValid }
}

export interface PettersenCoeff {
  name: string
  beta0: number
  beta1: number
  beta2: number
  beta3: number
  mse: number
  description: string
}
const detroit = (name: string, beta0: number, beta1: number, beta2: number, beta3: number, mse: number, description: string): PettersenCoeff =>
  ({name,beta0,beta1,beta2,beta3,mse,description})

// Pettersen et al., JASE 2008;21:922–934, Table 2 (p.934), DOI 10.1016/j.echo.2008.02.006.
// Measurement conventions: Table 1 (p.923) and Methods. BSA formula not stated in original;
// Du Bois was confirmed by authors via personal communication, reported in Authors' Reply (2014).
// https://thoracickey.com/authors-reply-37/
const mmode = "2D-guided M-mode, PSAX 유두근 끝 수준, leading edge–leading edge"
export const PETTERSEN_COEFF: Record<string, PettersenCoeff> = {
  MPA: detroit("MPA",-.707,2.746,-1.807,.424,.024,"주폐동맥 · PSAX, 최대 수축기 직경"),
  RPA: detroit("RPA",-1.360,3.394,-2.508,.660,.027,"우폐동맥 · SSAX, 분기 직후 최대 수축기 직경"),
  LPA: detroit("LPA",-1.348,2.884,-1.954,.466,.028,"좌폐동맥 · PSAX, 분기 직후 최대 수축기 직경"),
  PV: detroit("PV",-.761,2.774,-1.808,.436,.023,"폐동맥판륜 · PLAX, 수축기 hinge-to-hinge"),
  AoV: detroit("AoV",-.874,2.708,-1.841,.452,.010,"대동맥판륜 · PLAX, 수축기 hinge-to-hinge"),
  MV: detroit("MV",-.271,2.446,-1.700,.425,.022,"승모판륜 · A4C, 이완기 hinge-to-hinge"),
  TV: detroit("TV",-.164,2.341,-1.596,.387,.036,"삼첨판륜 · A4C, 이완기 hinge-to-hinge"),
  SOV: detroit("Sinuses of Valsalva",-.500,2.537,-1.707,.420,.012,"대동맥동 · PLAX, 최대 수축기 직경"),
  STJ: detroit("Sinotubular junction",-.759,2.643,-1.797,.442,.018,"동관접합부 · PLAX, 최대 수축기 직경"),
  ARCH: detroit("Transverse aortic arch",-.790,3.020,-2.484,.712,.023,"횡대동맥궁 · SSLAX, 무명동맥–좌총경동맥 사이, 최대 수축기 직경"),
  ISTH: detroit("Aortic isthmus",-1.072,2.539,-1.627,.368,.027,"대동맥 협부 · SSLAX, 좌쇄골하동맥 직후, 최대 수축기 직경"),
  ARCH_DIST: detroit("Distal aortic arch",-.976,2.469,-1.746,.445,.026,"원위 대동맥궁 · SSLAX, 협부 직후, 최대 수축기 직경 (Pettersen 정의)"),
  AOD: detroit("Aorta at diaphragm",-.922,2.100,-1.411,.371,.018,"횡격막 수준 대동맥 · Subcostal LAX, 최대 수축기 직경"),
  RVDd: detroit("RVDd",-.317,1.850,-1.274,.335,.058,"우심실 이완기말 직경 · "+mmode),
  IVSd: detroit("IVSd",-1.242,1.272,-.762,.208,.046,"심실중격 이완기말 두께 · "+mmode),
  IVSs: detroit("IVSs",-1.048,1.751,-1.177,.318,.034,"심실중격 수축기말 두께 · "+mmode),
  LVIDd: detroit("LVIDd",.105,2.859,-2.119,.552,.010,"좌심실 이완기말 내경 · "+mmode),
  LVIDs: detroit("LVIDs",-.371,2.833,-2.081,.538,.016,"좌심실 수축기말 내경 · "+mmode),
  LVPWd: detroit("LVPWd",-1.586,1.849,-1.188,.313,.037,"좌심실 후벽 이완기말 두께 · "+mmode),
  LVPWs: detroit("LVPWs",-.947,1.907,-1.259,.330,.023,"좌심실 후벽 수축기말 두께 · "+mmode),
  LA: detroit("Left atrium",-.208,2.164,-1.597,.429,.020,"좌심방 · PLAX, 수축기 최대 전후 직경"),
}
export function pettersenLnMean(bsa: number, c: PettersenCoeff) {
  return c.beta0 + c.beta1*bsa + c.beta2*bsa**2 + c.beta3*bsa**3
}
export function pettersenSize(bsa: number, z: number, c: PettersenCoeff) {
  return Math.exp(pettersenLnMean(bsa,c) + z*Math.sqrt(c.mse))*10
}
export function pettersenZ(bsa: number, sizeMm: number, c: PettersenCoeff) {
  return (Math.log(sizeMm/10)-pettersenLnMean(bsa,c))/Math.sqrt(c.mse)
}

export interface PhnCoeff {
  indexed_mean: number
  alpha: number
  sd: number
  unit: string
  scale: number
  description: string
  ref: string
  sourceUnit: string
}
const phn = (indexed_mean: number, sd: number, alpha: number, description: string, sourceUnit = "cm"): PhnCoeff => ({
  indexed_mean, sd, alpha, description, sourceUnit, unit: sourceUnit === "cm" ? "mm" : sourceUnit,
  scale: sourceUnit === "cm" ? 10 : 1, ref: "Lopez 2017 PHN (Table 2)"
})
// Lopez et al., Circ Cardiovasc Imaging 2017;10:e006979, Table 2.
// Coronary coefficients already use mm; areas cm²; volumes mL; mass g; ratios as published.
export const PHN_COEFF: Record<string, PhnCoeff> = {
  MPA: phn(1.82,.24,.5,"주폐동맥 · PSAX"),
  RPA: phn(1.07,.18,.5,"우폐동맥 · PSAX"),
  LPA: phn(1.10,.18,.5,"좌폐동맥 · PSAX"),
  PV: phn(1.91,.24,.5,"폐동맥판륜 · PSAX (PV SAX)"),
  AoV: phn(1.48,.14,.5,"대동맥판륜 · PLAX (ANN)"),
  MV: phn(2.23,.22,.5,"승모판륜 · A4C (MV LAT)"),
  TV: phn(2.36,.29,.5,"삼첨판륜 · A4C (TV LAT)"),
  ROOT: phn(2.06,.18,.5,"대동맥근 · PLAX"),
  STJ: phn(1.69,.16,.5,"동관접합부 · PLAX"),
  AAO: phn(1.79,.18,.5,"상행대동맥 · PLAX"),
  ARCH_PROX: phn(1.53,.23,.5,"근위 횡대동맥궁 · SSLAX"),
  ARCH_DIST: phn(1.36,.19,.5,"원위 횡대동맥궁 · SSLAX (PHN 정의)"),
  ISTH: phn(1.25,.18,.5,"대동맥 협부 · SSLAX"),
  LMCA: phn(2.95,.57,.45,"좌주관상동맥 · PSAX","mm"),
  LAD: phn(1.90,.34,.45,"근위 좌전하행동맥 · PSAX","mm"),
  RCA: phn(2.32,.55,.45,"근위 우관상동맥 · PSAX","mm"),
  MV_AP: phn(2.31,.24,.5,"승모판 전후 직경 · PLAX"),
  TV_AP: phn(2.36,.28,.5,"삼첨판 전후 직경 · PLAX"),
  PV_LAX: phn(2.01,.28,.5,"폐동맥판륜 · PLAX"),
  LVEDD: phn(3.89,.33,.45,"좌심실 이완기말 내경 · PSAX"),
  LVPWT: phn(.57,.09,.40,"좌심실 이완기말 후벽 두께 · PSAX"),
  LVST: phn(.58,.09,.40,"좌심실 이완기말 중격 두께 · PSAX"),
  LVEDL: phn(6.31,.46,.45,"좌심실 이완기말 심내막 길이 · A4C"),
  LVEDL_EPI: phn(6.87,.45,.45,"좌심실 이완기말 심외막 길이 · A4C"),
  MVA: phn(4.06,.68,1,"승모판 면적 · π/4 × MV AP × MV LAT","cm²"),
  TVA: phn(4.39,.83,1,"삼첨판 면적 · π/4 × TV AP × TV LAT","cm²"),
  LVEDA: phn(11.91,1.89,.90,"좌심실 이완기말 심내막 면적 · PSAX","cm²"),
  LVEDA_EPI: phn(20,2.59,.90,"좌심실 이완기말 심외막 면적 · PSAX","cm²"),
  LVEDV: phn(62.02,11.94,1.30,"좌심실 이완기말 용적 · 5/6 × LVEDA × LVEDL","mL"),
  LVEDV_EPI: phn(113.14,17.85,1.30,"좌심실 심외막 용적 · 5/6 × LVEDA EPI × LVEDL EPI","mL"),
  LVM: phn(53.02,9.06,1.25,"좌심실 질량 · 1.05 × (LVEDV EPI − LVEDV)","g"),
  LVMTV: phn(.88,.16,0,"좌심실 질량/용적 · LVM / LVEDV","g/mL"),
  LVTTD: phn(.15,.03,0,"후벽 두께/내경 · LVPWT / LVEDD","ratio"),
  LVSI: phn(1.63,.17,0,"좌심실 구형도 · LVEDL / LVEDD","ratio"),
}
export function phnBand(bsa: number, c: PhnCoeff) {
  const scale = bsa**c.alpha * c.scale
  const mean = c.indexed_mean * scale, sd = c.sd * scale
  return {mean, sd, range:ECHO_Z_LEVELS.map(z=>mean+z*sd)}
}
