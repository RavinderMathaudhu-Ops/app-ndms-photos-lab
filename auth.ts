/**
 * @fileoverview Auth.js v5 configuration — Entra ID (OIDC) for admin SSO
 *
 * When the Entra ID env vars are not set, the providers array is empty and
 * the admin page falls back to ADMIN_TOKEN input. PIN-based field team auth
 * is entirely separate and not managed by Auth.js.
 */

import NextAuth from 'next-auth'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'

const providers = []

if (
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Single-tenant: issuer URL locks to HHS tenant at OIDC level
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/admin',
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.provider = account.provider
      }
      return token
    },
    async session({ session, token }) {
      if (token.provider) {
        ;(session as any).provider = token.provider
      }
      return session
    },
    authorized({ auth: session, request }) {
      const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
      if (isAdminRoute) {
        // When Entra ID is not configured, allow through to ADMIN_TOKEN fallback
        if (providers.length === 0) return true
        return !!session?.user
      }
      return true
    },
  },
})

/** Whether Entra ID SSO is configured (for client UI detection) */
export const isEntraIdConfigured = !!(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER
)
