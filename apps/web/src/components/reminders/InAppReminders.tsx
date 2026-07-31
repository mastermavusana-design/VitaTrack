'use client'

import { useEffect } from 'react'

/**
 * In-app reminder fallback. While the dashboard (or installed PWA) is open and
 * notification permission is granted, this schedules local notifications at each
 * medication's dose times. Background delivery (app closed) is handled separately
 * by Web Push. Renders nothing.
 */
export default function InAppReminders() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    let timers: ReturnType<typeof setTimeout>[] = []
    let dayTimer: ReturnType<typeof setTimeout> | null = null

    async function notify(title: string, body: string, tag: string, url = '/dashboard/medications') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.()
        if (reg) {
          await reg.showNotification(title, { body, tag, icon: '/brand/icon.png', badge: '/brand/icon.png', data: { url } } as any)
        } else {
          // eslint-disable-next-line no-new
          new Notification(title, { body, tag, icon: '/brand/icon.png' })
        }
      } catch { /* ignore */ }
    }

    function alreadyFired(key: string): boolean {
      try {
        if (localStorage.getItem(key)) return true
        localStorage.setItem(key, '1')
        return false
      } catch { return false }
    }

    async function schedule() {
      timers.forEach(clearTimeout); timers = []
      let meds: any[] = []
      try {
        const res = await fetch('/api/medications')
        if (!res.ok) return
        meds = (await res.json()).medications ?? []
      } catch { return }

      const now = new Date()
      const dateStr = now.toISOString().slice(0, 10)

      for (const med of meds) {
        if (med.reminder_enabled === false) continue
        const label = `${med.name}${med.strength ? ` ${med.strength}${med.strength_unit ?? ''}` : ''}`

        // Refill alert (fire once per day when low).
        if (med.pill_count != null && med.refill_threshold != null && med.pill_count <= med.refill_threshold) {
          const key = `vt_refill_${dateStr}_${med.id}`
          if (!alreadyFired(key)) notify('Refill soon', `${label}: ${med.pill_count} left`, key)
        }

        for (const sched of med.schedules ?? []) {
          if (sched.reminder_enabled === false) continue
          for (const time of sched.times ?? []) {
            const m = /^(\d{2}):(\d{2})$/.exec(time)
            if (!m) continue
            const when = new Date(now)
            when.setHours(Number(m[1]), Number(m[2]), 0, 0)
            const delay = when.getTime() - now.getTime()
            const key = `vt_dose_${dateStr}_${med.id}_${time}`

            if (delay >= -5 * 60_000 && delay <= 0) {
              // Became due within the last 5 minutes — fire now (once).
              if (!alreadyFired(key)) notify('Time for your medication', `${label} — due at ${time}`, key)
            } else if (delay > 0) {
              timers.push(setTimeout(() => {
                if (!alreadyFired(key)) notify('Time for your medication', `${label} — due now`, key)
              }, Math.min(delay, 23 * 3600_000)))
            }
          }
        }
      }
    }

    schedule()
    // Re-evaluate hourly (covers new meds + rollover into the next day).
    const hourly = setInterval(schedule, 60 * 60_000)

    return () => {
      timers.forEach(clearTimeout)
      if (dayTimer) clearTimeout(dayTimer)
      clearInterval(hourly)
    }
  }, [])

  return null
}
