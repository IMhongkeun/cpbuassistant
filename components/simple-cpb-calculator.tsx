"use client"

import type React from "react"
import { useMemo, useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, Heart, Info } from "lucide-react"

/**
 * 간단 CPB 유량 계산기 (Boer LBM)
 * - Boer 공식으로 LBM 계산
 * - Mosteller BSA 공식 사용
 * - BSA vs BSA_lean 비교
 * - CI 1.0-3.0 유량표 (0.2 단위)
 */

// 계산 함수들
const round = (x: number, d = 2) => {
  if (isNaN(x) || !isFinite(x)) return 0
  return Math.round(x * Math.pow(10, d)) / Math.pow(10, d)
}

const bmi = (heightCm: number, weightKg: number) => {
  if (heightCm <= 0 || weightKg <= 0) return 0
  const h = heightCm / 100
  const result = weightKg / (h * h)
  return isNaN(result) || !isFinite(result) ? 0 : result
}

const bsaMosteller = (heightCm: number, weightKg: number) => {
  if (heightCm <= 0 || weightKg <= 0) return 0
  const result = Math.sqrt((heightCm * weightKg) / 3600)
  return isNaN(result) || !isFinite(result) ? 0 : result
}

const lbmBoer = (heightCm: number, weightKg: number, sex: "M" | "F") => {
  if (heightCm <= 0 || weightKg <= 0) return 0

  let result: number
  if (sex === "M") {
    // 남성: 0.407 × 체중(kg) + 0.267 × 신장(cm) - 19.2
    result = 0.407 * weightKg + 0.267 * heightCm - 19.2
  } else {
    // 여성: 0.252 × 체중(kg) + 0.473 × 신장(cm) - 48.3
    result = 0.252 * weightKg + 0.473 * heightCm - 48.3
  }

  return isNaN(result) || !isFinite(result) ? 0 : result
}

// 안전한 숫자 표시 함수
const safeDisplay = (value: number, decimals = 1) => {
  if (isNaN(value) || !isFinite(value)) return "0"
  return value.toFixed(decimals)
}

// 간단한 테이블 컴포넌트
const SimpleTable = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full max-w-md mx-auto border rounded-lg overflow-hidden">
    <table className="w-full text-sm">{children}</table>
  </div>
)

const TableHeader = ({ children }: { children: React.ReactNode }) => <thead className="bg-muted/50">{children}</thead>

const TableBody = ({ children }: { children: React.ReactNode }) => <tbody>{children}</tbody>

const TableRow = ({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) => (
  <tr className={`border-b ${highlight ? "bg-chart-1/10" : "hover:bg-muted/30"}`}>{children}</tr>
)

const TableCell = ({
  children,
  isHeader = false,
  className = "",
}: {
  children: React.ReactNode
  isHeader?: boolean
  className?: string
}) => {
  const Tag = isHeader ? "th" : "td"
  return <Tag className={`px-3 py-2 text-center ${isHeader ? "font-semibold" : ""} ${className}`}>{children}</Tag>
}

export default function SimpleCPBCalculator() {
  // 입력값들
  const [heightCm, setHeightCm] = useState<string>("")
  const [weightKg, setWeightKg] = useState<string>("")
  const [sex, setSex] = useState<"M" | "F">("M")
  const [showTable, setShowTable] = useState<boolean>(false)
  const [showFormula, setShowFormula] = useState<boolean>(false)

  // 계산된 값들
  const metrics = useMemo(() => {
    console.log("계산 시작:", { heightCm, weightKg, sex })

    const H = Number.parseFloat(heightCm)
    const W = Number.parseFloat(weightKg)

    console.log("파싱된 값:", { H, W })

    if (isNaN(H) || isNaN(W) || H <= 0 || W <= 0) {
      console.log("유효하지 않은 입력값")
      return null
    }

    const actualBMI = bmi(H, W)
    const bsaActual = bsaMosteller(H, W)
    const lbm = lbmBoer(H, W, sex)
    const bsaLean = bsaMosteller(H, lbm)

    const delta = bsaLean - bsaActual
    const pct = bsaActual > 0 ? (delta / bsaActual) * 100 : 0

    const result = {
      height: H,
      weight: W,
      actualBMI: round(actualBMI, 1),
      bsaActual: round(bsaActual, 2), // Changed from 3 to 2
      lbm: round(lbm, 1),
      bsaLean: round(bsaLean, 2), // Changed from 3 to 2
      delta: round(delta, 3),
      pct: round(pct, 1),
    }

    console.log("계산 결과:", result)
    return result
  }, [heightCm, weightKg, sex])

  // 유량표 데이터
  const flowTable = useMemo(() => {
    if (!metrics) return []

    const flows = []
    for (let ci = 1.0; ci <= 3.01; ci += 0.2) {
      // Updated loop condition
      const ciRounded = round(ci, 1)
      const flowActual = round(ciRounded * metrics.bsaActual, 2)
      const flowLean = round(ciRounded * metrics.bsaLean, 2)

      flows.push({
        ci: ciRounded,
        flowActual,
        flowLean,
      })
    }
    return flows
  }, [metrics])

  const getBMIBadge = () => {
    if (!metrics || isNaN(metrics.actualBMI)) return null

    if (metrics.actualBMI >= 40) {
      return <Badge variant="destructive">심한 비만 (BMI ≥40)</Badge>
    } else if (metrics.actualBMI >= 30) {
      return <Badge variant="destructive">비만 (BMI ≥30)</Badge>
    } else if (metrics.actualBMI >= 25) {
      return <Badge variant="secondary">과체중 (BMI 25-30)</Badge>
    }
    return <Badge variant="default">정상 체중</Badge>
  }

  useEffect(() => {
    if (metrics) {
      setShowTable(true)
    }
  }, [metrics])

  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Card className="shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <CardTitle className="text-2xl">Lean body mass calculator </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowFormula(!showFormula)}
              title="계산식 보기"
            >
              <Info className="h-5 w-5" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Boer 공식으로 계산한 제지방량(LBM) 기반 BSA와 실제 BSA 비교
          </p>

          {showFormula && (
            <Card className="mt-4 bg-muted/30 border-chart-1/20">
              <CardContent className="p-4 space-y-3">
                <div className="font-semibold text-sm">Boer Formula (LBM 계산식)</div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium text-chart-1">남성:</span> 0.407 × 체중(kg) + 0.267 × 신장(cm) - 19.2
                  </div>
                  <div>
                    <span className="font-medium text-chart-2">여성:</span> 0.252 × 체중(kg) + 0.473 × 신장(cm) - 48.3
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardHeader>

        <CardContent className="space-y-6">
          {/* 입력 섹션 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="height">키 (cm)</Label>
              <Input
                id="height"
                type="number"
                placeholder=""
                value={heightCm}
                onChange={(e) => {
                  console.log("키 입력:", e.target.value)
                  setHeightCm(e.target.value)
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="weight">체중 (kg)</Label>
              <Input
                id="weight"
                type="number"
                placeholder=""
                value={weightKg}
                onChange={(e) => {
                  console.log("체중 입력:", e.target.value)
                  setWeightKg(e.target.value)
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label>성별</Label>
              <Select
                value={sex}
                onValueChange={(v) => {
                  console.log("성별 선택:", v)
                  setSex(v as "M" | "F")
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">남성</SelectItem>
                  <SelectItem value="F">여성</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 결과 섹션 */}
          {metrics && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-muted/60 text-center">
                  <CardContent className="p-3">
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">BMI</div>
                      <div className="text-lg font-bold text-foreground">{safeDisplay(metrics.actualBMI, 1)}</div>
                      <div className="text-xs">{getBMIBadge()}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-muted/60 text-center">
                  <CardContent className="p-3">
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">Lean Body Mass</div>
                      <div className="text-lg font-bold text-chart-3">{safeDisplay(metrics.lbm, 1)} kg</div>
                      <div className="text-xs text-muted-foreground">Boer Formula</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-muted/60 text-center">
                  <CardContent className="p-3">
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">BSA (실제)</div>
                      <div className="text-lg font-bold text-chart-1">{safeDisplay(metrics.bsaActual, 2)} m²</div>
                      <div className="text-xs text-muted-foreground">Mosteller</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-muted/60 text-center">
                  <CardContent className="p-3">
                    <div className="space-y-1.5">
                      <div className="text-xs text-muted-foreground">BSA (Lean)</div>
                      <div className="text-lg font-bold text-chart-2">{safeDisplay(metrics.bsaLean, 2)} m²</div>
                      <div className="text-xs text-muted-foreground">LBM 기반</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 유량표 드롭다운 */}
              <Card className="border-muted/60">
                <CardHeader className="pb-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-0 h-auto"
                    onClick={() => setShowTable(!showTable)}
                  >
                    <div className="text-left">
                      <div className="font-semibold">유량 비교표 (CI 1.0 - 3.0)</div>
                      <div className="text-sm text-muted-foreground">BSA 실제 vs BSA Lean 유량 비교</div>
                    </div>
                    <ChevronDown className={`h-5 w-5 transition-transform ${showTable ? "rotate-180" : ""}`} />
                  </Button>
                </CardHeader>

                {showTable && (
                  <CardContent className="pt-0">
                    <div className="max-h-96 overflow-auto">
                      <SimpleTable>
                        <TableHeader>
                          <TableRow>
                            <TableCell isHeader>CI</TableCell>
                            <TableCell isHeader>
                              실제 BSA
                              <br />
                              유량 (L/min)
                            </TableCell>
                            <TableCell isHeader>
                              Lean BSA
                              <br />
                              유량 (L/min)
                            </TableCell>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {flowTable.map((row) => (
                            <TableRow key={row.ci} highlight={row.ci >= 2.2 && row.ci <= 2.4}>
                              <TableCell className="font-medium">{safeDisplay(row.ci, 1)}</TableCell>
                              <TableCell className="font-medium text-chart-1">
                                {safeDisplay(row.flowActual, 2)}
                              </TableCell>
                              <TableCell className="font-medium text-chart-2">{safeDisplay(row.flowLean, 2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </SimpleTable>
                    </div>
                  </CardContent>
                )}
              </Card>
            </>
          )}

          {!metrics && (
            <Card className="border-muted/60">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <div className="text-lg font-medium mb-2">환자 정보를 입력하세요</div>
                <div className="text-sm">키, 체중, 성별을 입력하면 BSA와 LBM 기반 유량을 비교할 수 있습니다</div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
