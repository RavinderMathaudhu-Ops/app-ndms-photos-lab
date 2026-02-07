import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'
import { signImageUrl } from '@/lib/auth'

export async function GET(req: Request) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor') // last photo ID for cursor-based pagination
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
  const search = url.searchParams.get('search') || ''
  const incident = url.searchParams.get('incident') || ''
  const status = url.searchParams.get('status') || ''
  const dateFrom = url.searchParams.get('dateFrom') || ''
  const dateTo = url.searchParams.get('dateTo') || ''
  const sessionId = url.searchParams.get('sessionId') || ''
  const sort = url.searchParams.get('sort') || 'newest'

  try {
    // Build dynamic WHERE clause
    const conditions: string[] = ['1=1']
    const params: Record<string, any> = { limit }

    if (cursor) {
      conditions.push('p.created_at < (SELECT created_at FROM photos WHERE id = @cursor)')
      params.cursor = cursor
    }

    if (incident) {
      conditions.push('p.incident_id = @incident')
      params.incident = incident
    }

    if (status) {
      conditions.push('p.status = @status')
      params.status = status
    }

    if (dateFrom) {
      conditions.push('p.created_at >= @dateFrom')
      params.dateFrom = dateFrom
    }

    if (dateTo) {
      conditions.push('p.created_at <= @dateTo')
      params.dateTo = dateTo
    }

    if (sessionId) {
      conditions.push('p.session_id = @sessionId')
      params.sessionId = sessionId
    }

    if (search) {
      conditions.push(
        '(p.file_name LIKE @search OR p.location_name LIKE @search OR p.notes LIKE @search OR p.incident_id LIKE @search)'
      )
      params.search = `%${search}%`
    }

    const whereClause = conditions.join(' AND ')
    const orderClause = sort === 'oldest' ? 'p.created_at ASC' : 'p.created_at DESC'

    // Main query — uses covering index IX_photos_admin_list
    const photosResult = await query(
      `SELECT TOP (@limit)
         p.id, p.session_id, p.file_name, p.file_size, p.width, p.height,
         p.mime_type, p.latitude, p.longitude, p.location_name, p.notes,
         p.incident_id, p.status, p.storage_tier, p.date_taken, p.camera_info,
         p.created_at, p.updated_at, p.updated_by,
         s.team_name
       FROM photos p
       LEFT JOIN upload_sessions s ON p.session_id = s.id
       WHERE ${whereClause}
       ORDER BY ${orderClause}`,
      params
    )

    // Count total (for UI "X of Y photos")
    const countResult = await query(
      `SELECT COUNT(*) as total FROM photos p WHERE ${whereClause}`,
      // Remove limit from count params
      Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'limit'))
    )

    const total = countResult.rows[0]?.total || 0

    // Build signed URLs for each photo
    const photos = photosResult.rows.map((p: any) => ({
      ...p,
      thumbnailUrl: signImageUrl(p.id, 'thumbnail'),
      originalUrl: signImageUrl(p.id, 'original'),
    }))

    // Next cursor for pagination
    const nextCursor = photos.length === limit ? photos[photos.length - 1]?.id : null

    return Response.json({
      photos,
      total,
      nextCursor,
      limit,
    })
  } catch (error) {
    console.error('Admin photos list error:', error)
    return Response.json(
      { error: 'Failed to fetch photos' },
      { status: 500 }
    )
  }
}
