import type { Dependant } from '@vitatrack/shared'
import { ageInDays } from '@vitatrack/shared'
import AddChildButton from './AddChildButton'

/** Human age label from a date of birth, e.g. "4 mo", "2 yr 3 mo", "6 yr". */
function formatAge(dobISO: string): string {
  const days = ageInDays(dobISO, new Date().toISOString().slice(0, 10))
  if (days < 0) return '—'
  const totalMonths = Math.floor(days / 30.4375)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years === 0) return `${totalMonths} mo`
  if (months === 0) return `${years} yr`
  return `${years} yr ${months} mo`
}

const SEX_LABEL: Record<string, string> = { male: 'Boy', female: 'Girl' }

export default function ChildrenView({
  dependants,
  notice,
}: {
  dependants: Dependant[]
  notice?: string | null
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Children</h1>
          <p className="text-sm text-gray-500">Road to Health records for the children you care for.</p>
        </div>
        <AddChildButton />
      </div>

      {notice && (
        <div className="rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3 border border-amber-100">
          {notice}
        </div>
      )}

      {dependants.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
          <p className="text-gray-700 font-medium">No children yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Add a child to start their immunisation schedule, growth chart and milestones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dependants.map((d) => (
            <a
              key={d.id}
              href={`/dashboard/children/${d.id}`}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-900 flex items-center justify-center font-bold text-lg shrink-0">
                {d.full_name.trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{d.full_name}</p>
                <p className="text-sm text-gray-500">
                  {formatAge(d.date_of_birth)}
                  {d.sex ? ` · ${SEX_LABEL[d.sex] ?? d.sex}` : ''}
                  {d.rthb_number ? ` · RtHB ${d.rthb_number}` : ''}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
