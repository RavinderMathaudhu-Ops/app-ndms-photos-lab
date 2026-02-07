import { v4 as uuid } from 'uuid'
import sharp from 'sharp'
import exifr from 'exifr'
import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'
import { getContainerClient, getRenditionBlobPath } from '@/lib/blobHelpers'

const MAX_FILES = 50
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB per file
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/* ─── Rendition specs ─────────────────────────────────── */
const RENDITIONS = [
  { variant: 'thumb_sm.webp', width: 200, height: 150, fit: 'cover' as const, quality: 75 },
  { variant: 'thumb_md.webp', width: 400, height: 300, fit: 'inside' as const, quality: 80 },
  { variant: 'web.webp', width: 1200, height: null, fit: 'inside' as const, quality: 85 },
] as const

/* ─── Extract EXIF safely ─────────────────────────────── */
async function extractExif(buffer: Buffer) {
  try {
    const data = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: false,
      xmp: false,
    } as any)
    if (!data) return null

    return {
      cameraMake: data.Make || null,
      cameraModel: data.Model || null,
      lensModel: data.LensModel || null,
      focalLength: data.FocalLength || null,
      aperture: data.FNumber || null,
      shutterSpeed: data.ExposureTime
        ? (data.ExposureTime < 1
          ? `1/${Math.round(1 / data.ExposureTime)}`
          : `${data.ExposureTime}`)
        : null,
      isoSpeed: data.ISO || null,
      flashUsed: data.Flash != null ? (data.Flash > 0 ? true : false) : null,
      orientation: data.Orientation || null,
      gpsAltitude: data.GPSAltitude || null,
      dateTakenExif: data.DateTimeOriginal || data.CreateDate || null,
      software: data.Software || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
    }
  } catch {
    return null
  }
}

/* ─── Build compact camera info string ────────────────── */
function buildCameraInfo(exif: NonNullable<Awaited<ReturnType<typeof extractExif>>>): string | null {
  const parts: string[] = []
  if (exif.cameraMake && exif.cameraModel) {
    const model = exif.cameraModel.startsWith(exif.cameraMake)
      ? exif.cameraModel
      : `${exif.cameraMake} ${exif.cameraModel}`
    parts.push(model)
  } else if (exif.cameraModel) {
    parts.push(exif.cameraModel)
  }
  if (exif.focalLength) parts.push(`${exif.focalLength}mm`)
  if (exif.aperture) parts.push(`f/${exif.aperture}`)
  if (exif.isoSpeed) parts.push(`ISO ${exif.isoSpeed}`)
  return parts.length > 0 ? parts.join(' \u2022 ') : null
}

/* ═══════════════════════════════════════════════════════════
   POST /api/admin/photos/upload
   Admin bulk upload with EXIF extraction + 3 rendition sizes
   ═══════════════════════════════════════════════════════════ */
export async function POST(req: Request) {
  const { ctx, error } = await guardAdmin(req)
  if (error) return error

  try {
    const formData = await req.formData()
    const incidentId = (formData.get('incidentId') as string) || null
    const locationName = (formData.get('locationName') as string) || null
    const notes = (formData.get('notes') as string) || null

    // Collect all files from the form
    const files: File[] = []
    for (const [key, value] of formData.entries()) {
      if (key === 'photos' && value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      return Response.json({ error: 'No files provided' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return Response.json(
        { error: `Maximum ${MAX_FILES} files per batch` },
        { status: 400 }
      )
    }

    // Validate all files before processing
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return Response.json(
          { error: `Invalid file type: ${file.name} (JPEG, PNG, WebP only)` },
          { status: 400 }
        )
      }
      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          { error: `File too large: ${file.name} (max 50MB)` },
          { status: 400 }
        )
      }
      if (file.size === 0) {
        return Response.json(
          { error: `Empty file: ${file.name}` },
          { status: 400 }
        )
      }
    }

    const containerClient = getContainerClient()
    const results: { photoId: string; fileName: string; status: 'success' | 'error'; error?: string }[] = []

    // Process each file
    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const photoId = uuid()

        // Sharp metadata + EXIF in parallel
        const [metadata, exifData] = await Promise.all([
          sharp(buffer).metadata(),
          extractExif(buffer),
        ])

        // Generate renditions in parallel
        const renditionBuffers = await Promise.all(
          RENDITIONS.map(async (spec) => {
            const resizeOpts: sharp.ResizeOptions = {
              fit: spec.fit,
              withoutEnlargement: true,
            }
            const pipeline = sharp(buffer)
              .resize(spec.width, spec.height, resizeOpts)
              .webp({ quality: spec.quality })
            return { variant: spec.variant, buffer: await pipeline.toBuffer(), spec }
          })
        )

        // Upload original + all renditions in parallel
        const originalPath = `${photoId}/original`
        const uploadPromises = [
          // Original
          containerClient.getBlockBlobClient(originalPath).upload(buffer, buffer.length, {
            blobHTTPHeaders: { blobContentType: file.type },
            metadata: {
              uploadedBy: ctx.adminEmail || 'admin',
              uploadTime: new Date().toISOString(),
            },
          }),
          // Legacy thumbnail (backward compat with existing gallery)
          (async () => {
            const thumbBuf = renditionBuffers.find(r => r.variant === 'thumb_md.webp')?.buffer
            if (thumbBuf) {
              await containerClient
                .getBlockBlobClient(`${photoId}/thumbnail`)
                .upload(thumbBuf, thumbBuf.length, {
                  blobHTTPHeaders: { blobContentType: 'image/webp' },
                })
            }
          })(),
          // CDN renditions
          ...renditionBuffers.map(async ({ variant, buffer: buf }) => {
            const blobPath = getRenditionBlobPath(photoId, variant)
            await containerClient.getBlockBlobClient(blobPath).upload(buf, buf.length, {
              blobHTTPHeaders: { blobContentType: 'image/webp' },
            })
          }),
        ]
        await Promise.all(uploadPromises)

        // Build camera info + date_taken from EXIF
        const cameraInfo = exifData ? buildCameraInfo(exifData) : null
        const dateTaken = exifData?.dateTakenExif
          ? new Date(exifData.dateTakenExif).toISOString()
          : null
        const lat = exifData?.latitude || null
        const lng = exifData?.longitude || null

        // Insert photo record
        await query(
          `INSERT INTO photos
           (id, file_name, blob_url, file_size, width, height, mime_type,
            latitude, longitude, location_name, notes, incident_id,
            status, date_taken, camera_info, updated_by)
           OUTPUT INSERTED.id
           VALUES (@id, @fileName, @blobUrl, @fileSize, @width, @height, @mimeType,
                   @latitude, @longitude, @locationName, @notes, @incidentId,
                   'active', @dateTaken, @cameraInfo, @updatedBy)`,
          {
            id: photoId,
            fileName: file.name,
            blobUrl: containerClient.getBlockBlobClient(originalPath).url,
            fileSize: file.size,
            width: metadata.width || 0,
            height: metadata.height || 0,
            mimeType: file.type,
            latitude: lat,
            longitude: lng,
            locationName,
            notes,
            incidentId,
            dateTaken,
            cameraInfo,
            updatedBy: ctx.adminEmail || 'admin',
          }
        )

        // Insert rendition records
        for (const { variant, buffer: buf, spec } of renditionBuffers) {
          const renditionMeta = await sharp(buf).metadata()
          await query(
            `INSERT INTO photo_renditions
             (id, photo_id, variant_type, blob_path, width, height, file_size, mime_type)
             VALUES (NEWID(), @photoId, @variantType, @blobPath, @width, @height, @fileSize, 'image/webp')`,
            {
              photoId,
              variantType: variant.replace('.webp', ''),
              blobPath: getRenditionBlobPath(photoId, variant),
              width: renditionMeta.width || spec.width,
              height: renditionMeta.height || (spec.height || 0),
              fileSize: buf.length,
            }
          )
        }

        // Insert EXIF record if available
        if (exifData) {
          await query(
            `INSERT INTO photo_exif
             (photo_id, camera_make, camera_model, lens_model, focal_length,
              aperture, shutter_speed, iso_speed, flash_used, orientation,
              gps_altitude, date_taken_exif, software, raw_json)
             VALUES (@photoId, @cameraMake, @cameraModel, @lensModel, @focalLength,
                     @aperture, @shutterSpeed, @isoSpeed, @flashUsed, @orientation,
                     @gpsAltitude, @dateTakenExif, @software, @rawJson)`,
            {
              photoId,
              cameraMake: exifData.cameraMake,
              cameraModel: exifData.cameraModel,
              lensModel: exifData.lensModel,
              focalLength: exifData.focalLength,
              aperture: exifData.aperture,
              shutterSpeed: exifData.shutterSpeed,
              isoSpeed: exifData.isoSpeed,
              flashUsed: exifData.flashUsed,
              orientation: exifData.orientation,
              gpsAltitude: exifData.gpsAltitude,
              dateTakenExif: exifData.dateTakenExif
                ? new Date(exifData.dateTakenExif).toISOString()
                : null,
              software: exifData.software,
              rawJson: JSON.stringify(exifData),
            }
          )
        }

        // Audit log
        await query(
          `INSERT INTO admin_audit_log (entity_type, entity_id, action, performed_by, details)
           VALUES ('photo', @photoId, 'photo.uploaded', @performedBy, @details)`,
          {
            photoId,
            performedBy: ctx.adminEmail || 'admin',
            details: JSON.stringify({
              fileName: file.name,
              fileSize: file.size,
              renditions: RENDITIONS.map(r => r.variant),
              hasExif: !!exifData,
              incidentId,
            }),
          }
        )

        results.push({ photoId, fileName: file.name, status: 'success' })
      } catch (fileErr) {
        console.error(`Upload failed for ${file.name}:`, fileErr)
        results.push({
          photoId: '',
          fileName: file.name,
          status: 'error',
          error: fileErr instanceof Error ? fileErr.message : 'Processing failed',
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const failCount = results.filter(r => r.status === 'error').length

    return Response.json({
      success: failCount === 0,
      uploaded: successCount,
      failed: failCount,
      total: files.length,
      results,
    })
  } catch (err) {
    console.error('Admin upload error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
