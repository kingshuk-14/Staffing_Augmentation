const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Mababa@0000',
  database: process.env.DB_NAME || 'staffing_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function clearDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database. Disabling foreign key checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Get all tables
    const [rows] = await connection.query(`
      SELECT TABLE_NAME 
      FROM information_schema.tables 
      WHERE table_schema = ?`, 
      [process.env.DB_NAME || 'staffing_db']
    );
    
    const tables = rows.map(row => row.TABLE_NAME);
    
    for (const table of tables) {
      console.log(`Truncating table: ${table}`);
      await connection.query(`TRUNCATE TABLE \`${table}\``);
    }
    
    console.log('Re-enabling foreign key checks...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Database successfully cleared.');
  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    if (connection) {
      connection.release();
    }
    pool.end();
  }
}

clearDatabase();
