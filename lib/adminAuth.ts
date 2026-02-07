import { timingSafeEqual } from 'crypto'
import { auth } from '@/auth'

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

export interface AdminContext {
  isAuthorized: boolean
  adminEmail: string | null
  authMethod: 'entra_id' | 'admin_token' | null
}

/**
 * Verify admin authorization via Entra ID session or ADMIN_TOKEN header fallback.
 * Returns the admin context with auth method and identity.
 */
export async function requireAdmin(req: Request): Promise<AdminContext> {
  // Try Entra ID session first
  const session = await auth()
  if (session?.user) {
    return {
      isAuthorized: true,
      adminEmail: session.user.email || session.user.name || 'admin',
      authMethod: 'entra_id',
    }
  }

  // Fallback to ADMIN_TOKEN header
  const adminToken = req.headers.get('x-admin-token') || ''
  if (safeCompare(adminToken, process.env.ADMIN_TOKEN || '')) {
    return {
      isAuthorized: true,
      adminEmail: 'admin-token',
      authMethod: 'admin_token',
    }
  }

  return { isAuthorized: false, adminEmail: null, authMethod: null }
}

/**
 * Guard helper — returns 401 Response if not authorized, null if OK.
 */
export async function guardAdmin(req: Request): Promise<{ ctx: AdminContext; error?: Response }> {
  const ctx = await requireAdmin(req)
  if (!ctx.isAuthorized) {
    return { ctx, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ctx }
}
