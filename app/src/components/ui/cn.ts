import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge configured with the custom design tokens from
 * `src/app/globals.css` (@theme). Without this, e.g. `text-caption` (a font
 * size) would be classified as a text *color* and silently dropped when
 * combined with `text-fg-muted`.
 *
 * Keep these lists in sync with the `--text-*`, `--radius-*`, `--shadow-*`
 * and `--ease-*` tokens in globals.css. Custom `--color-*` tokens need no
 * entry: tailwind-merge v3 accepts any color name.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["caption", "body", "body-lg", "title", "heading"],
      radius: ["ui-sm", "ui-md", "ui-lg"],
      shadow: ["ui-sm", "ui-md", "ui-lg", "ui-overlay"],
      ease: ["ui"],
    },
  },
})

type ClassPart = string | false | null | undefined

/**
 * Join truthy class names and resolve conflicting Tailwind utilities so the
 * last one wins (`cn("px-2", "px-4")` → `"px-4"`).
 */
export function cn(...parts: ClassPart[]): string {
  return twMerge(parts.filter(Boolean).join(" "))
}
