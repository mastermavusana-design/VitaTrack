/** Minimal ambient declaration for the `web-push` package (no @types published). */
declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer,
    options?: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: string; headers: Record<string, string> }>
  const _default: {
    setVapidDetails: typeof setVapidDetails
    sendNotification: typeof sendNotification
  }
  export default _default
}
