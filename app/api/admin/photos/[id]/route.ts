import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'
import { signImageUrl } from '@/lib/auth'
import { deleteBlobsByPrefix } from '@/lib/blobHelpers'
import { validation } from '@/lib/security'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, context: RouteContext) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const { id } = await context.params

  try {
    const result = await query(
      `SELECT p.*, s.team_name,
              e.camera_make, e.camera_model, e.lens_model,
              e.focal_length, e.aperture, e.shutter_speed,
              e.iso_speed, e.flash_used, e.orientation,
              e.gps_altitude, e.date_taken_exif, e.software, e.raw_json
       FROM photos p
       LEFT JOIN upload_sessions s ON p.session_id = s.id
       LEFT JOIN photo_exif e ON p.id = e.photo_id
       WHERE p.id = @id`,
      { id }
    )

    if (!result.rows.length) {
      return Response.json({ error: 'Photo not found' }, { status: 404 })
    }

    const photo = result.rows[0]

    // Get tags
    const tagsResult = await query(
      `SELECT t.id, t.name, t.category, t.color, pt.added_by, pt.added_at
       FROM photo_tags pt
       JOIN tags t ON pt.tag_id = t.id
       WHERE pt.photo_id = @id`,
      { id }
    )

    // Get renditions
    const renditionsResult = await query(
      `SELECT variant_type, blob_path, width, height, file_size, mime_type
       FROM photo_renditions WHERE photo_id = @id`,
      { id }
    )

    // Get edit history
    const editsResult = await query(
      `SELECT id, edit_type, edit_params, edited_by, created_at
       FROM photo_edits WHERE photo_id = @id
       ORDER BY created_at DESC`,
      { id }
    )

    return Response.json({
      ...photo,
      thumbnailUrl: signImageUrl(id, 'thumbnail'),
      originalUrl: signImageUrl(id, 'original'),
      tags: tagsResult.rows,
      renditions: renditionsResult.rows,
      editHistory: editsResult.rows,
    })
  } catch (error) {
    console.error('Admin photo detail error:', error)
    return Response.json({ error: 'Failed to fetch photo' }, { status: 500 })
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const { id } = await context.params
  const body = await req.json()

  // Validate inputs
  if (body.notes !== undefined) {
    const v = validation.validateNotes(body.notes)
    if (!v.valid) return Response.json({ error: v.error }, { status: 400 })
  }
  if (body.incidentId !== undefined) {
    const v = validation.validateIncidentId(body.incidentId)
    if (!v.valid) return Response.json({ error: v.error }, { status: 400 })
  }
  if (body.latitude !== undefined || body.longitude !== undefined) {
    const v = validation.validateCoordinates(body.latitude ?? 0, body.longitude ?? 0)
    if (!v.valid) return Response.json({ error: v.error }, { status: 400 })
  }
  if (body.status !== undefined) {
    const allowed = ['active', 'reviewed', 'flagged', 'archived']
    if (!allowed.includes(body.status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 })
    }
  }

  try {
    // Build SET clause dynamically
    const sets: string[] = ['updated_at = GETDATE()', 'updated_by = @updatedBy']
    const params: Record<string, any> = { id, updatedBy: ctx.adminEmail }

    const fieldMap: Record<string, string> = {
      incidentId: 'incident_id',
      locationName: 'location_name',
      notes: 'notes',
      status: 'status',
      latitude: 'latitude',
      longitude: 'longitude',
      dateTaken: 'date_taken',
      cameraInfo: 'camera_info',
    }

    for (const [jsKey, sqlCol] of Object.entries(fieldMap)) {
      if (body[jsKey] !== undefined) {
        sets.push(`${sqlCol} = @${jsKey}`)
        params[jsKey] = body[jsKey]
      }
    }

    await query(
      `UPDATE photos SET ${sets.join(', ')} WHERE id = @id`,
      params
    )

    // Audit log
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    await query(
      `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
       VALUES ('photo', @id, 'photo.metadata_updated', @performedBy, @ip, @details)`,
      {
        id,
        performedBy: ctx.adminEmail,
        ip,
        details: JSON.stringify(body),
      }
    )

    return Response.json({ success: true })
  } catch (error) {
    console.error('Admin photo update error:', error)
    return Response.json({ error: 'Failed to update photo' }, { status: 500 })
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const { id } = await context.params

  try {
    // Get photo info for audit (include session_id for usage tracking)
    const photoResult = await query(
      `SELECT file_name, file_size, session_id FROM photos WHERE id = @id`,
      { id }
    )
    if (!photoResult.rows.length) {
      return Response.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Delete blobs (original, thumbnail, and all renditions)
    const deletedCount = await deleteBlobsByPrefix(`${id}/`)
    const renditionsDeleted = await deleteBlobsByPrefix(`renditions/${id}/`)

    // Delete from DB (CASCADE handles renditions, exif, tags, edits)
    await query(`DELETE FROM photos WHERE id = @id`, { id })

    // Audit log
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    await query(
      `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
       VALUES ('photo', @id, 'photo.deleted', @performedBy, @ip, @details)`,
      {
        id,
        performedBy: ctx.adminEmail,
        ip,
        details: JSON.stringify({
          fileName: photoResult.rows[0].file_name,
          fileSize: photoResult.rows[0].file_size,
          sessionId: photoResult.rows[0].session_id,
          blobsDeleted: deletedCount + renditionsDeleted,
        }),
      }
    )

    return Response.json({ success: true, blobsDeleted: deletedCount + renditionsDeleted })
  } catch (error) {
    console.error('Admin photo delete error:', error)
    return Response.json({ error: 'Failed to delete photo' }, { status: 500 })
  }
}
