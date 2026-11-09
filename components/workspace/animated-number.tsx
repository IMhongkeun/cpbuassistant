"use client"

import { useEffect, useRef, useState } from "react"

// Short ease-out count toward the new value; respects reduced motion.
export function AnimatedNumber({ value, decimals = 0, duration = 320 }: { value: number; decimals?: number; duration?: number }) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const from = fromRef.current
    if (reduce || from === value) {
      fromRef.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + (value - from) * eased
      setShown(current)
      fromRef.current = current
      if (t < 1) frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return <span className="tabular-nums">{shown.toFixed(decimals)}</span>
}
