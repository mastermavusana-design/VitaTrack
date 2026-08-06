'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

interface Invite {
  id: string
  status: 'pending' | 'accepted' | 'revoked'
  invitee_email: string | null
  invite_token: string | null
  invited_at: string
  accepted_at: string | null
  role: 'viewer' | 'dose_logger'
}

interface Props {
  invites: Invite[]
  userId: string
}

export default function CaregiversClient({ invites: initial }: Props) {
  const router = useRouter()
  const [invites, setInvites] = useState<Invite[]>(initial)
  const [email, setEmail]     = useState('')
  const [role, setRole]       = useState<'viewer' | 'dose_logger'>('viewer')
  const [isSending, setIsSending]   = useState(false)
  const [isRevoking, setIsRevoking] = useState<string | null>(null)
  const [sendError, setSendError]   = useState<string | null>(null)
  const [sent, setSent]             = useState(false)

  const supabase = createClientComponentClient()

  const activeCount = invites.filter(i => i.status === 'accepted').length

  const handleInvite = async () => {
    if (!email.includes('@')) { setSendError('Enter a valid email address.'); return }
    if (activeCount >= 1) { setSendError('MVP allows 1 active caregiver. Revoke the current one first.'); return }
    setSendError(null)
    setIsSending(true)
    const { error } = await supabase.functions.invoke('send-family-invite', {
      body: { invitee_email: email.trim().toLowerCase(), role },
    })
    setIsSending(false)
    if (error) {
      setSendError(error.message)
    } else {
      setSent(true)
      setEmail('')
      setTimeout(() => setSent(false), 4000)
      router.refresh()
    }
  }

  const handleRevoke = async (invite: Invite) => {
    if (!confirm(`Remove ${invite.invitee_email ?? 'this caregiver'}? They will lose access immediately.`)) return
    setIsRevoking(invite.id)
    await supabase
      .from('family_members')
      .update({ status: 'revoked' })
      .eq('id', invite.id)
    setIsRevoking(null)
    setInvites(prev => prev.map(i => i.id === invite.id ? { ...i, status: 'revoked' } : i))
    router.refresh()
  }

  const handleResend = async (invite: Invite) => {
    const { error } = await supabase.functions.invoke('send-family-invite', {
      body: { invitee_email: invite.invitee_email, role: invite.role },
    })
    if (!error) alert(`Invite resent to ${invite.invitee_email}.`)
  }

  const activeInvites  = invites.filter(i => i.status !== 'revoked')
  const revokedInvites = invites.filter(i => i.status === 'revoked')

  return (
    <div className="space-y-6">

      {/* Info box */}
      <div className="card p-4 bg-blue-50 border-blue-200 space-y-2">
        <p className="text-sm font-semibold text-blue-800">How it works</p>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Your caregiver receives an email invite and must create a VitaTrack account.</li>
          <li>• They can view your dashboard in read-only mode and receive missed-dose alerts.</li>
          <li>• A <strong>Dose Logger</strong> can additionally mark your doses as taken on your behalf.</li>
          <li>• You can revoke access at any time.</li>
          <li>• MVP limit: 1 active caregiver per account.</li>
        </ul>
      </div>

      {/* Invite form */}
      {activeCount === 0 && (
        <section className="card p-6 space-y-4">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">Invite a Caregiver</h2>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                className="input w-full"
                placeholder="caregiver@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Role</label>
              <div className="flex gap-3">
                {(['viewer', 'dose_logger'] as const).map(r => (
                  <label key={r} className={`flex-1 flex items-start gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                    role === r ? 'border-brand-900 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-gray-800">{r === 'viewer' ? '👁 Viewer' : '💊 Dose Logger'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {r === 'viewer' ? 'Read-only access to your dashboard' : 'Can also log doses on your behalf'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {sendError && <p className="text-sm text-red-600">{sendError}</p>}
            {sent      && <p className="text-sm text-green-600 font-semibold">✓ Invite sent successfully.</p>}

            <button
              className="btn-primary w-full py-3"
              onClick={handleInvite}
              disabled={isSending}
            >
              {isSending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </section>
      )}

      {/* Active / pending invites */}
      {activeInvites.length > 0 && (
        <section className="card p-6 space-y-4">
          <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest">
            {activeCount > 0 ? 'Active Caregiver' : 'Pending Invites'}
          </h2>

          <div className="space-y-3">
            {activeInvites.map(invite => (
              <div key={invite.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-brand-900 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                  {(invite.invitee_email ?? '?').charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{invite.invitee_email}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {invite.role === 'dose_logger' ? '💊 Dose Logger' : '👁 Viewer'}
                    {' · '}
                    {invite.accepted_at
                      ? `Accepted ${new Date(invite.accepted_at).toLocaleDateString('en-ZA')}`
                      : `Invited ${new Date(invite.invited_at).toLocaleDateString('en-ZA')}`}
                  </p>
                </div>

                {/* Status badge */}
                <StatusBadge status={invite.status} />

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  {invite.status === 'pending' && (
                    <button
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      onClick={() => handleResend(invite)}
                    >
                      Resend
                    </button>
                  )}
                  <button
                    className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
                    onClick={() => handleRevoke(invite)}
                    disabled={isRevoking === invite.id}
                  >
                    {isRevoking === invite.id ? '…' : 'Revoke'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {activeCount === 0 && (
            <div className="pt-2">
              <button
                className="btn-primary w-full py-3"
                onClick={() => { /* show form */ }}
              >
                + Invite a Caregiver
              </button>
            </div>
          )}
        </section>
      )}

      {/* Revoked history */}
      {revokedInvites.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Access History</p>
          {revokedInvites.map(invite => (
            <div key={invite.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 opacity-60">
              <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                {(invite.invitee_email ?? '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500 truncate">{invite.invitee_email}</p>
                <p className="text-xs text-gray-400">
                  Revoked · Invited {new Date(invite.invited_at).toLocaleDateString('en-ZA')}
                </p>
              </div>
              <StatusBadge status="revoked" />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: 'pending' | 'accepted' | 'revoked' }) {
  const map = {
    accepted: 'bg-green-100 text-green-700',
    pending:  'bg-yellow-100 text-yellow-700',
    revoked:  'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  )
}
