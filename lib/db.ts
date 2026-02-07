import { ConnectionPool, config as sqlConfig } from 'mssql'
import { DefaultAzureCredential } from '@azure/identity'

let pool: ConnectionPool | null = null
let mockDatabase: Map<string, any> = new Map()

// Mock database storage for development
function initMockDatabase() {
  if (!mockDatabase.has('upload_sessions')) {
    mockDatabase.set('upload_sessions', [])
  }
  if (!mockDatabase.has('photos')) {
    mockDatabase.set('photos', [])
  }
}

async function getAccessToken(): Promise<string> {
  // In production, use Entra ID authentication
  // In development, return a mock token (requires SQL Server to allow local connections)
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️ Using development mode - ensure SQL Server allows local connections')
    return 'dev-mock-token'
  }

  try {
    const credential = new DefaultAzureCredential()
    const token = await credential.getToken('https://database.windows.net/.default')
    return token.token
  } catch (error) {
    console.error('❌ Entra ID authentication failed:', error instanceof Error ? error.message : error)
    throw new Error('Failed to obtain Azure access token. Ensure application is running in Azure or has proper credentials configured.')
  }
}

async function getPool(): Promise<ConnectionPool | null> {
  if (pool) return pool

  // Determine authentication method
  let config: sqlConfig

  if (process.env.SQL_USERNAME && process.env.SQL_PASSWORD) {
    // SQL Server authentication (when credentials are provided)
    config = {
      server: process.env.SQL_SERVER || '',
      database: process.env.SQL_DATABASE || '',
      authentication: {
        type: 'default',
        options: {
          userName: process.env.SQL_USERNAME,
          password: process.env.SQL_PASSWORD,
        },
      },
      options: {
        encrypt: true,
        trustServerCertificate: process.env.NODE_ENV === 'development',
        connectTimeout: 30000,
      },
    }
    console.log('ℹ️ Using SQL Server authentication')
  } else {
    // Entra ID token authentication (managed identity)
    const accessToken = await getAccessToken()
    config = {
      server: process.env.SQL_SERVER || '',
      database: process.env.SQL_DATABASE || '',
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: accessToken,
        },
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000,
      },
    }
    console.log('✅ Connected to SQL Server via Entra ID')
  }

  pool = new ConnectionPool(config)
  try {
    await pool.connect()
    console.log('✅ Successfully connected to SQL Server')
  } catch (error) {
    console.error('❌ Failed to connect to SQL Server:', error instanceof Error ? error.message : error)
    
    // In development, fall back to mock database
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Falling back to in-memory mock database for development')
      pool = null // Reset pool to indicate mock mode
      initMockDatabase()
    } else {
      pool = null
      throw error
    }
  }

  return pool
}

export async function query(sql: string, params?: Record<string, any>) {
  try {
    const pool = await getPool()
    
    if (!pool) {
      // Using mock database
      return queryMockDatabase(sql, params)
    }

    const request = pool.request()

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        request.input(key, value)
      })
    }

    const result = await request.query(sql)
    return { rows: result.recordset || [] }
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

// Mock database query handler
function queryMockDatabase(sql: string, params?: Record<string, any>) {
  initMockDatabase()
  
  const sqlUpper = sql.toUpperCase().trim()
  
  // UPDATE upload_sessions (revoke/reactivate)
  if (sqlUpper.includes('UPDATE') && sqlUpper.includes('UPLOAD_SESSIONS')) {
    const sessions = mockDatabase.get('upload_sessions') || []
    const target = sessions.find((s: any) => s.id === params?.id)
    if (target) {
      if (sqlUpper.includes('IS_ACTIVE = 0')) target.is_active = false
      if (sqlUpper.includes('IS_ACTIVE = 1')) target.is_active = true
    }
    mockDatabase.set('upload_sessions', sessions)
    return { rows: [] }
  }

  // INSERT INTO upload_sessions with OUTPUT
  if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('UPLOAD_SESSIONS') && sqlUpper.includes('OUTPUT')) {
    const newSession = {
      id: params?.id || Math.random().toString(36).substr(2, 9),
      pin: params?.pinHash || params?.pin,
      team_name: params?.teamName,
      is_active: true,
      expires_at: params?.expiresAt instanceof Date ? params.expiresAt.toISOString() : String(params?.expiresAt),
      created_at: new Date().toISOString(),
    }
    const sessions = mockDatabase.get('upload_sessions') || []
    sessions.push(newSession)
    mockDatabase.set('upload_sessions', sessions)
    // OUTPUT INSERTED.id, INSERTED.team_name (no longer returns pin)
    return { rows: [{ id: newSession.id, team_name: newSession.team_name }] }
  }

  // INSERT INTO upload_sessions (no OUTPUT)
  if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('UPLOAD_SESSIONS')) {
    const newSession = {
      id: params?.id || Math.random().toString(36).substr(2, 9),
      pin: params?.pinHash || params?.pin,
      team_name: params?.teamName,
      is_active: true,
      expires_at: params?.expiresAt instanceof Date ? params.expiresAt.toISOString() : String(params?.expiresAt),
      created_at: new Date().toISOString(),
    }
    const sessions = mockDatabase.get('upload_sessions') || []
    sessions.push(newSession)
    mockDatabase.set('upload_sessions', sessions)
    return { rows: [] }
  }

  // SELECT FROM upload_sessions with GROUP BY (session list endpoint)
  if (sqlUpper.includes('SELECT') && sqlUpper.includes('UPLOAD_SESSIONS') && sqlUpper.includes('GROUP BY')) {
    const sessions = mockDatabase.get('upload_sessions') || []
    const photos = mockDatabase.get('photos') || []
    const rows = sessions.map((s: any) => {
      const sessionPhotos = photos.filter((p: any) => p.session_id === s.id)
      const now = new Date()
      let status = 'active'
      if (s.is_active === false) status = 'revoked'
      else if (new Date(s.expires_at) < now) status = 'expired'
      return {
        id: s.id,
        team_name: s.team_name,
        expires_at: s.expires_at,
        created_at: s.created_at,
        status,
        photo_count: sessionPhotos.length,
        total_size: sessionPhotos.reduce((sum: number, p: any) => sum + (p.file_size || 0), 0),
      }
    })
    rows.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return { rows }
  }

  // SELECT FROM upload_sessions (all non-expired — bcrypt compare happens in route)
  if (sqlUpper.includes('SELECT') && sqlUpper.includes('UPLOAD_SESSIONS')) {
    const sessions = mockDatabase.get('upload_sessions') || []
    const filtered = sessions.filter((s: any) =>
      new Date(s.expires_at) > new Date() && s.is_active !== false
    )
    return { rows: filtered }
  }
  
  // INSERT INTO photos with OUTPUT
  if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('PHOTOS') && sqlUpper.includes('OUTPUT')) {
    const newPhoto = {
      id: params?.id || Math.random().toString(36).substr(2, 9),
      session_id: params?.sessionId,
      file_name: params?.fileName,
      blob_url: params?.blobUrl,
      file_size: params?.fileSize,
      width: params?.width,
      height: params?.height,
      mime_type: params?.mimeType,
      incident_id: params?.incidentId,
      latitude: params?.latitude,
      longitude: params?.longitude,
      location_name: params?.locationName,
      notes: params?.notes,
      created_at: new Date().toISOString(),
    }
    const photos = mockDatabase.get('photos') || []
    photos.push(newPhoto)
    mockDatabase.set('photos', photos)
    // OUTPUT INSERTED.id
    return { rows: [{ id: newPhoto.id, file_name: newPhoto.file_name, file_size: newPhoto.file_size, width: newPhoto.width, height: newPhoto.height, mime_type: newPhoto.mime_type }] }
  }

  // INSERT INTO photos (no OUTPUT)
  if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('PHOTOS')) {
    const newPhoto = {
      id: params?.id || Math.random().toString(36).substr(2, 9),
      session_id: params?.sessionId,
      file_name: params?.fileName,
      blob_url: params?.blobUrl,
      file_size: params?.fileSize,
      width: params?.width,
      height: params?.height,
      mime_type: params?.mimeType,
      incident_id: params?.incidentId,
      latitude: params?.latitude,
      longitude: params?.longitude,
      location_name: params?.locationName,
      notes: params?.notes,
      created_at: new Date().toISOString(),
    }
    const photos = mockDatabase.get('photos') || []
    photos.push(newPhoto)
    mockDatabase.set('photos', photos)
    return { rows: [] }
  }
  
  // SELECT FROM photos WHERE session_id
  if (sqlUpper.includes('SELECT') && sqlUpper.includes('PHOTOS') && sqlUpper.includes('SESSION_ID')) {
    const photos = mockDatabase.get('photos') || []
    const sessionId = params?.sessionId
    const filtered = sessionId ? photos.filter((p: any) => p.session_id === sessionId) : photos
    return { rows: filtered }
  }

  // SELECT FROM photos (all)
  if (sqlUpper.includes('SELECT') && sqlUpper.includes('PHOTOS')) {
    const photos = mockDatabase.get('photos') || []
    return { rows: photos }
  }

  // DELETE FROM photos WHERE id AND session_id
  if (sqlUpper.includes('DELETE') && sqlUpper.includes('PHOTOS')) {
    const photos = mockDatabase.get('photos') || []
    const filtered = photos.filter(
      (p: any) => !(p.id === params?.photoId && p.session_id === params?.sessionId)
    )
    mockDatabase.set('photos', filtered)
    return { rows: [] }
  }
  
  console.warn(`⚠️ Mock database: Unhandled query: ${sql.substring(0, 80)}...`)
  return { rows: [] }
}

export async function closePool() {
  if (pool) {
    await pool.close()
    pool = null
  }
}
