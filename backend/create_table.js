const pool = require('./db');

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resumes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uploaded_by INT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        extracted_text LONGTEXT,
        parsed_metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log("Table 'resumes' successfully created!");
  } catch (error) {
    console.error("Error creating table:", error);
  } finally {
    process.exit(0);
  }
}

run();
