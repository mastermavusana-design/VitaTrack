/**
 * VitaTrack Push Notification Handler
 *
 * Handles:
 * 1. Incoming remote push notifications (caregiver missed-dose alerts, refill pings)
 * 2. Notification tap routing — navigate user to the correct screen
 * 3. Expo push token registration — saves token to Supabase for Edge Function targeting
 */
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { router } from 'expo-router'
import { getSupabaseClient } from '@vitatrack/shared'

// ─── Convenience object used by the root _layout ───────────────────────────
// Structural type keeps this resilient across expo-notifications subscription
// type renames (EventSubscription/Subscription); all we need is remove().
// Note: the foreground handler is set via setNotificationHandler(), which
// returns no unsubscribe handle, so only the tap listener is tracked here.
type RemovableSub = { remove: () => void }
let _tapSub: RemovableSub | null = null

export const notificationHandler = {
  setup() {
    try {
      setupForegroundNotificationHandler()
      _tapSub = setupNotificationTapHandler()
    } catch (err) {
      // expo-notifications remote features may not be available in Expo Go
      console.warn('[VitaTrack] Notification setup skipped:', err)
    }
  },
  teardown() {
    _tapSub?.remove()
  },
}

/** ──────────────────────────────────────── */
/*  Push token registration                  */
/** ──────────────────────────────────────── */

/**
 * Register this device for remote push notifications.
 * Saves the Expo push token to `profiles.expo_push_token` in Supabase.
 * Must be called after auth + bootstrapNotifications().
 */
export async function registerPushToken(): Promise<void> {
  if (!Constants.isDevice) {
    // Simulator/emulator — skip (Expo push doesn't work on simulators)
    return
  }

  // Remote push tokens are not available in Expo Go from SDK 53+
  // They require a development build or production build
  const appOwnership = Constants.appOwnership
  if (appOwnership === 'expo') {
    console.warn('[VitaTrack] Expo Go detected — push token registration skipped. Use a dev build for push notifications.')
    return
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  // Required on Android 13+ for remote push
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('vitatrack-remote', {
      name: 'Remote Alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 250, 500],
      enableVibrate: true,
    })
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    })
    const token = tokenData.data

    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('profiles')
      .update({ expo_push_token: token, push_token_updated_at: new Date().toISOString() })
      .eq('id', user.id)
  } catch (err) {
    console.warn('[VitaTrack] Push token registration failed:', err)
  }
}

/** ──────────────────────────────────────── */
/*  Tap handler: route to correct screen     */
/** ──────────────────────────────────────── */

type NotificationData = {
  type?: string
  medicationId?: string
  scheduleId?: string
  profileId?: string   // whose data (caregiver alerts carry this)
}

/**
 * Set up the global tap-response listener.
 * Call once from the root _layout on mount.
 * Returns the subscription (call .remove() on unmount).
 */
export function setupNotificationTapHandler(): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as NotificationData

    switch (data?.type) {
      case 'dose_reminder':
        if (data.medicationId) {
          router.push(`/(app)/medications/${data.medicationId}/log`)
        } else {
          router.push('/(app)/medications')
        }
        break

      case 'refill_alert':
        if (data.medicationId) {
          // No standalone medication-detail route exists; open the med's log screen.
          router.push(`/(app)/medications/${data.medicationId}/log`)
        } else {
          router.push('/(app)/medications')
        }
        break

      case 'caregiver_missed_dose':
        // Caregiver received alert about another profile missing a dose
        // Route caregiver to the caregiver dashboard (web) or home
        router.push('/(app)')
        break

      case 'caregiver_refill':
        router.push('/(app)')
        break

      default:
        router.push('/(app)')
    }
  })
}

/** ──────────────────────────────────────── */
/*  Foreground notification display handler  */
/** ──────────────────────────────────────── */

/**
 * Customize how notifications appear while the app is in the foreground.
 * (Also set globally in scheduler.ts bootstrapNotifications, but here for clarity.)
 */
export function setupForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as NotificationData

      // Caregiver alerts — always show banner even in foreground
      if (data?.type === 'caregiver_missed_dose' || data?.type === 'caregiver_refill') {
        return {
          shouldShowAlert: true,   // deprecated alias, kept for older runtimes
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }
      }

      // Dose reminders — show in foreground too (user may not have acted yet)
      return {
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: false,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }
    },
  })
}

/** ──────────────────────────────────────── */
/*  Badge management                         */
/** ──────────────────────────────────────── */

/** Set the app badge count (iOS only) */
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'ios') {
    await Notifications.setBadgeCountAsync(count)
  }
}

/** Clear badge on app foreground */
export async function clearBadge(): Promise<void> {
  await setBadgeCount(0)
}
