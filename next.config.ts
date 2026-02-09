import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // Use system TLS certs (required for HHS proxy/network)
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },

  // Pin tailwindcss resolution to project node_modules (prevents Turbopack
  // from walking up to the parent directory and failing to resolve)
  turbopack: {
    resolveAlias: {
      tailwindcss: 'tailwindcss/index.css',
    },
  },

  // Security Headers - OWASP & CIS Compliance
  async headers() {
    return [
      // Cache static hero images for 7 days (CDN/Front Door)
      {
        source: '/hero-:slug.webp',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, immutable' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // XSS Protection
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer Policy - OWASP
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions Policy - OWASP
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), payment=()',
          },
          // HSTS - Enforce HTTPS
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          // CSP - Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.zippopotam.us https://login.microsoftonline.com; form-action 'self' https://login.microsoftonline.com; frame-ancestors 'none';",
          },
        ],
      },
    ]
  },

  // Disable powered by header
  poweredByHeader: false,

  // Production optimizations
  productionBrowserSourceMaps: false,

  // Compress responses
  compress: true,
}

export default nextConfig

