import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'
import { writeAuditLog } from '@/lib/security'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const { id } = await params

  try {
    const { action } = await req.json()

    // Get team name for audit context
    const sessionResult = await query(
      `SELECT team_name FROM upload_sessions WHERE id = @id`,
      { id }
    )
    const teamName = sessionResult.rows[0]?.team_name || 'unknown'

    if (action === 'revoke') {
      await query(
        `UPDATE upload_sessions SET is_active = 0 WHERE id = @id`,
        { id }
      )

      console.log(`Session ${id} revoked by ${ctx.adminEmail}`)
      await writeAuditLog('session', id, 'session.revoked', ctx.adminEmail || 'admin', req, {
        teamName,
      })
      return Response.json({ success: true, message: 'Session revoked' })
    }

    if (action === 'reactivate') {
      await query(
        `UPDATE upload_sessions SET is_active = 1 WHERE id = @id AND expires_at > GETUTCDATE()`,
        { id }
      )

      console.log(`Session ${id} reactivated by ${ctx.adminEmail}`)
      await writeAuditLog('session', id, 'session.reactivated', ctx.adminEmail || 'admin', req, {
        teamName,
      })
      return Response.json({ success: true, message: 'Session reactivated' })
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Session update error:', err)
    return Response.json({ error: 'Failed to update session' }, { status: 500 })
  }
}
