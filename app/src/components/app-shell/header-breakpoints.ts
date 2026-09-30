/**
 * Responsive split of the app header. Every destination is reachable at
 * every width: it is either inline in the header bar or inside the user menu.
 *
 * - primary (project list, my page): inline from `md`
 * - secondary (portfolio, admin menu, display language): inline from `lg`
 *
 * Below those widths the same items are listed in the user menu, so the bar
 * itself only holds ☰, logo, breadcrumb, search, bell and the avatar (fits 320px).
 */
export const HEADER_PRIMARY_INLINE = "hidden md:inline-flex"
export const HEADER_PRIMARY_IN_MENU = "md:hidden"
export const HEADER_SECONDARY_INLINE = "hidden lg:inline-flex"
export const HEADER_SECONDARY_IN_MENU = "lg:hidden"
/** Text labels of inline nav links appear from `xl`; icon-only (with sr-only name) below. */
export const HEADER_LABEL_VISIBLE = "hidden xl:inline"
export const HEADER_LABEL_SR_ONLY = "sr-only xl:hidden"
