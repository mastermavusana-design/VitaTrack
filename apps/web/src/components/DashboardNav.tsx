'use client'

import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useState } from 'react'

interface DashboardNavProps {
  userEmail: string
  userName: string
  isCaregiver: boolean
  ownerId: string
}

export default function DashboardNav({ userEmail, userName, isCaregiver }: DashboardNavProps) {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const supabase = createClientComponentClient()

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await supabase.auth.signOut()
    router.push('/')
  }

  const initials = userName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/brand/icon.png" alt="VitaTrack" width={32} height={32} className="rounded-lg" />
          <span className="font-black text-gray-900 text-lg">VitaTrack</span>
          {isCaregiver && (
            <span className="hidden sm:inline badge bg-blue-100 text-blue-700 text-xs">
              Caregiver Portal
            </span>
          )}
        </div>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/dashboard/vitals" label="Vitals" />
          <NavLink href="/dashboard/medications" label="Medications" />
          <NavLink href="/dashboard/records" label="Records" />
          {!isCaregiver && (
            <NavLink href="/dashboard/caregivers" label="Family" />
          )}
          <NavLink href="/dashboard/settings" label="Settings" />
        </div>

        {/* User menu */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-semibold text-gray-900">{userName}</span>
            <span className="text-xs text-gray-400">{userEmail}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-brand-900 flex items-center justify-center text-white text-sm font-black">
            {initials}
          </div>
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium"
          >
            {isSigningOut ? '…' : 'Sign out'}
          </button>
        </div>
      </div>
    </nav>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      {label}
    </a>
  )
}
