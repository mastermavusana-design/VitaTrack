/**
 * Public ICE (In Case of Emergency) page
 * Route: /ice/[token]
 *
 * Accessible without authentication via a unique qr_token.
 * Readable by first responders after scanning a QR code.
 * Only shows fields marked is_public = true.
 *
 * RLS policy in DB: SELECT allowed where qr_token = :token AND is_public = true
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase'
import type { ICEProfile, EmergencyContact } from '@vitatrack/shared'

interface PageProps {
  params: { token: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: 'Emergency Health Profile — VitaTrack',
    description: 'In Case of Emergency — medical information for first responders',
    robots: 'noindex, nofollow', // Don't index ICE pages
  }
}

export default async function ICEPage({ params }: PageProps) {
  const { token } = params
  const supabase = createPublicClient()

  const { data: ice, error } = await supabase
    .from('ice_profiles')
    .select('*')
    .eq('qr_token', token)
    .eq('is_public', true)
    .maybeSingle()

  if (error || !ice) notFound()

  const iceProfile = ice as ICEProfile

  return (
    <div className="min-h-screen bg-red-50">
      {/* Emergency header */}
      <div className="bg-red-600 text-white px-4 py-5 text-center">
        <div className="text-3xl mb-1">🆘</div>
        <h1 className="text-xl font-black tracking-wide uppercase">IN CASE OF EMERGENCY</h1>
        <p className="text-red-200 text-sm mt-1">This health profile was prepared by the patient</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Blood type + DNR + Donor badges */}
        <div className="flex flex-wrap gap-2">
          {iceProfile.blood_type && (
            <span className="bg-red-100 text-red-700 font-bold text-sm px-4 py-2 rounded-xl border border-red-300">
              🩸 Blood Type: {iceProfile.blood_type}
            </span>
          )}
          {iceProfile.organ_donor && (
            <span className="bg-amber-100 text-amber-700 font-bold text-sm px-4 py-2 rounded-xl border border-amber-300">
              💚 Organ Donor
            </span>
          )}
          {iceProfile.do_not_resuscitate && (
            <span className="bg-red-200 text-red-800 font-black text-sm px-4 py-2 rounded-xl border-2 border-red-600">
              ⚠️ DNR ON FILE
            </span>
          )}
        </div>

        {/* Allergies */}
        {iceProfile.allergies?.length ? (
          <div className="card p-5 border-red-300 bg-red-50">
            <h2 className="text-xs font-black uppercase tracking-widest text-red-600 mb-3">⚠️ Allergies</h2>
            <div className="flex flex-wrap gap-2">
              {iceProfile.allergies.map((a, i) => (
                <span key={i} className="bg-red-200 text-red-800 font-semibold text-sm px-3 py-1 rounded-lg">
                  {a}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Medical Conditions */}
        {iceProfile.conditions?.length ? (
          <div className="card p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">🏥 Medical Conditions</h2>
            <div className="flex flex-wrap gap-2">
              {iceProfile.conditions.map((c, i) => (
                <span key={i} className="bg-blue-100 text-blue-800 font-semibold text-sm px-3 py-1 rounded-lg">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Medications */}
        {iceProfile.medications?.length ? (
          <div className="card p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">💊 Current Medications</h2>
            <ul className="space-y-2">
              {iceProfile.medications.map((m: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                  <span className="text-blue-500 mt-0.5">•</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Emergency contacts */}
        {iceProfile.emergency_contacts?.length ? (
          <div className="card p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-3">📞 Emergency Contacts</h2>
            <div className="space-y-3">
              {iceProfile.emergency_contacts.map((c: EmergencyContact, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-black text-base shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-gray-900">{c.name}</p>
                      {c.is_primary && (
                        <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{c.relationship}</p>
                  </div>
                  <a
                    href={`tel:${c.phone.replace(/\s/g, '')}`}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold text-sm px-3 py-2 rounded-xl transition-colors"
                  >
                    📞 Call
                  </a>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Additional notes */}
        {iceProfile.additional_notes && (
          <div className="card p-5 bg-amber-50 border-amber-200">
            <h2 className="text-xs font-black uppercase tracking-widest text-amber-600 mb-2">📝 Additional Notes</h2>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{iceProfile.additional_notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-8 space-y-1">
          <p className="text-xs text-gray-400">
            This profile was shared voluntarily by the patient via VitaTrack.
          </p>
          <p className="text-xs text-gray-400">
            Information may not be current. Always verify with the patient when possible.
          </p>
          <div className="flex items-center justify-center gap-1 mt-3">
            <span className="text-xs text-gray-400">Powered by</span>
            <span className="text-xs font-bold text-brand-900">VitaTrack 🇿🇦</span>
          </div>
        </div>
      </div>
    </div>
  )
}
