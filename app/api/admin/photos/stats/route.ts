import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'

export async function GET(req: Request) {
  const { error } = await guardAdmin(req)
  if (error) return error

  try {
    // Global totals
    const totals = await query(
      `SELECT
         COUNT(*) AS total_photos,
         ISNULL(SUM(file_size), 0) AS total_size_bytes,
         COUNT(DISTINCT session_id) AS total_teams,
         COUNT(DISTINCT incident_id) AS total_incidents,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed_count,
         SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) AS flagged_count,
         SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived_count,
         MIN(created_at) AS earliest_upload,
         MAX(created_at) AS latest_upload
       FROM photos`,
      {}
    )

    // Per-incident breakdown (from view or inline)
    const incidents = await query(
      `SELECT
         ISNULL(incident_id, '(No Incident)') AS incident_id,
         COUNT(*) AS photo_count,
         SUM(file_size) AS total_size_bytes,
         COUNT(DISTINCT session_id) AS team_count,
         MIN(created_at) AS first_upload,
         MAX(created_at) AS last_upload
       FROM photos
       GROUP BY ISNULL(incident_id, '(No Incident)')
       ORDER BY MAX(created_at) DESC`,
      {}
    )

    // Uploads per day (last 30 days)
    const daily = await query(
      `SELECT
         CAST(created_at AS DATE) AS upload_date,
         COUNT(*) AS photo_count,
         SUM(file_size) AS total_size
       FROM photos
       WHERE created_at >= DATEADD(DAY, -30, GETDATE())
       GROUP BY CAST(created_at AS DATE)
       ORDER BY upload_date DESC`,
      {}
    )

    // Top teams by upload count
    const teams = await query(
      `SELECT TOP 10
         s.team_name,
         COUNT(p.id) AS photo_count,
         SUM(p.file_size) AS total_size
       FROM photos p
       JOIN upload_sessions s ON p.session_id = s.id
       GROUP BY s.team_name
       ORDER BY COUNT(p.id) DESC`,
      {}
    )

    return Response.json({
      totals: totals.rows[0] || {},
      incidents: incidents.rows,
      daily: daily.rows,
      teams: teams.rows,
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return Response.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
