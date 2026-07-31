'use client'

/** Web Push client helpers — service-worker registration + subscription. */

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js')
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

export function notificationPermission(): PermissionState {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PermissionState
}

/**
 * Ask permission, register the SW, subscribe to Web Push, and persist the
 * subscription server-side. Returns true if reminders are now active.
 */
export async function enablePush(vapidPublicKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Push notifications are not supported in this browser.' }
  if (!vapidPublicKey) return { ok: false, error: 'Server is missing its push key (VAPID). See setup notes.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: 'Notification permission was not granted.' }

  const reg = await registerServiceWorker()
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub, device_name: navigator.userAgent.slice(0, 120) }),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    return { ok: false, error: j.error ?? 'Could not save your subscription.' }
  }
  return { ok: true }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
}
