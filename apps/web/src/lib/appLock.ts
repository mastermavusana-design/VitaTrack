/**
 * App Lock — web parity with the mobile biometric lock.
 *
 * This is a CONVENIENCE lock that gates the dashboard UI after inactivity; it is
 * NOT a server-side authorization boundary (the Supabase session stays valid the
 * whole time, exactly like the mobile biometric lock). Config + PIN hash live in
 * localStorage on this device only.
 *
 * Unlock options:
 *   • PIN     — 4–8 digits, stored only as a salted SHA-256 hash (Web Crypto).
 *   • Passkey — a platform authenticator (Face ID / Touch ID / Windows Hello) via
 *               WebAuthn. We use the ceremony purely as a local biometric gesture;
 *               success of navigator.credentials.get() is the unlock signal.
 */

const CONFIG_KEY = 'vitatrack.appLock.v1'
const LAST_ACTIVE_KEY = 'vitatrack.appLock.lastActive'

export type AppLockConfig = {
  enabled: boolean
  salt?: string
  hash?: string
  idleMinutes: number
  /** base64url credential id of the registered passkey, if any */
  passkeyId?: string
}

const DEFAULT_CONFIG: AppLockConfig = { enabled: false, idleMinutes: 5 }

/* ─── Config persistence ─────────────────────────────────────────────────── */

export function getConfig(): AppLockConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG }
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppLockConfig>) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(cfg: AppLockConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  // Let the provider (and any open settings UI) react immediately.
  window.dispatchEvent(new CustomEvent('vitatrack:appLock:changed'))
}

export function getLastActive(): number {
  if (typeof window === 'undefined') return Date.now()
  const v = Number(localStorage.getItem(LAST_ACTIVE_KEY))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function markActive(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
}

/* ─── PIN (salted SHA-256 via Web Crypto) ────────────────────────────────── */

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomHex(bytes = 16): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

/** Enable the lock with a PIN. Preserves any existing idle timeout / passkey. */
export async function setPin(pin: string): Promise<void> {
  const salt = randomHex()
  const hash = await hashPin(pin, salt)
  const cfg = getConfig()
  saveConfig({ ...cfg, enabled: true, salt, hash })
}

export async function verifyPin(pin: string): Promise<boolean> {
  const { salt, hash } = getConfig()
  if (!salt || !hash) return false
  const candidate = await hashPin(pin, salt)
  // Constant-ish comparison (length-equal hex strings).
  if (candidate.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}

export function disableLock(): void {
  saveConfig({ ...DEFAULT_CONFIG })
}

export function setIdleMinutes(minutes: number): void {
  saveConfig({ ...getConfig(), idleMinutes: minutes })
}

/* ─── Passkey (WebAuthn platform authenticator) ──────────────────────────── */

function bufToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuf(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}

/** Register a device passkey and enable the lock. Returns true on success. */
export async function registerPasskey(userId: string, userName: string): Promise<boolean> {
  if (!passkeySupported()) return false
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const idBytes = new TextEncoder().encode(userId)
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'VitaTrack', id: window.location.hostname },
      user: { id: idBytes, name: userName, displayName: userName },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null
  if (!cred) return false
  const cfg = getConfig()
  saveConfig({ ...cfg, enabled: true, passkeyId: bufToBase64url(cred.rawId) })
  return true
}

/** Run the passkey ceremony as a local unlock gesture. Returns true on success. */
export async function unlockWithPasskey(): Promise<boolean> {
  const { passkeyId } = getConfig()
  if (!passkeyId || !passkeySupported()) return false
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ type: 'public-key', id: base64urlToBuf(passkeyId) }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!assertion
  } catch {
    return false
  }
}

export function removePasskey(): void {
  const cfg = getConfig()
  saveConfig({ ...cfg, passkeyId: undefined })
}

/** True if the lock is on and the device has been idle past its threshold. */
export function shouldBeLocked(cfg = getConfig()): boolean {
  if (!cfg.enabled) return false
  const last = getLastActive()
  if (!last) return true // enabled but never marked active → lock
  const idleMs = cfg.idleMinutes * 60 * 1000
  return Date.now() - last >= idleMs
}
