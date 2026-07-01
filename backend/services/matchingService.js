const pool = require('../db');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Calculates local match score (Stage 1) for a specific job against all candidates.
 * Returns candidate IDs and their local scores sorted descending.
 */
async function calculateStage1Matches(jobId) {
  // Fetch job requirements
  const [jobRows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
  if (jobRows.length === 0) throw new Error('Job not found');
  const job = jobRows[0];

  // Fetch job skills
  const [jobSkills] = await pool.query('SELECT * FROM job_skills WHERE job_id = ?', [jobId]);
  const reqSkills = jobSkills.filter(s => s.is_required).map(s => s.skill.toLowerCase());
  const prefSkills = jobSkills.filter(s => !s.is_required).map(s => s.skill.toLowerCase());

  // Fetch all available candidates (not HIRED globally, not OUTSOURCED globally, not rejected for this job, and not hired/outsourced elsewhere)
  const [allCandidates] = await pool.query(
    `SELECT c.*, r.file_path, r.file_name, r.extracted_text,
            (SELECT GROUP_CONCAT(skill) FROM candidate_skills WHERE candidate_id = c.id) AS skills
     FROM candidates c
     JOIN resumes r ON c.resume_id = r.id
     WHERE c.status != 'HIRED' AND c.status != 'OUTSOURCED' AND c.id NOT IN (
       SELECT DISTINCT candidate_id 
       FROM job_candidate_matches 
       WHERE job_id = ? AND status = 'REJECTED'
     ) AND c.id NOT IN (
       SELECT DISTINCT candidate_id 
       FROM job_candidate_matches 
       WHERE status = 'HIRED' OR (status = 'SENT_TO_CLIENT' AND job_id != ?)
     )`,
    [jobId, jobId]
  );

  if (allCandidates.length === 0) return [];

  const results = [];

  // Helper to extract clean tokens
  const getTechTokens = (skillsArray) => {
    const stopWords = new Set([
      'and', 'or', 'in', 'of', 'for', 'to', 'with', 'a', 'an', 'the',
      'good', 'understanding', 'knowledge', 'experience', 'expert',
      'strong', 'insightful', 'minimum', 'years', 'designing',
      'configuring', 'modules', 'like', 'supporting', 'processes',
      'management', 'skills', 'related', 'integration', 'flow', 'business'
    ]);

    const tokens = new Set();
    for (const skill of skillsArray) {
      const parts = skill.toLowerCase().split(/[^a-z0-9]+/);
      for (const part of parts) {
        if (part.length > 1 && !stopWords.has(part)) {
          tokens.add(part);
        }
      }
    }
    return tokens;
  };

  const jdTokens = getTechTokens(reqSkills);

  for (const candidate of allCandidates) {
    // Retrieve candidate skills from the concatenated column value
    const candSkills = candidate.skills ? candidate.skills.split(',').map(s => s.toLowerCase().trim()) : [];

    // Use candidate's parsed total experience years directly
    const totalYears = parseFloat(candidate.total_experience_years) || 0;

    // Filter step: ensure candidate experience is at most 1 year less than JD requirement (no upper limit)
    if (job.experience_years && job.experience_years > 0) {
      if (totalYears < job.experience_years - 1) {
        continue; // Exclude candidate
      }
    }

    // Filter step: check if candidate matches any of the required skills
    let matches = false;
    if (reqSkills.length === 0) {
      matches = true; // Match all if no requirements
    } else {
      // 1. Check token overlap
      const candTokens = getTechTokens(candSkills);
      for (const token of candTokens) {
        if (jdTokens.has(token)) {
          matches = true;
          break;
        }
      }

      // 2. Check substring match
      if (!matches) {
        for (const reqSkill of reqSkills) {
          for (const candSkill of candSkills) {
            if (reqSkill.includes(candSkill) || candSkill.includes(reqSkill)) {
              matches = true;
              break;
            }
          }
          if (matches) break;
        }
      }
    }

    // Exclude candidate if they don't match the subset criteria
    if (!matches) continue;

    // 1. Skill Score
    let reqScore = 100;
    if (reqSkills.length > 0) {
      // Give partial credit for token overlap or substring matches
      let matchCount = 0;
      for (const reqSkill of reqSkills) {
        let isMatched = false;
        if (candSkills.includes(reqSkill)) {
          isMatched = true;
        } else {
          const reqSkillTokens = getTechTokens([reqSkill]);
          const candTokens = getTechTokens(candSkills);
          for (const token of candTokens) {
            if (reqSkillTokens.has(token)) {
              isMatched = true;
              break;
            }
          }
          if (!isMatched) {
            for (const candSkill of candSkills) {
              if (reqSkill.includes(candSkill) || candSkill.includes(reqSkill)) {
                isMatched = true;
                break;
              }
            }
          }
        }
        if (isMatched) matchCount++;
      }
      reqScore = (matchCount / reqSkills.length) * 100;
    }

    let prefScore = 100;
    if (prefSkills.length > 0) {
      let matchCount = 0;
      for (const prefSkill of prefSkills) {
        let isMatched = false;
        if (candSkills.includes(prefSkill)) {
          isMatched = true;
        } else {
          const prefSkillTokens = getTechTokens([prefSkill]);
          const candTokens = getTechTokens(candSkills);
          for (const token of candTokens) {
            if (prefSkillTokens.has(token)) {
              isMatched = true;
              break;
            }
          }
          if (!isMatched) {
            for (const candSkill of candSkills) {
              if (prefSkill.includes(candSkill) || candSkill.includes(prefSkill)) {
                isMatched = true;
                break;
              }
            }
          }
        }
        if (isMatched) matchCount++;
      }
      prefScore = (matchCount / prefSkills.length) * 100;
    }

    const skillScore = (reqScore * 0.7) + (prefScore * 0.3);

    // 2. Experience Score based on years of experience compared to JD requirements
    let experienceScore = 100;
    if (job.experience_years && job.experience_years > 0) {
      experienceScore = Math.min(100, Math.round((totalYears / job.experience_years) * 100));
    }

    // 3. Budget Score
    let budgetScore = 100;
    if (job.budget && candidate.expected_salary) {
      const jdBudget = parseFloat(job.budget);
      const candExpect = parseFloat(candidate.expected_salary);
      if (candExpect > jdBudget) {
        const overPercentage = (candExpect - jdBudget) / jdBudget;
        budgetScore = Math.max(0, 100 - (overPercentage * 200));
      }
    }

    // Weighted Overall Stage 1 Score
    const overallScore = Math.round((skillScore * 0.6) + (experienceScore * 0.2) + (budgetScore * 0.2));

    results.push({
      candidateId: candidate.id,
      candidateName: candidate.name,
      email: candidate.email,
      skills: candSkills,
      totalExperienceYears: totalYears,
      expectedSalary: candidate.expected_salary,
      semantic_score: overallScore,
      breakdown: { skillFit: Math.round(skillScore), experienceFit: experienceScore, budgetFit: Math.round(budgetScore) },
      fileName: candidate.file_name,
      filePath: candidate.file_path,
      extractedText: candidate.extracted_text
    });
  }

  // Sort by overall score descending
  return results.sort((a, b) => b.semantic_score - a.semantic_score);
}

/**
 * Runs deep LLM analysis (Stage 2) using Groq for a single candidate against a job.
 * Updates or inserts the match record in the database.
 */
async function calculateStage2Match(jobId, candidateId, stage1Score, stage1Breakdown) {
  // Fetch job details
  const [jobRows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
  const [jobSkillsRows] = await pool.query('SELECT skill, is_required FROM job_skills WHERE job_id = ?', [jobId]);

  // Fetch candidate details
  const [candRows] = await pool.query(`
    SELECT c.*, r.extracted_text 
    FROM candidates c
    JOIN resumes r ON c.resume_id = r.id
    WHERE c.id = ?
  `, [candidateId]);

  if (jobRows.length === 0 || candRows.length === 0) {
    throw new Error('Job or Candidate not found');
  }

  const job = jobRows[0];
  const candidate = candRows[0];

  const reqSkills = jobSkillsRows.filter(s => s.is_required).map(s => s.skill);
  const prefSkills = jobSkillsRows.filter(s => !s.is_required).map(s => s.skill);

  // Fetch experiences
  const [expRows] = await pool.query('SELECT * FROM candidate_experiences WHERE candidate_id = ?', [candidateId]);
  const experiences = expRows.map(e => `${e.role} at ${e.company} (${e.duration_months || 0} months): ${e.description || ''}`).join('\n');

  // Fetch skills list
  const [skillsRows] = await pool.query('SELECT skill FROM candidate_skills WHERE candidate_id = ?', [candidateId]);
  const candidateSkills = skillsRows.map(s => s.skill);

  // Call Groq
  const prompt = `
You are a technical recruiter. Score the suitability of the following candidate for the job description.

Job Description:
- Title: ${job.title}
- Required Skills: ${reqSkills.join(', ')}
- Preferred Skills: ${prefSkills.join(', ')}
- Required Experience Years: ${job.experience_years || 'N/A'}
- Budget (Max Salary): ${job.budget ? `₹${job.budget}` : 'N/A'}

Candidate Profile:
- Name: ${candidate.name || 'Unknown'}
- Skills: ${candidateSkills.join(', ')}
- Work History:
${experiences || 'No specific history logged.'}
- Expected Salary: ${candidate.expected_salary ? `₹${candidate.expected_salary}` : 'N/A'}

Resume Extract (Truncated):
${(candidate.extracted_text || '').substring(0, 3000)}

Please return a JSON object with:
1. "skillFit": Score from 0 to 100 based on matching required and preferred skills.
2. "experienceFit": Score from 0 to 100 based on years of experience, relevant industry, and roles.
3. "budgetFit": Score from 0 to 100. If Candidate expected salary is less than or equal to Job budget, give 100. If expected salary is greater, reduce score proportionally. If either is N/A, default to 100.
4. "overallScore": Weighted average score from 0 to 100.
5. "rationale": A brief 2-3 sentence summary of matching strengths, gaps, and why they fit.

Return ONLY valid JSON.
`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an AI scoring API. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.1-8b-instant', // fast and efficient model
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const responseContent = chatCompletion.choices[0].message.content;
    const evaluation = JSON.parse(responseContent);

    // Save/Update in database
    const [existingMatch] = await pool.query(
      'SELECT id FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
      [jobId, candidateId]
    );

    const breakdown = {
      skillFit: evaluation.skillFit || stage1Breakdown.skillFit,
      experienceFit: evaluation.experienceFit || stage1Breakdown.experienceFit,
      budgetFit: evaluation.budgetFit || stage1Breakdown.budgetFit
    };

    const finalScore = evaluation.overallScore || stage1Score;
    const rationale = evaluation.rationale || 'Semantic match generated locally.';

    if (existingMatch.length > 0) {
      await pool.query(
        `UPDATE job_candidate_matches 
         SET semantic_score = ?, llm_score = ?, match_breakdown = ?, rationale = ?
         WHERE id = ?`,
        [stage1Score, finalScore, JSON.stringify(breakdown), rationale, existingMatch[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO job_candidate_matches (job_id, candidate_id, semantic_score, llm_score, match_breakdown, rationale)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [jobId, candidateId, stage1Score, finalScore, JSON.stringify(breakdown), rationale]
      );
    }

    return {
      candidateId,
      semantic_score: stage1Score,
      llm_score: finalScore,
      breakdown,
      rationale
    };
  } catch (error) {
    console.error(`Error running Stage 2 match for candidate ${candidateId}:`, error.message);

    // Fallback: save Stage 1 results if Groq fails
    const [existingMatch] = await pool.query(
      'SELECT id FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
      [jobId, candidateId]
    );

    if (existingMatch.length > 0) {
      await pool.query(
        `UPDATE job_candidate_matches 
         SET semantic_score = ?, llm_score = ?, match_breakdown = ?, rationale = ?
         WHERE id = ?`,
        [stage1Score, stage1Score, JSON.stringify(stage1Breakdown), 'Fallback semantic scoring (LLM offline).', existingMatch[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO job_candidate_matches (job_id, candidate_id, semantic_score, llm_score, match_breakdown, rationale)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [jobId, candidateId, stage1Score, stage1Score, JSON.stringify(stage1Breakdown), 'Fallback semantic scoring (LLM offline).']
      );
    }

    return {
      candidateId,
      semantic_score: stage1Score,
      llm_score: stage1Score,
      breakdown: stage1Breakdown,
      rationale: 'Fallback semantic scoring (LLM offline).'
    };
  }
}

module.exports = {
  calculateStage1Matches,
  calculateStage2Match
};