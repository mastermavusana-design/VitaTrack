'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { clearOfflineData } from '@/lib/pwa'
import ThemeToggle from '@/components/theme/ThemeToggle'
import {
  HomeIcon, VitalsIcon, PillIcon, RecordsIcon, BellIcon, EmergencyIcon,
  FamilyIcon, SettingsIcon, ScanIcon, ChevronIcon, MenuIcon, CloseIcon, SignOutIcon,
} from './icons'

interface Props {
  userEmail: string
  userName: string
  isCaregiver: boolean
  children: React.ReactNode
}

type NavItem = {
  href: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export default function DashboardShell({ userEmail, userName, isCaregiver, children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClientComponentClient()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  // Restore collapse preference.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('vt-sidebar') === 'collapsed')
    } catch { /* ignore */ }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('vt-sidebar', next ? 'collapsed' : 'expanded') } catch { /* ignore */ }
      return next
    })
  }

  // Close the mobile drawer on navigation; lock scroll + Esc-to-close while open.
  useEffect(() => { setMobileOpen(false) }, [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await clearOfflineData()
    await supabase.auth.signOut()
    router.push('/')
  }

  const initials = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const navItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
    { href: '/dashboard/vitals', label: 'Vitals', Icon: VitalsIcon },
    { href: '/dashboard/medications', label: 'Medications', Icon: PillIcon },
    { href: '/dashboard/records', label: 'Records', Icon: RecordsIcon },
    { href: '/dashboard/scan', label: 'Scan', Icon: ScanIcon },
    { href: '/dashboard/notifications', label: 'Notifications', Icon: BellIcon },
    ...(!isCaregiver ? [{ href: '/dashboard/ice', label: 'Emergency', Icon: EmergencyIcon }] : []),
    ...(!isCaregiver ? [{ href: '/dashboard/caregivers', label: 'Family', Icon: FamilyIcon }] : []),
    { href: '/dashboard/settings', label: 'Settings', Icon: SettingsIcon },
  ]

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  const currentLabel = navItems.find(i => isActive(i.href))?.label ?? 'Dashboard'

  /* ─── Sidebar body (shared by desktop rail + mobile drawer) ─────────────── */
  const SidebarContent = ({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) => (
    <div className="flex h-full flex-col">
      {/* Brand + collapse */}
      <div className={`flex items-center h-16 shrink-0 ${compact ? 'justify-center px-2' : 'justify-between px-4'}`}>
        <a href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 min-w-0">
          <img src="/brand/icon.png" alt="VitaTrack" width={34} height={34} className="rounded-xl shadow-sm shrink-0" />
          {!compact && <span className="font-black text-gray-900 text-lg tracking-tight truncate">VitaTrack</span>}
        </a>
        {!compact && (
          <button
            onClick={toggleCollapsed}
            className="hidden md:flex w-8 h-8 items-center justify-center rounded-lg text-gray-400 hover:text-brand-900 hover:bg-gray-100 transition-colors"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <ChevronIcon width={18} height={18} />
          </button>
        )}
      </div>

      {isCaregiver && !compact && (
        <div className="mx-3 mb-2">
          <span className="badge bg-blue-100 text-blue-700 text-[11px] w-full justify-center py-1">
            Caregiver Portal · read-only
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto vt-scroll py-2 ${compact ? 'px-2' : 'px-3'} space-y-1`}>
        {!compact && (
          <p className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Menu</p>
        )}
        {navItems.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <a
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={compact ? label : undefined}
              className={`group relative flex items-center rounded-xl text-[14.5px] font-semibold transition-colors ${
                compact ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'bg-brand-900 text-white shadow-sm shadow-brand-900/20'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Icon
                width={21}
                height={21}
                className={active ? 'text-white' : 'text-gray-400 group-hover:text-brand-900'}
              />
              {!compact && <span className="truncate">{label}</span>}
            </a>
          )
        })}
      </nav>

      {/* Footer: theme + user + sign out */}
      <div className={`shrink-0 border-t border-gray-100 ${compact ? 'px-2' : 'px-3'} py-3 space-y-2`}>
        <ThemeToggle collapsed={compact} />

        {!compact ? (
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-900 flex items-center justify-center text-white text-sm font-black shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-gray-900 truncate">{userName}</p>
              <p className="text-[11px] text-gray-500 truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <SignOutIcon width={18} height={18} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            aria-label="Sign out"
            title="Sign out"
          >
            <SignOutIcon width={18} height={18} />
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Desktop sidebar (fixed, collapsible) ── */}
      <aside
        className={`hidden md:flex fixed inset-y-0 left-0 z-30 flex-col bg-white border-r border-gray-200 shadow-rail transition-[width] duration-300 ease-in-out ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <SidebarContent compact={collapsed} />
        {collapsed && (
          <button
            onClick={toggleCollapsed}
            className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-500 hover:text-brand-900 transition-colors"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronIcon width={14} height={14} className="rotate-180" />
          </button>
        )}
      </aside>

      {/* ── Mobile drawer ── */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute inset-y-0 left-0 w-[84%] max-w-[300px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-4 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors z-10"
            aria-label="Close menu"
          >
            <CloseIcon width={18} height={18} />
          </button>
          <SidebarContent compact={false} onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* ── Content column ── */}
      <div className={`transition-[padding] duration-300 ease-in-out ${collapsed ? 'md:pl-[76px]' : 'md:pl-64'}`}>
        {/* Mobile topbar */}
        <header className="md:hidden sticky top-0 z-20 flex items-center gap-3 h-14 px-3 bg-white/90 backdrop-blur border-b border-gray-200">
          <button
            onClick={() => setMobileOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Open navigation menu"
          >
            <MenuIcon />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <img src="/brand/icon.png" alt="" width={26} height={26} className="rounded-lg" />
            <span className="font-black text-gray-900 truncate">{currentLabel}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-brand-900 flex items-center justify-center text-white text-sm font-black shrink-0">
            {initials}
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
