import { describe, it, expect } from 'vitest'
import {
  kgToLbs,
  lbsToKg,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  toISODate,
  today,
  addDays,
  formatDate,
  formatTime,
  generateId,
  capitalise,
  truncate,
} from './index'

describe('weight conversion', () => {
  it('kg → lbs, one decimal', () => {
    expect(kgToLbs(70)).toBe(154.3)
    expect(kgToLbs(0)).toBe(0)
  })
  it('lbs → kg, one decimal', () => {
    expect(lbsToKg(154.3)).toBeCloseTo(70, 0)
  })
})

describe('temperature conversion', () => {
  it('°C → °F', () => {
    expect(celsiusToFahrenheit(37)).toBe(98.6)
    expect(celsiusToFahrenheit(0)).toBe(32)
    expect(celsiusToFahrenheit(100)).toBe(212)
  })
  it('°F → °C', () => {
    expect(fahrenheitToCelsius(98.6)).toBe(37)
    expect(fahrenheitToCelsius(32)).toBe(0)
  })
})

describe('date helpers', () => {
  it('toISODate strips the time component', () => {
    expect(toISODate(new Date('2026-07-27T14:33:00Z'))).toBe('2026-07-27')
  })
  it('addDays shifts forward and backward without mutating input', () => {
    const base = new Date('2026-07-27T00:00:00Z')
    expect(toISODate(addDays(base, 5))).toBe('2026-08-01')
    expect(toISODate(addDays(base, -1))).toBe('2026-07-26')
    expect(toISODate(base)).toBe('2026-07-27') // unchanged
  })

  it('today returns an ISO date matching the current day', () => {
    expect(today()).toBe(new Date().toISOString().split('T')[0])
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('formatDate renders a human-readable date', () => {
    const out = formatDate('2026-07-27')
    expect(out).toContain('2026')
    expect(out).toMatch(/Jul/i)
  })

  it('formatTime renders 24-hour HH:MM in the given timezone', () => {
    const out = formatTime('2026-07-27T09:05:00Z', 'UTC')
    expect(out).toBe('09:05')
  })
})

describe('generateId', () => {
  it('produces a unique UUID-shaped string', () => {
    const a = generateId()
    const b = generateId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f-]{36}$/i)
  })
})

describe('string helpers', () => {
  it('capitalise upper-cases the first letter only', () => {
    expect(capitalise('hello')).toBe('Hello')
    expect(capitalise('')).toBe('')
  })
  it('truncate adds an ellipsis past the max length', () => {
    expect(truncate('short', 10)).toBe('short')
    expect(truncate('a much longer string', 6)).toBe('a muc…')
  })
})
