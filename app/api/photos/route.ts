import { query } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const sessionId = decoded.sessionId

    const result = await query(
      `SELECT id, file_name, blob_url, file_size, width, height, mime_type,
              latitude, longitude, location_name, notes, incident_id, created_at
       FROM photos
       WHERE session_id = @sessionId
       ORDER BY created_at DESC`,
      { sessionId }
    )

    const photos = result.rows.map((row: any) => ({
      id: row.id,
      fileName: row.file_name,
      thumbnailUrl: `/api/photos/${row.id}/image?type=thumbnail&token=${encodeURIComponent(token!)}`,
      originalUrl: `/api/photos/${row.id}/image?type=original&token=${encodeURIComponent(token!)}`,
      fileSize: Number(row.file_size) || 0,
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
      mimeType: row.mime_type,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      locationName: row.location_name,
      notes: row.notes,
      incidentId: row.incident_id,
      createdAt: row.created_at,
    }))

    return Response.json({ photos })
  } catch (error) {
    console.error('Photos fetch error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch photos' },
      { status: 500 }
    )
  }
}
