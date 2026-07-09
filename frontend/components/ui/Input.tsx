"use client"

import * as React from "react"

import { cx } from "@/utils/cx"

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-glass border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-accent-cyan/35",
        className
      )}
      {...props}
    />
  )
}
