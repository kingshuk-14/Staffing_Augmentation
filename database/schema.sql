-- Database initialization script for Staffing AI Platform
CREATE DATABASE IF NOT EXISTS staffing_db;
USE staffing_db;

-- 1. Table structure for table `users`
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20) NULL,                              -- e.g. +91-9876543210
  gender ENUM('male','female','non_binary','prefer_not_to_say') NULL,
  date_of_birth DATE NULL,
  company VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,                           -- 'recruiter', 'client', or 'alphaxine'
  profile_picture_url VARCHAR(500) NULL,               -- Provision for avatar upload later
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


-- 2. Table structure for table `resumes`
CREATE TABLE IF NOT EXISTS resumes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uploaded_by INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(255) NOT NULL, -- Modified from VARCHAR(50)
  file_path VARCHAR(255) NOT NULL,
  extracted_text LONGTEXT,
  parsed_metadata JSON,
  summarised JSON,
  is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_of INT NULL,
  duplicate_score FLOAT NULL,
  duplicate_reason VARCHAR(50) NULL,
  processing_status VARCHAR(50) DEFAULT 'INGESTED',
  error_message TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (duplicate_of) REFERENCES resumes(id) ON DELETE SET NULL
);

-- 3. Table structure for table `clients`
CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL UNIQUE,
  contact_person VARCHAR(255) NULL,
  email VARCHAR(255) NULL UNIQUE,
  phone VARCHAR(50) NULL,
  address TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. Table structure for table `jobs`
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NULL,
  title VARCHAR(255) NOT NULL,
  positions_needed INT NOT NULL DEFAULT 1,
  positions_filled INT NOT NULL DEFAULT 0,
  budget DECIMAL(12, 2) NULL,
  experience_years INT NULL,
  status VARCHAR(20) DEFAULT 'OPEN',
  raw_text LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

-- 5. Table structure for table `job_skills`
CREATE TABLE IF NOT EXISTS job_skills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  skill VARCHAR(100) NOT NULL,
  is_required BOOLEAN DEFAULT TRUE,
  UNIQUE KEY uq_job_skill (job_id, skill, is_required),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- 6. Table structure for table `candidates`
CREATE TABLE IF NOT EXISTS candidates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resume_id INT NOT NULL UNIQUE,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL UNIQUE,
  phone VARCHAR(50) NULL,
  expected_salary DECIMAL(12, 2) NULL,
  current_location VARCHAR(255) NULL,
  total_experience_years VARCHAR(50) NULL DEFAULT '0',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  hired_at TIMESTAMP NULL DEFAULT NULL,
  tenure_months INT NULL DEFAULT NULL,
  hired_by_company VARCHAR(255) NULL DEFAULT NULL,
  employment_start_date DATE NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
);

-- 7. Table structure for table `candidate_skills`
CREATE TABLE IF NOT EXISTS candidate_skills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidate_id INT NOT NULL,
  skill VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_candidate_skill (candidate_id, skill),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

-- 8. Table structure for table `candidate_experiences`
CREATE TABLE IF NOT EXISTS candidate_experiences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidate_id INT NOT NULL,
  company VARCHAR(255) NULL,
  role VARCHAR(255) NULL,
  duration_months INT NULL,
  description TEXT NULL,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

-- 9. Table structure for table `vendors`
CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  overall_score FLOAT DEFAULT 100.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Table structure for table `vendor_specializations`
CREATE TABLE IF NOT EXISTS vendor_specializations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  specialization VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_vendor_spec (vendor_id, specialization),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- 11. Table structure for table `vendor_outreach`
CREATE TABLE IF NOT EXISTS vendor_outreach (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  vendor_id INT NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- 12. Table structure for table `vendor_submissions`
CREATE TABLE IF NOT EXISTS vendor_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  resume_id INT NOT NULL,
  job_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- 13. Table structure for table `job_candidate_matches`
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
);

-- 14. Table structure for table `pending_verifications`
CREATE TABLE IF NOT EXISTS pending_verifications (
  email VARCHAR(255) PRIMARY KEY,
  token VARCHAR(512) NOT NULL,
  status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Table structure for table `login_otps`
CREATE TABLE IF NOT EXISTS login_otps (
  email VARCHAR(255) PRIMARY KEY,
  otp VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
