const { Connection, Request } = require('tedious');
const config = {
  server: process.env.SQL_SERVER,
  authentication: { type: 'default', options: { userName: process.env.SQL_USERNAME, password: process.env.SQL_PASSWORD } },
  options: { database: process.env.SQL_DATABASE, encrypt: true, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 30000 },
};

function runQuery(conn, sql) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const req = new Request(sql, (err) => { if (err) reject(err); else resolve(rows); });
    req.on('row', (cols) => { const r = {}; cols.forEach(c => { r[c.metadata.colName] = c.value; }); rows.push(r); });
    conn.execSql(req);
  });
}

const conn = new Connection(config);
conn.on('connect', async (err) => {
  if (err) { console.error('FAIL:', err.message); process.exit(1); }
  try {
    // 1. Tables
    const tables = await runQuery(conn, "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
    console.log('=== TABLES ===');
    const expected = ['admin_audit_log','photo_edits','photo_exif','photo_renditions','photo_tags','photos','tags','upload_batches','upload_sessions'];
    const found = tables.map(r => r.TABLE_NAME);
    expected.forEach(t => { console.log(found.includes(t) ? '  PASS  ' + t : '  FAIL  ' + t + ' MISSING'); });

    // 2. New columns on photos
    const cols = await runQuery(conn, "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='photos' ORDER BY COLUMN_NAME");
    console.log('\n=== NEW COLUMNS ON photos ===');
    const newCols = ['status','storage_tier','updated_at','updated_by','date_taken','camera_info','batch_id'];
    const foundCols = cols.map(r => r.COLUMN_NAME);
    newCols.forEach(c => { console.log(foundCols.includes(c) ? '  PASS  ' + c : '  FAIL  ' + c + ' MISSING'); });

    // 3. Indexes
    const indexes = await runQuery(conn, "SELECT i.name, o.name as tbl FROM sys.indexes i JOIN sys.objects o ON i.object_id=o.object_id WHERE i.name LIKE 'IX_%' ORDER BY o.name, i.name");
    console.log('\n=== INDEXES ===');
    const expectedIdx = ['IX_renditions_photo_type','IX_exif_camera','IX_exif_date','IX_photo_tags_tag','IX_edits_photo_date',
      'IX_audit_entity','IX_audit_action_date','IX_audit_user','IX_batches_session','IX_batches_status',
      'IX_photos_admin_list','IX_photos_session','IX_photos_date','IX_photos_location','IX_photos_status'];
    const foundIdx = indexes.map(r => r.name);
    expectedIdx.forEach(ix => { console.log(foundIdx.includes(ix) ? '  PASS  ' + ix : '  FAIL  ' + ix + ' MISSING'); });

    // 4. Views
    const views = await runQuery(conn, "SELECT name FROM sys.views WHERE name='v_incident_summary'");
    console.log('\n=== VIEWS ===');
    console.log(views.length > 0 ? '  PASS  v_incident_summary' : '  FAIL  v_incident_summary MISSING');

    // 5. Seed tags
    const tags = await runQuery(conn, "SELECT COUNT(*) as cnt FROM tags");
    const tagCount = tags[0].cnt;
    console.log('\n=== SEED TAGS ===');
    console.log(tagCount >= 11 ? '  PASS  ' + tagCount + ' tags seeded' : '  FAIL  Only ' + tagCount + ' tags (expected 11)');

    // 6. Summary
    console.log('\n=== SUMMARY ===');
    const total = expected.length + newCols.length + expectedIdx.length + 1 + 1;
    console.log('Total checks: ' + total);

  } catch (e) { console.error('ERR:', e.message); }
  conn.close();
});
conn.connect();
