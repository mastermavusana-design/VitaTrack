'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface InviteClientProps {
  ownerName: string
  role: string
  isLoggedIn: boolean
  token: string
}

export default function InviteClient({ ownerName, role, isLoggedIn, token }: InviteClientProps) {
  const router = useRouter()
  const supabase = createClientComponentClient()

  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAccept = async () => {
    if (!isLoggedIn) {
      // Redirect to login with return URL
      router.push(`/login?returnTo=/invite/${token}`)
      return
    }

    setIsAccepting(true)
    setError(null)

    // Claim the invite atomically: sets invitee_id = auth.uid() and
    // status = 'accepted' inside a SECURITY DEFINER RPC.
    const { error: acceptError } = await supabase
      .rpc('accept_family_invite', { p_token: token })

    setIsAccepting(false)

    if (acceptError) {
      setError(acceptError.message)
      return
    }

    router.push('/dashboard?welcomed=1')
  }

  return (
    <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center">
      {/* Header */}
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">👨‍👩‍👧</span>
      </div>

      <h1 className="text-2xl font-black text-gray-900 mb-2">
        Family Care Invitation
      </h1>

      <p className="text-gray-600 mb-6 leading-relaxed">
        <span className="font-semibold text-gray-900">{ownerName}</span> has invited you
        to be their caregiver on VitaTrack. You'll be able to view their medication
        adherence and vitals, and receive missed-dose alerts.
      </p>

      {/* What you can see */}
      <div className="bg-blue-50 rounded-2xl p-4 mb-6 text-left space-y-2">
        <p className="text-xs font-black text-blue-700 uppercase tracking-widest mb-3">
          As caregiver you'll see:
        </p>
        {[
          '✅ Medication schedule & adherence',
          '📊 Vitals history (BP, glucose, weight)',
          '🔔 Missed-dose alerts via push notification',
          '⚠️ Refill alerts when supply is low',
          ...(role === 'dose_logger' ? ['💊 Log doses on their behalf'] : []),
        ].map((item, i) => (
          <p key={i} className="text-sm text-gray-700">{item}</p>
        ))}
        <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-blue-200">
          {role === 'dose_logger'
            ? '💊 Dose Logger access — you can record doses, but cannot edit their other health records.'
            : '🔒 Read-only access. You cannot edit their health records.'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      <button
        onClick={handleAccept}
        disabled={isAccepting}
        className="w-full btn-primary py-4 text-base mb-3 disabled:opacity-60"
      >
        {isAccepting ? 'Accepting…' : isLoggedIn ? 'Accept Invitation' : 'Sign In to Accept'}
      </button>

      <p className="text-xs text-gray-400">
        By accepting, you agree to VitaTrack's{' '}
        <a href="/privacy" className="underline hover:text-gray-600">Privacy Policy</a>.
        You can be removed at any time by {ownerName}.
      </p>
    </div>
  )
}
