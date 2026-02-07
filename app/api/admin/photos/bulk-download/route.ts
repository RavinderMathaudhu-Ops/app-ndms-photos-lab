import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'
import { signImageUrl } from '@/lib/auth'

export async function POST(req: Request) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const body = await req.json()
  const { photoIds } = body as { photoIds: string[] }

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return Response.json({ error: 'photoIds are required' }, { status: 400 })
  }

  if (photoIds.length > 100) {
    return Response.json({ error: 'Maximum 100 photos per download' }, { status: 400 })
  }

  try {
    // Get photo metadata for filenames
    const params: Record<string, any> = {}
    const placeholders = photoIds.map((id, i) => {
      params[`id${i}`] = id
      return `@id${i}`
    })

    const result = await query(
      `SELECT id, file_name, file_size, incident_id
       FROM photos WHERE id IN (${placeholders.join(',')})`,
      params
    )

    // Generate signed download URLs (24-hour TTL)
    const downloads = result.rows.map((p: any) => ({
      id: p.id,
      fileName: p.file_name,
      fileSize: p.file_size,
      incidentId: p.incident_id,
      url: signImageUrl(p.id, 'original', 86400),
    }))

    // Audit log
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    await query(
      `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
       VALUES ('bulk', NULL, 'bulk.download', @performedBy, @ip, @details)`,
      {
        performedBy: ctx.adminEmail,
        ip,
        details: JSON.stringify({ photoCount: downloads.length }),
      }
    )

    return Response.json({ downloads })
  } catch (error) {
    console.error('Bulk download error:', error)
    return Response.json({ error: 'Failed to generate download URLs' }, { status: 500 })
  }
}
