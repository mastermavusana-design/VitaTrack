'use client'

import { useEffect, useState } from 'react'
import {
  getConfig, saveConfig, setPin, disableLock, setIdleMinutes, isValidPin,
  passkeySupported, registerPasskey, removePasskey,
  type AppLockConfig,
} from '@/lib/appLock'

const IDLE_OPTIONS = [1, 5, 15, 30]

/** App Lock settings — web parity with the mobile biometric lock. */
export default function AppLockSettings({ userId, userName }: { userId: string; userName: string }) {
  const [cfg, setCfg] = useState<AppLockConfig | null>(null)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showPinForm, setShowPinForm] = useState(false)
  const supportsPasskey = passkeySupported()

  const reload = () => setCfg(getConfig())
  useEffect(() => { reload() }, [])

  const flash = (m: string) => { setMsg(m); setErr(null); setTimeout(() => setMsg(null), 2500) }
  const fail = (m: string) => { setErr(m); setMsg(null) }

  const savePin = async () => {
    if (!isValidPin(pin1)) return fail('PIN must be 4–8 digits.')
    if (pin1 !== pin2) return fail('PINs do not match.')
    await setPin(pin1)
    setPin1(''); setPin2(''); setShowPinForm(false); reload(); flash('App Lock enabled.')
  }

  const turnOff = () => {
    disableLock(); reload(); setShowPinForm(false); flash('App Lock disabled.')
  }

  const onIdleChange = (m: number) => { setIdleMinutes(m); reload() }

  const addPasskey = async () => {
    try {
      const ok = await registerPasskey(userId, userName)
      if (ok) { reload(); flash('Passkey registered.') }
      else fail('Could not register passkey.')
    } catch {
      fail('Passkey registration was cancelled.')
    }
  }

  const dropPasskey = () => { removePasskey(); reload(); flash('Passkey removed.') }

  const lockNow = () => window.dispatchEvent(new CustomEvent('vitatrack:appLock:lockNow'))

  if (!cfg) return null
  const enabled = cfg.enabled

  return (
    <section className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">App Lock</h2>
        <span className={`badge ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {enabled ? 'On' : 'Off'}
        </span>
      </div>

      <p className="text-sm text-gray-500">
        Require a PIN or device biometrics to reopen the dashboard after a period of inactivity on this
        device. This locks the screen only — it does not sign you out.
      </p>

      {!enabled && !showPinForm && (
        <button className="btn-primary text-sm" onClick={() => setShowPinForm(true)}>
          Enable App Lock
        </button>
      )}

      {showPinForm && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="password" inputMode="numeric" placeholder="New PIN (4–8 digits)"
              value={pin1} onChange={(e) => setPin1(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              type="password" inputMode="numeric" placeholder="Confirm PIN"
              value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-sm" onClick={savePin}>Save PIN</button>
            <button className="btn-secondary text-sm" onClick={() => { setShowPinForm(false); setPin1(''); setPin2(''); setErr(null) }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          {/* Idle timeout */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-800">Auto-lock after</label>
            <select
              value={cfg.idleMinutes}
              onChange={(e) => onIdleChange(Number(e.target.value))}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              {IDLE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>

          {/* Passkey */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Device biometrics</p>
              <p className="text-xs text-gray-500">
                {cfg.passkeyId ? 'Passkey registered (Face ID / Touch ID / Windows Hello).'
                  : supportsPasskey ? 'Add a passkey to unlock with biometrics.'
                  : 'Not supported on this browser.'}
              </p>
            </div>
            {cfg.passkeyId ? (
              <button className="text-sm text-red-600 font-semibold hover:underline" onClick={dropPasskey}>Remove</button>
            ) : (
              <button className="btn-secondary text-sm" onClick={addPasskey} disabled={!supportsPasskey}>Add passkey</button>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn-secondary text-sm" onClick={lockNow}>Lock now</button>
            <button className="btn-secondary text-sm" onClick={() => setShowPinForm(true)}>Change PIN</button>
            <button className="text-sm text-red-600 font-semibold px-3 hover:underline" onClick={turnOff}>Turn off</button>
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-green-600 font-semibold">✓ {msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  )
}
