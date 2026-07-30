import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Switch, Image,
} from 'react-native'
import { router, Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/hooks/useAuth'
import { getSupabaseClient, PRIVACY_POLICY_URL, TERMS_URL } from '@vitatrack/shared'
import { Colors } from '@/constants/Colors'

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  popiaConsent: z.boolean().refine(v => v, 'You must accept the privacy policy to continue'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

export default function SignupScreen() {
  const [serverError, setServerError] = useState<string | null>(null)
  const { signUpWithEmail } = useAuthStore()

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { popiaConsent: false },
  })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    const err = await signUpWithEmail(data.email, data.password, data.fullName)
    if (err) {
      setServerError(err)
      return
    }
    // Record POPIA consent timestamp
    const supabase = getSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({
        popia_consent: true,
        popia_consent_at: new Date().toISOString(),
      }).eq('id', user.id)
    }
    router.replace('/(app)')
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.logoWrap}>
            <Image source={require('../../assets/images/icon.png')} style={s.logoImg} />
            <Text style={s.logoText}>VitaTrack</Text>
            <Text style={s.logoSub}>Create your free account</Text>
          </View>

          <View style={s.card}>
            {/* Full name */}
            <Controller control={control} name="fullName" render={({ field: { onChange, value, onBlur } }) => (
              <View style={s.fieldWrap}>
                <Text style={s.label}>Full Name</Text>
                <TextInput style={[s.input, errors.fullName && s.inputError]}
                  placeholder="Thandi Mavusana" placeholderTextColor="#aaa"
                  autoComplete="name" autoCapitalize="words"
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  accessibilityLabel="Full name" />
                {errors.fullName && <Text style={s.errorText}>{errors.fullName.message}</Text>}
              </View>
            )} />

            {/* Email */}
            <Controller control={control} name="email" render={({ field: { onChange, value, onBlur } }) => (
              <View style={s.fieldWrap}>
                <Text style={s.label}>Email</Text>
                <TextInput style={[s.input, errors.email && s.inputError]}
                  placeholder="you@example.com" placeholderTextColor="#aaa"
                  autoCapitalize="none" keyboardType="email-address" autoComplete="email"
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  accessibilityLabel="Email address" />
                {errors.email && <Text style={s.errorText}>{errors.email.message}</Text>}
              </View>
            )} />

            {/* Password */}
            <Controller control={control} name="password" render={({ field: { onChange, value, onBlur } }) => (
              <View style={s.fieldWrap}>
                <Text style={s.label}>Password</Text>
                <TextInput style={[s.input, errors.password && s.inputError]}
                  placeholder="Min. 8 characters" placeholderTextColor="#aaa"
                  secureTextEntry autoComplete="new-password"
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  accessibilityLabel="Password" />
                {errors.password && <Text style={s.errorText}>{errors.password.message}</Text>}
              </View>
            )} />

            {/* Confirm password */}
            <Controller control={control} name="confirmPassword" render={({ field: { onChange, value, onBlur } }) => (
              <View style={s.fieldWrap}>
                <Text style={s.label}>Confirm Password</Text>
                <TextInput style={[s.input, errors.confirmPassword && s.inputError]}
                  placeholder="Repeat password" placeholderTextColor="#aaa"
                  secureTextEntry autoComplete="new-password"
                  value={value} onChangeText={onChange} onBlur={onBlur}
                  accessibilityLabel="Confirm password" />
                {errors.confirmPassword && <Text style={s.errorText}>{errors.confirmPassword.message}</Text>}
              </View>
            )} />

            {/* POPIA consent */}
            <Controller control={control} name="popiaConsent" render={({ field: { onChange, value } }) => (
              <View style={s.consentRow}>
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ false: '#dce3ef', true: Colors.primary }}
                  thumbColor="#fff"
                  accessibilityLabel="Accept privacy policy"
                />
                <Text style={s.consentText}>
                  I agree to VitaTrack's{' '}
                  <Text style={s.consentLink}>Privacy Policy</Text>
                  {' '}and{' '}
                  <Text style={s.consentLink}>Terms of Service</Text>.
                  {'\n'}My health data is processed in accordance with POPIA.
                </Text>
              </View>
            )} />
            {errors.popiaConsent && <Text style={s.errorText}>{errors.popiaConsent.message}</Text>}

            {serverError && (
              <View style={s.serverErrorWrap}>
                <Text style={s.serverErrorText}>{serverError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, isSubmitting && s.btnDisabled]}
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {isSubmitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>Create Account</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={s.loginRow}>
            <Text style={s.loginText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={s.loginLink}>Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#f7f9fc' },
  scroll:         { flexGrow: 1, padding: 24 },
  logoWrap:       { alignItems: 'center', paddingTop: 24, paddingBottom: 24 },
  logoImg:        { width: 68, height: 68, borderRadius: 16 },
  logoText:       { fontSize: 26, fontWeight: '800', color: Colors.primary, marginTop: 6 },
  logoSub:        { fontSize: 14, color: '#666', marginTop: 4 },
  card:           { backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  fieldWrap:      { marginBottom: 14 },
  label:          { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input:          { borderWidth: 1.5, borderColor: '#dce3ef', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, color: '#1a1a2e', backgroundColor: '#f9fafb' },
  inputError:     { borderColor: '#ef4444' },
  errorText:      { fontSize: 12, color: '#ef4444', marginTop: 4 },
  consentRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8, marginBottom: 12 },
  consentText:    { flex: 1, fontSize: 13, color: '#555', lineHeight: 20 },
  consentLink:    { color: Colors.primary, fontWeight: '600' },
  serverErrorWrap:{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 8 },
  serverErrorText:{ color: '#b91c1c', fontSize: 13 },
  primaryBtn:     { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:    { opacity: 0.7 },
  loginRow:       { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginText:      { color: '#666', fontSize: 14 },
  loginLink:      { color: Colors.primary, fontSize: 14, fontWeight: '700' },
})
