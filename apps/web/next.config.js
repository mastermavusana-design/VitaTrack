const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vitatrack/shared'],
  images: {
    domains: [],
  },
  // The monorepo uses node-linker=hoisted (required for Expo on Windows) with mixed
  // React majors — web is React 18 (Next 14 only supports 18), mobile is React 19
  // (Expo 54). In the flat node_modules, React 19 sits at the root and can leak into
  // the web build, crashing `next build` static generation with a duplicate-React
  // "Cannot read properties of null (reading 'useContext')". Pin every react/react-dom
  // import in the web build to this app's own React 18 copies so resolution is
  // deterministic regardless of hoisting.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    }
    return config
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
