/**
 * On-device OCR via Tesseract.js, loaded lazily from jsdelivr (allow-listed in
 * the CSP). No npm dependency, so the pnpm lockfile / Vercel build stay untouched.
 * The image never leaves the device — matches the app's on_device/POPIA design.
 */

const TESSERACT_VERSION = '5'
const CDN = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`

declare global {
  interface Window { Tesseract?: any }
}

let loader: Promise<any> | null = null

/** Inject the Tesseract UMD bundle once and resolve with window.Tesseract. */
function loadTesseract(): Promise<any> {
  if (typeof window !== 'undefined' && window.Tesseract) return Promise.resolve(window.Tesseract)
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = CDN
    s.async = true
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract failed to initialise'))
    s.onerror = () => reject(new Error('Could not load the OCR engine (offline?)'))
    document.head.appendChild(s)
  })
  return loader
}

export interface OcrProgress { status: string; progress: number }

/**
 * Run OCR over an image source (canvas, blob, data URL or ImageData).
 * Returns the recognised plain text. Paths are pinned to jsdelivr / tessdata
 * so every network fetch is CSP-allowed.
 */
export async function ocrImage(
  image: HTMLCanvasElement | Blob | string,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const Tesseract = await loadTesseract()
  const result = await Tesseract.recognize(image, 'eng', {
    corePath:   `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`,
    workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`,
    langPath:   'https://tessdata.projectnaptha.com/4.0.0',
    logger: (m: any) => onProgress?.({ status: m.status ?? '', progress: m.progress ?? 0 }),
  })
  return (result?.data?.text ?? '').trim()
}
