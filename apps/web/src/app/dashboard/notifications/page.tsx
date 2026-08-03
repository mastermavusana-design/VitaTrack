import { createServerClient } from '@/lib/supabase'
import { formatTime } from '@vitatrack/shared'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notifications — VitaTrack' }
export const dynamic = 'force-dynamic'

type NotifKind = 'refill' | 'missed' | 'reminder'
type NotifItem = {
  id: string
  kind: NotifKind
  icon: string
  title: string
  subtitle: string
  accent: string
  href: string
}

/**
 * Notifications inbox — web parity with the mobile notifications screen.
 * VitaTrack has no dedicated notifications table, so this aggregates the
 * actionable signals the app already tracks: low-supply refill alerts and
 * today's missed / pending doses, prioritised.
 */
export default async function NotificationsPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  // Resolve target profile (caregiver → owner)
  let targetProfileId = session.user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id')
    .eq('invitee_id', session.user.id)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()
  if (membership) targetProfileId = (membership as any).owner_id

  // Start of today in SAST (UTC+2, no DST) — the app's default clock.
  const nowSast = new Date(Date.now() + 2 * 3600 * 1000)
  const startTodayUtc = new Date(
    Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate()) - 2 * 3600 * 1000,
  )

  const [{ data: meds }, { data: doses }] = await Promise.all([
    supabase
      .from('medications')
      .select('id, name, pill_count, refill_threshold')
      .eq('profile_id', targetProfileId)
      .eq('is_active', true),
    supabase
      .from('dose_logs')
      .select('id, medication_id, scheduled_at, status, medication:medications(name)')
      .eq('profile_id', targetProfileId)
      .in('status', ['pending', 'missed'])
      .gte('scheduled_at', startTodayUtc.toISOString())
      .order('scheduled_at', { ascending: true }),
  ])

  const items: NotifItem[] = []

  // 1. Low-supply refill alerts (critical first).
  const refills = (meds ?? []).filter(
    (m: any) => m.pill_count != null && m.refill_threshold != null && m.pill_count <= m.refill_threshold,
  )
  refills.sort((a: any, b: any) => a.pill_count - b.pill_count)
  for (const m of refills as any[]) {
    const critical = m.pill_count <= 5
    items.push({
      id: `refill-${m.id}`,
      kind: 'refill',
      icon: critical ? '⚠️' : '🔄',
      title: `Low supply: ${m.name}`,
      subtitle: `${m.pill_count} left · refill reminder at ${m.refill_threshold}`,
      accent: critical ? '#dc2626' : '#d97706',
      href: `/dashboard/medications/${m.id}`,
    })
  }

  // 2. Missed doses today.
  for (const d of (doses ?? []).filter((x: any) => x.status === 'missed') as any[]) {
    items.push({
      id: `missed-${d.id}`,
      kind: 'missed',
      icon: '❗',
      title: `Missed dose: ${d.medication?.name ?? 'Medication'}`,
      subtitle: d.scheduled_at ? `Scheduled ${formatTime(d.scheduled_at)}` : 'Scheduled today',
      accent: '#dc2626',
      href: `/dashboard/medications/${d.medication_id}`,
    })
  }

  // 3. Pending / upcoming doses today.
  for (const d of (doses ?? []).filter((x: any) => x.status === 'pending') as any[]) {
    items.push({
      id: `pending-${d.id}`,
      kind: 'reminder',
      icon: '💊',
      title: `Dose due: ${d.medication?.name ?? 'Medication'}`,
      subtitle: d.scheduled_at ? `Due at ${formatTime(d.scheduled_at)}` : 'Due today',
      accent: '#1A569B',
      href: `/dashboard/medications/${d.medication_id}`,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900">Notifications</h1>
        {items.length > 0 && (
          <span className="badge bg-brand-50 text-brand-900">{items.length}</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <span className="text-4xl">🔔</span>
          <p className="mt-2 font-medium text-gray-500">You&apos;re all caught up</p>
          <p className="text-sm">No refill alerts or outstanding doses right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: item.accent + '1A' }}
              >
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 truncate">{item.title}</p>
                <p className="text-sm text-gray-500 truncate">{item.subtitle}</p>
              </div>
              <span className="text-gray-300 text-lg shrink-0">›</span>
            </a>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Reminders are also delivered as push notifications. Manage them in Settings.
      </p>
    </div>
  )
}
