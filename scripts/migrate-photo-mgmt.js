/**
 * Photo Management Schema Migration — Kudu deployment script
 *
 * Run via Kudu command API (Azure SQL is VNet-restricted):
 *   1. Upload to App Service via Kudu VFS
 *   2. Copy from /home/tmp to /tmp
 *   3. Run: node migrate.js
 *
 * All statements are idempotent (IF NOT EXISTS / IF COL_LENGTH guards).
 */

const { Connection, Request, TYPES } = require('tedious');

const config = {
  server: process.env.SQL_SERVER,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.SQL_USERNAME,
      password: process.env.SQL_PASSWORD,
    },
  },
  options: {
    database: process.env.SQL_DATABASE,
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
    requestTimeout: 60000,
  },
};

function runQuery(conn, sql) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const req = new Request(sql, (err, rowCount) => {
      if (err) reject(err);
      else resolve({ rowCount, rows });
    });
    req.on('row', (cols) => {
      const r = {};
      cols.forEach((c) => {
        r[c.metadata.colName] = c.value;
      });
      rows.push(r);
    });
    conn.execSql(req);
  });
}

const MIGRATIONS = [
  // ──────────────────────────────────────────────────────────
  // 1. Enhanced photos table — new columns
  // ──────────────────────────────────────────────────────────
  {
    name: 'photos.status column',
    sql: `IF COL_LENGTH('photos', 'status') IS NULL
          ALTER TABLE photos ADD status NVARCHAR(20) DEFAULT 'active'`,
  },
  {
    name: 'photos.storage_tier column',
    sql: `IF COL_LENGTH('photos', 'storage_tier') IS NULL
          ALTER TABLE photos ADD storage_tier NVARCHAR(10) DEFAULT 'hot'`,
  },
  {
    name: 'photos.updated_at column',
    sql: `IF COL_LENGTH('photos', 'updated_at') IS NULL
          ALTER TABLE photos ADD updated_at DATETIME NULL`,
  },
  {
    name: 'photos.updated_by column',
    sql: `IF COL_LENGTH('photos', 'updated_by') IS NULL
          ALTER TABLE photos ADD updated_by NVARCHAR(255) NULL`,
  },
  {
    name: 'photos.date_taken column',
    sql: `IF COL_LENGTH('photos', 'date_taken') IS NULL
          ALTER TABLE photos ADD date_taken DATETIME NULL`,
  },
  {
    name: 'photos.camera_info column',
    sql: `IF COL_LENGTH('photos', 'camera_info') IS NULL
          ALTER TABLE photos ADD camera_info NVARCHAR(200) NULL`,
  },
  {
    name: 'photos.batch_id column',
    sql: `IF COL_LENGTH('photos', 'batch_id') IS NULL
          ALTER TABLE photos ADD batch_id UNIQUEIDENTIFIER NULL`,
  },

  // ──────────────────────────────────────────────────────────
  // 2. photo_renditions table
  // ──────────────────────────────────────────────────────────
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
    name: 'IX_renditions_photo_type index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_renditions_photo_type')
          CREATE INDEX IX_renditions_photo_type ON photo_renditions(photo_id, variant_type)`,
  },

  // ──────────────────────────────────────────────────────────
  // 3. photo_exif table
  // ──────────────────────────────────────────────────────────
  {
    name: 'photo_exif table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_exif')
          CREATE TABLE photo_exif (
            photo_id UNIQUEIDENTIFIER PRIMARY KEY,
            camera_make NVARCHAR(100),
            camera_model NVARCHAR(100),
            lens_model NVARCHAR(100),
            focal_length FLOAT,
            aperture FLOAT,
            shutter_speed NVARCHAR(20),
            iso_speed INT,
            flash_used BIT,
            orientation INT,
            gps_altitude FLOAT,
            date_taken_exif DATETIME,
            software NVARCHAR(100),
            raw_json NVARCHAR(MAX),
            CONSTRAINT FK_exif_photo FOREIGN KEY (photo_id)
              REFERENCES photos(id) ON DELETE CASCADE
          )`,
  },
  {
    name: 'IX_exif_camera index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_exif_camera')
          CREATE INDEX IX_exif_camera ON photo_exif(camera_make, camera_model)`,
  },
  {
    name: 'IX_exif_date index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_exif_date')
          CREATE INDEX IX_exif_date ON photo_exif(date_taken_exif)`,
  },

  // ──────────────────────────────────────────────────────────
  // 4. tags + photo_tags tables
  // ──────────────────────────────────────────────────────────
  {
    name: 'tags table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'tags')
          CREATE TABLE tags (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(100) NOT NULL,
            category NVARCHAR(50) NOT NULL DEFAULT 'custom',
            color NVARCHAR(7) NULL,
            created_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT UQ_tags_name_category UNIQUE (name, category)
          )`,
  },
  {
    name: 'photo_tags table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_tags')
          CREATE TABLE photo_tags (
            photo_id UNIQUEIDENTIFIER NOT NULL,
            tag_id UNIQUEIDENTIFIER NOT NULL,
            added_by NVARCHAR(255) NOT NULL,
            added_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT PK_photo_tags PRIMARY KEY (photo_id, tag_id),
            CONSTRAINT FK_pt_photo FOREIGN KEY (photo_id)
              REFERENCES photos(id) ON DELETE CASCADE,
            CONSTRAINT FK_pt_tag FOREIGN KEY (tag_id)
              REFERENCES tags(id) ON DELETE CASCADE
          )`,
  },
  {
    name: 'IX_photo_tags_tag index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photo_tags_tag')
          CREATE INDEX IX_photo_tags_tag ON photo_tags(tag_id)`,
  },

  // ──────────────────────────────────────────────────────────
  // 5. photo_edits table
  // ──────────────────────────────────────────────────────────
  {
    name: 'photo_edits table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'photo_edits')
          CREATE TABLE photo_edits (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            photo_id UNIQUEIDENTIFIER NOT NULL,
            edit_type NVARCHAR(30) NOT NULL,
            edit_params NVARCHAR(MAX) NULL,
            edited_blob_path NVARCHAR(500) NULL,
            edited_by NVARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT GETDATE(),
            CONSTRAINT FK_edits_photo FOREIGN KEY (photo_id)
              REFERENCES photos(id) ON DELETE CASCADE
          )`,
  },
  {
    name: 'IX_edits_photo_date index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_edits_photo_date')
          CREATE INDEX IX_edits_photo_date ON photo_edits(photo_id, created_at DESC)`,
  },

  // ──────────────────────────────────────────────────────────
  // 6. admin_audit_log table
  // ──────────────────────────────────────────────────────────
  {
    name: 'admin_audit_log table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'admin_audit_log')
          CREATE TABLE admin_audit_log (
            id BIGINT IDENTITY(1,1) PRIMARY KEY,
            entity_type NVARCHAR(20) NOT NULL,
            entity_id NVARCHAR(36) NULL,
            action NVARCHAR(50) NOT NULL,
            performed_by NVARCHAR(255) NOT NULL,
            ip_address NVARCHAR(45) NULL,
            details NVARCHAR(MAX) NULL,
            created_at DATETIME DEFAULT GETUTCDATE()
          )`,
  },
  {
    name: 'IX_audit_entity index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_entity')
          CREATE INDEX IX_audit_entity ON admin_audit_log(entity_type, entity_id, created_at DESC)`,
  },
  {
    name: 'IX_audit_action_date index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_action_date')
          CREATE INDEX IX_audit_action_date ON admin_audit_log(action, created_at DESC)`,
  },
  {
    name: 'IX_audit_user index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_user')
          CREATE INDEX IX_audit_user ON admin_audit_log(performed_by, created_at DESC)`,
  },

  // ──────────────────────────────────────────────────────────
  // 7. upload_batches table
  // ──────────────────────────────────────────────────────────
  {
    name: 'upload_batches table',
    sql: `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'upload_batches')
          CREATE TABLE upload_batches (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NULL,
            uploader_type NVARCHAR(10) NOT NULL,
            uploader_identity NVARCHAR(255) NOT NULL,
            photo_count INT NOT NULL DEFAULT 0,
            total_size BIGINT NOT NULL DEFAULT 0,
            status NVARCHAR(20) NOT NULL DEFAULT 'uploading',
            completed_count INT NOT NULL DEFAULT 0,
            failed_count INT NOT NULL DEFAULT 0,
            incident_id NVARCHAR(50) NULL,
            location_name NVARCHAR(255) NULL,
            started_at DATETIME DEFAULT GETDATE(),
            completed_at DATETIME NULL,
            CONSTRAINT FK_batches_session FOREIGN KEY (session_id)
              REFERENCES upload_sessions(id)
          )`,
  },
  {
    name: 'IX_batches_session index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_batches_session')
          CREATE INDEX IX_batches_session ON upload_batches(session_id, started_at DESC)`,
  },
  {
    name: 'IX_batches_status index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_batches_status')
          CREATE INDEX IX_batches_status ON upload_batches(status, started_at DESC)`,
  },

  // ──────────────────────────────────────────────────────────
  // 8. Performance indexes on photos table
  // ──────────────────────────────────────────────────────────
  {
    name: 'IX_photos_admin_list covering index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_admin_list')
          CREATE INDEX IX_photos_admin_list
            ON photos(incident_id, status, created_at DESC)
            INCLUDE (file_name, file_size, width, height, mime_type,
                     latitude, longitude, location_name, storage_tier, date_taken, camera_info)`,
  },
  {
    name: 'IX_photos_session index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_session')
          CREATE INDEX IX_photos_session
            ON photos(session_id, created_at DESC)
            INCLUDE (file_name, file_size, width, height, mime_type)`,
  },
  {
    name: 'IX_photos_date index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_date')
          CREATE INDEX IX_photos_date
            ON photos(created_at DESC)
            INCLUDE (incident_id, session_id, status)`,
  },
  {
    name: 'IX_photos_location index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_location')
          CREATE INDEX IX_photos_location
            ON photos(latitude, longitude)
            WHERE latitude IS NOT NULL`,
  },
  {
    name: 'IX_photos_status index',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_photos_status')
          CREATE INDEX IX_photos_status
            ON photos(status)
            INCLUDE (incident_id, created_at)`,
  },

  // ──────────────────────────────────────────────────────────
  // 9. Dashboard aggregation view
  // ──────────────────────────────────────────────────────────
  {
    name: 'v_incident_summary view',
    sql: `IF NOT EXISTS (SELECT 1 FROM sys.views WHERE name = 'v_incident_summary')
          EXEC('CREATE VIEW v_incident_summary AS
          SELECT
            ISNULL(p.incident_id, ''(No Incident)'') AS incident_id,
            COUNT(*) AS photo_count,
            SUM(p.file_size) AS total_size_bytes,
            COUNT(DISTINCT p.session_id) AS team_count,
            MIN(p.created_at) AS first_upload,
            MAX(p.created_at) AS last_upload,
            SUM(CASE WHEN p.status = ''active'' THEN 1 ELSE 0 END) AS active_count,
            SUM(CASE WHEN p.status = ''reviewed'' THEN 1 ELSE 0 END) AS reviewed_count,
            SUM(CASE WHEN p.status = ''flagged'' THEN 1 ELSE 0 END) AS flagged_count,
            SUM(CASE WHEN p.status = ''archived'' THEN 1 ELSE 0 END) AS archived_count
          FROM photos p
          GROUP BY ISNULL(p.incident_id, ''(No Incident)'')')`,
  },

  // ──────────────────────────────────────────────────────────
  // 10. Seed default tags
  // ──────────────────────────────────────────────────────────
  {
    name: 'Seed default tags',
    sql: `IF NOT EXISTS (SELECT 1 FROM tags WHERE category = 'status')
          BEGIN
            INSERT INTO tags (name, category, color) VALUES
              ('Reviewed', 'status', '#22C55E'),
              ('Needs Attention', 'status', '#EAB308'),
              ('Critical', 'priority', '#EF4444'),
              ('Routine', 'priority', '#6B7280'),
              ('Structural Damage', 'type', '#DC2626'),
              ('Flooding', 'type', '#3B82F6'),
              ('Infrastructure', 'type', '#8B5CF6'),
              ('Personnel', 'type', '#F59E0B'),
              ('Medical', 'type', '#EC4899'),
              ('Before', 'timeline', '#6366F1'),
              ('After', 'timeline', '#14B8A6')
          END`,
  },
];

// ──────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────

const conn = new Connection(config);

conn.on('connect', async (err) => {
  if (err) {
    console.error('CONNECTION FAILED:', err.message);
    process.exit(1);
  }

  console.log('Connected to SQL Server');
  console.log(`Database: ${process.env.SQL_DATABASE}`);
  console.log(`Running ${MIGRATIONS.length} migrations...\n`);

  let passed = 0;
  let failed = 0;

  for (const m of MIGRATIONS) {
    try {
      await runQuery(conn, m.sql);
      console.log(`  ✓ ${m.name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${m.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed`);

  // Verify tables
  try {
    const result = await runQuery(
      conn,
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME IN ('photos','photo_renditions','photo_exif','tags','photo_tags',
                            'photo_edits','admin_audit_log','upload_batches','upload_sessions')
       ORDER BY TABLE_NAME`
    );
    console.log('\nTables present:');
    result.rows.forEach((r) => console.log(`  - ${r.TABLE_NAME}`));
  } catch (e) {
    console.error('Verification failed:', e.message);
  }

  conn.close();
});

conn.connect();
