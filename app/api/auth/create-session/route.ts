import { randomInt } from 'crypto'
import { query } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { validation, createAuditLog, writeAuditLog } from '@/lib/security'
import { auth } from '@/auth'
import bcrypt from 'bcryptjs'

const PIN_SALT_ROUNDS = 10

function generatePin(): string {
  // NIST SP 800-63B: Use CSPRNG for authentication secrets
  return randomInt(100000, 999999).toString()
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'

    // --- Auth check: Entra ID session required ---
    const session = await auth()
    const adminUser = session?.user?.email || session?.user?.name || 'entra-user'
    const authMethod = 'entra-id'

    if (!session?.user) {
      const rateLimitKey = `admin-auth-fail:${ip}`
      const limit = rateLimit(rateLimitKey, {
        maxAttempts: 3,
        windowMs: 60 * 1000,
        lockoutMs: 30 * 60 * 1000, // 30 min lockout for admin
      })

      if (!limit.allowed) {
        console.warn(`⚠️ Suspicious admin auth attempts from ${ip}`)
        const auditLog = createAuditLog('AUTH_FAILURE', req, {
          reason: 'Invalid admin auth - rate limited',
          attempt: 'Admin API',
        })
        console.warn('SECURITY_ALERT:', auditLog)
        await writeAuditLog('auth', null, 'admin.auth_rate_limited', 'anonymous', req, {
          reason: 'Admin auth rate limit exceeded',
        })

        return Response.json(
          { error: 'Too many failed authentication attempts' },
          { status: 429 }
        )
      }

      console.warn(`⚠️ Invalid admin auth attempt from ${ip}`)
      await writeAuditLog('auth', null, 'admin.auth_failure', 'anonymous', req, {
        reason: 'No valid Entra ID session',
      })
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin authenticated - rate limit PIN generation
    const rateLimitKey = `pin-creation:${ip}`
    const limit = rateLimit(rateLimitKey, {
      maxAttempts: 20, // 20 PINs per minute max
      windowMs: 60 * 1000,
    })

    if (!limit.allowed) {
      console.warn(`⚠️ Excessive PIN generation from ${ip}`)
      const auditLog = createAuditLog('RATE_LIMIT_EXCEEDED', req, {
        reason: 'PIN generation rate limit exceeded',
      })
      console.warn('SECURITY_ALERT:', auditLog)
      await writeAuditLog('auth', null, 'pin.rate_limited', adminUser, req, {
        reason: 'PIN generation rate limit exceeded',
      })

      return Response.json(
        { error: 'Rate limit exceeded for PIN generation' },
        { status: 429 }
      )
    }

    const { teamName } = await req.json()

    // OWASP: Input Validation
    if (teamName) {
      const validation_result = validation.validateTeamName(teamName)
      if (!validation_result.valid) {
        return Response.json({ error: validation_result.error }, { status: 400 })
      }
    }

    const pin = generatePin()
    const pinHash = await bcrypt.hash(pin, PIN_SALT_ROUNDS)
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours

    const result = await query(
      `INSERT INTO upload_sessions (pin, team_name, expires_at)
       OUTPUT INSERTED.id, INSERTED.team_name
       VALUES (@pinHash, @teamName, @expiresAt)`,
      { pinHash, teamName: teamName || 'Anonymous', expiresAt }
    )

    const auditLog = createAuditLog('PIN_CREATED', req, {
      teamName: teamName || 'Anonymous',
      pin: '***' + pin.slice(-2), // Log last 2 digits only for security
      authMethod,
      adminUser,
    })
    console.log('✅ PIN_CREATED:', auditLog)

    // Persist to DB audit log
    await writeAuditLog('session', result.rows[0].id, 'pin.created', adminUser, req, {
      teamName: teamName || 'Anonymous',
      pinLast2: pin.slice(-2),
      authMethod,
      expiresAt: expiresAt.toISOString(),
    })

    // Return plaintext PIN only once at creation (admin gives to team verbally)
    return Response.json({ ...result.rows[0], pin }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('PIN creation error:', error)
    return Response.json({ error: 'Failed to create PIN' }, { status: 500 })
  }
}
