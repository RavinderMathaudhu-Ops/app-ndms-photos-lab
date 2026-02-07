import { guardAdmin } from '@/lib/adminAuth'
import { query } from '@/lib/db'

/**
 * Idempotent migration steps — safe to run multiple times.
 * Each step uses IF NOT EXISTS / IF COL_LENGTH guards.
 */
const MIGRATIONS: { name: string; sql: string }[] = [
  // ── Pin column migration (existing) ──
  {
    name: 'pin column resize',
    sql: `IF (SELECT CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'upload_sessions' AND COLUMN_NAME = 'pin') < 72
         ALTER TABLE upload_sessions ALTER COLUMN pin NVARCHAR(72) NOT NULL`,
  },

  // ── Photos table: new columns ──
  {
    name: 'photos.status',
    sql: `IF COL_LENGTH('photos', 'status') IS NULL
          ALTER TABLE photos ADD status NVARCHAR(20) DEFAULT 'active'`,
  },
  {
    name: 'photos.storage_tier',
    sql: `IF COL_LENGTH('photos', 'storage_tier') IS NULL
          ALTER TABLE photos ADD storage_tier NVARCHAR(10) DEFAULT 'hot'`,
  },
  {
    name: 'photos.updated_at',
    sql: `IF COL_LENGTH('photos', 'updated_at') IS NULL
          ALTER TABLE photos ADD updated_at DATETIME NULL`,
  },
  {
    name: 'photos.updated_by',
    sql: `IF COL_LENGTH('photos', 'updated_by') IS NULL
          ALTER TABLE photos ADD updated_by NVARCHAR(255) NULL`,
  },
  {
    name: 'photos.date_taken',
    sql: `IF COL_LENGTH('photos', 'date_taken') IS NULL
          ALTER TABLE photos ADD date_taken DATETIME NULL`,
  },
  {
    name: 'photos.camera_info',
    sql: `IF COL_LENGTH('photos', 'camera_info') IS NULL
          ALTER TABLE photos ADD camera_info NVARCHAR(200) NULL`,
  },
  {
    name: 'photos.batch_id',
    sql: `IF COL_LENGTH('photos', 'batch_id') IS NULL
          ALTER TABLE photos ADD batch_id UNIQUEIDENTIFIER NULL`,
  },

  // ── photo_renditions ──
  {
    name: 'photo_renditions table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_renditions')
          CREATE TABLE photo_renditions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            photo_id UNIQUEIDENTIFIER NOT NULL,
            variant_type NVARCHAR(30) NOT NULL,
            blob_path NVARCHAR(500) NOT NULL,
            width INT NOT NULL,
            height INT NOT NULL,
            file_size BIGINT NOT NULL,
            mime_type NVARCHAR(50) NOT NULL,
            created_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_renditions_photo FOREIGN KEY (photo_id)
              REFERENCES photos(id) ON DELETE CASCADE,
            CONSTRAINT UQ_renditions_photo_variant UNIQUE (photo_id, variant_type)
          )`,
  },
  {
    name: 'IX_renditions_photo_type',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_renditions_photo_type')
          CREATE INDEX IX_renditions_photo_type ON photo_renditions(photo_id, variant_type)`,
  },

  // ── photo_exif ──
  {
    name: 'photo_exif table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_exif')
          CREATE TABLE photo_exif (
            photo_id UNIQUEIDENTIFIER PRIMARY KEY,
            camera_make NVARCHAR(100), camera_model NVARCHAR(100), lens_model NVARCHAR(100),
            focal_length FLOAT, aperture FLOAT, shutter_speed NVARCHAR(20),
            iso_speed INT, flash_used BIT, orientation INT, gps_altitude FLOAT,
            date_taken_exif DATETIME, software NVARCHAR(100), raw_json NVARCHAR(MAX),
            CONSTRAINT FK_exif_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
          )`,
  },

  // ── tags + photo_tags ──
  {
    name: 'tags table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'tags')
          CREATE TABLE tags (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(100) NOT NULL, category NVARCHAR(50) NOT NULL DEFAULT 'custom',
            color NVARCHAR(7) NULL, created_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT UQ_tags_name_category UNIQUE (name, category)
          )`,
  },
  {
    name: 'photo_tags table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_tags')
          CREATE TABLE photo_tags (
            photo_id UNIQUEIDENTIFIER NOT NULL, tag_id UNIQUEIDENTIFIER NOT NULL,
            added_by NVARCHAR(255) NOT NULL, added_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT PK_photo_tags PRIMARY KEY (photo_id, tag_id),
            CONSTRAINT FK_pt_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
            CONSTRAINT FK_pt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
          )`,
  },
  {
    name: 'IX_photo_tags_tag',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photo_tags_tag')
          CREATE INDEX IX_photo_tags_tag ON photo_tags(tag_id)`,
  },

  // ── photo_edits ──
  {
    name: 'photo_edits table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_edits')
          CREATE TABLE photo_edits (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            photo_id UNIQUEIDENTIFIER NOT NULL, edit_type NVARCHAR(30) NOT NULL,
            edit_params NVARCHAR(MAX) NULL, edited_blob_path NVARCHAR(500) NULL,
            edited_by NVARCHAR(255) NOT NULL, created_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_edits_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
          )`,
  },
  {
    name: 'IX_edits_photo_date',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_edits_photo_date')
          CREATE INDEX IX_edits_photo_date ON photo_edits(photo_id, created_at DESC)`,
  },

  // ── admin_audit_log ──
  {
    name: 'admin_audit_log table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'admin_audit_log')
          CREATE TABLE admin_audit_log (
            id BIGINT IDENTITY(1,1) PRIMARY KEY,
            entity_type NVARCHAR(20) NOT NULL, entity_id NVARCHAR(36) NULL,
            action NVARCHAR(50) NOT NULL, performed_by NVARCHAR(255) NOT NULL,
            ip_address NVARCHAR(45) NULL, details NVARCHAR(MAX) NULL,
            created_at DATETIME DEFAULT GETUTCDATE()
          )`,
  },
  {
    name: 'IX_audit_entity',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_entity')
          CREATE INDEX IX_audit_entity ON admin_audit_log(entity_type, entity_id, created_at DESC)`,
  },
  {
    name: 'IX_audit_action_date',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_action_date')
          CREATE INDEX IX_audit_action_date ON admin_audit_log(action, created_at DESC)`,
  },
  {
    name: 'IX_audit_user',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_user')
          CREATE INDEX IX_audit_user ON admin_audit_log(performed_by, created_at DESC)`,
  },

  // ── upload_batches ──
  {
    name: 'upload_batches table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'upload_batches')
          CREATE TABLE upload_batches (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NULL,
            uploader_type NVARCHAR(10) NOT NULL, uploader_identity NVARCHAR(255) NOT NULL,
            photo_count INT NOT NULL DEFAULT 0, total_size BIGINT NOT NULL DEFAULT 0,
            status NVARCHAR(20) NOT NULL DEFAULT 'uploading',
            completed_count INT NOT NULL DEFAULT 0, failed_count INT NOT NULL DEFAULT 0,
            incident_id NVARCHAR(50) NULL, location_name NVARCHAR(255) NULL,
            started_at DATETIME DEFAULT GETDATE(), completed_at DATETIME NULL,
            CONSTRAINT FK_batches_session FOREIGN KEY (session_id) REFERENCES upload_sessions(id)
          )`,
  },
  {
    name: 'IX_batches_session',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_batches_session')
          CREATE INDEX IX_batches_session ON upload_batches(session_id, started_at DESC)`,
  },
  {
    name: 'IX_batches_status',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_batches_status')
          CREATE INDEX IX_batches_status ON upload_batches(status, started_at DESC)`,
  },

  // ── Performance indexes on photos ──
  {
    name: 'IX_photos_admin_list',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_admin_list')
          CREATE INDEX IX_photos_admin_list ON photos(incident_id, status, created_at DESC)
          INCLUDE (file_name, file_size, width, height, mime_type,
                   latitude, longitude, location_name, storage_tier, date_taken, camera_info)`,
  },
  {
    name: 'IX_photos_session',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_session')
          CREATE INDEX IX_photos_session ON photos(session_id, created_at DESC)
          INCLUDE (file_name, file_size, width, height, mime_type)`,
  },
  {
    name: 'IX_photos_date',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_date')
          CREATE INDEX IX_photos_date ON photos(created_at DESC)
          INCLUDE (incident_id, session_id, status)`,
  },
  {
    name: 'IX_photos_location',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_location')
          CREATE INDEX IX_photos_location ON photos(latitude, longitude) WHERE latitude IS NOT NULL`,
  },
  {
    name: 'IX_photos_status',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_status')
          CREATE INDEX IX_photos_status ON photos(status) INCLUDE (incident_id, created_at)`,
  },

  // ── Seed default tags ──
  {
    name: 'Seed default tags',
    sql: `IF NOT EXISTS (SELECT 1 FROM tags WHERE category = 'status')
          INSERT INTO tags (name, category, color) VALUES
            ('Reviewed', 'status', '#22C55E'), ('Needs Attention', 'status', '#EAB308'),
            ('Critical', 'priority', '#EF4444'), ('Routine', 'priority', '#6B7280'),
            ('Structural Damage', 'type', '#DC2626'), ('Flooding', 'type', '#3B82F6'),
            ('Infrastructure', 'type', '#8B5CF6'), ('Personnel', 'type', '#F59E0B'),
            ('Medical', 'type', '#EC4899'), ('Before', 'timeline', '#6366F1'),
            ('After', 'timeline', '#14B8A6')`,
  },
]

export async function POST(req: Request) {
  const { error } = await guardAdmin(req)
  if (error) return error

  try {
    const results: string[] = []
    let passed = 0
    let failed = 0

    for (const m of MIGRATIONS) {
      try {
        await query(m.sql, {})
        results.push(`OK: ${m.name}`)
        passed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push(`FAIL: ${m.name} — ${msg}`)
        failed++
      }
    }

    // Verify tables
    const tables = await query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME IN ('photos','photo_renditions','photo_exif','tags','photo_tags',
                            'photo_edits','admin_audit_log','upload_batches','upload_sessions')
       ORDER BY TABLE_NAME`,
      {}
    )

    return Response.json({
      success: failed === 0,
      summary: `${passed} passed, ${failed} failed`,
      results,
      tables: tables.rows.map((r: any) => r.TABLE_NAME),
    })
  } catch (error) {
    console.error('Migration error:', error)
    return Response.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
