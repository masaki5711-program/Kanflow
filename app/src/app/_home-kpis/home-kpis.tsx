"use client"

import Link from "next/link"
import { cn } from "@/components/ui"
import type { HomeKpiModel, KpiTile } from "./home-kpi-tiles"

/** The hero's numbers (dl of tiles), or a one-line hint when there is nothing to count. */
export function HomeKpis({ model }: { model: HomeKpiModel }) {
  if (model.tiles.length === 0) {
    return model.hint ? (
      <p data-testid="kpi-hint" className="max-w-sm text-body text-white/90 md:text-right">
        {model.hint}
      </p>
    ) : null
  }
  return (
    <dl className="flex shrink-0 flex-wrap gap-2 md:gap-3">
      {model.tiles.map((tile) => (
        <Kpi key={tile.key} tile={tile} />
      ))}
    </dl>
  )
}

function Kpi({ tile }: { tile: KpiTile }) {
  const { label, value, note, alert = false, href } = tile
  return (
    <div
      className={cn(
        "relative flex min-w-[88px] flex-1 basis-[88px] flex-col-reverse rounded-2xl px-3 py-2 text-center backdrop-blur md:flex-none md:px-4 md:py-3",
        alert ? "bg-white text-danger-strong shadow-ui-md" : "bg-white/15",
        href && "transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-white hover:bg-white/25",
      )}
    >
      {/* Wraps onto two lines instead of "Tugas terb…" at 375 px (A3-17). */}
      <dt data-testid="kpi-label" className={cn("mt-1 break-words text-caption leading-tight", alert ? "font-semibold" : "text-white/90")} title={label}>
        {label}
        {note && <span className="mt-0.5 block font-normal opacity-80">{note}</span>}
      </dt>
      <dd className="text-2xl font-bold leading-none md:text-3xl">
        {href ? (
          // Stretched link: the whole tile is the target, the number is its text.
          <Link href={href} aria-label={`${label}: ${value}`} className="outline-none after:absolute after:inset-0 after:content-['']">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
