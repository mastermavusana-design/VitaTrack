import { useEffect } from 'react'
import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@vitatrack/shared'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { router } from 'expo-router'
import { BIOMETRIC_LOCK_MINUTES } from '@vitatrack/shared'
import { registerPushToken } from '@/notifications/handler'

// Ensure any lingering auth session popups are dismissed on app load.
WebBrowser.maybeCompleteAuthSession()

const LAST_ACTIVE_KEY = 'vitatrack_last_active'

/** Parse tokens/code from both the query string and the URL fragment. */
function parseAuthParams(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  const tail = url.split(/[#?]/).slice(1).join('&')
  for (const pair of tail.split('&')) {
    if (!pair) continue
    const idx = pair.indexOf('=')
    const key = idx === -1 ? pair : pair.slice(0, idx)
    const val = idx === -1 ? '' : pair.slice(idx + 1)
    out[decodeURIComponent(key)] = decodeURIComponent(val)
  }
  return out
}

type AuthState = {
  session: Session | null
  user: User | null
  isLoading: boolean
  isLocked: boolean
  // actions
  signInWithEmail: (email: string, password: string) => Promise<string | null>
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<string | null>
  signInWithGoogle: () => Promise<string | null>
  signOut: () => Promise<void>
  lock: () => void
  unlock: () => Promise<boolean>
  checkBiometricLock: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  isLocked: false,

  signInWithEmail: async (email, password) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  },

  signUpWithEmail: async (email, password, fullName) => {
    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    return error?.message ?? null
  },

  signInWithGoogle: async () => {
    try {
      const supabase = getSupabaseClient()

      // Redirect back into the app via the custom scheme (vitatrack:// /
      // vitatrack-dev:// in dev). Must be added to Supabase Auth → URL
      // Configuration → Redirect URLs.
      const redirectTo = makeRedirectUri()

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error) return error.message
      if (!data?.url) return 'Could not start Google sign-in.'

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      // User closed the browser without completing sign-in.
      if (result.type !== 'success' || !result.url) return null

      const params = parseAuthParams(result.url)
      if (params.error_description) return params.error_description
      if (params.error) return params.error

      // PKCE flow returns a `code`; implicit flow returns tokens directly.
      if (params.code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(params.code)
        if (exErr) return exErr.message
      } else if (params.access_token && params.refresh_token) {
        const { error: sErr } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        })
        if (sErr) return sErr.message
      } else {
        return 'Google sign-in did not return a session.'
      }

      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Google sign-in failed.'
    }
  },

  signOut: async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    set({ session: null, user: null, isLocked: false })
    router.replace('/(auth)/login')
  },

  lock: () => {
    set({ isLocked: true })
    router.replace('/(auth)/lock')
  },

  unlock: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock VitaTrack',
      fallbackLabel: 'Use passcode',
      cancelLabel: 'Cancel',
    })
    if (result.success) {
      set({ isLocked: false })
      await SecureStore.setItemAsync(LAST_ACTIVE_KEY, Date.now().toString())
      router.back()
    }
    return result.success
  },

  checkBiometricLock: async () => {
    const { session, isLocked } = get()
    if (!session || isLocked) return

    const lastActiveStr = await SecureStore.getItemAsync(LAST_ACTIVE_KEY)
    if (!lastActiveStr) return

    const lastActive = parseInt(lastActiveStr, 10)
    const minutesInactive = (Date.now() - lastActive) / 1000 / 60

    if (minutesInactive >= BIOMETRIC_LOCK_MINUTES) {
      get().lock()
    }
  },
}))

/** Initialize auth listener — call once at app root */
export function useAuthInit() {
  const { isLoading } = useAuthStore()
  const supabase = getSupabaseClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      useAuthStore.setState({
        session,
        user: session?.user ?? null,
        isLoading: false,
      })
      // Register this device for push so caregiver-alert/refill crons can
      // target it. Safe to call repeatedly (idempotent token upsert).
      if (session) registerPushToken().catch(() => {})
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        useAuthStore.setState({
          session,
          user: session?.user ?? null,
          isLoading: false,
        })
        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          registerPushToken().catch(() => {})
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return { isLoading }
}
