import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Shared chrome for standalone legal / compliance pages (privacy, terms,
 * POPIA disclosure). Kept intentionally simple and dependency-free so these
 * pages render even if the app shell or auth is unavailable — app-store
 * reviewers and the Information Regulator must be able to reach them anonymously.
 */
export function LegalShell({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-black text-gray-900">
            VitaTrack
          </Link>
          <nav className="flex gap-4 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-black text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: {lastUpdated}</p>
        <div className="legal-prose mt-8 space-y-6 text-[15px] leading-relaxed text-gray-700">
          {children}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6 text-xs text-gray-400">
          © {new Date().getFullYear()} VitaTrack. Operated by [Registered Company Name].
        </div>
      </footer>
    </div>
  )
}

/** Section heading used inside legal documents. */
export function LegalSection({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-2 text-xl font-bold text-gray-900">{heading}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
