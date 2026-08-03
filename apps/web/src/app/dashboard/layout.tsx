import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import DashboardNav from '@/components/DashboardNav'
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
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <DashboardNav
          userEmail={user.email ?? ''}
          userName={(profile as any)?.full_name ?? user.email ?? 'User'}
          isCaregiver={!!membership}
          ownerId={membership?.owner_id ?? user.id}
        />
        <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
          {children}
        </main>
        <InAppReminders />
        <PwaBootstrap />
      </div>
    </AppLockProvider>
  )
}
