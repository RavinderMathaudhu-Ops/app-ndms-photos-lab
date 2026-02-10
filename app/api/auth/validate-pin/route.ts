import { query } from '@/lib/db'
import { signToken } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { validation, secureErrorResponse, createAuditLog, writeAuditLog } from '@/lib/security'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  try {
    // Get client IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const rateLimitKey = `pin-attempt:${ip}`

    // Rate limit: 5 attempts per minute, then 15 min lockout
    const limit = rateLimit(rateLimitKey, {
      maxAttempts: 5,
      windowMs: 60 * 1000,
      lockoutMs: 15 * 60 * 1000,
    })

    if (!limit.allowed) {
      // Log rate limit exceeded
      console.warn(`⚠️ Rate limit exceeded for PIN validation from ${ip}`)
      await writeAuditLog('auth', null, 'pin.auth_rate_limited', 'anonymous', req, {
        reason: 'PIN validation rate limit exceeded',
        retryAfter: limit.retryAfter,
      })
      return Response.json(
        { error: `Too many attempts. Try again in ${limit.retryAfter} seconds.` },
        {
          status: 429,
          headers: { 'Retry-After': limit.retryAfter?.toString() || '' },
        }
      )
    }

    const { pin } = await req.json()

    // OWASP: Input Validation
    const validation_result = validation.validatePin(pin)
    if (!validation_result.valid) {
      // Log failed validation
      const auditLog = createAuditLog('AUTH_FAILURE', req, {
        reason: 'Invalid PIN format',
        remainingAttempts: limit.remaining,
      })
      console.warn('AUTH_FAILURE:', auditLog)
      await writeAuditLog('auth', null, 'pin.auth_failure', 'anonymous', req, {
        reason: 'Invalid PIN format',
        remainingAttempts: limit.remaining,
      })

      return Response.json({ error: validation_result.error }, { status: 400 })
    }
    // Fetch all non-expired sessions and compare hashes (bcrypt can't do WHERE)
    const result = await query(
      `SELECT id, pin, team_name FROM upload_sessions
       WHERE expires_at > GETUTCDATE() AND is_active = 1`,
      {}
    )

    let matchedSession: { id: string; team_name: string } | null = null
    for (const row of result.rows) {
      if (await bcrypt.compare(pin, row.pin)) {
        matchedSession = row
        break
      }
    }

    if (!matchedSession) {
      // Log failed PIN validation
      const auditLog = createAuditLog('AUTH_FAILURE', req, {
        reason: 'Invalid or expired PIN',
        remainingAttempts: limit.remaining,
      })
      console.warn('AUTH_FAILURE:', auditLog)
      await writeAuditLog('auth', null, 'pin.auth_failure', 'anonymous', req, {
        reason: 'Invalid or expired PIN',
        remainingAttempts: limit.remaining,
      })

      return Response.json(
        { error: `Invalid or expired PIN. ${limit.remaining} attempts remaining.` },
        { status: 401 }
      )
    }

    const sessionId = matchedSession.id
    const teamName = matchedSession.team_name
    const token = signToken({ sessionId }, '24h')

    // Track PIN usage — update last_used_at
    try {
      await query(
        `UPDATE upload_sessions SET last_used_at = GETUTCDATE() WHERE id = @id`,
        { id: sessionId }
      )
    } catch {
      // Non-critical — auth still succeeds
    }

    // Log successful authentication
    const auditLog = createAuditLog('AUTH_SUCCESS', req, {
      sessionId,
      teamName,
    })
    console.log('✅ AUTH_SUCCESS:', auditLog)
    await writeAuditLog('auth', sessionId, 'pin.auth_success', `pin:${sessionId}`, req, {
      teamName,
    })

    return Response.json({
      sessionId,
      teamName,
      token,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('PIN validation error:', error)
    return Response.json({ error: 'Validation failed' }, { status: 500 })
  }
}
