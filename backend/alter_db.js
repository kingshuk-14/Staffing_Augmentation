const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Mababa@0000',
  database: process.env.DB_NAME || 'staffing_db'
});

async function run() {
  try {
    const conn = await pool.getConnection();
    await conn.query('ALTER TABLE jobs ADD COLUMN parsed_summary JSON NULL AFTER raw_text');
    console.log('Successfully added parsed_summary column to jobs table.');
    conn.release();
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column parsed_summary already exists.');
    } else {
      console.error(err);
    }
  } finally {
    pool.end();
  }
}
run();
