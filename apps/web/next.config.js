/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vitatrack/shared'],
  images: {
    domains: [],
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',         value: 'DENY' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection',         value: '1; mode=block' },
          {
            // Allow the site's own pages to use the camera (needed for scanning).
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // jsdelivr hosts the on-device Tesseract.js OCR engine + wasm core.
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              // Tesseract spawns its worker from a blob URL.
              "worker-src 'self' blob:",
              // connect-src: Supabase + jsdelivr (wasm/core) + Tesseract language data.
              `connect-src 'self' blob: data: ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} https://cdn.jsdelivr.net https://tessdata.projectnaptha.com`,
            ].join('; '),
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
