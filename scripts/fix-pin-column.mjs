// One-time migration: expand pin column for bcrypt hashes (60 chars)
import sql from 'mssql'

const config = {
  server: 'sql-ocio-microsites-eus2-01.database.windows.net',
  database: 'aspr_photos_db',
  user: 'sqladmin',
  password: 'OcioSQL@2026Prod',
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
}

async function main() {
  const pool = await sql.connect(config)

  // 1. Check current column size
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'upload_sessions'
    ORDER BY ORDINAL_POSITION
  `)
  console.log('Current schema:')
  console.table(cols.recordset)

  // 2. Alter pin column to NVARCHAR(72) for bcrypt hashes
  console.log('\nAltering pin column to NVARCHAR(72)...')
  await pool.request().query(`
    ALTER TABLE upload_sessions ALTER COLUMN pin NVARCHAR(72) NOT NULL
  `)
  console.log('✅ Column altered successfully')

  // 3. Delete any old plaintext PINs (they won't work with bcrypt.compare)
  const oldPins = await pool.request().query(`
    SELECT id, pin, team_name FROM upload_sessions
    WHERE LEN(pin) < 20
  `)
  if (oldPins.recordset.length > 0) {
    console.log(`\nFound ${oldPins.recordset.length} old plaintext PIN(s), deleting...`)
    await pool.request().query(`DELETE FROM upload_sessions WHERE LEN(pin) < 20`)
    console.log('✅ Old plaintext PINs removed')
  } else {
    console.log('\nNo old plaintext PINs found')
  }

  // 4. Verify new schema
  const newCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'upload_sessions'
    ORDER BY ORDINAL_POSITION
  `)
  console.log('\nUpdated schema:')
  console.table(newCols.recordset)

  await pool.close()
  console.log('\n✅ Migration complete!')
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
