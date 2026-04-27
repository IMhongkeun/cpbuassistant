"use client"
import { useMemo, useState, useRef } from "react"
import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Unlock, Copy, Check } from "lucide-react"
import { toast } from "sonner"

// --- Helper Functions ---

/**
 * 값을 안전하게 파싱하고, 유효하지 않으면 0을 반환합니다.
 */
const parseSafe = (value: string): number => {
  const parsed = Number.parseFloat(value)
  return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed
}

/**
 * 계산된 값을 ml/kg 형식(정수 반올림)으로 표시합니다.
 */
const formatMlKg = (value: number): string => {
  if (value <= 0 || !isFinite(value)) return "0"
  return Math.round(value).toString()
}

// --- Main Component ---

export default function ScmpFlowCalculator() {
  // --- State ---
  const [patientWeight, setPatientWeight] = useState<string>("")
  const [isWeightLocked, setIsWeightLocked] = useState<boolean>(false)
  const [mainFlow, setMainFlow] = useState<string>("")
  const [coronaryFlow, setCoronaryFlow] = useState<string>("")
  const [copiedCell, setCopiedCell] = useState<string | null>(null)

  // --- Refs ---
  const coronaryFlowInputRef = useRef<HTMLInputElement>(null)

  // --- Calculations ---
  const calculations = useMemo(() => {
    const W = parseSafe(patientWeight)
    const MF = parseSafe(mainFlow)
    const CF = parseSafe(coronaryFlow)

    if (W <= 0) {
      return {
        mainMlKg: "0",
        coronaryMlKg: "0",
      }
    }

    const mainMlKg = MF / W
    const coronaryMlKg = CF / W

    return {
      mainMlKg: formatMlKg(mainMlKg),
      coronaryMlKg: formatMlKg(coronaryMlKg),
    }
  }, [patientWeight, mainFlow, coronaryFlow, isWeightLocked])

  // --- Event Handlers ---
  const handleWeightLockToggle = () => {
    if (isWeightLocked) {
      setIsWeightLocked(false)
    } else if (parseSafe(patientWeight) > 0) {
      setIsWeightLocked(true)
    } else {
      alert("유효한 환자 체중을 입력하세요 (0kg 초과).")
    }
  }

  const handleCopy = async (text: string, cellId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCell(cellId)
      toast.success("클립보드에 복사되었습니다")
      setTimeout(() => setCopiedCell(null), 2000)
    } catch (err) {
      toast.error("복사에 실패했습니다")
    }
  }

  const handleMainFlowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setMainFlow(value)

    // If the value is 3 digits, automatically focus on coronary flow input
    if (value.length === 3 && coronaryFlowInputRef.current) {
      coronaryFlowInputRef.current.focus()
    }
  }

  // --- Render ---
  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <Card className="shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl">SCMP Flow Calculator</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            환자 체중(kg)을 기준으로 Cerebral 및 Coronary Flow의 ml/kg 값을 계산합니다.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* 1. Patient Weight Input */}
          <Card className="border-muted/60">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-2">
                  <Label htmlFor="weight" className="text-base font-semibold">
                    1. 환자 체중 (kg)
                  </Label>
                  <Input
                    id="weight"
                    type="number"
                    placeholder="예: 75.5"
                    value={patientWeight}
                    onChange={(e) => setPatientWeight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleWeightLockToggle()
                      }
                    }}
                    disabled={isWeightLocked}
                    className="mt-2 text-lg h-11"
                  />
                </div>
                <Button
                  onClick={handleWeightLockToggle}
                  variant={isWeightLocked ? "secondary" : "default"}
                  className="w-full text-base h-11"
                >
                  {isWeightLocked ? <Unlock className="mr-2 h-5 w-5" /> : <Lock className="mr-2 h-5 w-5" />}
                  {isWeightLocked ? "체중 수정" : "계산"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 2. Flow Inputs & Results (Only if weight is locked) */}
          {isWeightLocked ? (
            <>
              {/* Flow Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mainFlow" className="font-semibold">
                    2. Cerebral Flow (ml/min)
                  </Label>
                  <Input
                    id="mainFlow"
                    type="number"
                    placeholder="예: 350"
                    value={mainFlow}
                    onChange={handleMainFlowChange}
                    className="mt-1 text-lg h-11"
                  />
                </div>
                <div>
                  <Label htmlFor="coronaryFlow" className="font-semibold">
                    3. Coronary Flow (ml/min)
                  </Label>
                  <Input
                    id="coronaryFlow"
                    ref={coronaryFlowInputRef}
                    type="number"
                    placeholder="예: 100"
                    value={coronaryFlow}
                    onChange={(e) => setCoronaryFlow(e.target.value)}
                    className="mt-1 text-lg h-11"
                  />
                </div>
              </div>

              {/* Result Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-chart-1/30 bg-chart-1/5">
                  <CardContent className="p-4">
                    <div className="text-sm text-chart-1/70">Cerebral Flow (ml/kg)</div>
                    <div className="text-3xl font-bold text-chart-1 mt-1">
                      {calculations.mainMlKg}
                      <span className="text-xl font-normal ml-2">ml/kg</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-chart-2/30 bg-chart-2/5">
                  <CardContent className="p-4">
                    <div className="text-sm text-chart-2/70">Coronary Flow (ml/kg)</div>
                    <div className="text-3xl font-bold text-chart-2 mt-1">
                      {calculations.coronaryMlKg}
                      <span className="text-xl font-normal ml-2">ml/kg</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Chart Record Example */}
              <Card className="border-muted/60 bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">차트 기록용</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Input Values Cell */}
                    <Card className="border-border bg-background relative">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-xs text-muted-foreground">Flow rate (ml/min)</div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              const flowText = `${parseSafe(mainFlow) || "..."}/ C ${parseSafe(coronaryFlow) || "..."}`
                              handleCopy(flowText, "flow")
                            }}
                          >
                            {copiedCell === "flow" ? (
                              <Check className="h-4 w-4 text-chart-2" />
                            ) : (
                              <Copy className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <div className="font-mono text-2xl text-foreground text-center">
                          <span>{parseSafe(mainFlow) || "..."}</span>
                          <span className="text-muted-foreground">/ C </span>
                          <span>{parseSafe(coronaryFlow) || "..."}</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Calculated Values Cell */}
                    <Card className="border-destructive/30 bg-destructive/5 relative">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-xs text-destructive">Flow index (ml/kg)</div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              const indexText = `${calculations.mainMlKg}/ C ${calculations.coronaryMlKg}ml/kg`
                              handleCopy(indexText, "index")
                            }}
                          >
                            {copiedCell === "index" ? (
                              <Check className="h-4 w-4 text-chart-2" />
                            ) : (
                              <Copy className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        </div>
                        <div className="font-mono text-2xl font-bold text-destructive text-center">
                          <span>{calculations.mainMlKg}</span>
                          <span className="text-muted-foreground">/ C </span>
                          <span>{calculations.coronaryMlKg}</span>
                          <span className="text-base font-normal text-muted-foreground">ml/kg</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            // Placeholder when weight is not set
            <Card className="border-muted/60 border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground">
                <Lock className="h-10 w-10 mx-auto mb-4 opacity-50" />
                <div className="text-lg font-medium mb-2">환자 체중을 입력하고 &apos;계산&apos;을 누르세요.</div>
                
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
