const pool = require('./db');

async function alterTable() {
  try {
    await pool.query(`
      ALTER TABLE resumes 
      MODIFY COLUMN file_type VARCHAR(255) NOT NULL;
    `);
    console.log("Column 'file_type' modified successfully to VARCHAR(255)!");
  } catch (error) {
    console.error("Error altering table:", error);
  } finally {
    process.exit(0);
  }
}

alterTable();
