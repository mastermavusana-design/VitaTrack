'use client'

import { useEffect, useState } from 'react'
import { pushSupported, notificationPermission, enablePush, disablePush } from '@/lib/push'

export default function ReminderSettings() {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
  const [supported, setSupported] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupported(pushSupported())
    // Reflect current subscription state.
    ;(async () => {
      if (!pushSupported()) return
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setEnabled(!!sub && notificationPermission() === 'granted')
    })()
  }, [])

  async function toggle() {
    setBusy(true); setError(null); setMsg(null)
    try {
      if (!enabled) {
        const res = await enablePush(vapidKey)
        if (!res.ok) { setError(res.error ?? 'Could not enable reminders'); return }
        setEnabled(true); setMsg('Reminders enabled on this device')
      } else {
        await disablePush()
        setEnabled(false); setMsg('Reminders turned off on this device')
      }
    } finally {
      setBusy(false)
    }
  }

  async function testNotification() {
    if (notificationPermission() !== 'granted') { setError('Enable reminders first'); return }
    const reg = await navigator.serviceWorker.getRegistration()
    reg?.showNotification('VitaTrack test', { body: 'Reminders are working on this device 🎉', icon: '/brand/icon.png' } as any)
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900">Medication reminders</h2>
        <p className="text-sm text-gray-500 mt-1">
          Get notified at each dose time and when a medication is running low. Turn on per device.
        </p>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 border border-red-100">{error}</div>}
      {msg && <div className="rounded-xl bg-green-50 text-green-700 text-sm px-4 py-3 border border-green-100">{msg}</div>}

      {!supported ? (
        <p className="text-sm text-amber-600">
          This browser doesn’t support push notifications. Try Chrome or Edge, or install VitaTrack as an app.
        </p>
      ) : !vapidKey ? (
        <p className="text-sm text-amber-600">
          Reminders aren’t configured on the server yet (missing push key). In-app reminders still work while VitaTrack is open.
        </p>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {enabled ? 'Reminders are on for this device' : 'Reminders are off'}
          </span>
          <button onClick={toggle} disabled={busy}
            className={enabled ? 'btn-secondary text-sm' : 'btn-primary text-sm'}>
            {busy ? '…' : enabled ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}

      {enabled && (
        <button onClick={testNotification} className="text-brand-900 text-sm font-semibold">Send a test notification</button>
      )}
    </div>
  )
}
