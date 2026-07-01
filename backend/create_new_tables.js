const pool = require('./db');

async function createTables() {
  try {
    console.log('Initializing recruitment automation tables...');

    // 1. jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        positions_needed INT NOT NULL DEFAULT 1,
        positions_filled INT NOT NULL DEFAULT 0,
        budget DECIMAL(12, 2) NULL,
        experience_years INT NULL,
        status VARCHAR(20) DEFAULT 'OPEN',
        raw_text LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('- Table "jobs" initialized.');

    // 2. job_skills table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        skill VARCHAR(100) NOT NULL,
        is_required BOOLEAN DEFAULT TRUE,
        UNIQUE KEY uq_job_skill (job_id, skill, is_required),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "job_skills" initialized.');

    // 3. candidates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resume_id INT NOT NULL UNIQUE,
        name VARCHAR(255) NULL,
        email VARCHAR(255) NULL UNIQUE,
        phone VARCHAR(50) NULL,
        expected_salary DECIMAL(12, 2) NULL,
        current_location VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "candidates" initialized.');

    // 4. candidate_skills table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_skills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        skill VARCHAR(100) NOT NULL,
        UNIQUE KEY uq_candidate_skill (candidate_id, skill),
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "candidate_skills" initialized.');

    // 5. candidate_experiences table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_experiences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        candidate_id INT NOT NULL,
        company VARCHAR(255) NULL,
        role VARCHAR(255) NULL,
        duration_months INT NULL,
        description TEXT NULL,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "candidate_experiences" initialized.');

    // 6. vendors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        overall_score FLOAT DEFAULT 100.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('- Table "vendors" initialized.');

    // 7. vendor_specializations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendor_specializations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        specialization VARCHAR(100) NOT NULL,
        UNIQUE KEY uq_vendor_spec (vendor_id, specialization),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "vendor_specializations" initialized.');

    // 8. vendor_outreach table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendor_outreach (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        vendor_id INT NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "vendor_outreach" initialized.');

    // 9. vendor_submissions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendor_submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id INT NOT NULL,
        resume_id INT NOT NULL,
        job_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "vendor_submissions" initialized.');

    // 10. job_candidate_matches table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_candidate_matches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        job_id INT NOT NULL,
        candidate_id INT NOT NULL,
        semantic_score FLOAT NULL,
        llm_score FLOAT NULL,
        match_breakdown JSON NULL,
        rationale TEXT NULL,
        status VARCHAR(50) DEFAULT 'SUGGESTED',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
      )
    `);
    console.log('- Table "job_candidate_matches" initialized.');

    console.log('All recruitment automation tables initialized successfully!');
  } catch (error) {
    console.error('Error creating database tables:', error);
  } finally {
    process.exit(0);
  }
}

createTables();
