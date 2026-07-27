'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

type Tab = 'signin' | 'signup'

export default function LoginClient({ returnTo }: { returnTo?: string }) {
  const router   = useRouter()
  const supabase = createClientComponentClient()

  const [tab,       setTab]       = useState<Tab>('signin')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [fullName,  setFullName]  = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogle,  setIsGoogle]  = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState<string | null>(null)

  const switchTab = (t: Tab) => { setTab(t); setError(null); setSuccess(null) }

  const handleGoogle = async () => {
    setIsGoogle(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback${returnTo ? `?returnTo=${returnTo}` : ''}`,
      },
    })
    if (error) { setError(error.message); setIsGoogle(false) }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setIsLoading(false)
    if (error) { setError(error.message); return }
    router.push(returnTo ?? '/dashboard')
    router.refresh()
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setIsLoading(false)
    if (error) { setError(error.message); return }
    setSuccess('Account created! Check your email to confirm, then sign in.')
    setTab('signin')
  }

  return (
    <div>
      {/* Google Sign-In */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={isGoogle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '12px 16px',
          background: '#fff', fontSize: 14, fontWeight: 700, color: '#111',
          cursor: 'pointer', marginBottom: 20, transition: 'background 0.15s',
          opacity: isGoogle ? 0.7 : 1,
        }}
        onMouseOver={e => (e.currentTarget.style.background = '#f9fafb')}
        onMouseOut={e => (e.currentTarget.style.background = '#fff')}
      >
        {/* Google Logo SVG */}
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>
        {isGoogle ? 'Redirecting to Google…' : 'Continue with Google'}
      </button>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 24 }}>
        {(['signin', 'signup'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            style={{
              flex: 1, paddingBottom: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: 'none', background: 'transparent', transition: 'color 0.15s',
              borderBottom: tab === t ? '2px solid #1e3a5f' : '2px solid transparent',
              color: tab === t ? '#1e3a5f' : '#9ca3af',
            }}
          >
            {t === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        ))}
      </div>

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13, borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          ✅ {success}
        </div>
      )}

      {tab === 'signin' ? (
        <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              autoComplete="email" placeholder="you@example.com"
              style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              autoComplete="current-password" placeholder="••••••••"
              style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {error && <div style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, borderRadius: 10, padding: '12px 16px' }}>{error}</div>}
          <button type="submit" disabled={isLoading}
            style={{ width: '100%', background: '#1e3a5f', color: '#fff', fontWeight: 700, borderRadius: 12, padding: '14px', fontSize: 14, border: 'none', cursor: 'pointer', opacity: isLoading ? 0.7 : 1 }}>
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
              autoComplete="name" placeholder="Your full name"
              style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Email address</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              autoComplete="email" placeholder="you@example.com"
              style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              autoComplete="new-password" placeholder="At least 8 characters"
              style={{ width: '100%', border: '1.5px solid #d1d5db', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {error && <div style={{ background: '#fef2f2', color: '#b91c1c', fontSize: 13, borderRadius: 10, padding: '12px 16px' }}>{error}</div>}
          <button type="submit" disabled={isLoading}
            style={{ width: '100%', background: '#1e3a5f', color: '#fff', fontWeight: 700, borderRadius: 12, padding: '14px', fontSize: 14, border: 'none', cursor: 'pointer', opacity: isLoading ? 0.7 : 1 }}>
            {isLoading ? 'Creating account…' : 'Create Account'}
          </button>
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
            By signing up you agree to our Privacy Policy. Your data is stored in South Africa.
          </p>
        </form>
      )}
    </div>
  )
}
