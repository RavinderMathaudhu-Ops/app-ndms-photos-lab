import sharp from 'sharp'
import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'
import { getContainerClient, getRenditionBlobPath } from '@/lib/blobHelpers'

interface RouteContext {
  params: Promise<{ id: string }>
}

const RENDITIONS = [
  { variant: 'thumb_sm.webp', width: 200, height: 150, fit: 'cover' as const, quality: 75 },
  { variant: 'thumb_md.webp', width: 400, height: 300, fit: 'inside' as const, quality: 80 },
  { variant: 'web.webp', width: 1200, height: null, fit: 'inside' as const, quality: 85 },
] as const

/**
 * POST /api/admin/photos/[id]/edit
 * Receives an edited image (from client-side cropper/editor) and:
 * 1. Saves it as a new "edited" blob
 * 2. Replaces the original and regenerates all renditions
 * 3. Records the edit in photo_edits table
 * 4. Updates the photo record dimensions
 */
export async function POST(req: Request, context: RouteContext) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  const { id } = await context.params

  try {
    // Verify photo exists
    const photoResult = await query(
      `SELECT id, file_name, mime_type FROM photos WHERE id = @id`,
      { id }
    )
    if (!photoResult.rows.length) {
      return Response.json({ error: 'Photo not found' }, { status: 404 })
    }

    const formData = await req.formData()
    const editedFile = formData.get('image') as File
    const editType = (formData.get('editType') as string) || 'edit'
    const editParams = (formData.get('editParams') as string) || '{}'

    if (!editedFile) {
      return Response.json({ error: 'No edited image provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await editedFile.arrayBuffer())
    const metadata = await sharp(buffer).metadata()

    const containerClient = getContainerClient()
    const timestamp = Date.now()

    // Save edited version as a timestamped blob
    const editedBlobPath = `renditions/${id}/edited_${timestamp}.webp`
    const editedWebP = await sharp(buffer)
      .webp({ quality: 90 })
      .toBuffer()

    await containerClient.getBlockBlobClient(editedBlobPath).upload(editedWebP, editedWebP.length, {
      blobHTTPHeaders: { blobContentType: 'image/webp' },
      metadata: { editedBy: ctx.adminEmail || 'admin', editType },
    })

    // Replace original with the edited version
    const originalPath = `${id}/original`
    await containerClient.getBlockBlobClient(originalPath).upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: editedFile.type || 'image/webp' },
      metadata: {
        editedBy: ctx.adminEmail || 'admin',
        editTime: new Date().toISOString(),
        editType,
      },
    })

    // Regenerate all renditions from the edited image
    const renditionResults = await Promise.all(
      RENDITIONS.map(async (spec) => {
        const pipeline = sharp(buffer)
          .resize(spec.width, spec.height, { fit: spec.fit, withoutEnlargement: true })
          .webp({ quality: spec.quality })
        const buf = await pipeline.toBuffer()
        const rendMeta = await sharp(buf).metadata()

        // Upload CDN rendition
        const blobPath = getRenditionBlobPath(id, spec.variant)
        await containerClient.getBlockBlobClient(blobPath).upload(buf, buf.length, {
          blobHTTPHeaders: { blobContentType: 'image/webp' },
        })

        // Update rendition record
        await query(
          `UPDATE photo_renditions SET
            width = @width, height = @height, file_size = @fileSize
           WHERE photo_id = @photoId AND variant_type = @variantType;

           IF @@ROWCOUNT = 0
           INSERT INTO photo_renditions (id, photo_id, variant_type, blob_path, width, height, file_size, mime_type)
           VALUES (NEWID(), @photoId, @variantType, @blobPath, @width, @height, @fileSize, 'image/webp')`,
          {
            photoId: id,
            variantType: spec.variant.replace('.webp', ''),
            blobPath,
            width: rendMeta.width || spec.width,
            height: rendMeta.height || (spec.height || 0),
            fileSize: buf.length,
          }
        )

        return { variant: spec.variant, size: buf.length }
      })
    )

    // Also update legacy thumbnail
    const thumbBuf = await sharp(buffer)
      .resize(400, 300, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    await containerClient.getBlockBlobClient(`${id}/thumbnail`).upload(thumbBuf, thumbBuf.length, {
      blobHTTPHeaders: { blobContentType: 'image/webp' },
    })

    // Update photo dimensions
    await query(
      `UPDATE photos SET
        width = @width, height = @height,
        updated_at = GETDATE(), updated_by = @updatedBy
       WHERE id = @id`,
      {
        id,
        width: metadata.width || 0,
        height: metadata.height || 0,
        updatedBy: ctx.adminEmail || 'admin',
      }
    )

    // Insert edit record
    await query(
      `INSERT INTO photo_edits (id, photo_id, edit_type, edit_params, edited_blob_path, edited_by)
       VALUES (NEWID(), @photoId, @editType, @editParams, @editedBlobPath, @editedBy)`,
      {
        photoId: id,
        editType,
        editParams,
        editedBlobPath,
        editedBy: ctx.adminEmail || 'admin',
      }
    )

    // Audit log
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    await query(
      `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
       VALUES ('photo', @id, 'photo.edited', @performedBy, @ip, @details)`,
      {
        id,
        performedBy: ctx.adminEmail || 'admin',
        ip,
        details: JSON.stringify({
          editType,
          editParams: JSON.parse(editParams),
          newWidth: metadata.width,
          newHeight: metadata.height,
          renditionsUpdated: renditionResults.length,
        }),
      }
    )

    return Response.json({
      success: true,
      width: metadata.width,
      height: metadata.height,
      renditions: renditionResults,
    })
  } catch (err) {
    console.error('Photo edit error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Edit failed' },
      { status: 500 }
    )
  }
}
