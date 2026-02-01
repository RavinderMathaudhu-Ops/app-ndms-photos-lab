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

async function getPool(): Promise<ConnectionPool> {
  if (pool) return pool

  // Determine authentication method
  let config: sqlConfig

  if (process.env.NODE_ENV === 'development' && process.env.SQL_USERNAME && process.env.SQL_PASSWORD) {
    // Development: Use SQL Server authentication
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
        trustServerCertificate: true, // Allow self-signed certs in dev
        connectTimeout: 30000,
      },
    }
    console.log('ℹ️ Using SQL Server authentication (development mode)')
  } else {
    // Production: Use Entra ID token authentication
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
  
  // INSERT INTO upload_sessions with RETURNING
  if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('UPLOAD_SESSIONS') && sqlUpper.includes('RETURNING')) {
    const newSession = {
      id: params?.id || Math.random().toString(36).substr(2, 9),
      pin: params?.pin,
      team_name: params?.teamName,
      expires_at: params?.expiresAt instanceof Date ? params.expiresAt.toISOString() : String(params?.expiresAt),
      created_at: new Date().toISOString(),
    }
    const sessions = mockDatabase.get('upload_sessions') || []
    sessions.push(newSession)
    mockDatabase.set('upload_sessions', sessions)
    // RETURNING id, pin, team_name
    return { rows: [{ id: newSession.id, pin: newSession.pin, team_name: newSession.team_name }] }
  }
  
  // INSERT INTO upload_sessions (no RETURNING)
  if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('UPLOAD_SESSIONS')) {
    const newSession = {
      id: params?.id || Math.random().toString(36).substr(2, 9),
      pin: params?.pin,
      team_name: params?.teamName,
      expires_at: params?.expiresAt instanceof Date ? params.expiresAt.toISOString() : String(params?.expiresAt),
      created_at: new Date().toISOString(),
    }
    const sessions = mockDatabase.get('upload_sessions') || []
    sessions.push(newSession)
    mockDatabase.set('upload_sessions', sessions)
    return { rows: [] }
  }
  
  // SELECT FROM upload_sessions WHERE pin
  if (sqlUpper.includes('SELECT') && sqlUpper.includes('UPLOAD_SESSIONS') && sqlUpper.includes('PIN')) {
    const sessions = mockDatabase.get('upload_sessions') || []
    const pin = params?.pin
    const filtered = sessions.filter((s: any) => s.pin === pin && new Date(s.expires_at) > new Date())
    return { rows: filtered }
  }
  
  // SELECT FROM upload_sessions (all)
  if (sqlUpper.includes('SELECT') && sqlUpper.includes('UPLOAD_SESSIONS')) {
    const sessions = mockDatabase.get('upload_sessions') || []
    return { rows: sessions }
  }
  
  // INSERT INTO photos with RETURNING
  if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('PHOTOS') && sqlUpper.includes('RETURNING')) {
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
    // RETURNING id, file_name, file_size, width, height, mime_type
    return { rows: [{ id: newPhoto.id, file_name: newPhoto.file_name, file_size: newPhoto.file_size, width: newPhoto.width, height: newPhoto.height, mime_type: newPhoto.mime_type }] }
  }
  
  // INSERT INTO photos (no RETURNING)
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
  
  // SELECT FROM photos
  if (sqlUpper.includes('SELECT') && sqlUpper.includes('PHOTOS')) {
    const photos = mockDatabase.get('photos') || []
    return { rows: photos }
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
