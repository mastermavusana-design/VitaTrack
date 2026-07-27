import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useAuthStore } from '@/hooks/useAuth'
import { Colors } from '@/constants/Colors'

const TAB_ICON: Record<string, { active: string; inactive: string }> = {
  index:       { active: '🏠', inactive: '🏠' },
  medications: { active: '💊', inactive: '💊' },
  vitals:      { active: '📊', inactive: '📊' },
  records:     { active: '📂', inactive: '📂' },
  profile:     { active: '👤', inactive: '👤' },
}

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
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: 6,
          paddingTop: 4,
          height: 64,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.6 }}>
            {focused
              ? TAB_ICON[route.name]?.active
              : TAB_ICON[route.name]?.inactive}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="index"       options={{ title: 'Home' }} />
      <Tabs.Screen name="medications" options={{ title: 'Meds' }} />
      <Tabs.Screen name="vitals"      options={{ title: 'Vitals' }} />
      <Tabs.Screen name="records"     options={{ title: 'Records' }} />
      <Tabs.Screen name="profile"     options={{ title: 'Profile' }} />
    </Tabs>
  )
}
