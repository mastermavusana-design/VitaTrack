/**
 * VitaTrack Notification Scheduler
 *
 * Schedules local expo-notifications from MedicationSchedule rows.
 * Called whenever a medication is added, edited, or refetched.
 * All scheduling is 100% local — no network required.
 */
import * as Notifications from 'expo-notifications'
import type { Medication, MedicationSchedule } from '@vitatrack/shared'

/** Channel IDs (Android) */
export const CHANNEL_DOSE     = 'vitatrack-dose'
export const CHANNEL_REFILL   = 'vitatrack-refill'

/** How many days ahead to schedule at once */
const SCHEDULE_HORIZON_DAYS = 7

/** ──────────────────────────────────────── */
/*  Bootstrap: channels + handlers           */
/** ──────────────────────────────────────── */
export async function bootstrapNotifications(): Promise<boolean> {
  // Request permissions
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  // Android notification channels
  await Notifications.setNotificationChannelAsync(CHANNEL_DOSE, {
    name: 'Medication Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    showBadge: true,
  })

  await Notifications.setNotificationChannelAsync(CHANNEL_REFILL, {
    name: 'Refill Alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
    showBadge: true,
  })

  // Default handler: show banner even in foreground
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert:  true,   // deprecated alias, kept for older runtimes
      shouldShowBanner: true,
      shouldShowList:   true,
      shouldPlaySound:  true,
      shouldSetBadge:   false,
    }),
  })

  return true
}

/** ──────────────────────────────────────── */
/*  Schedule reminders for one medication   */
/** ──────────────────────────────────────── */
export type MedicationWithSchedules = Medication & {
  schedules: MedicationSchedule[]
}

export async function scheduleMedicationReminders(
  med: MedicationWithSchedules
): Promise<void> {
  // Cancel all existing notifications for this med first
  await cancelMedicationReminders(med.id)

  if (!med.reminder_enabled || med.is_active === false) return

  const now  = new Date()
  const stop = new Date(now)
  stop.setDate(stop.getDate() + SCHEDULE_HORIZON_DAYS)

  for (const schedule of med.schedules) {
    if (!schedule.is_active) continue

    const timesForFrequency = getTimesForSchedule(schedule)

    // Walk each day in the horizon
    const cursor = new Date(now)
    cursor.setHours(0, 0, 0, 0)

    while (cursor <= stop) {
      if (shouldFireOnDate(schedule, cursor)) {
        for (const [hours, minutes] of timesForFrequency) {
          const trigger = new Date(cursor)
          trigger.setHours(hours, minutes, 0, 0)

          // Skip times already in the past
          if (trigger <= now) continue

          await Notifications.scheduleNotificationAsync({
            identifier: notificationId(med.id, schedule.id, trigger),
            content: {
              title: `💊 ${med.name}`,
              body: buildDoseBody(med, hours, minutes),
              data: { medicationId: med.id, scheduleId: schedule.id, type: 'dose_reminder' },
              sound: 'default',
              ...(med.pill_count !== null && med.pill_count <= (med.refill_threshold ?? 7)
                ? { badge: 1 }
                : {}),
            },
            trigger: {
              date: trigger,
              channelId: CHANNEL_DOSE,
            },
          })
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }
}

/** Cancel all scheduled notifications for a medication */
export async function cancelMedicationReminders(medicationId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  const toCancel = scheduled
    .filter(n => (n.content.data as any)?.medicationId === medicationId)
    .map(n => n.identifier)

  await Promise.all(toCancel.map(id => Notifications.cancelScheduledNotificationAsync(id)))
}

/** Schedule a refill alert notification (fires once, today) */
export async function scheduleRefillAlert(med: Medication): Promise<void> {
  const fireAt = new Date()
  fireAt.setHours(9, 0, 0, 0) // 09:00 local time
  if (fireAt < new Date()) {
    fireAt.setDate(fireAt.getDate() + 1) // push to tomorrow morning if already past 09:00
  }

  await Notifications.scheduleNotificationAsync({
    identifier: `refill-${med.id}`,
    content: {
      title: `⚠️ Refill Needed: ${med.name}`,
      body: `Only ${med.pill_count} tablet${(med.pill_count ?? 0) === 1 ? '' : 's'} remaining. Time to request a refill.`,
      data: { medicationId: med.id, type: 'refill_alert' },
      sound: 'default',
    },
    trigger: {
      date: fireAt,
      channelId: CHANNEL_REFILL,
    },
  })
}

/** Re-schedule reminders for ALL active medications (call on app foreground) */
export async function rescheduleAll(
  medications: MedicationWithSchedules[]
): Promise<void> {
  // Cancel everything first
  await Notifications.cancelAllScheduledNotificationsAsync()

  // Re-schedule per medication
  await Promise.all(
    medications
      .filter(m => m.is_active && m.reminder_enabled)
      .map(m => scheduleMedicationReminders(m))
  )

  // Refill alerts
  await Promise.all(
    medications
      .filter(m => m.is_active && m.pill_count !== null && m.pill_count <= (m.refill_threshold ?? 7))
      .map(m => scheduleRefillAlert(m))
  )
}

/** ──────────────────────────────────────── */
/*  Internal helpers                         */
/** ──────────────────────────────────────── */

/** Parse "HH:MM" times from a schedule's `times` JSON array */
function getTimesForSchedule(schedule: MedicationSchedule): [number, number][] {
  if (!schedule.times?.length) return []
  return schedule.times.map((t: string) => {
    const [h, m] = t.split(':').map(Number)
    return [h, m] as [number, number]
  })
}

/** Determine if a schedule should fire on a given date */
function shouldFireOnDate(schedule: MedicationSchedule, date: Date): boolean {
  const freq = schedule.frequency

  if (freq === 'daily' || freq === 'twice_daily' || freq === 'three_times_daily') {
    return true
  }

  if (freq === 'weekly' && schedule.days_of_week?.length) {
    // days_of_week: 0=Sun … 6=Sat
    return schedule.days_of_week.includes(date.getDay())
  }

  if (freq === 'as_needed') return false

  // 'custom' (and any weekly schedule without explicit days) — default to firing.
  return true
}

/** Build a human-readable dose body */
function buildDoseBody(med: Medication, hours: number, minutes: number): string {
  const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  const parts: string[] = []

  if (med.strength) parts.push(`${med.strength}${med.strength_unit ?? ''}`)
  if (med.instructions) parts.push(med.instructions)

  return parts.length > 0
    ? `${time} · ${parts.join(' · ')}`
    : `Time to take your ${med.form ?? 'dose'}`
}

/** Stable identifier for a dose notification */
function notificationId(medId: string, schedId: string, date: Date): string {
  return `dose-${medId}-${schedId}-${date.toISOString().slice(0, 16)}`
}
