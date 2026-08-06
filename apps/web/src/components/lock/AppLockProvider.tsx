'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import {
  getConfig, markActive, shouldBeLocked, verifyPin, unlockWithPasskey,
  type AppLockConfig,
} from '@/lib/appLock'
import { clearOfflineData } from '@/lib/pwa'

/**
 * Wraps the dashboard. When App Lock is enabled and the device has been idle past
 * its threshold, it renders a full-screen unlock overlay over the content.
 * Convenience lock only — the Supabase session is untouched (parity with mobile).
 */
export default function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [cfg, setCfg] = useState<AppLockConfig>({ enabled: false, idleMinutes: 5 })
  const [locked, setLocked] = useState(false)
  const activityThrottle = useRef(0)

  const refreshConfig = useCallback(() => {
    const c = getConfig()
    setCfg(c)
    if (c.enabled && shouldBeLocked(c)) setLocked(true)
    if (!c.enabled) setLocked(false)
  }, [])

  // Initial load + react to settings changes and an explicit "lock now" event.
  useEffect(() => {
    refreshConfig()
    setReady(true)
    const onChange = () => refreshConfig()
    const onLockNow = () => {
      if (getConfig().enabled) setLocked(true)
    }
    window.addEventListener('vitatrack:appLock:changed', onChange)
    window.addEventListener('vitatrack:appLock:lockNow', onLockNow)
    return () => {
      window.removeEventListener('vitatrack:appLock:changed', onChange)
      window.removeEventListener('vitatrack:appLock:lockNow', onLockNow)
    }
  }, [refreshConfig])

  // Track activity (throttled) while unlocked; poll for idle; lock on tab-return.
  useEffect(() => {
    if (!cfg.enabled) return

    const onActivity = () => {
      if (locked) return
      const now = Date.now()
      if (now - activityThrottle.current > 5000) {
        activityThrottle.current = now
        markActive()
      }
    }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    const check = () => { if (!locked && shouldBeLocked()) setLocked(true) }
    const interval = window.setInterval(check, 15000)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [cfg.enabled, locked])

  const onUnlocked = useCallback(() => {
    markActive()
    activityThrottle.current = Date.now()
    setLocked(false)
  }, [])

  // Avoid flashing protected content before we know the lock state.
  if (!ready) return <div className="min-h-screen bg-gray-50" />

  return (
    <>
      {children}
      {locked && <LockOverlay hasPasskey={!!cfg.passkeyId} onUnlocked={onUnlocked} />}
    </>
  )
}

function LockOverlay({ hasPasskey, onUnlocked }: { hasPasskey: boolean; onUnlocked: () => void }) {
  const supabase = createClientComponentClient()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tryPasskey = useCallback(async () => {
    setBusy(true)
    setError(null)
    const ok = await unlockWithPasskey()
    setBusy(false)
    if (ok) onUnlocked()
    else setError('Passkey unlock cancelled or failed.')
  }, [onUnlocked])

  // Auto-prompt the passkey on mount if one is registered.
  useEffect(() => {
    if (hasPasskey) void tryPasskey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const ok = await verifyPin(pin)
    setBusy(false)
    if (ok) { setPin(''); onUnlocked() }
    else { setError('Incorrect PIN'); setPin('') }
  }

  const signOut = async () => {
    await clearOfflineData()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs text-center">
        <div className="text-5xl mb-4" aria-hidden>🔒</div>
        <h1 className="text-2xl font-black">VitaTrack is locked</h1>
        <p className="text-blue-200/80 text-sm mt-1 mb-8">Enter your PIN to continue</p>

        <form onSubmit={submitPin} className="space-y-3">
          <input
            type="password"
            inputMode="numeric"
            autoFocus={!hasPasskey}
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="••••"
            aria-label="PIN"
            className="w-full text-center tracking-[0.5em] text-2xl rounded-2xl bg-white/10 border border-white/25 py-4 text-white placeholder:text-white/40 focus:outline-none focus:border-white/60"
          />
          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="w-full bg-white text-blue-900 font-bold rounded-2xl py-3.5 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>

        {hasPasskey && (
          <button
            onClick={tryPasskey}
            disabled={busy}
            className="mt-3 w-full border border-white/40 rounded-2xl py-3 font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            👆 Use device biometrics
          </button>
        )}

        {error && <p className="text-red-300 text-sm mt-4">{error}</p>}

        <button onClick={signOut} className="mt-8 text-blue-200/70 text-sm hover:text-white transition-colors">
          Sign out
        </button>
      </div>
    </div>
  )
}
