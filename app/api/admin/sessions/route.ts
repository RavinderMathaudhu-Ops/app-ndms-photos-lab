import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'

export async function GET(req: Request) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  try {
    const result = await query(
      `SELECT
         s.id,
         s.team_name,
         s.expires_at,
         s.created_at,
         s.last_used_at,
         ISNULL(s.total_uploads, 0) AS total_uploads,
         CASE
           WHEN s.is_active = 0 THEN 'revoked'
           WHEN s.expires_at < GETUTCDATE() THEN 'expired'
           ELSE 'active'
         END AS status,
         COUNT(p.id) AS photo_count,
         ISNULL(SUM(p.file_size), 0) AS total_size
       FROM upload_sessions s
       LEFT JOIN photos p ON p.session_id = s.id
       GROUP BY s.id, s.team_name, s.expires_at, s.created_at, s.is_active, s.last_used_at, s.total_uploads
       ORDER BY s.created_at DESC`
    )

    return Response.json({ sessions: result.rows })
  } catch (err) {
    console.error('Session list error:', err)
    return Response.json({ error: 'Failed to load sessions' }, { status: 500 })
  }
}
