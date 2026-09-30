import type { ComponentPropsWithRef, ReactNode } from "react"
import { cn } from "./cn"
import { Spinner } from "./spinner"

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "link"
export type ButtonSize = "sm" | "md" | "lg"

const BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium select-none whitespace-nowrap " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-fg shadow-ui-sm hover:bg-primary-hover active:bg-primary-active disabled:hover:bg-primary",
  secondary:
    "bg-surface text-fg border border-border-strong shadow-ui-sm hover:bg-surface-sunken active:bg-border disabled:hover:bg-surface",
  danger:
    "bg-danger text-white shadow-ui-sm hover:bg-danger-hover active:bg-danger-hover disabled:hover:bg-danger",
  ghost: "bg-transparent text-fg-muted hover:bg-surface-sunken hover:text-fg active:bg-border",
  link: "bg-transparent text-primary underline-offset-2 hover:underline hover:text-primary-hover",
}

/** Heights: sm 32px, md 36px, lg 44px (lg meets the 44px touch-target guideline). */
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-caption rounded-ui-sm",
  md: "min-h-9 px-4 text-body rounded-ui-md",
  lg: "min-h-11 px-5 text-body-lg rounded-ui-md",
}

/** Link-style buttons keep a 24px minimum target (WCAG 2.5.8) without padding. */
const LINK_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-6 text-caption rounded-ui-sm",
  md: "min-h-6 text-body rounded-ui-sm",
  lg: "min-h-6 text-body-lg rounded-ui-sm",
}

/**
 * Class string for a button look — use it to style a Next `<Link>` or `<a>`
 * like a button without nesting interactive elements.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}): string {
  return cn(
    BASE,
    VARIANT[variant],
    variant === "link" ? LINK_SIZE[size] : SIZE[size],
    fullWidth && "w-full",
    className,
  )
}

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean
  /** Icon rendered before the label (replaced by the spinner while loading). */
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
  /** A visible label is required — for icon-only buttons use `IconButton`. */
  children: ReactNode
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Spinner size={size === "lg" ? "sm" : "xs"} /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
}

export type IconButtonVariant = Exclude<ButtonVariant, "link">

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 w-8 rounded-ui-sm",
  md: "h-9 w-9 rounded-ui-md",
  lg: "h-11 w-11 rounded-ui-md",
}

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label"> {
  /** Accessible name (becomes aria-label and the native tooltip). Required by type. */
  label: string
  icon: ReactNode
  variant?: IconButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Set false to suppress the native `title` tooltip. Default true. */
  showTitle?: boolean
}

/** Square icon-only button. `label` is mandatory so it always has an accessible name. */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  loading = false,
  showTitle = true,
  disabled,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={showTitle ? label : undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANT[variant], ICON_SIZE[size], "shrink-0 p-0", className)}
      {...rest}
    >
      {loading ? (
        <Spinner size="xs" />
      ) : (
        <span aria-hidden="true" className="inline-flex">
          {icon}
        </span>
      )}
    </button>
  )
}
