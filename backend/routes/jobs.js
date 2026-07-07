const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const Tesseract = require('tesseract.js');
const { cleanText } = require('../services/parserHelper');
const { calculateStage1Matches, calculateStage2Match } = require('../services/matchingService');
const { normalizeBreakdown, isValidBreakdown } = require('../services/breakdownNormalizer');
const { logEvaluation, logBatchSummary } = require('../services/evaluationLogger');
const aiService = require('../services/aiService');
const knowledgeService = require('../services/knowledgeService');
const pseudoJdService = require('../services/pseudoJdService');
const chatService = require('../services/chatService');
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

    // Call Multi-LLM API to extract details
    const parsedData = await aiService.parseJobDescriptionMultiLLM(jdText);
    if (!parsedData) {
      throw new Error("AI returned null during JD parsing");
    }
    
    const title = (parsedData.positions && parsedData.positions.length > 0 && parsedData.positions[0] !== 'Not Found') ? parsedData.positions[0] : (jdTitle || 'Unnamed Job Opening');
    const positions_needed = 1; // Not explicitly requested in the prompt, default to 1
    const budget = (parsedData.budget && parsedData.budget !== 'Not Found') ? parsedData.budget : null;
    const experience_years = (parsedData.experience_required && parsedData.experience_required.minimum && parsedData.experience_required.minimum !== 'Not Found') ? parseInt(parsedData.experience_required.minimum) : null;
    
    let skills_required = [];
    if (parsedData.required_skills) {
      skills_required = [
        ...(Array.isArray(parsedData.required_skills.critical) ? parsedData.required_skills.critical : []),
        ...(Array.isArray(parsedData.required_skills.important) ? parsedData.required_skills.important : []),
        ...(Array.isArray(parsedData.sap_modules) ? parsedData.sap_modules : [])
      ];
    } else {
      const crit = Array.isArray(parsedData.critical_requirements) ? parsedData.critical_requirements.map(c => typeof c === 'object' && c ? (c.value || c.skill || '') : c) : [];
      const imp = Array.isArray(parsedData.important_requirements) ? parsedData.important_requirements.map(i => typeof i === 'object' && i ? (i.value || i.responsibility || '') : i) : [];
      const modules = Array.isArray(parsedData.sap_modules) ? parsedData.sap_modules : [];
      skills_required = [...crit, ...imp, ...modules];
    }
    skills_required = skills_required.filter(s => s && s !== 'Not Found');
    
    let skills_preferred = [];
    if (parsedData.required_skills && Array.isArray(parsedData.required_skills.good_to_have)) {
      skills_preferred = parsedData.required_skills.good_to_have;
    } else if (Array.isArray(parsedData.preferred_requirements)) {
      skills_preferred = parsedData.preferred_requirements.map(p => typeof p === 'object' && p ? (p.value || p.tool || '') : p);
    }
    skills_preferred = skills_preferred.filter(s => s && s !== 'Not Found');

    const client_id = req.body.clientId || null;

    const knowledgeSet = knowledgeService.generateKnowledgeSet(parsedData);

    // Save to jobs table
    const [result] = await pool.query(
      `INSERT INTO jobs (client_id, title, positions_needed, positions_filled, budget, experience_years, status, raw_text, parsed_summary, knowledge_set) 
       VALUES (?, ?, ?, 0, ?, ?, 'OPEN', ?, ?, ?)`,
      [client_id, title, positions_needed, budget, experience_years, jdText, JSON.stringify(parsedData), JSON.stringify(knowledgeSet)]
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

    // 4. Auto-trigger Stage 2 (LLM) for unscored candidates (delegated to evaluationQueue)
    const unscoredMatches = stage1Matches.filter(s1m => {
      const dbMatch = dbMatchesMap.get(s1m.candidateId);
      return !dbMatch || dbMatch.llm_score === null;
    });

    if (unscoredMatches.length > 0) {
      const evaluationQueue = require('../services/evaluationQueue');
      evaluationQueue.addJob(jobId, unscoredMatches);
    }
    const autoEvaluated = unscoredMatches.filter(c => c.semantic_score > 50).length;

    // 5. Build final merged response — normalize every breakdown + write-back legacy data
    const matches = await Promise.all(stage1Matches.map(async (s1m) => {
      const dbMatch = dbMatchesMap.get(s1m.candidateId);

      // Get raw breakdown from DB or Stage 1
      let rawBreakdown = dbMatch ? dbMatch.match_breakdown : s1m.breakdown;

      // Parse JSON string if needed
      if (typeof rawBreakdown === 'string') {
        try { rawBreakdown = JSON.parse(rawBreakdown); } catch (e) { rawBreakdown = null; }
      }

      // Check if legacy/invalid — if so, normalize and write back
      const wasInvalid = !isValidBreakdown(rawBreakdown);
      const normalizedBreakdown = normalizeBreakdown(rawBreakdown);

      // Write-back migration: update legacy records transparently
      if (wasInvalid && dbMatch && dbMatch.id) {
        try {
          await pool.query(
            'UPDATE job_candidate_matches SET match_breakdown = ? WHERE id = ?',
            [JSON.stringify(normalizedBreakdown), dbMatch.id]
          );
          logEvaluation({
            candidateId: s1m.candidateId, jobId: parseInt(jobId),
            stage: 'MIGRATION', success: true,
            detail: 'Legacy breakdown migrated to canonical schema'
          });
        } catch (migErr) {
          console.error(`Migration write-back failed for candidate ${s1m.candidateId}:`, migErr.message);
        }
      }

      return {
        candidateId: s1m.candidateId,
        candidateName: s1m.candidateName,
        email: s1m.email,
        expectedSalary: s1m.expectedSalary,
        totalExperienceYears: s1m.totalExperienceYears,
        skills: s1m.skills,
        semanticScore: s1m.semantic_score,
        llmScore: dbMatch ? dbMatch.llm_score : null,
        matchBreakdown: normalizedBreakdown,
        rationale: dbMatch ? dbMatch.rationale : 'Score calculated locally.',
        status: dbMatch ? dbMatch.status : 'SUGGESTED',
        evaluationStatus: dbMatch ? (dbMatch.evaluation_status || 'PENDING') : 'PENDING',
        retryCount: dbMatch ? (dbMatch.retry_count || 0) : 0,
        lastError: dbMatch ? (dbMatch.last_error || null) : null,
        fileName: dbMatch ? dbMatch.file_name : s1m.fileName,
        filePath: dbMatch ? dbMatch.file_path : s1m.filePath,
        extractedText: dbMatch ? dbMatch.extracted_text : s1m.extractedText
      };
    }));

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

// GET /api/jobs/:id/evaluation-progress
router.get('/:id/evaluation-progress', authenticateToken, (req, res) => {
  const evaluationQueue = require('../services/evaluationQueue');
  const progress = evaluationQueue.getProgress(req.params.id);
  res.status(200).json(progress);
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

    const userPrompt = 'Resume Extract:\n' + cleanedText;
    const rationalizeTask = 'Review the 4 model extractions, resolve any conflicting parsing (especially related to 2-column resume layouts), and output a single JSON object matching the requested schema exactly.';

    const consensusResult = await aiService.executeConsensus(systemPrompt, userPrompt, rationalizeTask);
    const parsedData = consensusResult.finalJson;
    if (!parsedData) throw new Error("AI returned null for manual candidate parsing");

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

      // Check if outreach was already sent for THIS specific job
      const [jobOutreachRows] = await pool.query(
        'SELECT COUNT(*) as total FROM vendor_outreach WHERE vendor_id = ? AND job_id = ?',
        [vendor.id, jobId]
      );

      vendor.total_outreach = outreachRows[0].total;
      vendor.total_submissions = subRows[0].total;
      vendor.total_hires = hireRows[0].total;
      vendor.outreach_sent_for_job = jobOutreachRows[0].total > 0;

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

/**
 * Endpoint: POST /api/jobs/chat
 * Handles conversational queries about the active page context or general QA.
 */
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { message, chatHistory, pageContext } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const chatResult = await chatService.getChatResponse(message, chatHistory, pageContext);
    if (chatResult && typeof chatResult === 'object') {
      res.status(200).json({
        response: chatResult.response,
        inferredJd: chatResult.inferredJd || null
      });
    } else {
      res.status(200).json({ response: chatResult, inferredJd: null });
    }
  } catch (error) {
    console.error('Error in chat route:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

/**
 * Endpoint: POST /api/jobs/generate-pseudo
 * Generates a Pseudo Job Description from minimal recruiter inputs.
 */
router.post('/generate-pseudo', authenticateToken, async (req, res) => {
  try {
    const { primarySkill, experience, secondarySkills, location, industry, clientName, employmentType, additionalNotes } = req.body;
    
    if (!primarySkill || !experience) {
      return res.status(400).json({ error: 'Primary Skill and Experience are required' });
    }

    const pseudoResult = await pseudoJdService.generatePseudoJd({
      primarySkill,
      experience,
      secondarySkills: Array.isArray(secondarySkills) ? secondarySkills : (secondarySkills ? [secondarySkills] : []),
      location,
      industry,
      clientName,
      employmentType,
      additionalNotes
    });

    const client_id = req.body.clientId || null;
    const knowledgeSet = knowledgeService.generateKnowledgeSet(pseudoResult.parsedSummary);

    // Save to jobs table with is_pseudo = TRUE
    const [result] = await pool.query(
      `INSERT INTO jobs (client_id, title, budget, experience_years, status, raw_text, parsed_summary, knowledge_set, is_pseudo, pseudo_jd_metadata) 
       VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, TRUE, ?)`,
      [
        client_id, 
        pseudoResult.jobTitle, 
        null, 
        parseInt(experience.toString().replace(/[^0-9]/g, '')) || null, 
        pseudoResult.rawJdText, 
        JSON.stringify(pseudoResult.parsedSummary), 
        JSON.stringify(knowledgeSet), 
        JSON.stringify(pseudoResult.metadata)
      ]
    );
    const jobId = result.insertId;

    // Save job skills
    const skills_required = pseudoResult.parsedSummary.critical_requirements.map(c => c.value);
    const skills_preferred = pseudoResult.parsedSummary.preferred_requirements.map(p => p.value);

    for (const skill of skills_required) {
      await pool.query('INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, TRUE)', [jobId, skill]);
    }
    for (const skill of skills_preferred) {
      await pool.query('INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, FALSE)', [jobId, skill]);
    }

    // Recompute candidate matching immediately
    const stage1Matches = await calculateStage1Matches(jobId);
    
    // Background run Stage 2 matches (delegated to evaluationQueue)
    if (stage1Matches.length > 0) {
      const evaluationQueue = require('../services/evaluationQueue');
      evaluationQueue.addJob(jobId, stage1Matches);
    }

    res.status(201).json({
      message: 'Pseudo Job Description generated successfully',
      jobId,
      job: { 
        id: jobId, 
        title: pseudoResult.jobTitle, 
        is_pseudo: true, 
        pseudo_jd_metadata: pseudoResult.metadata,
        raw_text: pseudoResult.rawJdText 
      }
    });
  } catch (error) {
    console.error('Error generating pseudo JD:', error);
    res.status(500).json({ error: 'Failed to generate pseudo job description' });
  }
});

/**
 * Endpoint: POST /api/jobs/:id/official
 * Uploads/replaces a Pseudo Job Description with the official JD document or raw text.
 * Preserves the previous version in the audit history table.
 */
router.post('/:id/official', authenticateToken, upload.single('jdFile'), async (req, res) => {
  const jobId = req.params.id;
  try {
    let jdText = req.body.rawText || '';
    if (req.file) {
      jdText = await parseFile(req.file.path, req.file.mimetype);
    }
    
    if (!jdText.trim()) {
      return res.status(400).json({ error: 'No job description text or file provided' });
    }

    // 1. Fetch current job
    const [jobs] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    if (jobs.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const currentJob = jobs[0];

    // 2. Fetch version history count to determine next version number
    const [historyCount] = await pool.query('SELECT COUNT(*) as count FROM job_version_history WHERE job_id = ?', [jobId]);
    const nextVersion = historyCount[0].count + 1;

    // 3. Save existing JD to version history
    await pool.query(
      `INSERT INTO job_version_history (job_id, version, jd_type, title, raw_text, parsed_summary, knowledge_set, pseudo_jd_metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jobId, 
        nextVersion, 
        currentJob.is_pseudo ? 'PSEUDO' : 'OFFICIAL', 
        currentJob.title, 
        currentJob.raw_text, 
        currentJob.parsed_summary ? (typeof currentJob.parsed_summary === 'string' ? currentJob.parsed_summary : JSON.stringify(currentJob.parsed_summary)) : null,
        currentJob.knowledge_set ? (typeof currentJob.knowledge_set === 'string' ? currentJob.knowledge_set : JSON.stringify(currentJob.knowledge_set)) : null,
        currentJob.pseudo_jd_metadata ? (typeof currentJob.pseudo_jd_metadata === 'string' ? currentJob.pseudo_jd_metadata : JSON.stringify(currentJob.pseudo_jd_metadata)) : null
      ]
    );

    // 4. Parse new official JD
    const parsedData = await aiService.parseJobDescriptionMultiLLM(jdText);
    if (!parsedData) {
      throw new Error("AI returned null during JD parsing");
    }

    const title = (parsedData.positions && parsedData.positions.length > 0 && parsedData.positions[0] !== 'Not Found') ? parsedData.positions[0] : (req.body.title || currentJob.title || 'Unnamed Job Opening');
    const budget = (parsedData.budget && parsedData.budget !== 'Not Found') ? parsedData.budget : null;
    const experience_years = (parsedData.experience_required && parsedData.experience_required.minimum && parsedData.experience_required.minimum !== 'Not Found') ? parseInt(parsedData.experience_required.minimum) : null;
    
    let skills_required = [];
    if (parsedData.required_skills) {
      skills_required = [
        ...(Array.isArray(parsedData.required_skills.critical) ? parsedData.required_skills.critical : []),
        ...(Array.isArray(parsedData.required_skills.important) ? parsedData.required_skills.important : []),
        ...(Array.isArray(parsedData.sap_modules) ? parsedData.sap_modules : [])
      ];
    } else {
      const crit = Array.isArray(parsedData.critical_requirements) ? parsedData.critical_requirements.map(c => typeof c === 'object' && c ? (c.value || c.skill || '') : c) : [];
      const imp = Array.isArray(parsedData.important_requirements) ? parsedData.important_requirements.map(i => typeof i === 'object' && i ? (i.value || i.responsibility || '') : i) : [];
      const modules = Array.isArray(parsedData.sap_modules) ? parsedData.sap_modules : [];
      skills_required = [...crit, ...imp, ...modules];
    }
    skills_required = skills_required.filter(s => s && s !== 'Not Found');
    
    let skills_preferred = [];
    if (parsedData.required_skills && Array.isArray(parsedData.required_skills.good_to_have)) {
      skills_preferred = parsedData.required_skills.good_to_have;
    } else if (Array.isArray(parsedData.preferred_requirements)) {
      skills_preferred = parsedData.preferred_requirements.map(p => typeof p === 'object' && p ? (p.value || p.tool || '') : p);
    }
    skills_preferred = skills_preferred.filter(s => s && s !== 'Not Found');

    const knowledgeSet = knowledgeService.generateKnowledgeSet(parsedData);

    // 5. Update jobs table
    await pool.query(
      `UPDATE jobs 
       SET title = ?, budget = ?, experience_years = ?, raw_text = ?, parsed_summary = ?, knowledge_set = ?, is_pseudo = FALSE, pseudo_jd_metadata = NULL 
       WHERE id = ?`,
      [title, budget, experience_years, jdText, JSON.stringify(parsedData), JSON.stringify(knowledgeSet), jobId]
    );

    // 6. Rebuild job_skills
    await pool.query('DELETE FROM job_skills WHERE job_id = ?', [jobId]);
    for (const skill of skills_required) {
      await pool.query('INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, TRUE)', [jobId, skill]);
    }
    for (const skill of skills_preferred) {
      await pool.query('INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, FALSE)', [jobId, skill]);
    }

    // 7. Clear old candidate matches
    await pool.query('DELETE FROM job_candidate_matches WHERE job_id = ?', [jobId]);

    // 8. Re-evaluate matching candidates
    const stage1Matches = await calculateStage1Matches(jobId);
    
    // Background run Stage 2 matches for candidates (delegated to evaluationQueue)
    if (stage1Matches.length > 0) {
      const evaluationQueue = require('../services/evaluationQueue');
      evaluationQueue.addJob(jobId, stage1Matches);
    }

    res.status(200).json({
      message: 'Official Job Description parsed and replaced successfully. Matches updated.',
      jobId,
      job: { id: jobId, title, budget, experience_years, skills_required, skills_preferred }
    });
  } catch (error) {
    console.error('Error replacing with official JD:', error);
    res.status(500).json({ error: 'Failed to upload and parse official Job Description' });
  }
});

/**
 * Endpoint: GET /api/jobs/:id/versions
 * Fetches the audit version history logs of JDs for a job.
 */
router.get('/:id/versions', authenticateToken, async (req, res) => {
  const jobId = req.params.id;
  try {
    const [rows] = await pool.query('SELECT * FROM job_version_history WHERE job_id = ? ORDER BY version DESC', [jobId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching job versions:', error);
    res.status(500).json({ error: 'Failed to fetch job versions' });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  const jobId = req.params.id;
  try {
    // Delete record from database (will cascade delete linked job_skills, job_candidate_matches, job_version_history)
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
