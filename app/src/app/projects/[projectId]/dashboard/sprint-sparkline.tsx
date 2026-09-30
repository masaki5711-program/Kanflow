"use client"

import type { Sparkline } from "./dashboard-summary"

const W = 160
const H = 48
const PAD = 4

function path(values: readonly (number | null)[], max: number): string {
  const n = Math.max(values.length - 1, 1)
  return values
    .flatMap((v, i) => (v === null ? [] : [`${PAD + (i / n) * (W - PAD * 2)} ${PAD + (1 - v / max) * (H - PAD * 2)}`]))
    .map((xy, i) => `${i === 0 ? "M" : "L"} ${xy}`)
    .join(" ")
}

/** Tiny burndown of the active sprint: ideal (dashed) vs actual remaining tasks. */
export function SprintSparkline({ data, label }: { data: Sparkline; label: string }) {
  const max = Math.max(data.total, ...data.ideal, ...data.actual.map((v) => v ?? 0), 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="block max-w-full">
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="var(--color-border)" strokeWidth="1" />
      <path d={path(data.ideal, max)} fill="none" stroke="var(--color-fg-subtle)" strokeWidth="1.5" strokeDasharray="4,3" />
      <path d={path(data.actual, max)} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
