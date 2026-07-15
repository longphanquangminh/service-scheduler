import { describe, expect, it } from 'vitest'
import {
  durationLabel,
  meetsMinDuration,
  MIN_DURATION_MINUTES,
  sameCalendarDay,
  validateBookingRange,
} from './time'

describe('sameCalendarDay', () => {
  it('allows same-day ranges', () => {
    const start = new Date(2026, 6, 15, 9, 0)
    const end = new Date(2026, 6, 15, 11, 0)
    expect(sameCalendarDay(start, end)).toBe(true)
  })

  it('blocks cross-day ranges', () => {
    const start = new Date(2026, 6, 15, 16, 0)
    const end = new Date(2026, 6, 16, 9, 0)
    expect(sameCalendarDay(start, end)).toBe(false)
  })

  it('treats exclusive midnight end as same day', () => {
    const start = new Date(2026, 6, 15, 16, 0)
    const end = new Date(2026, 6, 16, 0, 0, 0)
    expect(sameCalendarDay(start, end)).toBe(true)
  })
})

describe('meetsMinDuration', () => {
  it(`requires at least ${MIN_DURATION_MINUTES} minutes`, () => {
    const start = new Date(2026, 6, 15, 9, 0)
    expect(meetsMinDuration(start, new Date(2026, 6, 15, 9, 15))).toBe(false)
    expect(meetsMinDuration(start, new Date(2026, 6, 15, 9, 30))).toBe(true)
    expect(meetsMinDuration(start, new Date(2026, 6, 15, 11, 0))).toBe(true)
  })
})

describe('validateBookingRange', () => {
  it('reports order error when end is before start without rewriting times', () => {
    const start = '2026-07-15T11:30:00.000+07:00'
    const end = '2026-07-15T11:00:00.000+07:00'
    const issues = validateBookingRange(start, end)
    expect(issues.some((i) => i.code === 'order')).toBe(true)
    expect(end).toBe('2026-07-15T11:00:00.000+07:00')
  })
})

describe('durationLabel', () => {
  it('formats hours and minutes', () => {
    expect(
      durationLabel('2026-07-15T09:00:00.000+07:00', '2026-07-15T10:30:00.000+07:00'),
    ).toBe('1h 30m')
  })

  it('labels inverted ranges as invalid', () => {
    expect(
      durationLabel('2026-07-15T11:30:00.000+07:00', '2026-07-15T11:00:00.000+07:00'),
    ).toBe('invalid range')
  })
})
