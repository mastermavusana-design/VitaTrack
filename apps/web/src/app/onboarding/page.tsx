'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const SLIDES = [
  {
    icon: '💊',
    title: 'Never miss a dose again',
    body: "Smart reminders track every medication for you and your family — with a web push notification when it's time.",
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
    body: 'Your ICE profile is reachable by first responders from a simple link or QR code.',
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const last = index === SLIDES.length - 1
  const slide = SLIDES[index]

  const next = () => {
    if (!last) setIndex((i) => i + 1)
    else router.push('/login?tab=signup')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 flex flex-col text-white">
      {/* Skip */}
      <div className="flex justify-end p-5">
        <button
          onClick={() => router.push('/login')}
          className="text-sm text-blue-200/80 hover:text-white transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Slide */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center max-w-md mx-auto">
        <div className="text-7xl mb-8" aria-hidden>{slide.icon}</div>
        <h1 className="text-2xl sm:text-3xl font-black leading-snug mb-4">{slide.title}</h1>
        <p className="text-blue-100/80 text-lg leading-relaxed">{slide.body}</p>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mb-6" role="tablist" aria-label="Onboarding progress">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-white' : 'w-2 bg-white/35'}`}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="px-6 pb-8 space-y-3 max-w-md mx-auto w-full">
        <button
          onClick={next}
          className="w-full bg-white text-blue-900 font-bold text-base rounded-2xl py-4 hover:bg-blue-50 transition-colors"
        >
          {last ? 'Get started' : 'Next'}
        </button>
        {last && (
          <button
            onClick={() => router.push('/login')}
            className="w-full border border-white/40 text-white font-semibold text-base rounded-2xl py-3.5 hover:bg-white/10 transition-colors"
          >
            I already have an account
          </button>
        )}
      </div>
    </div>
  )
}
