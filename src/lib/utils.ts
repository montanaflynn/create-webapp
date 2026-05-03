import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format like "May 2, 5:42 PM". Built from two formatters so we don't get
 * the locale-dependent "at" separator (e.g. "May 2 at 5:42 PM") that
 * `toLocaleString` injects when both date and time options are passed.
 */
export function formatDateTime(d: Date | string | number) {
  const date = new Date(d)
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${datePart}, ${timePart}`
}
