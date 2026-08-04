import CaregiversClient from './CaregiversClient'

/**
 * Presentational family-sharing page. Fed by either the SSR read (flag off) or
 * the client-direct read wrapper (flag on).
 */
export default function CaregiversView({
  invites,
  userId,
  caregiverOf,
  ownerName,
  notice,
}: {
  invites: any[]
  userId: string
  caregiverOf: any | null
  ownerName: string | null
  notice?: string | null
}) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Family Sharing</h1>
        <p className="text-sm text-gray-500 mt-1">
          Invite a trusted person to view your health data and receive missed-dose alerts on your behalf.
        </p>
      </div>

      {notice && (
        <div className="rounded-xl bg-amber-50 text-amber-700 text-sm px-4 py-2 border border-amber-100">{notice}</div>
      )}

      {/* If this user is themselves a caregiver */}
      {caregiverOf && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-sm font-semibold text-blue-800">
            👁 You are viewing as a caregiver
          </p>
          <p className="text-sm text-blue-600 mt-1">
            You have caregiver access to <strong>{ownerName ?? 'their account'}</strong>.
            The dashboard shows their data.
          </p>
        </div>
      )}

      <CaregiversClient invites={invites as any[]} userId={userId} />
    </div>
  )
}
