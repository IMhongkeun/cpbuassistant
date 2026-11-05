"use client"

import { useEffect } from "react"
import { blurFocusedNumberInputOnWheel } from "@/lib/number-input-wheel"

export function DisableNumberInputWheel() {
  useEffect(() => {
    // Blur before the browser steps a focused number input; do not cancel scrolling.
    document.addEventListener("wheel", blurFocusedNumberInputOnWheel, {
      capture: true,
      passive: true,
    })

    return () => document.removeEventListener("wheel", blurFocusedNumberInputOnWheel, true)
  }, [])

  return null
}
