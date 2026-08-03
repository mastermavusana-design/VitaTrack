'use client'

import { useEffect, useState } from 'react'
import { initClientQueue } from '@/lib/dataStore'

/**
 * PWA bootstrap — registers the service worker globally (previously it only
 * registered when the user enabled push), surfaces an install affordance, and
 * shows offline / pending-sync status. Renders small fixed UI at the bottom.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaBootstrap() {
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [clientPending, setClientPending] = useState(0)
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  // Register the service worker + wire up message/online listeners.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {})

    setOffline(!navigator.onLine)

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'vitatrack:sync' && typeof e.data.pending === 'number') {
        setPending(e.data.pending)
      }
    }
    const askPending = () => {
      navigator.serviceWorker.controller?.postMessage({ type: 'vitatrack:pending' })
    }
    const goOnline = () => {
      setOffline(false)
      // Trigger a replay even where Background Sync isn't available.
      navigator.serviceWorker.controller?.postMessage({ type: 'vitatrack:replay' })
    }
    const goOffline = () => setOffline(true)

    // Client-direct offline write queue (R1) — no-op unless the flag is on.
    initClientQueue()
    const onClientQueue = (e: Event) => setClientPending((e as CustomEvent<number>).detail ?? 0)
    window.addEventListener('vitatrack:clientq', onClientQueue as EventListener)

    navigator.serviceWorker.addEventListener('message', onMessage)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    navigator.serviceWorker.ready.then(askPending)

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('vitatrack:clientq', onClientQueue as EventListener)
    }
  }, [])

  // Capture the install prompt + detect installed state.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setInstallEvt(null) }
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    if (standalone) setInstalled(true)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!installEvt) return
    await installEvt.prompt()
    await installEvt.userChoice
    setInstallEvt(null)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none flex flex-col items-center gap-2 p-3">
      {offline && (
        <div className="pointer-events-auto rounded-full bg-gray-900 text-white text-sm font-medium px-4 py-2 shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Offline — changes will sync when you reconnect
        </div>
      )}

      {!offline && (pending + clientPending) > 0 && (
        <div className="pointer-events-auto rounded-full bg-brand-900 text-white text-sm font-medium px-4 py-2 shadow-lg flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          Syncing {pending + clientPending} pending change{(pending + clientPending) === 1 ? '' : 's'}…
        </div>
      )}

      {installEvt && !installed && (
        <button
          onClick={install}
          className="pointer-events-auto rounded-full bg-white border border-gray-200 text-brand-900 text-sm font-semibold px-4 py-2 shadow-lg hover:bg-brand-50 transition-colors flex items-center gap-2"
        >
          ⤓ Install VitaTrack
        </button>
      )}
    </div>
  )
}
