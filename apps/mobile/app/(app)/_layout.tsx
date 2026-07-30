import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus, View } from 'react-native'
import { Stack } from 'expo-router'
import { useAuthStore } from '@/hooks/useAuth'
import AppDrawer from '@/components/AppDrawer'

export default function AppLayout() {
  const { checkBiometricLock } = useAuthStore()
  const appState = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    // Check on initial mount
    checkBiometricLock()

    // Re-check every time app returns to foreground
    const subscription = AppState.addEventListener('change', nextState => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        checkBiometricLock()
      }
      appState.current = nextState
    })

    return () => subscription.remove()
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="medications" />
        <Stack.Screen name="vitals" />
        <Stack.Screen name="records" />
        <Stack.Screen name="profile" />
      </Stack>

      {/* Global slide-in navigation drawer, opened by the header hamburger. */}
      <AppDrawer />
    </View>
  )
}
