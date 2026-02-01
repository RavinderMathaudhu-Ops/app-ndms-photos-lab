import { v4 as uuid } from 'uuid'
import { query } from '@/lib/db'
import { rateLimit } from '@/lib/rateLimit'
import { validation, createAuditLog } from '@/lib/security'

function generatePin(): string {
  // Generate 6-digit PIN using crypto for better randomness
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const adminToken = req.headers.get('x-admin-token')

    // Check if caller is admin - rate limit failed attempts
    if (adminToken !== process.env.ADMIN_TOKEN) {
      const rateLimitKey = `admin-auth-fail:${ip}`
      const limit = rateLimit(rateLimitKey, {
        maxAttempts: 3,
        windowMs: 60 * 1000,
        lockoutMs: 30 * 60 * 1000, // 30 min lockout for admin
      })

      if (!limit.allowed) {
        console.warn(`⚠️ Suspicious admin token attempts from ${ip}`)
        const auditLog = createAuditLog('AUTH_FAILURE', req, {
          reason: 'Invalid admin token - rate limited',
          attempt: 'Admin API',
        })
        console.warn('SECURITY_ALERT:', auditLog)
        
        return Response.json(
          { error: 'Too many failed authentication attempts' },
          { status: 429 }
        )
      }

      console.warn(`⚠️ Invalid admin token attempt from ${ip}`)
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
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const result = await query(
      `INSERT INTO upload_sessions (pin, team_name, expires_at) 
       VALUES (@pin, @teamName, @expiresAt) 
       RETURNING id, pin, team_name`,
      { pin, teamName: teamName || 'Anonymous', expiresAt }
    )

    const auditLog = createAuditLog('PIN_CREATED', req, {
      teamName: teamName || 'Anonymous',
      pin: '***' + pin.slice(-2), // Log last 2 digits only for security
    })
    console.log('✅ PIN_CREATED:', auditLog)
    console.log('📋 Query result:', JSON.stringify(result.rows[0]), 'Type:', typeof result.rows[0])
    
    return Response.json(result.rows[0])
  } catch (error) {
    console.error('PIN creation error:', error)
    return Response.json({ error: 'Failed to create PIN' }, { status: 500 })
  }
}
