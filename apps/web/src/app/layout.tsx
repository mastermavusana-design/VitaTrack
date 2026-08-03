import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'VitaTrack',
    template: '%s — VitaTrack',
  },
  description: 'Your personal health companion — medication tracking, vitals, and emergency profiles for South Africa.',
  manifest: '/manifest.webmanifest',
  applicationName: 'VitaTrack',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'VitaTrack',
  },
  icons: {
    icon: '/brand/icon.png',
    apple: '/brand/icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1A569B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
