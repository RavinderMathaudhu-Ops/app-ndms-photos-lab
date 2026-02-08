import { BlobServiceClient, ContainerClient, BlockBlobClient } from '@azure/storage-blob'

let blobClient: BlobServiceClient | null = null

export function getBlobClient(): BlobServiceClient {
  if (!blobClient) {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!connStr || connStr.includes('<PASTE') || connStr.length < 20) {
      throw new Error('Azure Storage connection string is not configured')
    }
    blobClient = BlobServiceClient.fromConnectionString(connStr)
  }
  return blobClient
}

const CONTAINER_NAME = 'aspr-photos'

export function getContainerClient(): ContainerClient {
  return getBlobClient().getContainerClient(CONTAINER_NAME)
}

export function getBlockBlobClient(blobPath: string): BlockBlobClient {
  return getContainerClient().getBlockBlobClient(blobPath)
}

/**
 * Delete a blob by path. Returns true if deleted, false if not found.
 */
export async function deleteBlob(blobPath: string): Promise<boolean> {
  try {
    const client = getBlockBlobClient(blobPath)
    await client.delete()
    return true
  } catch (e: any) {
    if (e.statusCode === 404) return false
    throw e
  }
}

/**
 * Delete all blobs under a prefix (e.g., all renditions for a photo).
 */
export async function deleteBlobsByPrefix(prefix: string): Promise<number> {
  const container = getContainerClient()
  let count = 0
  for await (const blob of container.listBlobsFlat({ prefix })) {
    await container.getBlockBlobClient(blob.name).delete()
    count++
  }
  return count
}

/**
 * Generate a SAS-free signed proxy URL for an image.
 * Uses the app's own /api/photos/[id]/image endpoint with HMAC signature.
 */
export function getRenditionBlobPath(photoId: string, variant: string): string {
  return `renditions/${photoId}/${variant}`
}

/**
 * Get the CDN URL for a rendition, or fall back to blob path.
 */
export function getRenditionUrl(photoId: string, variant: string): string {
  const cdnBase = process.env.IMAGE_CDN_URL
  const path = `renditions/${photoId}/${variant}`
  if (cdnBase) {
    return `${cdnBase}/${path}`
  }
  // Fallback: use signed proxy (will be implemented per-endpoint)
  return path
}
