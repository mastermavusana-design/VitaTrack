import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native'
import { router, Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/hooks/useAuth'
import { Colors } from '@/constants/Colors'

const schema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm:  z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})
type FormData = z.infer<typeof schema>

export default function RegisterScreen() {
  const [serverError, setServerError] = useState<string | null>(null)
  const { signUpWithEmail } = useAuthStore()

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    const err = await signUpWithEmail(data.email, data.password, data.fullName)
    if (err) {
      setServerError(err)
    } else {
      // Supabase sends a confirmation email; let user know
      router.replace('/(auth)/login')
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={s.logoWrap}>
            <Text style={s.logoIcon}>💊</Text>
            <Text style={s.logoText}>VitaTrack</Text>
            <Text style={s.logoSub}>Create your free account</Text>
          </View>

          {/* Form */}
          <View style={s.card}>
            <Controller
              control={control}
              name="fullName"
              render={({ field: { onChange, value, onBlur } }) => (
                <View style={s.fieldWrap}>
                  <Text style={s.label}>Full Name</Text>
                  <TextInput
                    style={[s.input, errors.fullName && s.inputError]}
                    placeholder="Your name"
                    placeholderTextColor="#aaa"
                    autoCapitalize="words"
                    autoComplete="name"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    accessibilityLabel="Full name"
                  />
                  {errors.fullName && <Text style={s.errorText}>{errors.fullName.message}</Text>}
                </View>
              )}
            />

            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, value, onBlur } }) => (
                <View style={s.fieldWrap}>
                  <Text style={s.label}>Email</Text>
                  <TextInput
                    style={[s.input, errors.email && s.inputError]}
                    placeholder="you@example.com"
                    placeholderTextColor="#aaa"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    accessibilityLabel="Email address"
                  />
                  {errors.email && <Text style={s.errorText}>{errors.email.message}</Text>}
                </View>
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value, onBlur } }) => (
                <View style={s.fieldWrap}>
                  <Text style={s.label}>Password</Text>
                  <TextInput
                    style={[s.input, errors.password && s.inputError]}
                    placeholder="At least 8 characters"
                    placeholderTextColor="#aaa"
                    secureTextEntry
                    autoComplete="new-password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    accessibilityLabel="Password"
                  />
                  {errors.password && <Text style={s.errorText}>{errors.password.message}</Text>}
                </View>
              )}
            />

            <Controller
              control={control}
              name="confirm"
              render={({ field: { onChange, value, onBlur } }) => (
                <View style={s.fieldWrap}>
                  <Text style={s.label}>Confirm Password</Text>
                  <TextInput
                    style={[s.input, errors.confirm && s.inputError]}
                    placeholder="Re-enter your password"
                    placeholderTextColor="#aaa"
                    secureTextEntry
                    autoComplete="new-password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    accessibilityLabel="Confirm password"
                  />
                  {errors.confirm && <Text style={s.errorText}>{errors.confirm.message}</Text>}
                </View>
              )}
            />

            {serverError && (
              <View style={s.serverErrorWrap}>
                <Text style={s.serverErrorText}>{serverError}</Text>
              </View>
            )}

            <Text style={s.termsText}>
              By creating an account you agree to our{' '}
              <Text style={s.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={s.termsLink}>Privacy Policy</Text>.
            </Text>

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

          {/* Sign in link */}
          <View style={s.signinRow}>
            <Text style={s.signinText}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={s.signinLink}>Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: '#f7f9fc' },
  scroll:          { flexGrow: 1, padding: 24 },
  logoWrap:        { alignItems: 'center', paddingTop: 24, paddingBottom: 28 },
  logoIcon:        { fontSize: 52 },
  logoText:        { fontSize: 28, fontWeight: '800', color: Colors.primary, marginTop: 8 },
  logoSub:         { fontSize: 15, color: '#666', marginTop: 6 },
  card:            { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  fieldWrap:       { marginBottom: 14 },
  label:           { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input:           { borderWidth: 1.5, borderColor: '#dce3ef', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, color: '#1a1a2e', backgroundColor: '#f9fafb' },
  inputError:      { borderColor: '#ef4444' },
  errorText:       { fontSize: 12, color: '#ef4444', marginTop: 4 },
  serverErrorWrap: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 8 },
  serverErrorText: { color: '#b91c1c', fontSize: 13 },
  termsText:       { fontSize: 12, color: '#888', lineHeight: 18, marginBottom: 4 },
  termsLink:       { color: Colors.primary, fontWeight: '600' },
  primaryBtn:      { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  primaryBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:     { opacity: 0.7 },
  signinRow:       { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  signinText:      { color: '#666', fontSize: 14 },
  signinLink:      { color: Colors.primary, fontSize: 14, fontWeight: '700' },
})
