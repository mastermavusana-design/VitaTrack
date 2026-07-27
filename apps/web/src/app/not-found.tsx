import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '404 — VitaTrack' }

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center">
      <span className="text-6xl mb-6">🔍</span>
      <h1 className="text-3xl font-black text-gray-900 mb-2">Page not found</h1>
      <p className="text-gray-500 max-w-sm mb-8">
        The page you're looking for doesn't exist, or the ICE / invite link may have expired.
      </p>
      <div className="flex gap-3">
        <Link href="/" className="btn-secondary">Go home</Link>
        <Link href="/dashboard" className="btn-primary">Dashboard</Link>
      </div>
    </div>
  )
}
