'use client'

import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function getInitial(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Small shared hook: reads/writes the `.dark` class + persists to localStorage. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    setTheme(getInitial())
  }, [])

  const apply = useCallback((next: Theme) => {
    const el = document.documentElement
    el.classList.toggle('dark', next === 'dark')
    el.style.colorScheme = next
    try {
      localStorage.setItem('vt-theme', next)
    } catch {
      /* ignore */
    }
    setTheme(next)
  }, [])

  const toggle = useCallback(() => {
    apply(getInitial() === 'dark' ? 'light' : 'dark')
  }, [apply])

  return { theme, toggle, setTheme: apply }
}

export default function ThemeToggle({
  collapsed = false,
  className = '',
}: {
  collapsed?: boolean
  className?: string
}) {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`group flex items-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:text-brand-900 dark:hover:text-brand-200 hover:border-brand-200 dark:hover:border-slate-600 transition-colors ${
        collapsed ? 'w-10 h-10 justify-center' : 'w-full gap-2.5 px-3 py-2.5'
      } ${className}`}
    >
      <span className="relative w-5 h-5 shrink-0">
        <SunIcon
          className={`absolute inset-0 transition-all duration-300 ${
            isDark ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
          }`}
        />
        <MoonIcon
          className={`absolute inset-0 transition-all duration-300 ${
            isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
          }`}
        />
      </span>
      {!collapsed && (
        <span className="text-sm font-semibold">{isDark ? 'Light mode' : 'Dark mode'}</span>
      )}
    </button>
  )
}

function SunIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
