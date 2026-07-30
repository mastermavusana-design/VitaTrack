import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'VitaTrack — Your Health Companion',
  description: 'Track medications, vitals, and share your health with caregivers. Built for South Africa.',
}

const FEATURES = [
  { icon: '💊', title: 'Medication Tracking',   desc: 'Never miss a dose. Schedule reminders for all your medications and track adherence over time.' },
  { icon: '📊', title: 'Vitals Monitoring',     desc: 'Log blood pressure, glucose, and weight with automatic WHO classification and 30-day trend charts.' },
  { icon: '👨‍👩‍👧', title: 'Family Care',        desc: 'Invite a caregiver to monitor your adherence and receive missed-dose alerts on your behalf.' },
  { icon: '🆘', title: 'ICE Profile',           desc: 'First responders can scan your QR code to access your allergies, conditions, and emergency contacts instantly.' },
  { icon: '📂', title: 'Health Records',        desc: 'Keep all doctor visits, lab results, and prescriptions in one secure, searchable place.' },
  { icon: '🔒', title: 'POPIA Compliant',       desc: 'Your data stays in South Africa (AWS Cape Town). Export or delete your records any time.' },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Navigation */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: 1024, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/icon.png" alt="VitaTrack" width={36} height={36} style={{ borderRadius: 10, display: 'block' }} />
            <span style={{ fontWeight: 900, fontSize: 18, color: '#111' }}>VitaTrack</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: '#374151', textDecoration: 'none' }}>Sign in</Link>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: '#1e3a5f', borderRadius: 10, padding: '8px 20px', textDecoration: 'none' }}>
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #0f2044 0%, #1e3a5f 50%, #1d4ed8 100%)', color: '#fff', padding: '80px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px 16px', fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
            🇿🇦 Built for South Africa
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 20 }}>
            Your health.<br /><span style={{ color: '#93c5fd' }}>Under control.</span>
          </h1>
          <p style={{ fontSize: 18, color: '#bfdbfe', maxWidth: 560, margin: '0 auto 40px', lineHeight: 1.7 }}>
            VitaTrack helps South Africans manage chronic medications, track vitals, and share health data with caregivers — all from one secure platform.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" style={{ background: '#fff', color: '#1e3a5f', fontWeight: 800, fontSize: 15, padding: '14px 32px', borderRadius: 14, textDecoration: 'none' }}>
              Get Started Free →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 24px', background: '#f9fafb' }}>
        <div style={{ maxWidth: 1024, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, color: '#111', marginBottom: 12 }}>Everything you need to stay healthy</h2>
            <p style={{ color: '#6b7280', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
              Designed for South Africa's healthcare landscape — from HIV treatment to hypertension management.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {FEATURES.map(({ icon, title, desc }) => (
              <div key={title} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>{icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111', marginBottom: 8 }}>{title}</h3>
                <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 24px', background: '#fff', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 900, color: '#111', marginBottom: 12 }}>Start tracking today</h2>
        <p style={{ color: '#6b7280', marginBottom: 32 }}>Free to use. No credit card required. Your data stays in South Africa.</p>
        <Link href="/login" style={{ background: '#1e3a5f', color: '#fff', fontWeight: 800, fontSize: 15, padding: '16px 40px', borderRadius: 14, textDecoration: 'none' }}>
          Create Your Account →
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ background: '#111827', color: '#9ca3af', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1024, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 700, color: '#e5e7eb' }}>VitaTrack · 🇿🇦 South Africa</span>
          <span style={{ fontSize: 13 }}>© {new Date().getFullYear()} VitaTrack. POPIA Compliant.</span>
        </div>
      </footer>
    </div>
  )
}
