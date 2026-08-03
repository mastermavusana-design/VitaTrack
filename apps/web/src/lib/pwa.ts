/**
 * PWA offline-storage helpers.
 *
 * Clears the service-worker caches (cached pages + API responses) and the
 * offline write queue. Call on sign-out so no health data is left in Cache
 * Storage / IndexedDB on a shared device.
 */
export async function clearOfflineData(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('vt-')).map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
  try {
    indexedDB.deleteDatabase('vitatrack-sync')
  } catch {
    /* ignore */
  }
}
