import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Image,
} from 'react-native'
import { router, Link } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/hooks/useAuth'
import { Colors } from '@/constants/Colors'

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
type FormData = z.infer<typeof schema>

export default function LoginScreen() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { signInWithEmail, signInWithGoogle } = useAuthStore()

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    const err = await signInWithEmail(data.email, data.password)
    if (err) {
      setServerError(err)
    } else {
      router.replace('/(app)')
    }
  }

  const onGoogle = async () => {
    setServerError(null)
    setGoogleLoading(true)
    const err = await signInWithGoogle()
    setGoogleLoading(false)
    if (err) {
      setServerError(err)
    } else if (useAuthStore.getState().session) {
      router.replace('/(app)')
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
            <Image source={require('../../assets/images/icon.png')} style={s.logoImg} />
            <Text style={s.logoText}>VitaTrack</Text>
            <Text style={s.logoSub}>Sign in to your account</Text>
          </View>

          {/* Form */}
          <View style={s.card}>
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
                    placeholder="••••••••"
                    placeholderTextColor="#aaa"
                    secureTextEntry
                    autoComplete="password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    accessibilityLabel="Password"
                  />
                  {errors.password && <Text style={s.errorText}>{errors.password.message}</Text>}
                </View>
              )}
            />

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
              accessibilityLabel="Sign in"
            >
              {isSubmitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.forgotWrap}>
              <Text style={s.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or continue with</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Google */}
          <TouchableOpacity
            style={[s.googleBtn, googleLoading && s.btnDisabled]}
            onPress={onGoogle}
            disabled={googleLoading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
          >
            {googleLoading
              ? <ActivityIndicator color={Colors.primary} />
              : <Text style={s.googleBtnText}>G  Sign in with Google</Text>
            }
          </TouchableOpacity>

          {/* Sign up link */}
          <View style={s.signupRow}>
            <Text style={s.signupText}>Don't have an account? </Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity>
                <Text style={s.signupLink}>Create one</Text>
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
  logoWrap:       { alignItems: 'center', paddingTop: 32, paddingBottom: 32 },
  logoImg:        { width: 76, height: 76, borderRadius: 18 },
  logoText:       { fontSize: 28, fontWeight: '800', color: Colors.primary, marginTop: 8 },
  logoSub:        { fontSize: 15, color: '#666', marginTop: 6 },
  card:           { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  fieldWrap:      { marginBottom: 14 },
  label:          { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input:          { borderWidth: 1.5, borderColor: '#dce3ef', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, color: '#1a1a2e', backgroundColor: '#f9fafb' },
  inputError:     { borderColor: '#ef4444' },
  errorText:      { fontSize: 12, color: '#ef4444', marginTop: 4 },
  serverErrorWrap:{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 8 },
  serverErrorText:{ color: '#b91c1c', fontSize: 13 },
  primaryBtn:     { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:    { opacity: 0.7 },
  forgotWrap:     { alignItems: 'center', paddingVertical: 12 },
  forgotText:     { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  dividerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine:    { flex: 1, height: 1, backgroundColor: '#e0e4ea' },
  dividerText:    { color: '#888', fontSize: 13 },
  googleBtn:      { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#dce3ef', paddingVertical: 14, alignItems: 'center' },
  googleBtnText:  { fontSize: 15, fontWeight: '600', color: '#333' },
  signupRow:      { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  signupText:     { color: '#666', fontSize: 14 },
  signupLink:     { color: Colors.primary, fontSize: 14, fontWeight: '700' },
})
