import { useEffect } from 'react'
import { create } from 'zustand'
import { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient } from '@vitatrack/shared'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { router } from 'expo-router'
import { BIOMETRIC_LOCK_MINUTES } from '@vitatrack/shared'

const LAST_ACTIVE_KEY = 'vitatrack_last_active'

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
    // Implemented via expo-auth-session in the UI layer
    return null
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
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        useAuthStore.setState({
          session,
          user: session?.user ?? null,
          isLoading: false,
        })
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return { isLoading }
}
