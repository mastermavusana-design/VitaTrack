'use client'

import { useState, useTransition } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { clearOfflineData } from '@/lib/pwa'

interface Profile {
  full_name: string | null
  date_of_birth: string | null
  blood_type: string | null
  phone: string | null
  timezone: string | null
  popia_consent: boolean | null
  popia_consent_at: string | null
  preferred_units: {
    glucose?: string
    weight?: string
    temperature?: string
  } | null
}

interface Props {
  profile: Profile | null
  email: string
  userId: string
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']
const TIMEZONES   = ['Africa/Johannesburg', 'Africa/Harare', 'UTC', 'Europe/London', 'America/New_York']

export default function SettingsClient({ profile, email, userId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Form state
  const [fullName,   setFullName]   = useState(profile?.full_name ?? '')
  const [dob,        setDob]        = useState(profile?.date_of_birth ?? '')
  const [bloodType,  setBloodType]  = useState(profile?.blood_type ?? 'Unknown')
  const [phone,      setPhone]      = useState(profile?.phone ?? '')
  const [timezone,   setTimezone]   = useState(profile?.timezone ?? 'Africa/Johannesburg')
  const [glucoseUnit, setGlucoseUnit] = useState(profile?.preferred_units?.glucose ?? 'mmol/L')
  const [weightUnit,  setWeightUnit]  = useState(profile?.preferred_units?.weight ?? 'kg')
  const [tempUnit,    setTempUnit]    = useState(profile?.preferred_units?.temperature ?? '°C')

  const supabase = createClientComponentClient()

  const handleSave = async () => {
    setError(null)
    setSaved(false)
    startTransition(() => {
      void (async () => {
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert({
            id:             userId,
            full_name:      fullName.trim(),
            date_of_birth:  dob || null,
            blood_type:     bloodType,
            phone:          phone.trim() || null,
            timezone,
            preferred_units: {
              glucose:     glucoseUnit,
              weight:      weightUnit,
              temperature: tempUnit,
            },
          })
        if (upsertError) {
          setError(upsertError.message)
        } else {
          setSaved(true)
          router.refresh()
          setTimeout(() => setSaved(false), 3000)
        }
      })()
    })
  }

  const handleExport = async () => {
    setIsExporting(true)
    const { error } = await supabase.functions.invoke('data-export', {})
    setIsExporting(false)
    if (error) {
      setError('Export failed: ' + error.message)
    } else {
      alert('Export requested. You will receive your data via email within 24 hours.')
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true)
    await supabase.functions.invoke('request-deletion', {})
    await clearOfflineData()
    await supabase.auth.signOut()
    router.push('/?deleted=1')
  }

  const consentDate = profile?.popia_consent_at
    ? new Date(profile.popia_consent_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="space-y-6">

      {/* ── Profile ── */}
      <section className="card p-6 space-y-4">
        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Profile</h2>

        <div className="flex items-center gap-4 pb-2 border-b border-gray-100">
          <div className="w-14 h-14 rounded-full bg-brand-900 flex items-center justify-center text-white text-xl font-black select-none">
            {(fullName || email).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-gray-900">{fullName || 'Your Name'}</p>
            <p className="text-sm text-gray-400">{email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name" required>
            <input
              className="input"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Thabo Nkosi"
            />
          </Field>

          <Field label="Date of Birth">
            <input
              type="date"
              className="input"
              value={dob}
              onChange={e => setDob(e.target.value)}
            />
          </Field>

          <Field label="Blood Type">
            <select className="input" value={bloodType} onChange={e => setBloodType(e.target.value)}>
              {BLOOD_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>

          <Field label="Phone">
            <input
              className="input"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+27 82 123 4567"
              type="tel"
            />
          </Field>

          <Field label="Timezone">
            <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>
        </div>
      </section>

      {/* ── Preferred Units ── */}
      <section className="card p-6 space-y-4">
        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Measurement Units</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Glucose">
            <select className="input" value={glucoseUnit} onChange={e => setGlucoseUnit(e.target.value)}>
              <option value="mmol/L">mmol/L (South Africa)</option>
              <option value="mg/dL">mg/dL (US)</option>
            </select>
          </Field>
          <Field label="Weight">
            <select className="input" value={weightUnit} onChange={e => setWeightUnit(e.target.value)}>
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </select>
          </Field>
          <Field label="Temperature">
            <select className="input" value={tempUnit} onChange={e => setTempUnit(e.target.value)}>
              <option value="°C">°C (Celsius)</option>
              <option value="°F">°F (Fahrenheit)</option>
            </select>
          </Field>
        </div>
      </section>

      {/* ── Save button ── */}
      <div className="flex items-center gap-3">
        <button
          className="btn-primary px-8"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-600 font-semibold">✓ Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* ── Privacy & POPIA ── */}
      <section className="card p-6 space-y-4">
        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Privacy & POPIA</h2>

        {consentDate ? (
          <p className="text-sm text-gray-600">
            ✅ You provided data processing consent on <strong>{consentDate}</strong>. VitaTrack stores
            all your health data in South Africa (AWS af-south-1, Cape Town) as required by POPIA.
          </p>
        ) : (
          <p className="text-sm text-gray-500">Consent not yet recorded. It will be captured on next sign-in.</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div>
            <p className="text-sm font-semibold text-gray-800">📦 Export My Data</p>
            <p className="text-xs text-gray-500 mt-0.5">All vitals, medications, visits, and documents emailed as a ZIP within 24 hours.</p>
          </div>
          <button
            className="btn-secondary text-sm px-4"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? 'Requesting…' : 'Request Export'}
          </button>
        </div>
      </section>

      {/* ── Danger Zone ── */}
      <section className="card p-6 space-y-4 border-red-200 bg-red-50">
        <h2 className="text-sm font-black text-red-400 uppercase tracking-widest">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-red-700">🗑 Delete My Account</p>
            <p className="text-xs text-red-500 mt-0.5">Permanently removes all your health data. Cannot be undone.</p>
          </div>
          {!showDeleteConfirm ? (
            <button
              className="text-sm font-semibold text-red-600 border border-red-300 rounded-lg px-4 py-2 hover:bg-red-100 transition-colors"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Account
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                className="text-sm font-semibold text-gray-600 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-100"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="text-sm font-semibold text-white bg-red-600 rounded-lg px-3 py-2 hover:bg-red-700"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
              >
                {isDeletingAccount ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
