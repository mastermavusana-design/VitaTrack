import { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as LocalAuthentication from 'expo-local-authentication'
import { useAuthStore } from '@/hooks/useAuth'
import { Colors } from '@/constants/Colors'

export default function LockScreen() {
  const { unlock, signOut } = useAuthStore()

  useEffect(() => {
    // Auto-prompt biometric on mount
    handleUnlock()
  }, [])

  const handleUnlock = async () => {
    await unlock()
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.content}>
        <Text style={s.icon}>🔒</Text>
        <Text style={s.title}>VitaTrack is locked</Text>
        <Text style={s.sub}>Authenticate to continue</Text>

        <TouchableOpacity style={s.unlockBtn} onPress={handleUnlock} accessibilityRole="button" accessibilityLabel="Unlock with biometrics">
          <Text style={s.unlockIcon}>👆</Text>
          <Text style={s.unlockText}>Use Face ID / Fingerprint</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.primary },
  content:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon:       { fontSize: 56, marginBottom: 20 },
  title:      { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8 },
  sub:        { fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 48 },
  unlockBtn:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 32, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  unlockIcon: { fontSize: 36, marginBottom: 8 },
  unlockText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  signOutBtn: { marginTop: 32 },
  signOutText:{ color: 'rgba(255,255,255,0.6)', fontSize: 14 },
})
