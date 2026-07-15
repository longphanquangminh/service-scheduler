import { addMinutes, differenceInMinutes, isBefore, isSameDay, parseISO } from 'date-fns'

/** Shortest allowed booking window (Google-style free duration, but not below this). */
export const MIN_DURATION_MINUTES = 30

/** FullCalendar ends are exclusive; midnight next day still counts as previous day. */
export function sameCalendarDay(start: Date, end: Date): boolean {
  const endAdj =
    end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && end > start
      ? new Date(end.getTime() - 1)
      : end
  return isSameDay(start, endAdj)
}

export function durationMinutesBetween(startIso: string, endIso: string): number {
  return differenceInMinutes(parseISO(endIso), parseISO(startIso))
}

export function meetsMinDuration(start: Date, end: Date): boolean {
  return differenceInMinutes(end, start) >= MIN_DURATION_MINUTES
}

export type RangeIssue =
  | { code: 'order'; message: string }
  | { code: 'min_duration'; message: string }
  | { code: 'cross_day'; message: string }

/** Validate only — never mutates / “fixes” the user’s times. */
export function validateBookingRange(startIso: string, endIso: string): RangeIssue[] {
  const start = parseISO(startIso)
  const end = parseISO(endIso)
  const issues: RangeIssue[] = []

  if (!isBefore(start, end)) {
    issues.push({
      code: 'order',
      message: 'End time must be after start time.',
    })
    return issues
  }

  if (!sameCalendarDay(start, end)) {
    issues.push({
      code: 'cross_day',
      message: 'Start and end must be on the same day.',
    })
  }

  const mins = differenceInMinutes(end, start)
  if (mins < MIN_DURATION_MINUTES) {
    issues.push({
      code: 'min_duration',
      message: `Minimum booking duration is ${MIN_DURATION_MINUTES} minutes (currently ${mins} min).`,
    })
  }

  return issues
}

export function isValidBookingRange(startIso: string, endIso: string): boolean {
  return validateBookingRange(startIso, endIso).length === 0
}

/** Default end when opening a new booking without an explicit end — not used as auto-fix on edit. */
export function defaultEndFromStart(startIso: string): string {
  return addMinutes(parseISO(startIso), MIN_DURATION_MINUTES).toISOString()
}

export function durationLabel(startIso: string, endIso: string): string {
  const mins = durationMinutesBetween(startIso, endIso)
  if (mins <= 0) return 'invalid range'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export const PENDING_EVENT_ID = '__pending_selection__'
