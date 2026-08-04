import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import SettingsClient from './SettingsClient'
import SettingsLoader from './SettingsLoader'
import ReminderSettings from '@/components/reminders/ReminderSettings'
import AppLockSettings from '@/components/lock/AppLockSettings'

export const metadata: Metadata = { title: 'Settings — VitaTrack' }

const CLIENT_DIRECT = process.env.NEXT_PUBLIC_CLIENT_DIRECT === '1'

export default async function SettingsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const Header = (
    <div>
      <h1 className="text-2xl font-black text-gray-900">Settings</h1>
      <p className="text-sm text-gray-500 mt-1">Manage your profile, units, and account preferences.</p>
    </div>
  )

  // ── R1 Phase B: client-direct read (flagged; profiles read stays in af-south-1). ──
  if (CLIENT_DIRECT) {
    return (
      <div className="space-y-6 max-w-2xl">
        {Header}
        <SettingsLoader />
      </div>
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div className="space-y-6 max-w-2xl">
      {Header}
      <SettingsClient
        profile={profile ?? null}
        email={user.email ?? ''}
        userId={user.id}
      />
      <ReminderSettings />
      <AppLockSettings
        userId={user.id}
        userName={(profile as any)?.full_name ?? user.email ?? 'VitaTrack user'}
      />
    </div>
  )
}
