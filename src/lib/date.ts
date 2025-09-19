// src/lib/date.ts
export const tz = 'America/New_York'

/** YYYY-MM-DD in EST */
export function todayKeyEST(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')!.value
  const m = parts.find(p => p.type === 'month')!.value
  const da = parts.find(p => p.type === 'day')!.value
  return `${y}-${m}-${da}`
}

/** ISO-like timestamp but localized to EST wall clock */
export function nowESTIso(d = new Date()): string {
  // Compose ISO string with EST date/time (no TZ suffix)
  const date = todayKeyEST(d)
  const time = d.toLocaleTimeString('en-GB', { timeZone: tz, hour12: false }) // HH:MM:SS
  const ms = d.toLocaleString('en-US', { timeZone: tz, hour12: false, fractionalSecondDigits: 3 })
    .split('.')[1]?.slice(0,3) ?? '000'
  return `${date}T${time}.${ms}`
}
