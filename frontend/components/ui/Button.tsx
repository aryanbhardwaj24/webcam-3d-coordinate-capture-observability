"use client"

import * as React from "react"

import { cx } from "@/utils/cx"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-accent-cyan/85 to-accent-violet/85 text-obsidian-950 shadow-glow hover:from-accent-cyan hover:to-accent-violet",
  secondary:
    "bg-white/10 text-white hover:bg-white/15 active:bg-white/20 border border-white/10 shadow-glass",
  ghost: "bg-transparent text-white hover:bg-white/8 active:bg-white/12",
  danger: "bg-red-500/20 text-red-200 hover:bg-red-500/25 border border-red-500/30",
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
}

export function Button({
  className,
  variant = "secondary",
  size = "md",
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-glass font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/40 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={props.disabled ?? loading}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
          aria-hidden
        />
      ) : null}
      <span className="inline-flex items-center justify-center gap-2">{props.children}</span>
    </button>
  )
}
