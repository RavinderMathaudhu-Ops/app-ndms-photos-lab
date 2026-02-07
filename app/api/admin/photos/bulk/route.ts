import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'
import { deleteBlobsByPrefix } from '@/lib/blobHelpers'

export async function POST(req: Request) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const body = await req.json()
  const { action, photoIds, value } = body as {
    action: 'delete' | 'tag' | 'untag' | 'status'
    photoIds: string[]
    value?: string
  }

  if (!action || !Array.isArray(photoIds) || photoIds.length === 0) {
    return Response.json({ error: 'action and photoIds are required' }, { status: 400 })
  }

  if (photoIds.length > 200) {
    return Response.json({ error: 'Maximum 200 photos per bulk operation' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for') || 'unknown'

  try {
    let affected = 0

    switch (action) {
      case 'delete': {
        // Delete blobs for each photo
        for (const id of photoIds) {
          await deleteBlobsByPrefix(`${id}/`)
          await deleteBlobsByPrefix(`renditions/${id}/`)
        }
        // Build parameterized IN clause
        const deleteParams: Record<string, any> = {}
        const placeholders = photoIds.map((id, i) => {
          deleteParams[`id${i}`] = id
          return `@id${i}`
        })
        const result = await query(
          `DELETE FROM photos WHERE id IN (${placeholders.join(',')})`,
          deleteParams
        )
        affected = photoIds.length
        break
      }

      case 'status': {
        const allowed = ['active', 'reviewed', 'flagged', 'archived']
        if (!value || !allowed.includes(value)) {
          return Response.json({ error: 'Invalid status value' }, { status: 400 })
        }
        const statusParams: Record<string, any> = {
          status: value,
          updatedBy: ctx.adminEmail,
        }
        const statusPlaceholders = photoIds.map((id, i) => {
          statusParams[`id${i}`] = id
          return `@id${i}`
        })
        await query(
          `UPDATE photos
           SET status = @status, updated_at = GETDATE(), updated_by = @updatedBy
           WHERE id IN (${statusPlaceholders.join(',')})`,
          statusParams
        )
        affected = photoIds.length
        break
      }

      case 'tag': {
        if (!value) {
          return Response.json({ error: 'tag ID is required' }, { status: 400 })
        }
        for (const photoId of photoIds) {
          try {
            await query(
              `IF NOT EXISTS (SELECT 1 FROM photo_tags WHERE photo_id = @photoId AND tag_id = @tagId)
               INSERT INTO photo_tags (photo_id, tag_id, added_by) VALUES (@photoId, @tagId, @addedBy)`,
              { photoId, tagId: value, addedBy: ctx.adminEmail }
            )
            affected++
          } catch {
            // Skip duplicates
          }
        }
        break
      }

      case 'untag': {
        if (!value) {
          return Response.json({ error: 'tag ID is required' }, { status: 400 })
        }
        const untagParams: Record<string, any> = { tagId: value }
        const untagPlaceholders = photoIds.map((id, i) => {
          untagParams[`id${i}`] = id
          return `@id${i}`
        })
        await query(
          `DELETE FROM photo_tags WHERE tag_id = @tagId AND photo_id IN (${untagPlaceholders.join(',')})`,
          untagParams
        )
        affected = photoIds.length
        break
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 })
    }

    // Audit log
    await query(
      `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
       VALUES ('bulk', NULL, @action, @performedBy, @ip, @details)`,
      {
        action: `bulk.${action}`,
        performedBy: ctx.adminEmail,
        ip,
        details: JSON.stringify({ photoCount: photoIds.length, value }),
      }
    )

    return Response.json({ success: true, affected })
  } catch (error) {
    console.error('Bulk operation error:', error)
    return Response.json({ error: 'Bulk operation failed' }, { status: 500 })
  }
}
