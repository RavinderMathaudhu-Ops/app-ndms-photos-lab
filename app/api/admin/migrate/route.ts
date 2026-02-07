import { timingSafeEqual } from 'crypto'
import { query } from '@/lib/db'

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

export async function POST(req: Request) {
  // Admin-only endpoint
  const adminToken = req.headers.get('x-admin-token') || ''
  if (!safeCompare(adminToken, process.env.ADMIN_TOKEN || '')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results: string[] = []

    // 1. Check current pin column size
    const cols = await query(
      `SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'upload_sessions' AND COLUMN_NAME = 'pin'`,
      {}
    )
    const currentSize = cols.rows[0]?.CHARACTER_MAXIMUM_LENGTH
    results.push(`Current pin column size: ${currentSize}`)

    if (currentSize && currentSize < 72) {
      // 2. Alter pin column for bcrypt hashes (60 chars)
      await query(
        `ALTER TABLE upload_sessions ALTER COLUMN pin NVARCHAR(72) NOT NULL`,
        {}
      )
      results.push('Altered pin column to NVARCHAR(72)')

      // 3. Delete old plaintext PINs (won't work with bcrypt.compare)
      const deleted = await query(
        `DELETE FROM upload_sessions WHERE LEN(pin) < 20`,
        {}
      )
      results.push(`Deleted old plaintext PINs`)
    } else {
      results.push('Pin column already correct size, no migration needed')
    }

    // 4. Verify
    const verify = await query(
      `SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'upload_sessions' AND COLUMN_NAME = 'pin'`,
      {}
    )
    results.push(`Verified pin column size: ${verify.rows[0]?.CHARACTER_MAXIMUM_LENGTH}`)

    return Response.json({ success: true, results })
  } catch (error) {
    console.error('Migration error:', error)
    return Response.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
