const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const Groq = require('groq-sdk');
const Tesseract = require('tesseract.js');
const { cleanText } = require('../services/parserHelper');
const { sendJobOutreach } = require('../services/emailService');
const { calculateStage1Matches, calculateStage2Match } = require('../services/matchingService');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const router = express.Router();

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper: Parse documents
async function parseFile(filePath, mimetype) {
  if (mimetype === 'application/pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } else if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
    return text;
  }
  return fs.readFileSync(filePath, 'utf8');
}

// Recalculates metrics for a vendor
async function updateVendorMetrics(vendorId) {
  try {
    // 1. Calculate Response Rate
    const [outreachRows] = await pool.query('SELECT COUNT(*) as total FROM vendor_outreach WHERE vendor_id = ?', [vendorId]);
    const totalOutreach = outreachRows[0].total;

    let responseRate = 100.0;
    if (totalOutreach > 0) {
      // Count unique jobs the vendor has submitted candidates for, matching outreach logs
      const [responseRows] = await pool.query(`
        SELECT COUNT(DISTINCT job_id) as responded 
        FROM vendor_submissions 
        WHERE vendor_id = ? AND job_id IN (SELECT job_id FROM vendor_outreach WHERE vendor_id = ?)
      `, [vendorId, vendorId]);
      responseRate = (responseRows[0].responded / totalOutreach) * 100;
    }

    // 2. Calculate Average Match Score
    const [scoreRows] = await pool.query(`
      SELECT AVG(m.llm_score) as avg_score 
      FROM job_candidate_matches m
      JOIN candidates c ON m.candidate_id = c.id
      JOIN resumes r ON c.resume_id = COALESCE(r.duplicate_of, r.id)
      JOIN vendor_submissions vs ON vs.resume_id = r.id
      WHERE vs.vendor_id = ?
    `, [vendorId]);
    const avgMatchScore = scoreRows[0].avg_score || 0.0;

    // 3. Calculate Speed Score
    // Find the average duration (hours) between outreach request and vendor submission for each job
    const [speedRows] = await pool.query(`
      SELECT AVG(TIMESTAMPDIFF(HOUR, o.sent_at, s.created_at)) as avg_hours
      FROM vendor_submissions s
      JOIN vendor_outreach o ON s.vendor_id = o.vendor_id AND s.job_id = o.job_id
      WHERE s.vendor_id = ?
    `, [vendorId]);
    const avgHours = speedRows[0].avg_hours || 0.0;
    const speedScore = Math.max(0, 100 - (avgHours * 2)); // 50 hours response = 0 score

    // 4. Calculate Conversion Rate
    const [convRows] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN m.status = 'HIRED' THEN 1 END) as hires,
        COUNT(m.id) as total
      FROM job_candidate_matches m
      JOIN candidates c ON m.candidate_id = c.id
      JOIN resumes r ON c.resume_id = COALESCE(r.duplicate_of, r.id)
      JOIN vendor_submissions vs ON vs.resume_id = r.id
      WHERE vs.vendor_id = ?
    `, [vendorId]);
    
    let conversionRate = 0.0;
    if (convRows[0].total > 0) {
      conversionRate = (convRows[0].hires / convRows[0].total) * 100;
    }

    // 5. Compute Overall Score
    // Formula: S = 0.5*ResponseRate (received/sent ratio) + 0.5*ConversionRate (accepted rate)
    let overallScore = 100.0;
    const [subCountRows] = await pool.query('SELECT COUNT(*) as count FROM vendor_submissions WHERE vendor_id = ?', [vendorId]);
    
    if (subCountRows[0].count > 0 || totalOutreach > 0) {
      overallScore = (Math.min(100, responseRate) * 0.5) + (conversionRate * 0.5);
    }

    // Update database
    await pool.query(
      'UPDATE vendors SET overall_score = ? WHERE id = ?',
      [overallScore, vendorId]
    );

    return { responseRate, avgMatchScore, conversionRate, avgHours, overallScore };
  } catch (error) {
    console.error(`Error updating metrics for vendor ${vendorId}:`, error);
  }
}

/**
 * Endpoint: GET /api/vendors
 * Lists all vendors along with specializations and calculated metrics.
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [vendors] = await pool.query('SELECT * FROM vendors');
    
    for (const vendor of vendors) {
      // Fetch specializations
      const [specRows] = await pool.query('SELECT specialization FROM vendor_specializations WHERE vendor_id = ?', [vendor.id]);
      vendor.specializations = specRows.map(s => s.specialization);

      // Re-fetch metrics details dynamically
      const [outreachRows] = await pool.query('SELECT COUNT(*) as total FROM vendor_outreach WHERE vendor_id = ?', [vendor.id]);
      const [subRows] = await pool.query('SELECT COUNT(*) as total FROM vendor_submissions WHERE vendor_id = ?', [vendor.id]);
      const [hireRows] = await pool.query(`
        SELECT COUNT(*) as total 
        FROM job_candidate_matches m
        JOIN candidates c ON m.candidate_id = c.id
        JOIN resumes r ON c.resume_id = COALESCE(r.duplicate_of, r.id)
        JOIN vendor_submissions vs ON vs.resume_id = r.id
        WHERE vs.vendor_id = ? AND m.status = 'HIRED'
      `, [vendor.id]);

      vendor.total_outreach = outreachRows[0].total;
      vendor.total_submissions = subRows[0].total;
      vendor.total_hires = hireRows[0].total;

      // Base overall_score on sent, received (responseRate), and accepted rate (conversionRate)
      const responseRate = vendor.total_outreach > 0 ? (vendor.total_submissions / vendor.total_outreach) * 100 : 0;
      const conversionRate = vendor.total_submissions > 0 ? (vendor.total_hires / vendor.total_submissions) * 100 : 0;
      vendor.overall_score = Math.round((Math.min(100, responseRate) * 0.5) + (Math.min(100, conversionRate) * 0.5));
    }

    // Sort vendors by the newly computed overall score descending
    vendors.sort((a, b) => b.overall_score - a.overall_score);

    res.status(200).json(vendors);
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

/**
 * Endpoint: POST /api/vendors
 * Creates a new vendor.
 */
router.post('/', authenticateToken, async (req, res) => {
  const { name, email, specializations } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and Email are required' });
  }

  try {
    // Insert vendor
    const [result] = await pool.query(
      'INSERT INTO vendors (name, email, overall_score) VALUES (?, ?, 100.0)',
      [name, email]
    );
    const vendorId = result.insertId;

    // Insert specializations
    if (specializations && Array.isArray(specializations)) {
      for (const spec of specializations) {
        if (spec.trim()) {
          await pool.query(
            'INSERT IGNORE INTO vendor_specializations (vendor_id, specialization) VALUES (?, ?)',
            [vendorId, spec.trim()]
          );
        }
      }
    }

    res.status(201).json({ message: 'Vendor created successfully', vendorId });
  } catch (error) {
    console.error('Error creating vendor:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Vendor email already exists' });
    }
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

/**
 * Endpoint: POST /api/vendors/outreach
 * Logs vendor outreach and sends email.
 */
router.post('/outreach', authenticateToken, async (req, res) => {
  const { jobId, vendorIds } = req.body;
  if (!jobId || !vendorIds || !Array.isArray(vendorIds)) {
    return res.status(400).json({ error: 'jobId and vendorIds array are required' });
  }

  try {
    // Fetch Job Details
    const [jobRows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (jobRows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    const [jobSkills] = await pool.query('SELECT skill, is_required FROM job_skills WHERE job_id = ?', [jobId]);
    const requiredSkills = jobSkills.filter(s => s.is_required).map(s => s.skill);
    const preferredSkills = jobSkills.filter(s => !s.is_required).map(s => s.skill);

    const results = [];

    for (const vendorId of vendorIds) {
      // Fetch vendor info
      const [vendorRows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [vendorId]);
      if (vendorRows.length > 0) {
        const vendor = vendorRows[0];

        // Insert into outreach log
        await pool.query('INSERT INTO vendor_outreach (job_id, vendor_id) VALUES (?, ?)', [jobId, vendorId]);

        // Send Email (SMTP / File log)
        const emailLog = await sendJobOutreach(vendor, job, requiredSkills, preferredSkills);

        // Update vendor rating
        await updateVendorMetrics(vendorId);

        results.push({ vendorId, name: vendor.name, outreachEmail: emailLog });
      }
    }

    res.status(200).json({ message: 'Outreach completed successfully', results });
  } catch (error) {
    console.error('Error sending vendor outreach:', error);
    res.status(500).json({ error: 'Failed to execute vendor outreach' });
  }
});

/**
 * Endpoint: POST /api/vendors/submit-resume (PUBLIC ROUTE)
 * Ingestion point for vendor resume uploads.
 */
router.post('/submit-resume', upload.single('resume'), async (req, res) => {
  const { jobId, vendorId, name: manualName, email: manualEmail, phone: manualPhone, expectedSalary: manualSalary } = req.body;

  if (!jobId || !vendorId) {
    return res.status(400).json({ error: 'jobId and vendorId are required' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No resume file attached' });
  }

  const { filename, path: filePath, mimetype, originalname } = req.file;

  try {
    // 1. Verify Job and Vendor exist
    const [jobRows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (jobRows.length === 0) return res.status(404).json({ error: 'Job description not found' });
    const job = jobRows[0];

    const [vendorRows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [vendorId]);
    if (vendorRows.length === 0) return res.status(404).json({ error: 'Vendor profile not found' });
    const vendor = vendorRows[0];

    // 2. Extract text from file
    let extractedText = await parseFile(filePath, mimetype);

    // 3. Parse candidate metadata with Groq
    const systemPrompt = `You are a technical recruiter. Parse the provided resume text and extract candidate profile details.
    1. name: The candidate's name (string). Use '${manualName || ''}' as fallback.
    2. email: Candidate's email address (string). Use '${manualEmail || ''}' as fallback.
    3. phone: Phone number (string). Use '${manualPhone || ''}' as fallback.
    4. expected_salary: Expected salary in INR (numeric/null). Use ${manualSalary || null} as fallback.
    5. current_location: Current location (string).
    6. total_experience_years: The total number of years of professional work experience the candidate has across all roles (numeric, e.g. 5.5).
    7. skills: Array of candidate's key skills (strings).
    8. experiences: Array of objects, each containing:
       - company: Company name (string)
       - role: Job title (string)
       - duration_months: Duration worked in months (integer)
       - description: Key accomplishments (string)
    Output ONLY valid JSON.
    
    UN-SCRAMBLE INSTRUCTIONS: The resume text is extracted from a PDF which may have a two-column layout. When columns are extracted, text lines across the columns often interlace (e.g. contact details or skills from the left sidebar appear in the middle of work experience bullet points). You MUST mentally un-scramble the columns, separate the sidebar data (contact info, skills, education) from the main experience timeline, and associate work accomplishments with their correct employer/job role.
    
    CRITICAL DATE & DURATION CALCULATIONS (Today is June 26, 2026):
    - Extract ALL experiences. Do not skip any role or project.
    - If a role lists dates, calculate the exact duration in months. If the end date is "Present" or "Current", calculate the duration up to June 2026.
    - If the resume states a total years of experience in their profile/summary (e.g. "5+ years of SAP FICO experience"), but individual projects or roles do not have explicit dates, distribute this total duration (e.g. 5 years = 60 months) across the projects/roles, or attribute it to the main current/most recent employer, so that the candidate's total experience in the database matches their actual experience level. Do NOT default duration_months to 0 if total experience is specified!`;

    const cleanedText = cleanText(extractedText).substring(0, 30000);

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an AI parsing API. Return only valid JSON.' },
        { role: 'user', content: systemPrompt + '\n\nResume Extract:\n' + cleanedText }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const parsedData = JSON.parse(chatCompletion.choices[0].message.content);

    // 4. Save to resumes table (mark uploaded_by = 1 as system user/placeholder for vendor uploads)
    // Find a valid admin/system user first
    const [userRows] = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    const systemUserId = userRows.length > 0 ? userRows[0].id : 1;

    const parsedMeta = { fileSize: req.file.size, parsedEngine: mimetype.includes('pdf') ? 'pdf-parse' : 'mammoth' };
    const [resumeResult] = await pool.query(
      'INSERT INTO resumes (uploaded_by, file_name, file_type, file_path, extracted_text, parsed_metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [systemUserId, originalname, mimetype, `uploads/${filename}`, extractedText, JSON.stringify(parsedMeta)]
    );
    const resumeId = resumeResult.insertId;

    // 5. Save candidate
    const name = parsedData.name || manualName || originalname.split('.')[0];
    const email = parsedData.email || manualEmail || `vendor_cand_${resumeId}@test.com`;
    const phone = parsedData.phone || manualPhone || '';
    const expectedSalary = parsedData.expected_salary || manualSalary || null;
    const currentLocation = parsedData.current_location || '';

    const totalExpYears = parseFloat(parsedData.total_experience_years) || 0.00;

    // Handle duplicates: check if candidate already exists in database
    let candidateId = null;
    const [existingCand] = await pool.query('SELECT id FROM candidates WHERE email = ?', [email]);
    if (existingCand.length > 0) {
      candidateId = existingCand[0].id;
      // Update candidate file link to newest upload
      await pool.query('UPDATE candidates SET resume_id = ?, expected_salary = ?, total_experience_years = ? WHERE id = ?', [resumeId, expectedSalary, totalExpYears, candidateId]);
    } else {
      const [candResult] = await pool.query(
        `INSERT INTO candidates (resume_id, name, email, phone, expected_salary, current_location, total_experience_years) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [resumeId, name, email, phone, expectedSalary, currentLocation, totalExpYears]
      );
      candidateId = candResult.insertId;
    }

    // Save skills
    const skills = parsedData.skills || [];
    for (const skill of skills) {
      await pool.query(
        'INSERT IGNORE INTO candidate_skills (candidate_id, skill) VALUES (?, ?)',
        [candidateId, skill]
      );
    }

    // Save experiences
    const experiences = parsedData.experiences || [];
    for (const exp of experiences) {
      await pool.query(
        `INSERT INTO candidate_experiences (candidate_id, company, role, duration_months, description)
         VALUES (?, ?, ?, ?, ?)`,
        [candidateId, exp.company || '', exp.role || '', exp.duration_months || 0, exp.description || '']
      );
    }

    // 6. Log Vendor Submission
    await pool.query(
      'INSERT INTO vendor_submissions (vendor_id, resume_id, job_id) VALUES (?, ?, ?)',
      [vendorId, resumeId, jobId]
    );

    // 7. Instantly score against the Job Description
    const [jobSkills] = await pool.query('SELECT * FROM job_skills WHERE job_id = ?', [jobId]);
    const reqSkills = jobSkills.filter(s => s.is_required).map(s => s.skill.toLowerCase());
    const prefSkills = jobSkills.filter(s => !s.is_required).map(s => s.skill.toLowerCase());
    const candSkillsLower = skills.map(s => s.toLowerCase());

    let reqScore = 100;
    if (reqSkills.length > 0) {
      reqScore = (reqSkills.filter(s => candSkillsLower.includes(s)).length / reqSkills.length) * 100;
    }
    let prefScore = 100;
    if (prefSkills.length > 0) {
      prefScore = (prefSkills.filter(s => candSkillsLower.includes(s)).length / prefSkills.length) * 100;
    }

    const skillScore = (reqScore * 0.7) + (prefScore * 0.3);
    let budgetScore = 100;
    if (job.budget && expectedSalary) {
      const jdBudget = parseFloat(job.budget);
      const candExpect = parseFloat(expectedSalary);
      if (candExpect > jdBudget) {
        budgetScore = Math.max(0, 100 - (((candExpect - jdBudget) / jdBudget) * 200));
      }
    }

    const totalYears = parseFloat(parsedData.total_experience_years) || 0.00;
    let experienceScore = 100;
    if (job.experience_years && job.experience_years > 0) {
      experienceScore = Math.min(100, Math.round((totalYears / job.experience_years) * 100));
    }

    const stage1Score = Math.round((skillScore * 0.6) + (experienceScore * 0.2) + (budgetScore * 0.2));
    const breakdown = { skillFit: Math.round(skillScore), experienceFit: experienceScore, budgetFit: Math.round(budgetScore) };

    // Run Stage 2 LLM Scorecard
    await calculateStage2Match(jobId, candidateId, stage1Score, breakdown);

    // 8. Recompute vendor performance metrics
    await updateVendorMetrics(vendorId);

    res.status(201).json({
      message: 'Candidate resume submitted successfully',
      candidateId,
      candidate: { name, email }
    });
  } catch (error) {
    console.error('Error in vendor submit-resume:', error);
    res.status(500).json({ error: 'Failed to process vendor candidate submission' });
  }
});

// DELETE /api/vendors/:id - Remove a vendor
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM vendors WHERE id = ?', [id]);
    res.status(200).json({ message: 'Vendor removed successfully' });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

module.exports = router;
