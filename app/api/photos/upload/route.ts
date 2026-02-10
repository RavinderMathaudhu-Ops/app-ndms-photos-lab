import { v4 as uuid } from 'uuid'
import sharp from 'sharp'
import { query } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { rateLimit } from '@/lib/rateLimit'
import { validation, createAuditLog, secureErrorResponse, writeAuditLog } from '@/lib/security'
import { getContainerClient } from '@/lib/blobHelpers'

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'

    // Rate limit uploads: 50 per hour per IP
    const rateLimitKey = `upload:${ip}`
    const limit = rateLimit(rateLimitKey, {
      maxAttempts: 50,
      windowMs: 60 * 60 * 1000, // 1 hour
    })

    if (!limit.allowed) {
      const auditLog = createAuditLog('RATE_LIMIT_EXCEEDED', req, {
        reason: 'Upload rate limit exceeded',
        type: 'File Upload',
      })
      console.warn('SECURITY_ALERT:', auditLog)
      await writeAuditLog('auth', null, 'upload.rate_limited', 'anonymous', req, {
        reason: 'Upload rate limit exceeded',
      })

      return Response.json(
        { error: 'Upload rate limit exceeded' },
        { status: 429 }
      )
    }

    // Verify auth token
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const sessionId = decoded.sessionId

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('photo') as File
    const notes = (formData.get('notes') as string) || null
    const latitude = formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : null
    const longitude = formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : null
    const locationName = (formData.get('locationName') as string) || null
    const incidentId = (formData.get('incidentId') as string) || null

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    // OWASP: Input Validation - File Upload Protection
    const fileValidation = validation.validateFile({
      name: file.name,
      size: file.size,
      type: file.type,
    })
    if (!fileValidation.valid) {
      const auditLog = createAuditLog('UPLOAD_FAILURE', req, {
        reason: fileValidation.error,
        sessionId,
      })
      console.warn('UPLOAD_FAILURE:', auditLog)
      return Response.json({ error: fileValidation.error }, { status: 400 })
    }

    // OWASP: Input Validation - Notes
    if (notes) {
      const notesValidation = validation.validateNotes(notes)
      if (!notesValidation.valid) {
        return Response.json({ error: notesValidation.error }, { status: 400 })
      }
    }

    // OWASP: Input Validation - Coordinates
    if (latitude !== null || longitude !== null) {
      const coordValidation = validation.validateCoordinates(latitude || 0, longitude || 0)
      if (!coordValidation.valid) {
        return Response.json({ error: coordValidation.error }, { status: 400 })
      }
    }

    // OWASP: Input Validation - Incident ID
    if (incidentId) {
      const incidentValidation = validation.validateIncidentId(incidentId)
      if (!incidentValidation.valid) {
        return Response.json({ error: incidentValidation.error }, { status: 400 })
      }
    }

    const buffer = await file.arrayBuffer()
    const imageBuffer = Buffer.from(buffer)

    // Get image metadata including EXIF (GPS data preserved for disaster response)
    const metadata = await sharp(imageBuffer).metadata()

    // Generate thumbnail (WebP re-encode inherently strips EXIF)
    const thumbnail = await sharp(imageBuffer)
      .resize(400, 300, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()

    // Upload to Azure Blob Storage
    const photoId = uuid()
    const containerClient = getContainerClient()

    // Create container if it doesn't exist
    try {
      await containerClient.create()
    } catch (e) {
      // Container might already exist
    }

    const originalBlob = containerClient.getBlockBlobClient(`${photoId}/original`)
    const thumbnailBlob = containerClient.getBlockBlobClient(`${photoId}/thumbnail`)

    await originalBlob.upload(imageBuffer, imageBuffer.length, {
      blobHTTPHeaders: { blobContentType: file.type },
      metadata: {
        uploadTime: new Date().toISOString(),
        sessionId,
      },
    })

    await thumbnailBlob.upload(thumbnail, thumbnail.length, {
      blobHTTPHeaders: { blobContentType: 'image/webp' },
    })

    // Save metadata to database
    const photoResult = await query(
      `INSERT INTO photos
       (id, session_id, file_name, blob_url, file_size, width, height, mime_type,
        latitude, longitude, location_name, notes, incident_id)
       OUTPUT INSERTED.id
       VALUES (@id, @sessionId, @fileName, @blobUrl, @fileSize, @width, @height, @mimeType,
               @latitude, @longitude, @locationName, @notes, @incidentId)`,
      {
        id: photoId,
        sessionId,
        fileName: file.name,
        blobUrl: originalBlob.url,
        fileSize: file.size,
        width: metadata.width || 0,
        height: metadata.height || 0,
        mimeType: file.type,
        latitude,
        longitude,
        locationName,
        notes,
        incidentId,
      }
    )

    // Persist EXIF data (GPS, camera info) to photo_exif table
    try {
      const exif = metadata.exif ? JSON.parse(JSON.stringify(metadata)) : null
      await query(
        `INSERT INTO photo_exif
         (photo_id, camera_make, camera_model, orientation, date_taken_exif, software, raw_json)
         VALUES (@photoId, @make, @model, @orientation, @dateTaken, @software, @raw)`,
        {
          photoId,
          make: (exif?.exif as any)?.Make || null,
          model: (exif?.exif as any)?.Model || null,
          orientation: metadata.orientation || null,
          dateTaken: (exif?.exif as any)?.DateTimeOriginal || null,
          software: (exif?.exif as any)?.Software || null,
          raw: exif ? JSON.stringify({ format: metadata.format, density: metadata.density, hasAlpha: metadata.hasAlpha, space: metadata.space }) : null,
        }
      )
    } catch {
      // Non-critical — photo saved, EXIF insert is best-effort
    }

    // Increment total_uploads counter on the session
    try {
      await query(
        `UPDATE upload_sessions SET total_uploads = total_uploads + 1, last_used_at = GETUTCDATE() WHERE id = @id`,
        { id: sessionId }
      )
    } catch {
      // Non-critical — photo already saved
    }

    // Write audit log to DB
    try {
      await query(
        `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, ip_address, details)
         VALUES ('photo', @photoId, 'photo.uploaded', @performedBy, @ip, @details)`,
        {
          photoId,
          performedBy: `pin:${sessionId}`,
          ip,
          details: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            sessionId,
            source: 'pin',
          }),
        }
      )
    } catch {
      // Non-critical — photo already saved
    }

    return Response.json({
      success: true,
      photoId: photoResult.rows[0].id,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
