import type { ReactNode } from "react"

// A compact, dependency-free mathematical display for calculator help panels.
// The visual fraction is paired with an accessible linear description.
export function CompactEquation({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="math"
      aria-label={label}
      className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[13px] leading-snug text-slate-800 sm:text-sm"
    >
      <span aria-hidden="true" className="inline-flex min-w-max items-center gap-1.5 whitespace-nowrap font-medium tabular-nums">
        {children}
      </span>
    </div>
  )
}

export function MathFraction({ numerator, denominator }: { numerator: ReactNode; denominator: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 flex-col items-center justify-center align-middle text-center leading-[1.15]">
      <span className="w-full border-b border-current px-1 pb-0.5">{numerator}</span>
      <span className="px-1 pt-0.5">{denominator}</span>
    </span>
  )
}
