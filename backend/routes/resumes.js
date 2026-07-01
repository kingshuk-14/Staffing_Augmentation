const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const Groq = require('groq-sdk');
const { cleanText } = require('../services/parserHelper');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const router = express.Router();

// Multer storage configuration
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, JPEG, and PNG are allowed.'));
    }
  }
});

// ---------------------------------------------------------------------------
// Jaccard similarity between two sets (arrays of lowercase strings)
function jaccardSimilarity(setA, setB) {
  if (!setA.length || !setB.length) return 0;
  const a = new Set(setA.map(s => s.toLowerCase().trim()));
  const b = new Set(setB.map(s => s.toLowerCase().trim()));
  const intersection = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// Normalised string similarity (0–1) using character bigrams
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = s => new Set([...Array(s.length - 1)].map((_, i) => s.slice(i, i + 2)));
  const bg1 = bigrams(na);
  const bg2 = bigrams(nb);
  const intersection = [...bg1].filter(x => bg2.has(x)).length;
  return (2 * intersection) / (bg1.size + bg2.size);
}

/**
 * Detect if a newly inserted resume is a duplicate of an existing one.
 * Hierarchy (first match wins):
 *   1. EXACT_FILENAME   — same file_name (score 100)
 *   2. EMAIL_MATCH      — same email in candidates table (score 90)
 *   3. NAME_SKILL       — name sim ≥ 0.80 AND skill Jaccard ≥ 0.60 (score 70–85)
 *   4. NAME_EXPERIENCE  — name sim ≥ 0.80 AND experience overlap ≥ 0.50 (score 60–75)
 *   5. SKILL_OVERLAP    — skill Jaccard ≥ 0.75, regardless of name (score 50–65)
 *   6. SUMMARY_MATCH    — professional summary sim ≥ 0.70 AND name sim ≥ 0.50 (score 55–70)
 *
 * IMPORTANT: Must be called BEFORE the candidate insert/update so old records are intact.
 *
 * Returns { isDuplicate, duplicateOf, score, reason } or null (no duplicate).
 */
async function detectDuplicate(newResumeId, originalname, parsedEmail, parsedName, skills, experiences, professionalSummary, pool) {
  // Fetch all OTHER resumes with their candidates, concatenated skills, and total experience months in one single query
  const [existing] = await pool.query(`
    SELECT
      r.id              AS resume_id,
      r.file_name,
      r.summarised,
      c.email,
      c.name            AS cand_name,
      (SELECT GROUP_CONCAT(skill) FROM candidate_skills WHERE candidate_id = c.id) AS skills,
      (SELECT SUM(duration_months) FROM candidate_experiences WHERE candidate_id = c.id) AS total_exp_months
    FROM resumes r
    LEFT JOIN candidates c ON c.resume_id = r.id
    WHERE r.id != ?
    ORDER BY r.id DESC
    LIMIT 200
  `, [newResumeId]);

  const newSkills = (skills || []).map(s => s.toLowerCase().trim());
  const newExpMonths = (experiences || []).reduce((acc, e) => acc + (e.duration_months || 0), 0);

  for (const row of existing) {
    // --- Tier 1: Exact filename ---
    if (row.file_name && row.file_name === originalname) {
      return { isDuplicate: true, duplicateOf: row.resume_id, score: 100, reason: 'EXACT_FILENAME' };
    }

    // --- Tier 2: Email match ---
    if (parsedEmail && row.email && parsedEmail.toLowerCase() === row.email.toLowerCase()) {
      return { isDuplicate: true, duplicateOf: row.resume_id, score: 90, reason: 'EMAIL_MATCH' };
    }

    // Retrieve skills from the concatenated column value
    const existingSkills = row.skills ? row.skills.split(',').map(s => s.toLowerCase().trim()) : [];
    const skillJaccard = jaccardSimilarity(newSkills, existingSkills);
    const nameSim = stringSimilarity(parsedName, row.cand_name);

    // --- Tier 3: Name similarity + skill overlap ---
    if (nameSim >= 0.80 && skillJaccard >= 0.60) {
      const score = Math.round(70 + (skillJaccard - 0.60) * 75);
      return { isDuplicate: true, duplicateOf: row.resume_id, score: Math.min(score, 85), reason: 'NAME_SKILL_OVERLAP' };
    }

    // Retrieve experience total months from the initial query column
    const existingExpMonths = parseInt(row.total_exp_months) || 0;
    const expOverlap = (newExpMonths && existingExpMonths)
      ? 1 - Math.abs(newExpMonths - existingExpMonths) / Math.max(newExpMonths, existingExpMonths)
      : 0;

    if (nameSim >= 0.80 && expOverlap >= 0.50) {
      const score = Math.round(60 + expOverlap * 15);
      return { isDuplicate: true, duplicateOf: row.resume_id, score: Math.min(score, 75), reason: 'NAME_EXP_OVERLAP' };
    }

    // --- Tier 5: Strong skill overlap alone ---
    if (skillJaccard >= 0.75) {
      const score = Math.round(50 + (skillJaccard - 0.75) * 60);
      return { isDuplicate: true, duplicateOf: row.resume_id, score: Math.min(score, 65), reason: 'SKILL_OVERLAP' };
    }

    // --- Tier 6: Professional summary similarity ---
    if (professionalSummary && row.summarised) {
      try {
        const existingSummary = typeof row.summarised === 'string' ? JSON.parse(row.summarised) : row.summarised;
        const existingProfSummary = existingSummary.professional_summary || '';
        if (existingProfSummary) {
          const summarySim = stringSimilarity(professionalSummary, existingProfSummary);
          if (summarySim >= 0.70 && nameSim >= 0.50) {
            const score = Math.round(55 + (summarySim - 0.70) * 50);
            return { isDuplicate: true, duplicateOf: row.resume_id, score: Math.min(score, 70), reason: 'SUMMARY_MATCH' };
          }
        }
      } catch (e) { /* ignore bad JSON */ }
    }
  }

  return null;
}
// ---------------------------------------------------------------------------

const parsingQueue = [];
let activeWorkersCount = 0;
const MAX_CONCURRENT_PARSERS = 1;

function queueResumeForParsing(resumeId, originalname) {
  parsingQueue.push({ resumeId, originalname });
  // Trigger processor asynchronously
  setTimeout(triggerQueueProcessor, 0);
}

async function triggerQueueProcessor() {
  if (activeWorkersCount >= MAX_CONCURRENT_PARSERS) return;
  if (parsingQueue.length === 0) return;

  activeWorkersCount++;
  const task = parsingQueue.shift();
  if (task) {
    try {
      await processResumeInBackground(task.resumeId, task.originalname, pool);
    } catch (err) {
      console.error(`Queue processor task error for ID ${task.resumeId}:`, err);
    }
  }
  activeWorkersCount--;
  // Check if there are more tasks in the queue, adding a small delay to prevent Groq API burst limits
  setTimeout(triggerQueueProcessor, 500);
}

async function processResumeInBackground(resumeId, originalname, pool) {
  try {
    // 1. Update status to 'PARSING'
    await pool.query("UPDATE resumes SET processing_status = 'PARSING' WHERE id = ?", [resumeId]);

    // 2. Fetch the resume details to get extracted_text
    const [[resume]] = await pool.query("SELECT extracted_text, file_type FROM resumes WHERE id = ?", [resumeId]);
    if (!resume || !resume.extracted_text) {
      throw new Error("Extracted text is empty or resume record not found");
    }

    const systemPrompt = `You are a technical recruiter. Parse the provided resume text and extract candidate profile details and summaries into a single JSON object with these exact keys:
    1. name: The candidate's name (string).
    2. email: Candidate's email address (string).
    3. phone: Phone number (string).
    4. expected_salary: Expected annual salary in INR (numeric/null).
    5. current_location: Current location (string).
    6. total_experience_years: The total professional experience of the candidate (string, e.g. '5.5', '5+', '10+'). If the resume explicitly mentions something like '5+ years' or '10+ years', return it EXACTLY as '5+' or '10+'. Otherwise, calculate the total years precisely from the listed experiences (e.g. '6.2').
    7. skills: Array of candidate's key skills (strings).
    8. experiences: Array of objects, each containing:
       - company: Company name (string)
       - role: Job title (string)
       - duration_months: Duration worked in months (integer)
       - description: Key accomplishments (string)
    9. professional_summary: A concise 2-3 sentence overview of the candidate's profile, expertise area, and career level.
    10. key_strengths: Array of 3-5 bullet-point strings describing the candidate's top strengths.
    11. career_trajectory: A 1-2 sentence description of the candidate's career progression.
    12. education_highlight: A single string summarizing the candidate's highest/most relevant education.
    
    Output ONLY valid JSON.
    
    UN-SCRAMBLE INSTRUCTIONS: The resume text is extracted from a PDF which may have a two-column layout. When columns are extracted, text lines across the columns often interlace (e.g. contact details or skills from the left sidebar appear in the middle of work experience bullet points). You MUST mentally un-scramble the columns, separate the sidebar data (contact info, skills, education) from the main experience timeline, and associate work accomplishments with their correct employer/job role.
    
    CRITICAL DATE & DURATION CALCULATIONS (Today is June 29, 2026):
    - Extract ALL experiences. Do not skip any role or project.
    - If a role lists dates, calculate the exact duration in months. If the end date is "Present" or "Current", calculate the duration up to June 2026.
    - If the resume states a total years of experience in their profile/summary (e.g. "5+ years of SAP FICO experience"), but individual projects or roles do not have explicit dates, distribute this total duration (e.g. 5 years = 60 months) across the projects/roles, or attribute it to the main current/most recent employer, so that the candidate's total experience in the database matches their actual experience level. Do NOT default duration_months to 0 if total experience is specified!`;

    const cleanedText = cleanText(resume.extracted_text).substring(0, 30000);
    let chatCompletion = null;
    let attempts = 0;
    const maxAttempts = 3;
    let retryDelay = 5000;

    while (attempts < maxAttempts) {
      try {
        chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are an AI parsing API. Return only valid JSON.' },
            { role: 'user', content: systemPrompt + '\n\nResume Extract:\n' + cleanedText }
          ],
          model: 'llama-3.1-8b-instant',
          temperature: 0.1,
          response_format: { type: 'json_object' }
        });
        break;
      } catch (parseErr) {
        attempts++;
        console.warn(`Groq parsing attempt ${attempts} failed:`, parseErr.message || parseErr);
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to parse candidate details via AI: ${parseErr.message || parseErr}`);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 2;
      }
    }

    const parsedData = JSON.parse(chatCompletion.choices[0].message.content);

    const name = parsedData.name || originalname.split('.')[0];
    const email = parsedData.email || `candidate_${resumeId}@test.com`;
    const phone = parsedData.phone || '';
    const expectedSalary = parsedData.expected_salary || null;
    const currentLocation = parsedData.current_location || '';
    const totalExpYears = parsedData.total_experience_years ? String(parsedData.total_experience_years) : '0';
    const skills = parsedData.skills || [];
    const experiences = parsedData.experiences || [];

    // Construct summary structure expected by downstream modules
    const summaryData = {
      professional_summary: parsedData.professional_summary || '',
      key_strengths: parsedData.key_strengths || [],
      career_trajectory: parsedData.career_trajectory || '',
      education_highlight: parsedData.education_highlight || '',
      experience: experiences.map(exp => ({
        company: exp.company || '',
        title: exp.role || '',
        accomplishments: exp.description || ''
      })),
      'skill set': skills
    };
    const professionalSummary = summaryData.professional_summary;

    await pool.query('UPDATE resumes SET summarised = ? WHERE id = ?', [JSON.stringify(summaryData), resumeId]);

    // 3. Run duplicate detection BEFORE candidate upsert
    const dupResult = await detectDuplicate(
      resumeId, originalname, email, name, skills, experiences, professionalSummary, pool
    );

    let candidateId = null;

    if (dupResult && dupResult.isDuplicate) {
      await pool.query(
        `UPDATE resumes
         SET is_duplicate = TRUE, duplicate_of = ?, duplicate_score = ?, duplicate_reason = ?, processing_status = 'COMPLETED'
         WHERE id = ?`,
        [dupResult.duplicateOf, dupResult.score, dupResult.reason, resumeId]
      );

      // If duplicate, retrieve existing candidate ID associated with original resume
      const [candRows] = await pool.query('SELECT id FROM candidates WHERE resume_id = ?', [dupResult.duplicateOf]);
      if (candRows.length > 0) {
        candidateId = candRows[0].id;
      } else {
        const [candEmailRows] = await pool.query('SELECT id FROM candidates WHERE email = ?', [email]);
        if (candEmailRows.length > 0) {
          candidateId = candEmailRows[0].id;
        }
      }
    } else {
      // 4. Insert or Update candidate (ONLY if unique resume)
      const [existingCand] = await pool.query('SELECT id, resume_id FROM candidates WHERE email = ?', [email]);

      if (existingCand.length > 0) {
        candidateId = existingCand[0].id;
        await pool.query(
          `UPDATE candidates
           SET resume_id = ?, name = ?, phone = ?, expected_salary = ?, current_location = ?, total_experience_years = ?
           WHERE id = ?`,
          [resumeId, name, phone, expectedSalary, currentLocation, totalExpYears, candidateId]
        );
        await pool.query('DELETE FROM candidate_skills WHERE candidate_id = ?', [candidateId]);
        await pool.query('DELETE FROM candidate_experiences WHERE candidate_id = ?', [candidateId]);
      } else {
        const [candResult] = await pool.query(
          `INSERT INTO candidates (resume_id, name, email, phone, expected_salary, current_location, total_experience_years)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [resumeId, name, email, phone, expectedSalary, currentLocation, totalExpYears]
        );
        candidateId = candResult.insertId;
      }

      // 5. Save normalized skills via bulk insert
      const skillValues = skills
        .filter(s => s && s.trim())
        .map(s => [candidateId, s.trim()]);
      if (skillValues.length > 0) {
        await pool.query(
          'INSERT IGNORE INTO candidate_skills (candidate_id, skill) VALUES ?',
          [skillValues]
        );
      }

      // 6. Save normalized experiences via bulk insert
      const expValues = experiences.map(exp => [
        candidateId,
        exp.company || '',
        exp.role || '',
        exp.duration_months || 0,
        exp.description || ''
      ]);
      if (expValues.length > 0) {
        await pool.query(
          'INSERT INTO candidate_experiences (candidate_id, company, role, duration_months, description) VALUES ?',
          [expValues]
        );
      }

      // Mark status as 'COMPLETED'
      await pool.query("UPDATE resumes SET processing_status = 'COMPLETED' WHERE id = ?", [resumeId]);
    }
  } catch (error) {
    console.error(`Error in background resume parsing for ID ${resumeId}:`, error);
    await pool.query(
      "UPDATE resumes SET processing_status = 'FAILED', error_message = ? WHERE id = ?",
      [error.message || 'Unknown background parsing error', resumeId]
    );
  }
}

router.post('/upload', authenticateToken, upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { filename, path: filePath, mimetype, originalname } = req.file;
  const userId = req.user.userId;

  try {
    let extractedText = '';

    // Parse the file based on its mime type
    if (mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      extractedText = data.text;
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
      extractedText = text;
    }

    // Default metadata
    const metadata = {
      fileSize: req.file.size,
      parsedEngine: mimetype.includes('pdf') ? 'pdf-parse' : mimetype.includes('image') ? 'tesseract' : 'mammoth',
    };

    // 1. Insert into resumes table
    const [result] = await pool.query(
      "INSERT INTO resumes (uploaded_by, file_name, file_type, file_path, extracted_text, parsed_metadata, processing_status) VALUES (?, ?, ?, ?, ?, ?, 'INGESTED')",
      [userId, originalname, mimetype, `uploads/${filename}`, extractedText, JSON.stringify(metadata)]
    );
    const resumeId = result.insertId;

    // Trigger background parsing automatically as before
    queueResumeForParsing(resumeId, originalname);

    res.status(201).json({
      success: true,
      message: 'Resume uploaded successfully. AI processing has started in the background.',
      resumeId
    });
  } catch (error) {
    console.error('Error in instant resume upload:', error);
    res.status(500).json({ error: 'Failed to process resume upload' });
  }
});

// Batch status check endpoint for background parsing progress
router.get('/status', authenticateToken, async (req, res) => {
  const idsStr = req.query.ids;
  if (!idsStr) {
    return res.status(400).json({ error: 'Missing ids parameter' });
  }

  const ids = idsStr.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Invalid ids parameter' });
  }

  try {
    const [rows] = await pool.query(`
      SELECT 
        r.id AS resume_id,
        r.processing_status,
        r.is_duplicate,
        r.duplicate_reason,
        r.duplicate_score,
        r.error_message,
        c.name AS candidate_name,
        c.email AS candidate_email
      FROM resumes r
      LEFT JOIN candidates c ON c.resume_id = COALESCE(r.duplicate_of, r.id)
      WHERE r.id IN (?)
    `, [ids]);

    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching resume status batch:', error);
    res.status(500).json({ error: 'Failed to query resume status batch' });
  }
});

// Get resumes
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT
        r.id, r.file_name, r.file_type, r.created_at, r.parsed_metadata,
        r.extracted_text, r.summarised,
        r.is_duplicate, r.duplicate_of, r.duplicate_score, r.duplicate_reason,
        r.processing_status, r.error_message,
        u.first_name, u.last_name,
        dup.file_name AS duplicate_of_file_name
      FROM resumes r
      JOIN users u ON r.uploaded_by = u.id
      LEFT JOIN resumes dup ON dup.id = r.duplicate_of
    `;
    let params = [];

    if (req.user.role !== 'alphaxine') {
      query += ' WHERE r.uploaded_by = ?';
      params.push(req.user.userId);
    }

    query += ' ORDER BY r.created_at DESC';

    const [resumes] = await pool.query(query, params);
    res.status(200).json(resumes);
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
});

// Summarize Resume using Groq
router.post('/:id/summarize', authenticateToken, async (req, res) => {
  try {
    const resumeId = req.params.id;

    // Check permission & fetch text
    let query = 'SELECT uploaded_by, extracted_text, parsed_metadata FROM resumes WHERE id = ?';
    const [rows] = await pool.query(query, [resumeId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Resume not found' });

    const resume = rows[0];
    if (req.user.role !== 'alphaxine' && req.user.userId !== resume.uploaded_by) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!resume.extracted_text) {
      return res.status(400).json({ error: 'No extracted text available to summarize' });
    }

    const { fields } = req.body;
    let requestedFields = fields && Array.isArray(fields) && fields.length > 0
      ? fields
      : ["experience"];

    const cleanedText = cleanText(resume.extracted_text).substring(0, 30000);

    const systemPrompt = `You are a professional technical recruiter. Analyze the provided resume text and extract the following specific fields into a clean JSON object: ${requestedFields.join(', ')}. 
    Output ONLY valid JSON where the keys exactly match the requested fields, no markdown, no other text.
    CRITICAL: All extracted values MUST be simple strings or simple arrays of strings. Do not output complex nested objects or arrays of objects. Keep the text concise.
    
    UN-SCRAMBLE INSTRUCTIONS: The resume text is extracted from a PDF which may have a two-column layout. When columns are extracted, text lines across the columns often interlace (e.g. contact details or skills from the left sidebar appear in the middle of work experience bullet points). You MUST mentally un-scramble the columns, separate the sidebar data (contact info, skills, education) from the main experience timeline, and associate work accomplishments with their correct employer/job role.`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: cleanedText
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const aiResponse = chatCompletion.choices[0].message.content;
    const summaryData = JSON.parse(aiResponse);

    // Save directly to the new summarised column
    await pool.query('UPDATE resumes SET summarised = ? WHERE id = ?', [JSON.stringify(summaryData), resumeId]);

    res.status(200).json({ message: 'Summary generated', summary: summaryData });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// DELETE /api/resumes/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  const resumeId = req.params.id;
  try {
    // 1. Fetch file path to delete from disk
    const [rows] = await pool.query('SELECT file_path FROM resumes WHERE id = ?', [resumeId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Resume not found' });
    const resume = rows[0];

    // 2. Clear duplicate flags on any resume that was pointing at this one
    //    (must happen BEFORE deletion so the FK reference is still valid)
    const [affectedRows] = await pool.query(
      `UPDATE resumes
       SET is_duplicate = FALSE, duplicate_of = NULL, duplicate_score = NULL, duplicate_reason = NULL
       WHERE duplicate_of = ?`,
      [resumeId]
    );
    const clearedCount = affectedRows.affectedRows || 0;

    // 3. Delete file from disk if it exists
    if (resume.file_path) {
      const fullPath = path.join(__dirname, '../', resume.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    // 4. Delete record from database (cascades to candidate, skills, experiences, matches)
    await pool.query('DELETE FROM resumes WHERE id = ?', [resumeId]);

    res.status(200).json({
      message: 'Resume deleted successfully',
      duplicateFlagsCleared: clearedCount
    });
  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

// PATCH /api/resumes/:id/clear-duplicate — manually dismiss a duplicate flag
router.patch('/:id/clear-duplicate', authenticateToken, async (req, res) => {
  const resumeId = req.params.id;
  try {
    const [rows] = await pool.query('SELECT id, is_duplicate, duplicate_of FROM resumes WHERE id = ?', [resumeId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Resume not found' });

    const duplicateOf = rows[0].duplicate_of;

    // Clear duplicate metadata on the resume
    await pool.query(
      `UPDATE resumes
       SET is_duplicate = FALSE, duplicate_of = NULL, duplicate_score = NULL, duplicate_reason = NULL
       WHERE id = ?`,
      [resumeId]
    );

    // If there is an original resume associated, update the candidate record to point to this cleared resume
    if (duplicateOf) {
      await pool.query(
        'UPDATE candidates SET resume_id = ? WHERE resume_id = ?',
        [resumeId, duplicateOf]
      );
    }

    res.status(200).json({ message: 'Duplicate flag cleared successfully', resumeId });
  } catch (error) {
    console.error('Error clearing duplicate flag:', error);
    res.status(500).json({ error: 'Failed to clear duplicate flag' });
  }
});

module.exports = router;