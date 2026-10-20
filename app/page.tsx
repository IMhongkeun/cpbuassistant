"use client" // Add this directive at the top to mark this as a client component

import { useState, useEffect } from "react"
import { Clock } from "lucide-react"
import EchoZScoreTool from "../components/echo-zscore-tool"
import SimpleCPBCalculator from "../components/simple-cpb-calculator"
import ScmpFlowCalculator from "../components/scmp-flow-calculator"
import BloodHemodilutionCalculator from "../components/blood-hemodilution-calculator"
import AdultHctPredictCalculator from "../components/adult-hct-predict-calculator"
import QpQsCalculator from "../components/qp-qs-calculator"
import GDPCalculator from "../components/gdp-calculator" // Import the GDPCalculator component
import MicsDrainageCalculator from "../components/mics-drainage-calculator"

// Helper function to convert HH:MM string (allowing HH > 23) to total minutes from midnight
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0
  const parts = timeStr.split(":")
  if (parts.length !== 2) return 0 // Invalid format
  const hours = Number.parseInt(parts[0], 10)
  const minutes = Number.parseInt(parts[1], 10)
  if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) return 0 // Invalid numbers
  return hours * 60 + minutes
}

// Stable module-scoped time inputs preserve focus as transplant data updates.
  // Function to get current time in HH:MM format
  const getCurrentTime = () => {
    const now = new Date() // Get current Date object
    const hours = now.getHours().toString().padStart(2, "0") // Get hours and pad with leading zero if needed
    const minutes = now.getMinutes().toString().padStart(2, "0") // Get minutes and pad with leading zero if needed
    return `${hours}:${minutes}` // Return formatted time string
  }


  // Reusable TimeInput component for time selection
  const TimeInput = ({ label, value, onChange, readOnly = false, skipTab = false }) => {
    // Internal state for the raw input string, allowing user to type freely
    const [inputValue, setInputValue] = useState(value)

    // Sync internal state with external value prop
    // Only update inputValue if the external value changes AND it's different from current inputValue
    // This prevents resetting the input while the user is actively typing
    useEffect(() => {
      if (value !== inputValue) {
        setInputValue(value)
      }
    }, [value])

    // Handler for direct input changes and formatting
    const handleInputChange = (e) => {
      if (readOnly) return
      let rawValue = e.target.value.replace(/[^0-9]/g, "") // Keep only numbers
      let tempFormattedValue = ""

      // Allow up to 5 characters for HH:MM (e.g., "25:00")
      if (rawValue.length > 4) {
        // Still limit to 4 digits for raw input to form HHMM
        rawValue = rawValue.substring(0, 4)
      }

      if (rawValue.length >= 3) {
        // Automatically add colon after 2 digits
        tempFormattedValue = `${rawValue.substring(0, 2)}:${rawValue.substring(2)}`
      } else {
        tempFormattedValue = rawValue
      }

      setInputValue(tempFormattedValue) // Update internal state for display

      // Update parent state immediately if it looks like a complete time or is empty
      if (tempFormattedValue.length === 5 || tempFormattedValue.length === 0) {
        onChange({ target: { value: tempFormattedValue } })
      }
    }

    // Handler for when the input loses focus (blur)
    const handleBlur = () => {
      if (readOnly) return
      let finalValueToParent = ""
      const rawDigits = inputValue.replace(/[^0-9]/g, "")

      if (rawDigits.length === 4) {
        const hours = Number.parseInt(rawDigits.substring(0, 2), 10)
        const minutes = Number.parseInt(rawDigits.substring(2, 4), 10)
        // Allow hours > 23, but minutes must be 0-59
        if (minutes >= 0 && minutes <= 59) {
          finalValueToParent = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
        }
      } else if (rawDigits.length === 3) {
        // Handle "123" -> "12:30"
        const hours = Number.parseInt(rawDigits.substring(0, 2), 10)
        const minutes = Number.parseInt(rawDigits.substring(2, 3) + "0", 10)
        if (minutes >= 0 && minutes <= 59) {
          finalValueToParent = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
        }
      } else if (rawDigits.length === 2) {
        // Handle "12" -> "12:00"
        const hours = Number.parseInt(rawDigits.substring(0, 2), 10)
        // No specific hour validation here, just format
        finalValueToParent = `${hours.toString().padStart(2, "0")}:00`
      } else if (rawDigits.length === 1) {
        // Handle "1" -> "01:00"
        const hours = Number.parseInt(rawDigits.substring(0, 1), 10)
        finalValueToParent = `0${hours.toString().padStart(1, "0")}:00`
      }

      setInputValue(finalValueToParent)
      onChange({ target: { value: finalValueToParent } })
    }

    // Handler for setting current time
    const handleCurrentTime = () => {
      if (readOnly) return
      const currentTime = getCurrentTime()
      setInputValue(currentTime) // Update internal state
      onChange({ target: { value: currentTime } }) // Notify parent
    }

    return (
      <div className="flex min-w-0 flex-col gap-2">
        <label className="whitespace-nowrap text-sm font-medium leading-5 text-[#536a70]">{label}</label>
        <div className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              // Add onKeyDown handler for Enter key
              if (e.key === "Enter") {
                e.target.blur() // Remove focus when Enter is pressed
              }
            }}
            readOnly={readOnly}
            tabIndex={readOnly || skipTab ? -1 : 0}
            placeholder="시간:분" // Modified placeholder text
            maxLength={5}
            className="cpbu-time-input"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={handleCurrentTime}
              tabIndex={-1}
              className="cpbu-clock-button"
              title="현재 시간 입력"
              aria-label={`${label}에 현재 시간 입력`}
            >
              <Clock className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // Special TimeInput component for Donor ACC Time with inline help text
  const DonorAccTimeInput = ({ label, value, onChange }) => {
    // Internal state for the raw input string, allowing user to type freely
    const [inputValue, setInputValue] = useState(value)

    // Sync internal state with external value prop
    useEffect(() => {
      if (value !== inputValue) {
        setInputValue(value)
      }
    }, [value])

    // Handler for direct input changes and formatting
    const handleInputChange = (e) => {
      let rawValue = e.target.value.replace(/[^0-9]/g, "") // Keep only numbers
      let tempFormattedValue = ""

      if (rawValue.length > 4) {
        rawValue = rawValue.substring(0, 4)
      }

      if (rawValue.length >= 3) {
        tempFormattedValue = `${rawValue.substring(0, 2)}:${rawValue.substring(2)}`
      } else {
        tempFormattedValue = rawValue
      }

      setInputValue(tempFormattedValue)

      if (tempFormattedValue.length === 5 || tempFormattedValue.length === 0) {
        onChange({ target: { value: tempFormattedValue } })
      }
    }

    // Handler for when the input loses focus (blur)
    const handleBlur = () => {
      let finalValueToParent = ""
      const rawDigits = inputValue.replace(/[^0-9]/g, "")

      if (rawDigits.length === 4) {
        const hours = Number.parseInt(rawDigits.substring(0, 2), 10)
        const minutes = Number.parseInt(rawDigits.substring(2, 4), 10)
        if (minutes >= 0 && minutes <= 59) {
          finalValueToParent = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
        }
      } else if (rawDigits.length === 3) {
        const hours = Number.parseInt(rawDigits.substring(0, 2), 10)
        const minutes = Number.parseInt(rawDigits.substring(2, 3) + "0", 10)
        if (minutes >= 0 && minutes <= 59) {
          finalValueToParent = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
        }
      } else if (rawDigits.length === 2) {
        const hours = Number.parseInt(rawDigits.substring(0, 2), 10)
        finalValueToParent = `${hours.toString().padStart(2, "0")}:00`
      } else if (rawDigits.length === 1) {
        const hours = Number.parseInt(rawDigits.substring(0, 1), 10)
        finalValueToParent = `0${hours.toString().padStart(1, "0")}:00`
      }

      setInputValue(finalValueToParent)
      onChange({ target: { value: finalValueToParent } })
    }

    // Handler for setting current time
    const handleCurrentTime = () => {
      const currentTime = getCurrentTime()
      setInputValue(currentTime)
      onChange({ target: { value: currentTime } })
    }

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-[#DFE9E7] bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-[#18323B]">{label}</label>
          <div className="text-xs leading-5 text-[#657a7e] sm:text-sm">
            <Clock className="inline-block w-4 h-4 mr-1 align-middle" />
            시계 아이콘을 누르면 현재 시간이 입력됩니다.
          </div>
        </div>
        <div className="relative w-full sm:max-w-[310px]">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.target.blur()
              }
            }}
            placeholder="시간:분"
            maxLength={5}
            className="cpbu-time-input"
          />
          <button
            type="button"
            onClick={handleCurrentTime}
            tabIndex={-1}
            className="cpbu-clock-button"
            title="현재 시간 입력"
            aria-label="Donor ACC Time에 현재 시간 입력"
          >
            <Clock className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // Reusable TimeSection component for displaying time intervals
  const TimeSection = ({
    title,
    description,
    startTime,
    endTime,
    onStartChange,
    onEndChange,
    duration,
    side = "",
    readOnlyStart = false,
    skipStartTab = false,
    skipEndTab = false,
  }) => (
    <div className="cpbu-time-section">
      <h4 className="mb-3 flex flex-col items-start font-semibold text-gray-800">
        {" "}
        {/* Changed to flex-col for description below title */}
        <div className="flex items-start min-[360px]:items-center min-[360px]:whitespace-nowrap">
          <span>{title} {side && `(${side})`}</span>
        </div>
        {description && <p className="mt-1 text-xs font-normal text-[#657a7e]">{description}</p>}
      </h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <TimeInput
          label="시작 시간"
          value={startTime}
          onChange={onStartChange}
          readOnly={readOnlyStart} // Use readOnlyStart prop
          skipTab={skipStartTab}
        />
        <TimeInput label="종료 시간" value={endTime} onChange={onEndChange} skipTab={skipEndTab} />
        <div className="flex min-w-0 flex-col gap-2">
          <label className="whitespace-nowrap text-sm font-medium leading-5 text-[#536a70]">소요 시간</label>
          <div className="cpbu-duration">
            {duration || "-"} {/* Display duration or '-' if not available */}
          </div>
        </div>
      </div>
    </div>
  )


// Main CPBU Assistant component
const CPBUassistant = () => {
  // State to manage the active tab (lung, heart, pediatric, cpb, or gdp)
  const [activeTab, setActiveTab] = useState("transplant")
  const [transplantSubTab, setTransplantSubTab] = useState("lung")
  // Pediatric surgery utilities; the existing Hct calculator is now under Hct > PCS.
  const [pcsSubTab, setPcsSubTab] = useState("echo")
  const [hctSubTab, setHctSubTab] = useState("ahd")

  // State for Lung Transplant data
  const [lungData, setLungData] = useState({
    donorAccTime: "", // Donor ACC Time
    coldIschemicTime: {
      // Cold Ischemic Time for Left and Right Lungs
      lt: { start: "", end: "" },
      rt: { start: "", end: "" },
    },
    warmIschemicTime: {
      // Warm Ischemic Time for Left and Right Lungs
      lt: { start: "", end: "" },
      rt: { start: "", end: "" },
    },
    anastomosisTime: {
      // Anastomosis Time for Left and Right Lungs
      lt: { start: "", end: "" },
      rt: { start: "", end: "" },
    },
    // New state for Pump Time
    pumpTime: { start: "", end: "" },
  })

  // State for Heart Transplant data
  const [heartData, setHeartData] = useState({
    donorAccTime: "", // Donor ACC Time
    coldIschemicTime: { start: "", end: "" }, // Cold Ischemic Time
    warmIschemicTime: { start: "", end: "" }, // Warm Ischemic Time
    anastomosisTime: { start: "", end: "" }, // Anastomosis Time
  })

  // State for Pediatric Cardiac Surgery data
  const [pediatricData, setPediatricData] = useState({
    // Placeholder for pediatric-specific data
  })

  // Function to calculate duration between two time strings (HH:MM) in minutes
  const calculateDuration = (start, end) => {
    if (!start || !end) return "" // Return empty if start or end time is missing
    const startMinutes = timeToMinutes(start)
    const endMinutes = timeToMinutes(end)

    const diffMinutes = endMinutes - startMinutes
    return diffMinutes >= 0 ? `${diffMinutes}분` : "" // Return duration in minutes or empty string, handle negative for invalid input
  }

  // Effect hook to automatically set Cold Ischemic Time start when Donor ACC Time changes for Lung Transplant
  useEffect(() => {
    if ((activeTab === "transplant" && transplantSubTab === "lung") && lungData.donorAccTime) {
      setLungData((prev) => ({
        ...prev,
        coldIschemicTime: {
          ...prev.coldIschemicTime,
          lt: { ...prev.coldIschemicTime.lt, start: lungData.donorAccTime },
          rt: { ...prev.coldIschemicTime.rt, start: lungData.donorAccTime },
        },
      }))
    }
  }, [lungData.donorAccTime, activeTab, transplantSubTab]) // Dependencies: lungData.donorAccTime and activeTab

  // Effect hook to automatically set Warm Ischemic Time start when Cold Ischemic Time end changes for Lung Transplant
  useEffect(() => {
    if ((activeTab === "transplant" && transplantSubTab === "lung")) {
      setLungData((prev) => ({
        ...prev,
        warmIschemicTime: {
          lt: { ...prev.warmIschemicTime.lt, start: prev.coldIschemicTime.lt.end },
          rt: { ...prev.warmIschemicTime.rt, start: prev.coldIschemicTime.rt.end },
        },
      }))
    }
  }, [lungData.coldIschemicTime.lt.end, lungData.coldIschemicTime.rt.end, activeTab, transplantSubTab]) // Dependencies: cold ischemic end times and activeTab

  // Effect hook to automatically set Cold Ischemic Time start when Donor ACC Time changes for Heart Transplant
  useEffect(() => {
    if ((activeTab === "transplant" && transplantSubTab === "heart") && heartData.donorAccTime) {
      setHeartData((prev) => ({
        ...prev,
        coldIschemicTime: { ...prev.coldIschemicTime, start: heartData.donorAccTime },
      }))
    }
  }, [heartData.donorAccTime, activeTab, transplantSubTab]) // Dependencies: heartData.donorAccTime and activeTab

  // Effect hook to automatically set Warm Ischemic Time start when Cold Ischemic Time end changes for Heart Transplant
  useEffect(() => {
    if ((activeTab === "transplant" && transplantSubTab === "heart")) {
      setHeartData((prev) => ({
        ...prev,
        warmIschemicTime: { ...prev.warmIschemicTime, start: prev.coldIschemicTime.end },
      }))
    }
  }, [heartData.coldIschemicTime.end, activeTab, transplantSubTab]) // Dependencies: cold ischemic end time and activeTab

  return (
    <div className="cpbu-shell min-h-screen">
      <header className="cpbu-header">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex shrink-0 items-center gap-3">
            <img src="/asan-foundation-mark.svg" alt="아산재단 로고" width={42} height={42} className="h-10 w-10 shrink-0 object-contain" />
            <h1 className="whitespace-nowrap text-xl font-bold tracking-tight text-[#173940] sm:text-2xl">CPBU assistant</h1>
          </div>
          {/* A compact underline navigation matching the supplied reference layout. */}
          <nav className="cpbu-nav flex min-w-0 gap-1 overflow-x-auto" aria-label="주요 계산기 및 이식 관리">
            {[
              { id: "transplant", label: "이식관리" },
              { id: "hct", label: "Hct" },
              { id: "pediatric", label: "PCS" },
              { id: "gdp", label: "GDP" },
              { id: "mics", label: "MICS" },
              { id: "cpb", label: "LBM" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-current={activeTab === tab.id ? "page" : undefined}
                onClick={() => setActiveTab(tab.id)}
                className={"cpbu-nav-tab " + (activeTab === tab.id ? "cpbu-nav-tab-active" : "")}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6 sm:py-7">
      {activeTab === "transplant" && (
        <div className="cpbu-subtabs grid grid-cols-2 gap-1" role="tablist" aria-label="이식 종류">
          <button type="button" role="tab" aria-selected={transplantSubTab === "lung"}
            onClick={() => setTransplantSubTab("lung")}
            className={"cpbu-subtab " + (transplantSubTab === "lung" ? "cpbu-subtab-active" : "")}>
            폐이식
          </button>
          <button type="button" role="tab" aria-selected={transplantSubTab === "heart"}
            onClick={() => setTransplantSubTab("heart")}
            className={"cpbu-subtab " + (transplantSubTab === "heart" ? "cpbu-subtab-active" : "")}>
            심장이식
          </button>
        </div>
      )}

      {/* Lung Transplant Section */}
      {(activeTab === "transplant" && transplantSubTab === "lung") && (
        <div className="space-y-6">
          <div className="cpbu-panel">
            <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center border-b pb-3">
              폐이식 시간 관리
            </h3>
            {/* Donor ACC Time Input */}
            <div className="mb-6">
              <DonorAccTimeInput
                label="Donor ACC Time"
                value={lungData.donorAccTime}
                onChange={(e) => setLungData((prev) => ({ ...prev, donorAccTime: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Lung Section */}
              <div className="cpbu-lung-panel">
                <h4 className="mb-0 border-b border-[#E1EBE9] pb-3 text-base font-bold text-[#18323B] sm:text-lg">Left Lung (1st lung)</h4>
                <TimeSection
                  title="Cold Ischemic Time"
                  description="ACC~ Ice box에서 꺼낸 시간"
                  startTime={lungData.coldIschemicTime.lt.start}
                  endTime={lungData.coldIschemicTime.lt.end}
                  onStartChange={() => {}} // Read-only, set by Donor ACC Time
                  onEndChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      coldIschemicTime: {
                        ...prev.coldIschemicTime,
                        lt: { ...prev.coldIschemicTime.lt, end: e.target.value },
                      },
                    }))
                  }
                  duration={calculateDuration(lungData.coldIschemicTime.lt.start, lungData.coldIschemicTime.lt.end)}
                  side="Lt"
                  readOnlyStart={true} // Cold Ischemic Time start is read-only
                />
                <TimeSection
                  title="Warm Ischemic Time"
                  description="Ice box에서 꺼낸시간 ~ 1st lung reperfusion"
                  startTime={lungData.warmIschemicTime.lt.start}
                  endTime={lungData.warmIschemicTime.lt.end}
                  onStartChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      warmIschemicTime: {
                        ...prev.warmIschemicTime,
                        lt: { ...prev.warmIschemicTime.lt, start: e.target.value },
                      },
                    }))
                  }
                  onEndChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      warmIschemicTime: {
                        ...prev.warmIschemicTime,
                        lt: { ...prev.warmIschemicTime.lt, end: e.target.value },
                      },
                      anastomosisTime: {
                        // Also update anastomosis time end
                        ...prev.anastomosisTime,
                        lt: { ...prev.anastomosisTime.lt, end: e.target.value },
                      },
                    }))
                  }
                  duration={calculateDuration(lungData.warmIschemicTime.lt.start, lungData.warmIschemicTime.lt.end)}
                  side="Lt"
                  readOnlyStart={false} // Warm Ischemic Time start is editable
                  skipStartTab={true} // Auto-populated from cold end
                />
                {calculateDuration(lungData.coldIschemicTime.lt.start, lungData.coldIschemicTime.lt.end) &&
                  calculateDuration(lungData.warmIschemicTime.lt.start, lungData.warmIschemicTime.lt.end) && (
                    <div className="cpbu-total">
                      <p className="mb-1 text-xs font-medium text-[#006B6E]">Total Ischemic Time (Left)</p>
                      <p className="text-lg font-bold text-[#005559]">
                        {(() => {
                          const coldDuration = calculateDuration(
                            lungData.coldIschemicTime.lt.start,
                            lungData.coldIschemicTime.lt.end,
                          )
                          const warmDuration = calculateDuration(
                            lungData.warmIschemicTime.lt.start,
                            lungData.warmIschemicTime.lt.end,
                          )
                          const coldMatch = coldDuration.match(/(\d+)분/)
                          const warmMatch = warmDuration.match(/(\d+)분/)
                          if (coldMatch && warmMatch) {
                            const totalMinutes = Number.parseInt(coldMatch[1]) + Number.parseInt(warmMatch[1])
                            return `${totalMinutes}분`
                          }
                          return "-"
                        })()}
                      </p>
                    </div>
                  )}
                <TimeSection
                  title="Anastomosis Time"
                  description="1st lung anastomosis start ~ 1st lung reperfusion"
                  startTime={lungData.anastomosisTime.lt.start}
                  endTime={lungData.anastomosisTime.lt.end}
                  onStartChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      anastomosisTime: {
                        ...prev.anastomosisTime,
                        lt: { ...prev.anastomosisTime.lt, start: e.target.value },
                      },
                    }))
                  }
                  onEndChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      anastomosisTime: {
                        ...prev.anastomosisTime,
                        lt: { ...prev.anastomosisTime.lt, end: e.target.value },
                      },
                    }))
                  }
                  duration={calculateDuration(lungData.anastomosisTime.lt.start, lungData.anastomosisTime.lt.end)}
                  side="Lt"
                  skipEndTab={true} // Auto-populated from warm end
                />
              </div>

              {/* Right Lung Section */}
              <div className="cpbu-lung-panel">
                <h4 className="mb-0 border-b border-[#E1EBE9] pb-3 text-base font-bold text-[#18323B] sm:text-lg">Right Lung (2nd lung)</h4>
                <TimeSection
                  title="Cold Ischemic Time"
                  description="ACC~ 2nd lung ice packing에서 꺼낸 시간"
                  startTime={lungData.coldIschemicTime.rt.start}
                  endTime={lungData.coldIschemicTime.rt.end}
                  onStartChange={() => {}} // Read-only, set by Donor ACC Time
                  onEndChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      coldIschemicTime: {
                        ...prev.coldIschemicTime,
                        rt: { ...prev.coldIschemicTime.rt, end: e.target.value },
                      },
                    }))
                  }
                  duration={calculateDuration(lungData.coldIschemicTime.rt.start, lungData.coldIschemicTime.rt.end)}
                  side="Rt"
                  readOnlyStart={true} // Cold Ischemic Time start is read-only
                />
                <TimeSection
                  title="Warm Ischemic Time"
                  description="2nd lung ice packing에서 꺼낸 시간 ~ 2nd lung reperfusion"
                  startTime={lungData.warmIschemicTime.rt.start}
                  endTime={lungData.warmIschemicTime.rt.end}
                  onStartChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      warmIschemicTime: {
                        ...prev.warmIschemicTime,
                        rt: { ...prev.warmIschemicTime.rt, start: e.target.value },
                      },
                    }))
                  }
                  onEndChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      warmIschemicTime: {
                        ...prev.warmIschemicTime,
                        rt: { ...prev.warmIschemicTime.rt, end: e.target.value },
                      },
                      anastomosisTime: {
                        // Also update anastomosis time end
                        ...prev.anastomosisTime,
                        rt: { ...prev.anastomosisTime.rt, end: e.target.value },
                      },
                    }))
                  }
                  duration={calculateDuration(lungData.warmIschemicTime.rt.start, lungData.warmIschemicTime.rt.end)}
                  side="Rt"
                  readOnlyStart={false} // Warm Ischemic Time start is editable
                  skipStartTab={true} // Auto-populated from cold end
                />
                {calculateDuration(lungData.coldIschemicTime.rt.start, lungData.coldIschemicTime.rt.end) &&
                  calculateDuration(lungData.warmIschemicTime.rt.start, lungData.warmIschemicTime.rt.end) && (
                    <div className="cpbu-total">
                      <p className="mb-1 text-xs font-medium text-[#006B6E]">Total Ischemic Time (Right)</p>
                      <p className="text-lg font-bold text-[#005559]">
                        {(() => {
                          const coldDuration = calculateDuration(
                            lungData.coldIschemicTime.rt.start,
                            lungData.coldIschemicTime.rt.end,
                          )
                          const warmDuration = calculateDuration(
                            lungData.warmIschemicTime.rt.start,
                            lungData.warmIschemicTime.rt.end,
                          )
                          const coldMatch = coldDuration.match(/(\d+)분/)
                          const warmMatch = warmDuration.match(/(\d+)분/)
                          if (coldMatch && warmMatch) {
                            const totalMinutes = Number.parseInt(coldMatch[1]) + Number.parseInt(warmMatch[1])
                            return `${totalMinutes}분`
                          }
                          return "-"
                        })()}
                      </p>
                    </div>
                  )}
                <TimeSection
                  title="Anastomosis Time"
                  description="2nd lung anastomosis start ~ 2nd lung reperfusion"
                  startTime={lungData.anastomosisTime.rt.start}
                  endTime={lungData.anastomosisTime.rt.end}
                  onStartChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      anastomosisTime: {
                        ...prev.anastomosisTime,
                        rt: { ...prev.anastomosisTime.rt, start: e.target.value },
                      },
                    }))
                  }
                  onEndChange={(e) =>
                    setLungData((prev) => ({
                      ...prev,
                      anastomosisTime: {
                        ...prev.anastomosisTime,
                        rt: { ...prev.anastomosisTime.rt, end: e.target.value },
                      },
                    }))
                  }
                  duration={calculateDuration(lungData.anastomosisTime.rt.start, lungData.anastomosisTime.rt.end)}
                  side="Rt"
                  skipEndTab={true} // Auto-populated from warm end
                />
              </div>
            </div>
            {/* Pump Time Section - New Addition */}
            <div className="mt-6">
              <TimeSection
                title="Pump Time"
                description="펌프 시작 ~ 펌프 종료"
                startTime={lungData.pumpTime.start}
                endTime={lungData.pumpTime.end}
                onStartChange={(e) =>
                  setLungData((prev) => ({
                    ...prev,
                    pumpTime: { ...prev.pumpTime, start: e.target.value },
                  }))
                }
                onEndChange={(e) =>
                  setLungData((prev) => ({
                    ...prev,
                    pumpTime: { ...prev.pumpTime, end: e.target.value },
                  }))
                }
                duration={calculateDuration(lungData.pumpTime.start, lungData.pumpTime.end)}
              />
            </div>
            <div className="cpbu-note mt-6">
              <p className="mb-2 font-semibold">참고:</p>
              <p>
                * Ice box에서 lung을 꺼내 trimming 후 2nd. implantation을 하는 lung을 다시 ice packing 상태로 보존하기
                때문에 2nd lung의 cold ischemic time이 매우 길다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Heart Transplant Section */}
      {(activeTab === "transplant" && transplantSubTab === "heart") && (
        <div className="space-y-6">
          <div className="cpbu-panel">
            <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center border-b pb-3">
              심장이식 시간 관리
            </h3>
            {/* Donor ACC Time Input */}
            <div className="mb-6">
              <DonorAccTimeInput
                label="Donor ACC Time"
                value={heartData.donorAccTime}
                onChange={(e) => setHeartData((prev) => ({ ...prev, donorAccTime: e.target.value }))}
              />
            </div>
            <div className="space-y-4">
              <TimeSection
                title="Cold Ischemic Time"
                description="ACC ~ Ice box에서 꺼낸 시간"
                startTime={heartData.coldIschemicTime.start}
                endTime={heartData.coldIschemicTime.end}
                onStartChange={() => {}} // Read-only, no direct change
                onEndChange={(e) =>
                  setHeartData((prev) => ({
                    ...prev,
                    coldIschemicTime: { ...prev.coldIschemicTime, end: e.target.value },
                  }))
                }
                duration={calculateDuration(heartData.coldIschemicTime.start, heartData.coldIschemicTime.end)}
                readOnlyStart={true} // Cold Ischemic Time start is read-only
              />
              <TimeSection
                title="Warm Ischemic Time"
                description="Ice box에서 꺼낸 시간 ~ Recipient ACC release"
                startTime={heartData.warmIschemicTime.start}
                endTime={heartData.warmIschemicTime.end}
                onStartChange={(e) =>
                  setHeartData((prev) => ({
                    ...prev,
                    warmIschemicTime: { ...prev.warmIschemicTime, start: e.target.value },
                  }))
                }
                onEndChange={(e) =>
                  setHeartData((prev) => ({
                    ...prev,
                    warmIschemicTime: { ...prev.warmIschemicTime, end: e.target.value },
                  }))
                }
                duration={calculateDuration(heartData.warmIschemicTime.start, heartData.warmIschemicTime.end)}
                readOnlyStart={false}
                skipStartTab={true} // Warm start auto-filled from cold end // Warm Ischemic Time start is now editable
              />

              {(() => {
                const coldDuration = calculateDuration(heartData.coldIschemicTime.start, heartData.coldIschemicTime.end)
                const warmDuration = calculateDuration(heartData.warmIschemicTime.start, heartData.warmIschemicTime.end)

                if (coldDuration && warmDuration) {
                  const totalMinutes = Number.parseInt(coldDuration) + Number.parseInt(warmDuration)
                  return (
                    <div className="cpbu-total">
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Total Ischemic Time:</span>{" "}
                        <span className="font-bold text-[#005559]">{totalMinutes} 분</span>
                      </p>
                    </div>
                  )
                }
                return null
              })()}

              <TimeSection
                title="Anastomosis Time"
                startTime={heartData.anastomosisTime.start}
                endTime={heartData.anastomosisTime.end}
                onStartChange={(e) =>
                  setHeartData((prev) => ({
                    ...prev,
                    anastomosisTime: { ...prev.anastomosisTime, start: e.target.value },
                  }))
                }
                onEndChange={(e) =>
                  setHeartData((prev) => ({
                    ...prev,
                    anastomosisTime: { ...prev.anastomosisTime, end: e.target.value },
                  }))
                }
                duration={calculateDuration(heartData.anastomosisTime.start, heartData.anastomosisTime.end)}
              />
            </div>
          </div>

          {/* Controlled Rewarming reference images section */}
          <div className="cpbu-panel">
            <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center border-b pb-3">
              심장이식 참고 자료 - Controlled Rewarming
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Old Version - HT.1 */}
              <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                <div className="mb-3">
                  <span className="inline-block bg-gray-600 text-white px-3 py-1 rounded-md text-sm font-semibold">
                    구버전 (Old Version)
                  </span>
                </div>
                <img
                  src="/images/ht.png"
                  alt="심장이식 참고 자료 - 구버전"
                  className="w-full h-auto rounded-md shadow-sm"
                />
              </div>

              {/* New Version - HT.2 */}
              <div className="rounded-lg border border-[#DFE9E7] bg-[#F4FAF9] p-4">
                <div className="mb-3">
                  <span className="inline-block rounded-md bg-[#006B6E] px-3 py-1 text-sm font-semibold text-white">
                    신버전 (New Version)
                  </span>
                </div>
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/HT2-DRxQDpNlWB7GSZkU9HT5JCUOX7y8z1.png"
                  alt="Controlled Rewarming - 신버전"
                  className="w-full h-auto rounded-md shadow-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pediatric Cardiac Surgery Section with Sub-tabs */}
      {activeTab === "pediatric" && (
        <div className="space-y-6">
          {/* Sub-tab Navigation */}
          <div className="cpbu-subtabs grid grid-cols-3 gap-1">
            <button
              onClick={() => setPcsSubTab("echo")}
              className={"cpbu-subtab whitespace-nowrap " + (pcsSubTab === "echo" ? "cpbu-subtab-active" : "")}
            >
              Echo Z-Score
            </button>
            <button
              onClick={() => setPcsSubTab("scmp")}
              className={"cpbu-subtab whitespace-nowrap " + (pcsSubTab === "scmp" ? "cpbu-subtab-active" : "")}
            >
              SCMP Flow
            </button>
            <button
              onClick={() => setPcsSubTab("qpqs")}
              className={"cpbu-subtab whitespace-nowrap " + (pcsSubTab === "qpqs" ? "cpbu-subtab-active" : "")}
            >
              Qp/Qs
            </button>
          </div>

          {/* Sub-tab Content */}
          {pcsSubTab === "echo" && <EchoZScoreTool />}
          {pcsSubTab === "scmp" && <ScmpFlowCalculator />}
          {pcsSubTab === "qpqs" && <QpQsCalculator />}
        </div>
      )}

      {/* Hct calculators: AHD = adult, PCS = existing pediatric predictor. */}
      {activeTab === "hct" && (
        <div className="space-y-6">
          <div className="cpbu-subtabs grid grid-cols-2 gap-1" role="tablist" aria-label="Hct calculator type">
            <button
              type="button"
              role="tab"
              aria-selected={hctSubTab === "ahd"}
              onClick={() => setHctSubTab("ahd")}
              className={"cpbu-subtab " + (hctSubTab === "ahd" ? "cpbu-subtab-active" : "")}
            >
              AHD · Adult
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={hctSubTab === "pcs"}
              onClick={() => setHctSubTab("pcs")}
              className={"cpbu-subtab " + (hctSubTab === "pcs" ? "cpbu-subtab-active" : "")}
            >
              PCS · Pediatric
            </button>
          </div>
          {hctSubTab === "ahd" && <AdultHctPredictCalculator />}
          {hctSubTab === "pcs" && <BloodHemodilutionCalculator />}
        </div>
      )}

      {/* CPB Calculator Section */}
      {activeTab === "cpb" && (
        <div className="space-y-6">
          <SimpleCPBCalculator />
        </div>
      )}

      {/* GDP Calculator Section */}
      {activeTab === "gdp" && (
        <div className="space-y-6">
          <GDPCalculator />
        </div>
      )}

      {/* MICS venous drainage simulator */}
      {activeTab === "mics" && (
        <div className="space-y-6">
          <MicsDrainageCalculator />
        </div>
      )}
      </main>
    </div>
  )
}

export default CPBUassistant
