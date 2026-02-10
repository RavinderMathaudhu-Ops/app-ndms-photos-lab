/**
 * Security Middleware - OWASP & CIS Compliance
 * Implements security headers, input validation, and protection mechanisms
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Security Headers Implementation
 * Prevents: XSS, Clickjacking, MIME type sniffing, etc.
 */
export const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff', // Prevent MIME sniffing
  'X-Frame-Options': 'DENY', // Clickjacking protection
  'X-XSS-Protection': '1; mode=block', // Legacy XSS protection
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
}

/**
 * Input Validation Functions
 */
export const validation = {
  /**
   * Validate PIN format
   * OWASP: Broken Input Validation
   */
  validatePin(pin: string): { valid: boolean; error?: string } {
    if (!pin) return { valid: false, error: 'PIN is required' }
    if (!/^\d{6}$/.test(pin)) {
      return { valid: false, error: 'PIN must be exactly 6 digits' }
    }
    return { valid: true }
  },

  /**
   * Validate Team Name
   * Prevents: Injection attacks, XSS
   */
  validateTeamName(name: string): { valid: boolean; error?: string } {
    if (!name) return { valid: false, error: 'Team name is required' }
    if (name.length > 255) return { valid: false, error: 'Team name too long' }
    // Only allow alphanumeric, spaces, hyphens, underscores
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
      return { valid: false, error: 'Team name contains invalid characters' }
    }
    return { valid: true }
  },

  /**
   * Validate File Upload
   * OWASP: Unrestricted File Upload
   */
  validateFile(file: {
    name: string
    size: number
    type: string
  }): { valid: boolean; error?: string } {
    const MAX_SIZE = 50 * 1024 * 1024 // 50MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

    if (!file) return { valid: false, error: 'File is required' }
    if (file.size === 0) return { valid: false, error: 'File is empty' }
    if (file.size > MAX_SIZE) {
      return { valid: false, error: `File exceeds ${MAX_SIZE / 1024 / 1024}MB limit` }
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: 'File type not allowed (JPEG, PNG, WebP only)' }
    }
    // Validate filename
    if (!/^[\w\s\-\.]+$/.test(file.name)) {
      return { valid: false, error: 'Filename contains invalid characters' }
    }
    return { valid: true }
  },

  /**
   * Validate Coordinates
   * Prevents: Invalid geolocation data
   */
  validateCoordinates(lat: number, lng: number): { valid: boolean; error?: string } {
    if (lat === undefined || lng === undefined) {
      return { valid: true } // Optional field
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return { valid: false, error: 'Coordinates must be numbers' }
    }
    if (lat < -90 || lat > 90) {
      return { valid: false, error: 'Latitude must be between -90 and 90' }
    }
    if (lng < -180 || lng > 180) {
      return { valid: false, error: 'Longitude must be between -180 and 180' }
    }
    return { valid: true }
  },

  /**
   * Validate Notes/Text Input
   * Prevents: XSS, injection
   */
  validateNotes(notes: string, maxLength = 1000): { valid: boolean; error?: string } {
    if (!notes) return { valid: true } // Optional field
    if (typeof notes !== 'string') {
      return { valid: false, error: 'Notes must be text' }
    }
    if (notes.length > maxLength) {
      return { valid: false, error: `Notes must be under ${maxLength} characters` }
    }
    return { valid: true }
  },

  /**
   * Validate Incident ID
   * Format: HU-2024-001
   */
  validateIncidentId(id: string): { valid: boolean; error?: string } {
    if (!id) return { valid: true } // Optional field
    if (id.length > 50) {
      return { valid: false, error: 'Incident ID must be under 50 characters' }
    }
    if (!/^[a-zA-Z0-9\-_]+$/.test(id)) {
      return { valid: false, error: 'Incident ID contains invalid characters' }
    }
    return { valid: true }
  },
}

/**
 * Output Encoding Functions
 * Prevents: XSS attacks
 */
export const encoding = {
  /**
   * HTML Encode - Prevent XSS
   */
  htmlEncode(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return text.replace(/[&<>"']/g, (char) => map[char])
  },

  /**
   * JSON Stringify (safe serialization)
   */
  safeJson(obj: any): string {
    try {
      return JSON.stringify(obj)
    } catch (error) {
      console.error('JSON serialization error:', error)
      return '{}'
    }
  },
}

/**
 * Middleware for Next.js
 * Apply to all API routes
 */
export function withSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

/**
 * Error Response Handler
 * OWASP: Information Disclosure
 * Never expose internal error details to user
 */
export function secureErrorResponse(
  error: unknown,
  statusCode: number = 500
): { message: string; error?: string } {
  console.error('API Error:', error)

  // Don't expose internal errors to client
  if (statusCode === 500) {
    return { message: 'Internal server error. Please contact support.' }
  }

  // Safe error messages for specific statuses
  const errorMap: { [key: number]: string } = {
    400: 'Bad request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    429: 'Too many requests',
    500: 'Internal server error',
  }

  return { message: errorMap[statusCode] || 'An error occurred' }
}

/**
 * Request Context Extractor
 * OWASP: Logging & Monitoring
 */
export function extractRequestContext(req: Request): {
  ip: string
  userAgent: string
  method: string
  path: string
  timestamp: string
} {
  return {
    ip: req.headers.get('x-forwarded-for') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
    method: req.method,
    path: new URL(req.url).pathname,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Audit Log Entry
 * For security event logging (console)
 */
export interface AuditLog {
  timestamp: string
  event: 'AUTH_SUCCESS' | 'AUTH_FAILURE' | 'UPLOAD_SUCCESS' | 'UPLOAD_FAILURE' | 'PIN_CREATED' | 'RATE_LIMIT_EXCEEDED'
  ip: string
  userId?: string
  sessionId?: string
  details: Record<string, any>
}

export function createAuditLog(
  event: AuditLog['event'],
  req: Request,
  details: Record<string, any> = {}
): AuditLog {
  const context = extractRequestContext(req)
  return {
    timestamp: context.timestamp,
    event,
    ip: context.ip,
    details: {
      ...details,
      userAgent: context.userAgent,
    },
  }
}

/**
 * Persistent Audit Log — writes to admin_audit_log table in DB
 * NIST 800-53 AU-2/AU-3/AU-12: All security-relevant events must be
 * recorded with who, what, when, where (IP), and outcome.
 *
 * This is fire-and-forget — audit failures never block the primary operation.
 */
export async function writeAuditLog(
  entityType: string,
  entityId: string | null,
  action: string,
  performedBy: string,
  req: Request,
  details: Record<string, any> = {}
): Promise<void> {
  try {
    const { query: dbQuery } = await import('@/lib/db')
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const ua = req.headers.get('user-agent') || 'unknown'
    await dbQuery(
      `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
       VALUES (@entityType, @entityId, @action, @performedBy, @ip, @details)`,
      {
        entityType,
        entityId,
        action,
        performedBy,
        ip,
        details: JSON.stringify({ ...details, userAgent: ua }),
      }
    )
  } catch {
    // Non-critical — never block the primary operation for audit
  }
}
