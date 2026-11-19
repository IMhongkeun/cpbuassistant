import test from "node:test"
import assert from "node:assert/strict"
import { echoBsa, resolveEchoBsa, PETTERSEN_COEFF, PHN_COEFF, pettersenSize, pettersenZ, phnBand } from "../lib/echo-zscore.ts"

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)

test("BSA model-specific calculations: infant and toddler", () => {
  near(echoBsa(75,10,"mosteller"),0.45643546458763845)
  near(echoBsa(75,10,"dubois"),0.437306305656655)
  near(echoBsa(75,10,"haycock"),0.46350516762240934)
  near(echoBsa(50,3,"mosteller"),0.2041241452319315)
  near(echoBsa(50,3,"dubois"),0.19538720035350282)
  near(echoBsa(50,3,"haycock"),0.2065607568281943)
  for (const formula of ["mosteller","dubois","haycock"]) {
    assert.equal(echoBsa(0,3,formula),0)
    assert.equal(echoBsa(50,-1,formula),0)
    assert.equal(echoBsa(Infinity,3,formula),0)
    assert.equal(echoBsa(50,NaN,formula),0)
  }
})

test("automatic height/weight takes precedence; manual fallback only when both blank", () => {
  near(resolveEchoBsa(75,10,"1.2","dubois").bsa,0.437306305656655)
  near(resolveEchoBsa(75,10,"1.2","haycock").bsa,0.46350516762240934)
  assert.equal(resolveEchoBsa("75","","0.5","dubois").bsa,0)
  assert.equal(resolveEchoBsa("","10","0.5","haycock").bsa,0)
  assert.equal(resolveEchoBsa("","","0.5","haycock").bsa,.5)
  assert.equal(resolveEchoBsa("","","Infinity","haycock").bsa,0)
  assert.equal(resolveEchoBsa("","","-0.5","dubois").bsa,0)
  assert.equal(resolveEchoBsa("","","","dubois").bsa,0)
})

test("Pettersen 2008 Table 2: all 21 coefficients and published IVSd worked example", () => {
  const expected = {
    RVDd:[-.317,1.850,-1.274,.335,.058], IVSd:[-1.242,1.272,-.762,.208,.046],
    IVSs:[-1.048,1.751,-1.177,.318,.034], LVIDd:[.105,2.859,-2.119,.552,.010],
    LVIDs:[-.371,2.833,-2.081,.538,.016], LVPWd:[-1.586,1.849,-1.188,.313,.037],
    LVPWs:[-.947,1.907,-1.259,.330,.023], AoV:[-.874,2.708,-1.841,.452,.010],
    SOV:[-.500,2.537,-1.707,.420,.012], STJ:[-.759,2.643,-1.797,.442,.018],
    ARCH:[-.790,3.020,-2.484,.712,.023], ISTH:[-1.072,2.539,-1.627,.368,.027],
    ARCH_DIST:[-.976,2.469,-1.746,.445,.026], AOD:[-.922,2.100,-1.411,.371,.018],
    PV:[-.761,2.774,-1.808,.436,.023], MPA:[-.707,2.746,-1.807,.424,.024],
    RPA:[-1.360,3.394,-2.508,.660,.027], LPA:[-1.348,2.884,-1.954,.466,.028],
    MV:[-.271,2.446,-1.700,.425,.022], TV:[-.164,2.341,-1.596,.387,.036],
    LA:[-.208,2.164,-1.597,.429,.020],
  }
  assert.deepEqual(Object.keys(PETTERSEN_COEFF).sort(),Object.keys(expected).sort())
  for (const [key, row] of Object.entries(expected)) {
    const c=PETTERSEN_COEFF[key]
    assert.deepEqual([c.beta0,c.beta1,c.beta2,c.beta3,c.mse],row,key)
  }
  near(pettersenZ(1.4,4,PETTERSEN_COEFF.IVSd),-2.48,.005)
  for (const bsa of [.1,.2,.5,1,1.4,2]) for (const c of Object.values(PETTERSEN_COEFF)) {
    const sizes = [-3,-2,-1,0,1,2,3].map(z=>pettersenSize(bsa,z,c))
    assert.ok(sizes.every((x,i)=>Number.isFinite(x)&&x>0&&(i===0||x>sizes[i-1])))
    sizes.forEach((x,i)=>near(pettersenZ(bsa,x,c),i-3))
  }
})

test("PHN Table 2: 34 coefficients, correct source units, and published MV example", () => {
  const expected = {
    MV_AP:[2.31,.24,.50,"cm"], MV:[2.23,.22,.50,"cm"], MVA:[4.06,.68,1,"cm²"],
    TV_AP:[2.36,.28,.50,"cm"], TV:[2.36,.29,.50,"cm"], TVA:[4.39,.83,1,"cm²"],
    AoV:[1.48,.14,.50,"cm"], ROOT:[2.06,.18,.50,"cm"], STJ:[1.69,.16,.50,"cm"],
    AAO:[1.79,.18,.50,"cm"], ARCH_PROX:[1.53,.23,.50,"cm"], ARCH_DIST:[1.36,.19,.50,"cm"],
    ISTH:[1.25,.18,.50,"cm"], LMCA:[2.95,.57,.45,"mm"], LAD:[1.90,.34,.45,"mm"],
    RCA:[2.32,.55,.45,"mm"], PV:[1.91,.24,.50,"cm"], PV_LAX:[2.01,.28,.50,"cm"],
    MPA:[1.82,.24,.50,"cm"], RPA:[1.07,.18,.50,"cm"], LPA:[1.10,.18,.50,"cm"],
    LVEDD:[3.89,.33,.45,"cm"], LVPWT:[.57,.09,.40,"cm"], LVST:[.58,.09,.40,"cm"],
    LVEDL:[6.31,.46,.45,"cm"], LVEDL_EPI:[6.87,.45,.45,"cm"],
    LVEDA:[11.91,1.89,.90,"cm²"], LVEDA_EPI:[20,2.59,.90,"cm²"],
    LVEDV:[62.02,11.94,1.30,"mL"], LVEDV_EPI:[113.14,17.85,1.30,"mL"],
    LVM:[53.02,9.06,1.25,"g"], LVMTV:[.88,.16,0,"g/mL"], LVTTD:[.15,.03,0,"ratio"],
    LVSI:[1.63,.17,0,"ratio"],
  }
  assert.deepEqual(Object.keys(PHN_COEFF).sort(),Object.keys(expected).sort())
  for (const [key,row] of Object.entries(expected)) {
    const c=PHN_COEFF[key]
    assert.deepEqual([c.indexed_mean,c.sd,c.alpha,c.sourceUnit],row,key)
    assert.equal(c.scale,c.sourceUnit==="cm"?10:1,key)
  }
  const mv=phnBand(.3,PHN_COEFF.MV)
  near((11-mv.mean)/mv.sd,-1.0,.02)
  near(phnBand(1,PHN_COEFF.LMCA).mean,2.95)
  near(phnBand(1,PHN_COEFF.ROOT).mean,20.6)
  near(phnBand(1,PHN_COEFF.LVEDV).mean,62.02)
  near(phnBand(.2,PHN_COEFF.LVSI).mean,phnBand(2,PHN_COEFF.LVSI).mean)
  for (const bsa of [.1,.2,.5,1,2,2.3]) for (const c of Object.values(PHN_COEFF)) {
    const result=phnBand(bsa,c)
    assert.ok(result.range.every((x,i)=>Number.isFinite(x)&&x>0&&(i===0||x>result.range[i-1])))
    near(result.range[3],result.mean)
    result.range.forEach((x,i)=>near((x-result.mean)/result.sd,i-3))
  }
})
