require('dotenv').config();
const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function cleanDatabase() {
  try {
    console.log('Connecting to database...');
    
    // Disable foreign key checks to allow truncating tables with relationships
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Get all tables in the current database
    const [tables] = await pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()');
    
    console.log(`Found ${tables.length} tables to clean...`);
    
    for (const row of tables) {
      const tableName = row.TABLE_NAME || row.table_name;
      console.log(`Truncating table: ${tableName}`);
      await pool.query(`TRUNCATE TABLE \`${tableName}\``);
    }
    
    // Re-enable foreign key checks
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ Database data successfully cleared!');

    // Clean uploads folder
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        if (file !== '.gitkeep') {
          fs.unlinkSync(path.join(uploadsDir, file));
        }
      }
      console.log('✅ Uploaded resumes cleared!');
    }

    // Clean sent_emails folder
    const emailsDir = path.join(__dirname, 'sent_emails');
    if (fs.existsSync(emailsDir)) {
      const files = fs.readdirSync(emailsDir);
      for (const file of files) {
        if (file !== '.gitkeep') {
          fs.unlinkSync(path.join(emailsDir, file));
        }
      }
      console.log('✅ Sent emails history cleared!');
    }

    console.log('\nTesting environment is perfectly clean and ready!');
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning database:', error);
    process.exit(1);
  }
}

cleanDatabase();
