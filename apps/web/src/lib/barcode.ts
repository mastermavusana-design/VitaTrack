/**
 * Barcode / QR detection using the native BarcodeDetector API
 * (Chrome/Android — the primary phone-scanning target). Degrades gracefully
 * where unsupported: callers should check `barcodeDetectionSupported()`.
 */

const FORMATS = [
  'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'itf', 'data_matrix', 'pdf417', 'codabar',
]

export interface BarcodeHit { rawValue: string; format: string }

export function barcodeDetectionSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

let detector: any = null

async function getDetector(): Promise<any | null> {
  if (!barcodeDetectionSupported()) return null
  if (detector) return detector
  try {
    // Only request formats the platform actually supports.
    const supported: string[] = (await (window as any).BarcodeDetector.getSupportedFormats?.()) ?? FORMATS
    const wanted = FORMATS.filter(f => supported.includes(f))
    detector = new (window as any).BarcodeDetector({ formats: wanted.length ? wanted : undefined })
    return detector
  } catch {
    return null
  }
}

/** Detect the first barcode/QR in a video frame or image. Returns null if none. */
export async function detectBarcode(
  source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
): Promise<BarcodeHit | null> {
  const d = await getDetector()
  if (!d) return null
  try {
    const hits = await d.detect(source)
    if (hits && hits.length > 0) {
      return { rawValue: hits[0].rawValue, format: hits[0].format }
    }
  } catch {
    /* transient decode errors are expected between frames */
  }
  return null
}

/** True for retail/product-style barcodes (as opposed to a QR code). */
export function isProductBarcode(format: string): boolean {
  return ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'data_matrix', 'codabar'].includes(format)
}
