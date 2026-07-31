import { createServerClient } from '@/lib/supabase'
import { formatDate } from '@vitatrack/shared'
import type { Metadata } from 'next'
import AddVisitButton from '@/components/records/AddVisitButton'
import AddDocumentButton from '@/components/records/AddDocumentButton'

export const metadata: Metadata = { title: 'Records — VitaTrack' }
export const revalidate = 60

const VISIT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  gp:         { bg: '#EFF6FF', text: '#1D4ED8' },
  specialist:  { bg: '#D1FAE5', text: '#065F46' },
  emergency:   { bg: '#FEE2E2', text: '#991B1B' },
  dentist:     { bg: '#FEF3C7', text: '#92400E' },
  pharmacy:    { bg: '#F3E8FF', text: '#6B21A8' },
  other:       { bg: '#F3F4F6', text: '#374151' },
}

const DOC_CAT_ICONS: Record<string, string> = {
  lab_result:   '🔬',
  prescription: '💊',
  imaging:      '🩻',
  report:       '📋',
  other:        '📎',
}

export default async function RecordsPage() {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  let targetProfileId = session.user.id
  const { data: membership } = await supabase
    .from('family_members')
    .select('owner_id, owner:profiles!family_members_owner_id_fkey(full_name)')
    .eq('invitee_id', session.user.id)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle()
  if (membership) targetProfileId = (membership as any).owner_id

  const [{ data: visits }, { data: documents }] = await Promise.all([
    supabase
      .from('doctor_visits')
      .select('*')
      .eq('profile_id', targetProfileId)
      .order('visit_date', { ascending: false })
      .limit(50),
    supabase
      .from('health_documents')
      .select('*')
      .eq('profile_id', targetProfileId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const visitList  = visits  ?? []
  const docList    = documents ?? []
  const isCaregiver = !!membership

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900">Health Records</h1>
        {isCaregiver ? (
          <span className="badge bg-blue-100 text-blue-700 text-sm px-3 py-1">
            👁 Read-only caregiver view
          </span>
        ) : (
          <AddVisitButton />
        )}
      </div>

      {/* Doctor visits */}
      <section>
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
          Doctor Visits ({visitList.length})
        </h2>

        {visitList.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">
            <span className="text-4xl">🏥</span>
            <p className="mt-2 text-sm">No visits recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visitList.map((v: any) => {
              const tc = VISIT_TYPE_COLORS[v.visit_type ?? 'other'] ?? VISIT_TYPE_COLORS.other
              const visitDate = new Date(v.visit_date)

              return (
                <div key={v.id} className="card flex overflow-hidden">
                  {/* Date column */}
                  <div className="w-16 bg-brand-900 flex flex-col items-center justify-center py-3 shrink-0">
                    <span className="text-xs font-black text-blue-200 uppercase tracking-wide">
                      {visitDate.toLocaleString('default', { month: 'short' })}
                    </span>
                    <span className="text-2xl font-black text-white leading-tight">
                      {visitDate.getDate()}
                    </span>
                    <span className="text-xs text-blue-300">{visitDate.getFullYear()}</span>
                  </div>

                  {/* Body */}
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="font-black text-gray-900">{v.provider_name}</p>
                      <span
                        className="badge text-xs px-2.5 py-1 shrink-0"
                        style={{ backgroundColor: tc.bg, color: tc.text }}
                      >
                        {(v.visit_type ?? 'other').toUpperCase()}
                      </span>
                    </div>

                    {v.facility && (
                      <p className="text-sm text-gray-500 mb-1">🏥 {v.facility}</p>
                    )}
                    {v.reason && (
                      <p className="text-sm text-gray-600 line-clamp-2">{v.reason}</p>
                    )}
                    {v.diagnosis && (
                      <p className="text-sm text-gray-500 mt-1">
                        <span className="font-semibold">Dx:</span> {v.diagnosis}
                      </p>
                    )}
                    {v.follow_up_date && (
                      <p className="text-xs text-amber-600 font-semibold mt-2">
                        📅 Follow-up: {formatDate(v.follow_up_date)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Documents */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Documents ({docList.length})
          </h2>
          {!isCaregiver && (
            <div className="flex items-center gap-2">
              <a href="/dashboard/scan?artifact=prescription" className="btn-secondary text-sm whitespace-nowrap">📷 Scan</a>
              <AddDocumentButton />
            </div>
          )}
        </div>

        {docList.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">
            <span className="text-4xl">📄</span>
            <p className="mt-2 text-sm">No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="card divide-y divide-gray-100">
            {docList.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-xl w-7 text-center">
                  {DOC_CAT_ICONS[doc.category] ?? '📎'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{doc.file_name}</p>
                  <p className="text-xs text-gray-400 capitalize">
                    {doc.category.replace('_', ' ')} · {formatDate(doc.created_at)}
                  </p>
                  {doc.notes && (
                    <p className="text-xs text-gray-400 italic truncate">{doc.notes}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {doc.file_type?.includes('pdf') ? 'PDF' : doc.file_type?.split('/')[1]?.toUpperCase() ?? 'FILE'}
                </span>
              </div>
            ))}
          </div>
        )}

        {isCaregiver && docList.length > 0 && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            Document download links are not available in the caregiver view for privacy reasons.
          </p>
        )}
      </section>
    </div>
  )
}
