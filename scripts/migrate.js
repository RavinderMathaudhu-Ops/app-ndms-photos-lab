const { Connection, Request } = require('tedious');
const config = {
  server: process.env.SQL_SERVER,
  authentication: { type: 'default', options: { userName: process.env.SQL_USERNAME, password: process.env.SQL_PASSWORD } },
  options: { database: process.env.SQL_DATABASE, encrypt: true, trustServerCertificate: false, connectTimeout: 15000 }
};
function runQuery(conn, sql) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const req = new Request(sql, (err, cnt) => { if (err) reject(err); else resolve({ cnt, rows }); });
    req.on('row', (cols) => { const r = {}; cols.forEach(c => { r[c.metadata.colName] = c.value; }); rows.push(r); });
    conn.execSql(req);
  });
}
const conn = new Connection(config);
conn.on('connect', async (err) => {
  if (err) { console.error('FAIL:', err.message); process.exit(1); }
  console.log('Connected to SQL Server');
  try {
    const c = await runQuery(conn, "SELECT CHARACTER_MAXIMUM_LENGTH as sz FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='upload_sessions' AND COLUMN_NAME='pin'");
    console.log('Current pin column size:', c.rows[0] ? c.rows[0].sz : 'NOT FOUND');
    if (c.rows[0] && c.rows[0].sz < 72) {
      await runQuery(conn, 'ALTER TABLE upload_sessions ALTER COLUMN pin NVARCHAR(72) NOT NULL');
      console.log('Altered pin column to NVARCHAR(72)');
      await runQuery(conn, "DELETE FROM upload_sessions WHERE LEN(pin) < 20");
      console.log('Deleted old plaintext PINs');
    } else {
      console.log('Pin column already correct size or not found');
    }
    const v = await runQuery(conn, "SELECT CHARACTER_MAXIMUM_LENGTH as sz FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='upload_sessions' AND COLUMN_NAME='pin'");
    console.log('Verified pin column size:', v.rows[0] ? v.rows[0].sz : 'NOT FOUND');
    console.log('Migration complete!');
  } catch(e) { console.error('Migration error:', e.message); }
  conn.close();
});
conn.connect();
