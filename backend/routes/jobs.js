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
const { calculateStage1Matches, calculateStage2Match } = require('../services/matchingService');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const router = express.Router();

// Multer disk storage setup
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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper: Parse document file to string
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

/**
 * Endpoint: POST /api/jobs
 * Creates and parses a new job description.
 * Supports file upload (pdf/docx) OR raw text body.
 */
router.post('/', authenticateToken, upload.single('jdFile'), async (req, res) => {
  try {
    let jdText = req.body.rawText || '';
    let jdTitle = req.body.title || '';

    // If file uploaded, extract text from it
    if (req.file) {
      jdText = await parseFile(req.file.path, req.file.mimetype);
    }

    if (!jdText.trim()) {
      return res.status(400).json({ error: 'No job description text or file provided' });
    }

    // Call Groq to extract details
    const systemPrompt = `You are a technical recruiter. Parse the provided job description and extract:
    1. title: The job title (string). Use '${jdTitle}' as default if not found.
    2. positions_needed: Number of positions available (integer, default 1).
    3. budget: Maximum annual salary budget in INR (numeric/null, e.g. 1200000).
    4. experience_years: Minimum years of experience required (integer/null).
    5. skills_required: Array of required/essential skills (strings).
    6. skills_preferred: Array of preferred/nice-to-have skills (strings).
    Output ONLY valid JSON representing this object.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an AI parsing API. Return only valid JSON.' },
        { role: 'user', content: systemPrompt + '\n\nJob Description:\n' + jdText }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const parsedData = JSON.parse(chatCompletion.choices[0].message.content);
    
    const title = parsedData.title || jdTitle || 'Unnamed Job Opening';
    const positions_needed = parsedData.positions_needed || 1;
    const budget = parsedData.budget || null;
    const experience_years = parsedData.experience_years || null;
    const skills_required = parsedData.skills_required || [];
    const skills_preferred = parsedData.skills_preferred || [];

    const client_id = req.body.clientId || null;

    // Save to jobs table
    const [result] = await pool.query(
      `INSERT INTO jobs (client_id, title, positions_needed, positions_filled, budget, experience_years, status, raw_text) 
       VALUES (?, ?, ?, 0, ?, ?, 'OPEN', ?)`,
      [client_id, title, positions_needed, budget, experience_years, jdText]
    );
    const jobId = result.insertId;

    // Save required skills
    for (const skill of skills_required) {
      await pool.query(
        'INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, TRUE)',
        [jobId, skill]
      );
    }

    // Save preferred skills
    for (const skill of skills_preferred) {
      await pool.query(
        'INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, FALSE)',
        [jobId, skill]
      );
    }

    res.status(201).json({
      message: 'Job Description parsed and created successfully',
      jobId,
      job: { id: jobId, title, positions_needed, budget, experience_years, skills_required, skills_preferred }
    });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to parse and create job description' });
  }
});

/**
 * Endpoint: GET /api/jobs
 * Lists all jobs, including the count of matched candidates.
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT j.*, c.company_name AS client_name 
      FROM jobs j 
      LEFT JOIN clients c ON j.client_id = c.id 
      ORDER BY j.created_at DESC
    `);
    
    // Add matched candidate count for each job
    const jobsWithCount = [];
    for (const job of rows) {
      try {
        const matches = await calculateStage1Matches(job.id);
        jobsWithCount.push({
          ...job,
          matched_count: matches.length
        });
      } catch (err) {
        console.error(`Error calculating match count for job ${job.id}:`, err);
        jobsWithCount.push({
          ...job,
          matched_count: 0
        });
      }
    }
    
    res.status(200).json(jobsWithCount);
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * Endpoint: GET /api/jobs/:id
 * Fetches single job detail, including requirements, matching candidates, and scores.
 * Auto-triggers LLM evaluation (Stage 2) for candidates that haven't been scored yet.
 */
router.get('/:id', authenticateToken, async (req, res) => {
  const jobId = req.params.id;
  try {
    // 1. Fetch Job
    const [jobRows] = await pool.query(`
      SELECT j.*, c.company_name AS client_name 
      FROM jobs j 
      LEFT JOIN clients c ON j.client_id = c.id 
      WHERE j.id = ?
    `, [jobId]);
    if (jobRows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    // 2. Fetch Job Skills
    const [skillsRows] = await pool.query('SELECT * FROM job_skills WHERE job_id = ?', [jobId]);
    job.skills_required = skillsRows.filter(s => s.is_required).map(s => s.skill);
    job.skills_preferred = skillsRows.filter(s => !s.is_required).map(s => s.skill);

    // 3. Stage 1: Calculate local semantic matches
    const stage1Matches = await calculateStage1Matches(jobId);

    // Fetch existing database scores (cached LLM evaluations)
    const [matchRows] = await pool.query(`
      SELECT m.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone, c.expected_salary, r.file_name, r.file_path, r.extracted_text
      FROM job_candidate_matches m
      JOIN candidates c ON m.candidate_id = c.id
      JOIN resumes r ON c.resume_id = r.id
      WHERE m.job_id = ?
    `, [jobId]);

    const dbMatchesMap = new Map(matchRows.map(m => [m.candidate_id, m]));

    // 4. Auto-trigger Stage 2 (LLM) for unscored candidates (cap at 25 for rate limits) in parallel
    const AUTO_EVAL_CAP = 25;
    const unscoredMatches = stage1Matches.filter(s1m => {
      const dbMatch = dbMatchesMap.get(s1m.candidateId);
      return !dbMatch || dbMatch.llm_score === null;
    }).slice(0, AUTO_EVAL_CAP);

    if (unscoredMatches.length > 0) {
      await Promise.all(unscoredMatches.map(async (s1m) => {
        try {
          const llmResult = await calculateStage2Match(
            jobId, s1m.candidateId, s1m.semantic_score, s1m.breakdown
          );
          const dbMatch = dbMatchesMap.get(s1m.candidateId);
          // Update the map with fresh results
          dbMatchesMap.set(s1m.candidateId, {
            llm_score: llmResult.llm_score,
            match_breakdown: JSON.stringify(llmResult.breakdown),
            rationale: llmResult.rationale,
            status: dbMatch ? dbMatch.status : 'SUGGESTED',
            file_name: s1m.fileName,
            file_path: s1m.filePath,
            extracted_text: s1m.extractedText
          });
        } catch (evalErr) {
          console.error(`Auto-eval failed for candidate ${s1m.candidateId}:`, evalErr.message);
        }
      }));
    }
    const autoEvaluated = unscoredMatches.length;

    // 5. Build final merged response
    const matches = stage1Matches.map(s1m => {
      const dbMatch = dbMatchesMap.get(s1m.candidateId);
      return {
        candidateId: s1m.candidateId,
        candidateName: s1m.candidateName,
        email: s1m.email,
        expectedSalary: s1m.expectedSalary,
        totalExperienceYears: s1m.totalExperienceYears,
        skills: s1m.skills,
        semanticScore: s1m.semantic_score,
        llmScore: dbMatch ? dbMatch.llm_score : null,
        matchBreakdown: dbMatch ? dbMatch.match_breakdown : s1m.breakdown,
        rationale: dbMatch ? dbMatch.rationale : 'Score calculated locally.',
        status: dbMatch ? dbMatch.status : 'SUGGESTED',
        fileName: dbMatch ? dbMatch.file_name : s1m.fileName,
        filePath: dbMatch ? dbMatch.file_path : s1m.filePath,
        extractedText: dbMatch ? dbMatch.extracted_text : s1m.extractedText
      };
    });

    // Sort by best available score (LLM > Semantic)
    matches.sort((a, b) => {
      const scoreA = a.llmScore !== null ? a.llmScore : a.semanticScore;
      const scoreB = b.llmScore !== null ? b.llmScore : b.semanticScore;
      return scoreB - scoreA;
    });

    res.status(200).json({ job, matches, autoEvaluated });
  } catch (error) {
    console.error('Error fetching job details:', error);
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

/**
 * Endpoint: POST /api/jobs/:id/manual-candidate
 * Allows recruiter to manually upload a resume file and link it to the Job.
 */
router.post('/:id/manual-candidate', authenticateToken, upload.single('resume'), async (req, res) => {
  const jobId = req.params.id;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { filename, path: filePath, mimetype, originalname } = req.file;
  const userId = req.user.userId;

  try {
    // 1. Extract text from file
    let extractedText = await parseFile(filePath, mimetype);

    // 2. Parse candidate metadata with Groq
    const systemPrompt = `You are a technical recruiter. Parse the provided resume text and extract the candidate profile:
    1. name: The candidate's name (string).
    2. email: Candidate's email address (string).
    3. phone: Phone number (string).
    4. expected_salary: Desired salary in INR (numeric/null).
    5. current_location: Current city/country (string).
    6. total_experience_years: The total number of years of professional work experience the candidate has across all roles (numeric, e.g. 5.5).
    7. skills: Array of candidate's key skills (strings).
    8. experiences: Array of objects, each with:
       - company: Company name (string)
       - role: Job title (string)
       - duration_months: Months worked (integer)
       - description: Key accomplishments (string)
    Output ONLY valid JSON representing this object.
    
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

    // 3. Insert file into resumes table
    const parsedMeta = { fileSize: req.file.size, parsedEngine: mimetype.includes('pdf') ? 'pdf-parse' : 'mammoth' };
    const [resumeResult] = await pool.query(
      'INSERT INTO resumes (uploaded_by, file_name, file_type, file_path, extracted_text, parsed_metadata) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, originalname, mimetype, `uploads/${filename}`, extractedText, JSON.stringify(parsedMeta)]
    );
    const resumeId = resumeResult.insertId;

    // 4. Save Candidate Details
    const name = parsedData.name || originalname.split('.')[0];
    const email = parsedData.email || `candidate_${resumeId}@test.com`;
    const phone = parsedData.phone || '';
    const expectedSalary = parsedData.expected_salary || null;
    const currentLocation = parsedData.current_location || '';

    const totalExpYears = parseFloat(parsedData.total_experience_years) || 0.00;

    const [candResult] = await pool.query(
      `INSERT INTO candidates (resume_id, name, email, phone, expected_salary, current_location, total_experience_years) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [resumeId, name, email, phone, expectedSalary, currentLocation, totalExpYears]
    );
    const candidateId = candResult.insertId;

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

    // 5. Instantly score match against this specific job
    const [jobRows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    const job = jobRows[0];
    const [jobSkills] = await pool.query('SELECT * FROM job_skills WHERE job_id = ?', [jobId]);
    
    // Compute local score
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

    // Trigger LLM Match Scorecard
    const llmScorecard = await calculateStage2Match(jobId, candidateId, stage1Score, breakdown);

    res.status(201).json({
      message: 'Candidate uploaded and matched successfully',
      candidateId,
      match: llmScorecard
    });
  } catch (error) {
    console.error('Error manually uploading candidate:', error);
    res.status(500).json({ error: 'Failed to process candidate upload' });
  }
});

// GET /api/jobs/:id/vendors
router.get('/:id/vendors', authenticateToken, async (req, res) => {
  const jobId = req.params.id;
  try {
    // 1. Fetch Job required and preferred skills
    const [skillsRows] = await pool.query('SELECT skill, is_required FROM job_skills WHERE job_id = ?', [jobId]);
    const reqSkills = skillsRows.filter(s => s.is_required).map(s => s.skill.toLowerCase().trim());
    const prefSkills = skillsRows.filter(s => !s.is_required).map(s => s.skill.toLowerCase().trim());

    // 2. Fetch all vendors
    const [vendors] = await pool.query('SELECT * FROM vendors');

    const scoredVendors = [];

    for (const vendor of vendors) {
      // Fetch vendor specializations
      const [specRows] = await pool.query('SELECT specialization FROM vendor_specializations WHERE vendor_id = ?', [vendor.id]);
      const specs = specRows.map(s => s.specialization.toLowerCase().trim());
      vendor.specializations = specRows.map(s => s.specialization);

      // Fetch dynamic outreach/submission metrics
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

      // 3. Compute skill matching score against the Job Description
      let skillScore = 100;
      let reqMatchCount = 0;
      let prefMatchCount = 0;

      // Check overlaps
      if (reqSkills.length > 0) {
        reqSkills.forEach(reqSkill => {
          // Exact or substring match with any vendor specialization
          const isMatched = specs.some(spec => spec.includes(reqSkill) || reqSkill.includes(spec));
          if (isMatched) reqMatchCount++;
        });
        const reqWeightScore = (reqMatchCount / reqSkills.length) * 100;
        
        if (prefSkills.length > 0) {
          prefSkills.forEach(prefSkill => {
            const isMatched = specs.some(spec => spec.includes(prefSkill) || prefSkill.includes(spec));
            if (isMatched) prefMatchCount++;
          });
          const prefWeightScore = (prefMatchCount / prefSkills.length) * 100;
          skillScore = (reqWeightScore * 0.7) + (prefWeightScore * 0.3);
        } else {
          skillScore = reqWeightScore;
        }
      } else if (prefSkills.length > 0) {
        prefSkills.forEach(prefSkill => {
          const isMatched = specs.some(spec => spec.includes(prefSkill) || prefSkill.includes(spec));
          if (isMatched) prefMatchCount++;
        });
        skillScore = (prefMatchCount / prefSkills.length) * 100;
      }

      // Compute final job-specific match score
      // Balance skill fit (70%) with historic performance rating (30%)
      const finalScore = Math.round((skillScore * 0.7) + (vendor.overall_score * 0.3));

      scoredVendors.push({
        ...vendor,
        skill_score: Math.round(skillScore),
        overall_score: finalScore, // Override for job-specific rank
        historical_score: Math.round(vendor.overall_score)
      });
    }

    // Sort by overall job-specific score descending
    scoredVendors.sort((a, b) => b.overall_score - a.overall_score);

    res.status(200).json(scoredVendors);
  } catch (error) {
    console.error('Error fetching scored vendors:', error);
    res.status(500).json({ error: 'Failed to fetch scored vendors' });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  const jobId = req.params.id;
  try {
    // Delete record from database (will cascade delete linked job_skills, job_candidate_matches)
    const [result] = await pool.query('DELETE FROM jobs WHERE id = ?', [jobId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Job description not found' });
    }
    res.status(200).json({ message: 'Job description deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job description' });
  }
});

module.exports = router;
