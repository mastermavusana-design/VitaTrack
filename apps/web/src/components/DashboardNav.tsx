'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEffect, useState } from 'react'

interface DashboardNavProps {
  userEmail: string
  userName: string
  isCaregiver: boolean
  ownerId: string
}

type NavItemDef = { href: string; label: string; icon: string }

export default function DashboardNav({ userEmail, userName, isCaregiver }: DashboardNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  const navItems: NavItemDef[] = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/dashboard/vitals', label: 'Vitals', icon: '📊' },
    { href: '/dashboard/medications', label: 'Medications', icon: '💊' },
    { href: '/dashboard/records', label: 'Records', icon: '📂' },
    ...(!isCaregiver ? [{ href: '/dashboard/ice', label: 'Emergency', icon: '🚨' }] : []),
    ...(!isCaregiver ? [{ href: '/dashboard/caregivers', label: 'Family', icon: '👨‍👩‍👧' }] : []),
    { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  ]

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  // Close the drawer on route change, lock body scroll while open, and allow Esc to close.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">

          {/* Left: hamburger (mobile) + logo */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden -ml-1 w-10 h-10 flex items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-drawer"
            >
              <HamburgerIcon />
            </button>

            <img src="/brand/icon.png" alt="VitaTrack" width={32} height={32} className="rounded-lg" />
            <span className="font-black text-gray-900 text-lg">VitaTrack</span>
            {isCaregiver && (
              <span className="hidden sm:inline badge bg-blue-100 text-blue-700 text-xs">
                Caregiver Portal
              </span>
            )}
          </div>

          {/* Center: desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map(item => (
              <NavLink key={item.href} href={item.href} label={item.label} active={isActive(item.href)} />
            ))}
          </div>

          {/* Right: user menu */}
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
              className="hidden md:block text-sm text-gray-500 hover:text-red-600 transition-colors font-medium"
            >
              {isSigningOut ? '…' : 'Sign out'}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer + scrim */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!menuOpen}
      >
        {/* Scrim */}
        <div
          className="absolute inset-0 bg-slate-900/50"
          onClick={() => setMenuOpen(false)}
        />

        {/* Panel */}
        <aside
          id="mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 w-[84%] max-w-[320px] bg-white shadow-2xl rounded-r-3xl flex flex-col transition-transform duration-300 ease-out ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Brand + close */}
          <div className="flex items-center justify-between px-5 pt-6 pb-4">
            <div className="flex items-center gap-2.5">
              <img src="/brand/icon.png" alt="" width={34} height={34} className="rounded-lg" />
              <span className="font-black text-gray-900 text-xl">VitaTrack</span>
            </div>
            <button
              onClick={() => setMenuOpen(false)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          {/* User card */}
          <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl bg-brand-50 p-3">
            <div className="w-11 h-11 rounded-full bg-brand-900 flex items-center justify-center text-white text-base font-black shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{userName}</p>
              <p className="text-xs text-gray-500 truncate">{userEmail}</p>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto px-3 space-y-1">
            {navItems.map(item => {
              const active = isActive(item.href)
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-[15px] font-semibold transition-colors ${
                    active
                      ? 'bg-brand-50 text-brand-900'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-brand-900" />
                  )}
                  <span className="text-xl w-6 text-center">{item.icon}</span>
                  {item.label}
                </a>
              )
            })}
          </nav>

          {/* Footer: sign out */}
          <div className="border-t border-gray-100 p-3">
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-[15px] font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
            >
              <span className="text-lg w-6 text-center">⏻</span>
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
            <p className="px-3.5 pt-1 text-[11px] text-gray-400">VitaTrack · v1.0</p>
          </div>
        </aside>
      </div>
    </>
  )
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-brand-50 text-brand-900'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {label}
    </a>
  )
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
