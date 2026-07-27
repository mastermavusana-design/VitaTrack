import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import type { Metadata } from 'next'
import SettingsClient from './SettingsClient'

export const metadata: Metadata = { title: 'Settings — VitaTrack' }

export default async function SettingsPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle()

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile, units, and account preferences.</p>
      </div>
      <SettingsClient
        profile={profile ?? null}
        email={session.user.email ?? ''}
        userId={session.user.id}
      />
    </div>
  )
}
