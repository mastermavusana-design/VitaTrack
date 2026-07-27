import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase'
import LoginClient from './LoginClient'

export const metadata: Metadata = { title: 'Sign In — VitaTrack' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { returnTo?: string }
}) {
  const supabase = createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) redirect(searchParams.returnTo ?? '/dashboard')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-2xl font-black text-brand-900">V</span>
          </div>
          <h1 className="text-2xl font-black text-white">VitaTrack</h1>
          <p className="text-blue-300 text-sm mt-1">Caregiver & Web Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <h2 className="text-xl font-black text-gray-900 mb-1">Sign in</h2>
          <p className="text-sm text-gray-500 mb-6">
            Use the same account as the VitaTrack mobile app.
          </p>
          <LoginClient returnTo={searchParams.returnTo} />
        </div>

        <p className="text-center text-blue-300 text-xs mt-6">
          🇿🇦 Built for South Africa · POPIA Compliant
        </p>
      </div>
    </div>
  )
}
