import { verifyImageSignature } from '@/lib/auth'
import { BlobServiceClient } from '@azure/storage-blob'

let blobClient: BlobServiceClient | null = null

function getBlobClient(): BlobServiceClient | null {
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) return null
  if (!blobClient) {
    blobClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    )
  }
  return blobClient
}

/** GET /api/photos/[id]/image?type=thumbnail|original&exp=123&sig=abc */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: photoId } = await params
    const url = new URL(req.url)
    const type = url.searchParams.get('type') === 'thumbnail' ? 'thumbnail' : 'original'
    const exp = url.searchParams.get('exp') || ''
    const sig = url.searchParams.get('sig') || ''

    // Verify signed URL (CDN-safe, no JWT needed)
    if (!verifyImageSignature(photoId, type, exp, sig)) {
      return new Response('Forbidden', { status: 403 })
    }

    const client = getBlobClient()
    if (!client) {
      return new Response('Storage not configured', { status: 500 })
    }

    // Blob names are lowercase (uuid), but SQL returns uppercase GUIDs
    const blobId = photoId.toLowerCase()
    const container = client.getContainerClient('aspr-photos')
    const blob = container.getBlockBlobClient(`${blobId}/${type}`)

    const exists = await blob.exists()
    if (!exists) {
      return new Response(null, { status: 404 })
    }

    const download = await blob.download(0)
    const body = download.readableStreamBody
    if (!body) {
      return new Response(null, { status: 404 })
    }

    // Convert Node stream to web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        body.on('data', (chunk: Buffer) => controller.enqueue(chunk))
        body.on('end', () => controller.close())
        body.on('error', (err: Error) => controller.error(err))
      },
    })

    // CDN-friendly cache headers:
    // - public: CDN/Front Door can cache
    // - s-maxage=604800: CDN caches for 7 days
    // - max-age=3600: browser caches for 1 hour
    // - immutable: content at this URL won't change (signed URLs are unique)
    return new Response(webStream, {
      headers: {
        'Content-Type': download.contentType || (type === 'thumbnail' ? 'image/webp' : 'image/jpeg'),
        'Content-Length': String(download.contentLength || 0),
        'Cache-Control': 'public, max-age=3600, s-maxage=604800, immutable',
        'CDN-Cache-Control': 'public, max-age=604800',
        'Vary': 'Accept-Encoding',
      },
    })
  } catch (error) {
    console.error('Image proxy error:', error)
    return new Response('Failed to load image', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
