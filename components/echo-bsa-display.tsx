"use client"

import { Input } from "@/components/ui/input"
import { resolveEchoBsa, type EchoBsaFormula } from "@/lib/echo-zscore"

interface Props {
  formula: Exclude<EchoBsaFormula, "mosteller">
  id: string
  height: number | string
  weight: number | string
  manual: string
  onManualChange: (value: string) => void
}

export function EchoBsaDisplay({formula,id,height,weight,manual,onManualChange}: Props) {
  const {bsa,mosteller,auto,canUseManual,manualValid} = resolveEchoBsa(height,weight,manual,formula)
  const name = formula === "dubois" ? "Du Bois" : "Haycock"
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-muted p-3">
        <p className="text-xs text-muted-foreground">병원 기준 BSA · Mosteller (참고)</p>
        <p className="text-xl font-semibold tabular-nums">{mosteller > 0 ? mosteller.toFixed(4) : "—"} <span className="text-sm font-normal">m²</span></p>
      </div>
      <div className="rounded-lg border border-primary/30 p-3">
        <p className="text-xs font-semibold">Z-score 적용 BSA · {name}</p>
        <p className="text-xl font-semibold text-primary tabular-nums">{bsa > 0 ? bsa.toFixed(4) : "—"} <span className="text-sm font-normal">m²</span></p>
        <p className="text-xs text-muted-foreground">{manualValid ? "직접 입력값 적용" : auto > 0 ? "키·체중으로 자동 계산 (반올림 전 값 적용)" : "키·체중을 모두 입력하면 자동 계산됩니다."}</p>
        {formula === "dubois" && <p className="mt-1 text-xs text-muted-foreground">원문 미명시 · 2014년 저자 확인 보고 기준</p>}
      </div>
      {canUseManual && (
        <details className="rounded border p-2">
          <summary className="cursor-pointer text-xs font-medium">BSA 직접 입력 ({name} 값만)</summary>
          <p className="my-2 text-xs text-muted-foreground">키·체중이 없을 때만 사용합니다. Mosteller 값은 입력하지 마세요. {name} 공식으로 계산된 값인지 확인하세요.</p>
          <label htmlFor={id} className="text-xs">{name} BSA (m²)</label>
          <Input id={id} type="number" min="0.1" step="any" value={manual} onChange={e=>onManualChange(e.target.value)} />
        </details>
      )}
    </div>
  )
}
