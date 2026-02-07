import { query } from '@/lib/db'
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

/** POST /api/photos/fix-blobs - Fix content types on existing blobs */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const sessionId = decoded.sessionId

    const result = await query(
      `SELECT id, mime_type FROM photos WHERE session_id = @sessionId`,
      { sessionId }
    )

    const client = getBlobClient()
    if (!client) {
      return Response.json({ error: 'Storage not configured' }, { status: 500 })
    }

    const container = client.getContainerClient('aspr-photos')
    let fixed = 0

    for (const row of result.rows) {
      try {
        const originalBlob = container.getBlockBlobClient(`${row.id}/original`)
        const thumbnailBlob = container.getBlockBlobClient(`${row.id}/thumbnail`)

        await originalBlob.setHTTPHeaders({
          blobContentType: row.mime_type || 'image/jpeg',
        })
        await thumbnailBlob.setHTTPHeaders({
          blobContentType: 'image/webp',
        })
        fixed++
      } catch (e) {
        console.error('Fix blob error for', row.id, e)
      }
    }

    return Response.json({ fixed, total: result.rows.length })
  } catch (error) {
    console.error('Fix blobs error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Fix failed' },
      { status: 500 }
    )
  }
}
