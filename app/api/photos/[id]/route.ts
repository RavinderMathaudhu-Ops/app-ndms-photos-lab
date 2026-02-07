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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    const sessionId = decoded.sessionId
    const { id: photoId } = await params

    // Verify the photo belongs to this session
    const check = await query(
      `SELECT id FROM photos WHERE id = @photoId AND session_id = @sessionId`,
      { photoId, sessionId }
    )

    if (check.rows.length === 0) {
      return Response.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Delete blobs (blob names are lowercase uuid, SQL returns uppercase)
    const blobId = photoId.toLowerCase()
    const client = getBlobClient()
    if (client) {
      const container = client.getContainerClient('aspr-photos')
      try {
        await container.getBlockBlobClient(`${blobId}/original`).deleteIfExists()
        await container.getBlockBlobClient(`${blobId}/thumbnail`).deleteIfExists()
      } catch (e) {
        console.error('Blob delete error:', e)
      }
    }

    // Delete from database
    await query(
      `DELETE FROM photos WHERE id = @photoId AND session_id = @sessionId`,
      { photoId, sessionId }
    )

    return Response.json({ success: true })
  } catch (error) {
    console.error('Photo delete error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
