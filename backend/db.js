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

// Test the connection
pool.getConnection()
  .then((connection) => {
    console.log('Successfully connected to the database.');
    connection.release();
  })
  .catch((err) => {
    console.error('Error connecting to the database:', err.message);
  });

module.exports = pool;
