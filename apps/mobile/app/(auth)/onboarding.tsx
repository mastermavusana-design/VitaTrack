import { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Colors } from '@/constants/Colors'

const { width: SCREEN_W } = Dimensions.get('window')

const SLIDES = [
  {
    icon: '💊',
    title: 'Never miss a dose again',
    body: 'Smart reminders track every medication for you and your family — even when you\'re offline.',
  },
  {
    icon: '📊',
    title: 'Monitor your vitals',
    body: 'Log blood pressure, glucose, and weight. See trends your doctor will actually find useful.',
  },
  {
    icon: '📂',
    title: 'Your records, organised',
    body: 'Store prescriptions, lab results, and visit notes in one secure, searchable place.',
  },
  {
    icon: '🆘',
    title: 'Emergency info, always ready',
    body: 'Your ICE profile is accessible to first responders without unlocking your phone.',
  },
]

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)
    setCurrentIndex(index)
  }

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (currentIndex + 1) * SCREEN_W, animated: true })
    } else {
      router.replace('/(auth)/signup')
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />

      {/* Skip */}
      <TouchableOpacity style={s.skip} onPress={() => router.replace('/(auth)/login')}>
        <Text style={s.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[s.slide, { width: SCREEN_W }]}>
            <Text style={s.slideIcon}>{slide.icon}</Text>
            <Text style={s.slideTitle}>{slide.title}</Text>
            <Text style={s.slideBody}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === currentIndex && s.dotActive]} />
        ))}
      </View>

      {/* CTA */}
      <View style={s.footer}>
        <TouchableOpacity style={s.primaryBtn} onPress={goNext}>
          <Text style={s.primaryBtnText}>
            {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>

        {currentIndex === SLIDES.length - 1 && (
          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={s.secondaryBtnText}>I already have an account</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Colors.primary },
  skip:         { position: 'absolute', top: 56, right: 24, zIndex: 10 },
  skipText:     { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  slide:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 40 },
  slideIcon:    { fontSize: 72, marginBottom: 28 },
  slideTitle:   { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 16, lineHeight: 34 },
  slideBody:    { fontSize: 17, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 26 },
  dots:         { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive:    { width: 24, borderRadius: 4, backgroundColor: '#fff' },
  footer:       { paddingHorizontal: 24, paddingBottom: 16, gap: 10 },
  primaryBtn:   { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText:   { color: Colors.primary, fontSize: 17, fontWeight: '700' },
  secondaryBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  secondaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
