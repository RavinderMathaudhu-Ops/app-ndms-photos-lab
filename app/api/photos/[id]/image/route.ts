import { verifyToken } from '@/lib/auth'
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

/** GET /api/photos/[id]/image?type=thumbnail|original&token=xxx */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(req.url)

    // Accept token from header or query param (img src can't send headers)
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '') || url.searchParams.get('token')
    if (!token) {
      return new Response('Unauthorized', { status: 401 })
    }

    verifyToken(token) // throws if invalid

    const { id: photoId } = await params
    const type = url.searchParams.get('type') === 'thumbnail' ? 'thumbnail' : 'original'

    const client = getBlobClient()
    if (!client) {
      return new Response('Storage not configured', { status: 500 })
    }

    const container = client.getContainerClient('aspr-photos')
    const blob = container.getBlockBlobClient(`${photoId}/${type}`)

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

    return new Response(webStream, {
      headers: {
        'Content-Type': download.contentType || (type === 'thumbnail' ? 'image/webp' : 'image/jpeg'),
        'Cache-Control': 'private, max-age=3600',
        'Content-Length': String(download.contentLength || 0),
      },
    })
  } catch (error) {
    console.error('Image proxy error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Failed to load image',
      { status: 500 }
    )
  }
}
