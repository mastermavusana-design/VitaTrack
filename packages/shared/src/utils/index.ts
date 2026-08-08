export * from './bp-classification'
export * from './glucose-units'
export * from './adherence'
export * from './growth-lms'
export * from './growth-reference'

// ── Date helpers ──────────────────────────────────────────────
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function today(): string {
  return toISODate(new Date())
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function formatDate(iso: string, locale = 'en-ZA'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso))
}

export function formatTime(iso: string, timezone = 'Africa/Johannesburg'): string {
  return new Intl.DateTimeFormat('en-ZA', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).format(new Date(iso))
}

// ── Weight helpers ────────────────────────────────────────────
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10
}
export function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 10) / 10
}

// ── Temperature helpers ───────────────────────────────────────
export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9/5 + 32) * 10) / 10
}
export function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5/9) * 10) / 10
}

// ── Misc ──────────────────────────────────────────────────────
export function generateId(): string {
  return crypto.randomUUID()
}

export function capitalise(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}
