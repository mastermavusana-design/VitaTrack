import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import DashboardShell from '@/components/layout/DashboardShell'
import InAppReminders from '@/components/reminders/InAppReminders'
import AppLockProvider from '@/components/lock/AppLockProvider'
import PwaBootstrap from '@/components/pwa/PwaBootstrap'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verify this user is a caregiver (has at least one accepted family_members row)
  const { data: membership } = await supabase
    .from('family_members')
    .select('id, owner_id')
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()

  // Also allow owners to view their own dashboard
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <AppLockProvider>
      <DashboardShell
        userEmail={user.email ?? ''}
        userName={(profile as any)?.full_name ?? user.email ?? 'User'}
        isCaregiver={!!membership}
      >
        {children}
      </DashboardShell>
      <InAppReminders />
      <PwaBootstrap />
    </AppLockProvider>
  )
}
