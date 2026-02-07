import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const { id } = await params

  try {
    const { action } = await req.json()

    if (action === 'revoke') {
      await query(
        `UPDATE upload_sessions SET is_active = 0 WHERE id = @id`,
        { id }
      )

      console.log(`Session ${id} revoked by ${ctx.adminEmail}`)
      return Response.json({ success: true, message: 'Session revoked' })
    }

    if (action === 'reactivate') {
      await query(
        `UPDATE upload_sessions SET is_active = 1 WHERE id = @id AND expires_at > GETUTCDATE()`,
        { id }
      )

      console.log(`Session ${id} reactivated by ${ctx.adminEmail}`)
      return Response.json({ success: true, message: 'Session reactivated' })
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Session update error:', err)
    return Response.json({ error: 'Failed to update session' }, { status: 500 })
  }
}
