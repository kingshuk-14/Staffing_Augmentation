const pool = require('../db');

async function migrate() {
  try {
    console.log('Running migration: add_duplicate_flags to resumes table...');

    // Add is_duplicate column
    await pool.query(`
      ALTER TABLE resumes
        ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS duplicate_of INT NULL,
        ADD COLUMN IF NOT EXISTS duplicate_score FLOAT NULL,
        ADD COLUMN IF NOT EXISTS duplicate_reason VARCHAR(50) NULL
    `).catch(async () => {
      // MySQL < 8.0 doesn't support IF NOT EXISTS on ALTER TABLE ADD COLUMN
      // Add columns one by one, ignoring errors if they already exist
      const addIfMissing = async (sql) => {
        try { await pool.query(sql); } catch (e) {
          if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        }
      };
      await addIfMissing('ALTER TABLE resumes ADD COLUMN is_duplicate BOOLEAN NOT NULL DEFAULT FALSE');
      await addIfMissing('ALTER TABLE resumes ADD COLUMN duplicate_of INT NULL');
      await addIfMissing('ALTER TABLE resumes ADD COLUMN duplicate_score FLOAT NULL');
      await addIfMissing('ALTER TABLE resumes ADD COLUMN duplicate_reason VARCHAR(50) NULL');
    });

    console.log('Migration complete: duplicate flag columns added to resumes table.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
