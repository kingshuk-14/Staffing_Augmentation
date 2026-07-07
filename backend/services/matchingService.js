const pool = require('../db');
const Groq = require('groq-sdk');
const { normalizeBreakdown } = require('./breakdownNormalizer');
const { logEvaluation, logBatchSummary } = require('./evaluationLogger');

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
  // Check if comparison already exists in jd_comparisons (caching layer)
  const [cachedComparisons] = await pool.query(
    'SELECT * FROM jd_comparisons WHERE jd_id = ? AND candidate_id = ?',
    [jobId, candidateId]
  );
  if (cachedComparisons.length > 0 && cachedComparisons[0].llm_score !== null) {
    const cached = cachedComparisons[0];
    let breakdown = cached.match_breakdown;
    if (typeof breakdown === 'string') {
      try { breakdown = JSON.parse(breakdown); } catch (e) { breakdown = null; }
    }
    
    // Sync back to job_candidate_matches if missing
    const [existingMatch] = await pool.query(
      'SELECT id, retry_count FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
      [jobId, candidateId]
    );
    if (existingMatch.length === 0) {
      await pool.query(`
        INSERT INTO job_candidate_matches 
        (job_id, candidate_id, semantic_score, llm_score, match_breakdown, rationale, evaluation_status, retry_count) 
        VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', 1)
      `, [jobId, candidateId, cached.llm_score, cached.llm_score, JSON.stringify(breakdown), cached.rationale]);
    } else {
      await pool.query(`
        UPDATE job_candidate_matches 
        SET llm_score = ?, semantic_score = ?, match_breakdown = ?, rationale = ?, evaluation_status = 'COMPLETED'
        WHERE id = ?
      `, [cached.llm_score, cached.llm_score, JSON.stringify(breakdown), cached.rationale, existingMatch[0].id]);
    }

    return {
      success: true,
      score: cached.llm_score,
      llm_score: cached.llm_score,
      breakdown,
      rationale: cached.rationale,
      cacheHit: true
    };
  }

  const aiService = require('./aiService');
  const knowledgeService = require('./knowledgeService');

  // Fetch job details
  const [jobRows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
  
  // Fetch candidate details
  const [candRows] = await pool.query(`
    SELECT c.*, r.extracted_text, r.summarised as resume_summarised, r.knowledge_set as resume_knowledge_set
    FROM candidates c
    JOIN resumes r ON c.resume_id = r.id
    WHERE c.id = ?
  `, [candidateId]);

  if (jobRows.length === 0 || candRows.length === 0) {
    throw new Error('Job or Candidate not found');
  }

  const job = jobRows[0];
  const candidate = candRows[0];

  const jobSummary = typeof job.parsed_summary === 'string' ? JSON.parse(job.parsed_summary) : (job.parsed_summary || { title: job.title, budget: job.budget, experience_years: job.experience_years });
  const candidateSummary = typeof candidate.resume_summarised === 'string' ? JSON.parse(candidate.resume_summarised) : (candidate.resume_summarised || { name: candidate.name, expected_salary: candidate.expected_salary, experience_years: candidate.total_experience_years });

  // --- DETERMINISTIC BACKEND CALCULATIONS ---
  const backendMetrics = {
    candidateKnowledgeCount: 0,
    exactMatchCount: 0,
    normalizedMatchCount: 0,
    synonymMatchCount: 0,
    substringMatchCount: 0,
    semanticMatchCount: 0,
    practicalMatchCount: 0,
    remainingUnmatchedCount: 0,
    
    criticalMatched: 0,
    criticalMissing: 0,
    importantMatched: 0,
    importantMissing: 0,
    preferredMatched: 0,
    preferredMissing: 0,

    matchedResponsibilities: [],
    missingResponsibilities: [],
    matchedDomains: [],
    matchedModules: [],
    matchedIntegrations: [],
    matchedTools: [],
    matchedCertifications: [],
    
    exact_matches: [],
    missingRequiredSkills: [], 
    missingPreferredSkills: [], 
    
    experience_difference_years: 0,
    experience_score_computed: 0,
    budget_difference_percent: 0,
    budget_score_computed: 0,
    
    weightBreakdown: {
      criticalWeight: 0,
      importantWeight: 0,
      preferredWeight: 0
    },
    
    appliedCap: "None",
    capReasoning: ""
  };

  // 1. Fetch or Generate Knowledge Sets
  let jobKnowledge = typeof job.knowledge_set === 'string' ? JSON.parse(job.knowledge_set) : job.knowledge_set;
  if (!jobKnowledge) jobKnowledge = knowledgeService.generateKnowledgeSet(jobSummary);
  
  let candKnowledge = typeof candidate.resume_knowledge_set === 'string' ? JSON.parse(candidate.resume_knowledge_set) : candidate.resume_knowledge_set;
  if (!candKnowledge) candKnowledge = knowledgeService.generateKnowledgeSet(candidateSummary);
  
  backendMetrics.candidateKnowledgeCount = candKnowledge.length;

  // 2. Normalization sets for quick lookup
  const candSet = require('./normalizationService').normalizeArrayToSet(candKnowledge);
  
  // Extract Hierarchical Requirements safely
  const reqCritical = jobSummary.critical_requirements || [];
  const reqImportant = jobSummary.important_requirements || [];
  const reqPreferred = jobSummary.preferred_requirements || [];
  
  // Backwards compatibility with old parsed JD schema
  if (jobSummary.required_skills?.critical && reqCritical.length === 0) {
    jobSummary.required_skills.critical.forEach(s => reqCritical.push({ category: "Technical Skill", priority: "Critical", match_type: "Skill", value: s }));
  }
  if (jobSummary.required_skills?.important && reqImportant.length === 0) {
    jobSummary.required_skills.important.forEach(s => reqImportant.push({ category: "Technical Skill", priority: "Important", match_type: "Skill", value: s }));
  }
  if (jobSummary.required_skills?.good_to_have && reqPreferred.length === 0) {
    jobSummary.required_skills.good_to_have.forEach(s => reqPreferred.push({ category: "Technical Skill", priority: "Preferred", match_type: "Skill", value: s }));
  }
  if (jobSummary.responsibilities?.required && reqCritical.length === 0) {
    jobSummary.responsibilities.required.forEach(s => reqCritical.push({ category: "Responsibility", priority: "Critical", match_type: "Practical", value: s }));
  }
  if (jobSummary.responsibilities?.preferred && reqImportant.length === 0) {
    jobSummary.responsibilities.preferred.forEach(s => reqImportant.push({ category: "Responsibility", priority: "Important", match_type: "Practical", value: s }));
  }

  // Set used to deduplicate matches
  const matchedCandidateStrings = new Set();
  
  // 3. 5-Stage Matching Function for specific items
  const matchItem = (itemObj) => {
    const item = typeof itemObj === 'string' ? itemObj : (itemObj.value || "");
    if (!item) return { matched: false, stage: 0 };
    
    const exact = item.trim();
    
    // Stage 1: Exact Match
    if (candKnowledge.includes(exact) && !matchedCandidateStrings.has(exact)) {
      matchedCandidateStrings.add(exact);
      return { matched: true, stage: 1, matched_with: exact };
    }
    
    // Stage 2: Normalized Match
    const norm = require('./normalizationService').normalizeString(item);
    if (!norm) return { matched: false, stage: 0 };
    
    if (candSet.has(norm) && !matchedCandidateStrings.has(norm)) {
      matchedCandidateStrings.add(norm);
      return { matched: true, stage: 2, matched_with: norm };
    }
    
    // Stage 3 & 4: Synonym & Substring Match
    for (const candItem of candSet) {
      if (!matchedCandidateStrings.has(candItem)) {
        if (candItem.includes(norm) || norm.includes(candItem)) {
          matchedCandidateStrings.add(candItem);
          return { matched: true, stage: 4, matched_with: candItem }; // Substring / Synonym
        }
      }
    }
    
    return { matched: false, stage: 0 };
  };

  const processRequirementList = (list, priorityLevel) => {
    let matchedScore = 0;
    list.forEach(reqObj => {
      const value = typeof reqObj === 'string' ? reqObj : (reqObj.value || "");
      const res = matchItem(reqObj);
      
      if (res.matched) {
        backendMetrics.exact_matches.push(value);
        if (res.stage === 1) backendMetrics.exactMatchCount++;
        else if (res.stage === 2) backendMetrics.normalizedMatchCount++;
        else if (res.stage === 4) backendMetrics.substringMatchCount++;
        
        if (priorityLevel === 'Critical') {
            backendMetrics.criticalMatched++;
            matchedScore += 3; // Highest Weight
        }
        else if (priorityLevel === 'Important') {
            backendMetrics.importantMatched++;
            matchedScore += 2; // Medium Weight
        }
        else {
            backendMetrics.preferredMatched++;
            matchedScore += 1; // Lowest Weight
        }
      } else {
        if (priorityLevel === 'Critical') {
            backendMetrics.criticalMissing++;
            backendMetrics.missingRequiredSkills.push(value);
        }
        else if (priorityLevel === 'Important') {
            backendMetrics.importantMissing++;
            backendMetrics.missingRequiredSkills.push(value);
        }
        else {
            backendMetrics.preferredMissing++;
            backendMetrics.missingPreferredSkills.push(value);
        }
      }
    });
    return matchedScore;
  };

  backendMetrics.weightBreakdown.criticalWeight = processRequirementList(reqCritical, 'Critical');
  backendMetrics.weightBreakdown.importantWeight = processRequirementList(reqImportant, 'Important');
  backendMetrics.weightBreakdown.preferredWeight = processRequirementList(reqPreferred, 'Preferred');

  // Extract specific domains from job vs candidate knowledge (For Frontend compat)
  const extractMatches = (jobArr) => {
    const matches = [];
    (jobArr || []).forEach(item => {
      if (matchItem(item).matched) matches.push(item);
    });
    return matches;
  };
  
  const extractMissing = (jobArr) => {
    const missing = [];
    (jobArr || []).forEach(item => {
      if (!matchItem(item).matched) missing.push(item);
    });
    return missing;
  };

  backendMetrics.matchedModules = extractMatches(jobSummary.sap_modules);
  backendMetrics.matchedDomains = extractMatches(jobSummary.domains);
  backendMetrics.matchedIntegrations = extractMatches(jobSummary.integrations);
  backendMetrics.matchedTools = extractMatches(jobSummary.tools);
  backendMetrics.matchedCertifications = extractMatches(jobSummary.certifications);
  
  backendMetrics.matchedResponsibilities = extractMatches(jobSummary.responsibilities?.required);
  backendMetrics.missingResponsibilities = extractMissing(jobSummary.responsibilities?.required);
  
  // Deduplicate
  backendMetrics.exact_matches = [...new Set(backendMetrics.exact_matches)];
  backendMetrics.missingRequiredSkills = [...new Set(backendMetrics.missingRequiredSkills)];
  backendMetrics.missingPreferredSkills = [...new Set(backendMetrics.missingPreferredSkills)];
  backendMetrics.matchedResponsibilities = [...new Set(backendMetrics.matchedResponsibilities)];
  backendMetrics.missingResponsibilities = [...new Set(backendMetrics.missingResponsibilities)];

  backendMetrics.remainingUnmatchedCount = backendMetrics.missingRequiredSkills.length + backendMetrics.missingPreferredSkills.length + backendMetrics.missingResponsibilities.length;

  // Experience Matching (Max 20)
  const reqExp = parseFloat(jobSummary.experience_required?.minimum || job.experience_years || 0);
  const candExp = parseFloat(candidateSummary.total_experience || candidate.total_experience_years || 0);
  backendMetrics.experience_difference_years = candExp - reqExp;
  
  // Experience validates skills logic (ensure it doesn't arbitrarily push you if skills missing)
  if (backendMetrics.experience_difference_years >= 0) {
    backendMetrics.experience_score_computed = 20;
  } else if (backendMetrics.experience_difference_years >= -1) {
    backendMetrics.experience_score_computed = 18;
  } else if (backendMetrics.experience_difference_years >= -2) {
    backendMetrics.experience_score_computed = 15;
  } else if (backendMetrics.experience_difference_years >= -3) {
    backendMetrics.experience_score_computed = 10;
  } else {
    backendMetrics.experience_score_computed = 0;
  }

  // Budget Matching (Max 20)
  const extractNumber = (str) => {
    const num = parseFloat((str || '').toString().replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  };
  const jdBudget = extractNumber(jobSummary.budget || job.budget);
  const candBudget = extractNumber(candidateSummary.expected_ctc || candidate.expected_salary);
  
  if (jdBudget > 0 && candBudget > 0) {
    if (candBudget <= jdBudget) {
      backendMetrics.budget_score_computed = 20;
      backendMetrics.budget_difference_percent = 0;
    } else {
      const overPercentage = ((candBudget - jdBudget) / jdBudget) * 100;
      backendMetrics.budget_difference_percent = Math.round(overPercentage);
      if (overPercentage <= 10) backendMetrics.budget_score_computed = 18;
      else if (overPercentage <= 20) backendMetrics.budget_score_computed = 15;
      else if (overPercentage <= 30) backendMetrics.budget_score_computed = 10;
      else backendMetrics.budget_score_computed = 0;
    }
  } else {
    backendMetrics.budget_score_computed = 10;
  }

  // Exact Skills Score Validation & Caps (Max 60 internally before LLM semantics)
  const totalReq = reqCritical.length + reqImportant.length + reqPreferred.length;
  let exactSkillScore = 60;
  
  if (totalReq > 0) {
    const totalMaxWeight = (reqCritical.length * 3) + (reqImportant.length * 2) + (reqPreferred.length * 1);
    const achievedWeight = backendMetrics.weightBreakdown.criticalWeight + backendMetrics.weightBreakdown.importantWeight + backendMetrics.weightBreakdown.preferredWeight;
    exactSkillScore = Math.round((achievedWeight / totalMaxWeight) * 60);
  }

  // Enforce Hard Caps BEFORE LLM Semantic augmentation
  if (backendMetrics.criticalMissing === 1) {
    backendMetrics.appliedCap = "Max 85";
    backendMetrics.capReasoning = "1 Critical requirement missing.";
  } else if (backendMetrics.criticalMissing === 2) {
    backendMetrics.appliedCap = "Max 75";
    backendMetrics.capReasoning = "2 Critical requirements missing.";
  } else if (backendMetrics.criticalMissing >= 3) {
    backendMetrics.appliedCap = "Max 60";
    backendMetrics.capReasoning = "3 or more Critical requirements missing.";
  }

  // Call the multi-LLM consensus service
  const evalStartTime = Date.now();
  try {
    const result = await aiService.scoreCandidateMultiLLM(candidateSummary, jobSummary, backendMetrics);

    if (!result || !result.finalJson) {
      throw new Error("Evaluation returned null");
    }

    const evaluation = result.finalJson;
    const llmDurationMs = Date.now() - evalStartTime;

    // --- SCORE VALIDATION & RECALCULATION ---
    // Read scores directly from the LLM response to avoid hardcoded evaluation rules
    let experienceScore = typeof evaluation.experience_fit_score === 'number' ? evaluation.experience_fit_score : backendMetrics.experience_score_computed;
    let budgetScore = typeof evaluation.budget_fit_score === 'number' ? evaluation.budget_fit_score : backendMetrics.budget_score_computed;
    let skillsScore = typeof evaluation.skill_fit_score === 'number' ? evaluation.skill_fit_score : (exactSkillScore + Math.min(15, (Array.isArray(evaluation.semantic_matches) ? evaluation.semantic_matches.length : 0) * 2) + Math.min(15, (Array.isArray(evaluation.practical_matches) ? evaluation.practical_matches.length : 0) * 2));
    let finalScore = typeof evaluation.match_score === 'number' ? evaluation.match_score : Math.round((skillsScore * 0.6) + (experienceScore * 0.2) + (budgetScore * 0.2));

    const semanticMatchesCount = Array.isArray(evaluation.semantic_matches) ? evaluation.semantic_matches.length : 0;
    const practicalMatchesCount = Array.isArray(evaluation.practical_matches) ? evaluation.practical_matches.length : 0;
    const semanticScore = Math.min(15, semanticMatchesCount * 2);
    const practicalScore = Math.min(15, practicalMatchesCount * 2);

    // Enforce Hiring Decision thresholds dynamically based on the final score
    let hiringDecision = "Reject";
    if (finalScore >= 90) hiringDecision = "Strong Hire";
    else if (finalScore >= 80) hiringDecision = "Hire";
    else if (finalScore >= 70) hiringDecision = "Borderline";
    else if (finalScore >= 60) hiringDecision = "Consider if Talent Pool is Limited";

    // Format rich objects for the frontend
    const richExperienceScore = {
      score: experienceScore,
      required: reqExp,
      candidate: candExp,
      difference: backendMetrics.experience_difference_years,
      percentage: "N/A",
      reason: evaluation.reasoning?.experience || "Calculated deterministically"
    };

    const richSkillsScore = {
      score: skillsScore,
      exact_match_score: exactSkillScore,
      semantic_match_score: semanticScore,
      practical_match_score: practicalScore,
      required_skills_count: totalReq,
      exact_matches: backendMetrics.exact_matches,
      semantic_matches: evaluation.semantic_matches || [],
      transferable_matches: [],
      practical_matches: evaluation.practical_matches || [],
      missing_skills: backendMetrics.missingRequiredSkills,
      missing_preferred: backendMetrics.missingPreferredSkills,
      matched_responsibilities: backendMetrics.matchedResponsibilities,
      reason: evaluation.reasoning?.skills || "Calculated deterministically + LLM augmentation"
    };

    const richBudgetScore = {
      score: budgetScore,
      jd_budget: jdBudget,
      candidate_budget: candBudget,
      difference: backendMetrics.budget_difference_percent + "%",
      reason: evaluation.reasoning?.budget || "Calculated deterministically"
    };

    const fallbackStrengths = [];
    if (backendMetrics.exact_matches.length > 0) fallbackStrengths.push(`Strong exact matches including ${backendMetrics.exact_matches.slice(0, 2).join(', ')}.`);
    if (backendMetrics.experience_difference_years >= 0) fallbackStrengths.push("Exceeds minimum experience requirement.");
    if (fallbackStrengths.length === 0) fallbackStrengths.push("Candidate meets baseline criteria.");

    const fallbackRisks = [];
    if (backendMetrics.missingRequiredSkills.length > 0) fallbackRisks.push(`Missing critical skills: ${backendMetrics.missingRequiredSkills.slice(0, 2).join(', ')}.`);
    if (backendMetrics.experience_difference_years < 0) fallbackRisks.push(`Experience gap of ${Math.abs(backendMetrics.experience_difference_years)} years.`);
    if (backendMetrics.budget_difference_percent > 0) fallbackRisks.push(`Budget exceeds requirement by ${backendMetrics.budget_difference_percent}%.`);
    if (backendMetrics.appliedCap !== "None") fallbackRisks.push(backendMetrics.capReasoning);
    if (fallbackRisks.length === 0) fallbackRisks.push("No major risks identified.");

    const rawBreakdown = {
      experienceFit: richExperienceScore,
      skillFit: richSkillsScore,
      budgetFit: richBudgetScore,
      hiringDecision: hiringDecision,
      confidence: evaluation.confidence || 0,
      bulleted_summary: evaluation.bulleted_summary || [],
      top_strengths: (evaluation.top_strengths && evaluation.top_strengths.length > 0) ? evaluation.top_strengths : fallbackStrengths,
      top_risks: (evaluation.top_risks && evaluation.top_risks.length > 0) ? evaluation.top_risks : fallbackRisks,
      hiring_manager_summary: evaluation.hiring_manager_summary || "",
      semanticFit: finalScore,
      rawOutputs: result.rawOutputs,
      backendMetrics: {
        exactMatchCount: backendMetrics.exactMatchCount,
        normalizedMatchCount: backendMetrics.normalizedMatchCount,
        substringMatchCount: backendMetrics.substringMatchCount,
        semanticMatchCount: semanticMatchesCount,
        practicalMatchCount: practicalMatchesCount,
        criticalMatched: backendMetrics.criticalMatched,
        criticalMissing: backendMetrics.criticalMissing,
        appliedCap: backendMetrics.appliedCap
      }
    };

    // Normalize breakdown through canonical schema before DB write
    const breakdown = normalizeBreakdown(rawBreakdown);
    const rationale = evaluation.reasoning?.overall || "Calculated based on hierarchical knowledge sets and multi-stage semantic extraction.";

    // Insert or Update the match record
    const [existingMatch] = await pool.query(
      'SELECT id, retry_count FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
      [jobId, candidateId]
    );

    if (existingMatch.length > 0) {
      await pool.query(`
        UPDATE job_candidate_matches 
        SET llm_score = ?, semantic_score = ?, match_breakdown = ?, rationale = ?,
            evaluation_status = 'COMPLETED', retry_count = ?, last_error = NULL
        WHERE id = ?
      `, [finalScore, finalScore, JSON.stringify(breakdown), rationale, (existingMatch[0].retry_count || 0) + 1, existingMatch[0].id]);
    } else {
      await pool.query(`
        INSERT INTO job_candidate_matches 
        (job_id, candidate_id, semantic_score, llm_score, match_breakdown, rationale, evaluation_status, retry_count) 
        VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', 1)
      `, [jobId, candidateId, finalScore, finalScore, JSON.stringify(breakdown), rationale]);
    }

    // Insert or Update in the jd_comparisons table
    await pool.query(`
      INSERT INTO jd_comparisons (jd_id, candidate_id, llm_score, match_breakdown, rationale)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      llm_score = VALUES(llm_score),
      match_breakdown = VALUES(match_breakdown),
      rationale = VALUES(rationale)
    `, [jobId, candidateId, finalScore, JSON.stringify(breakdown), rationale]);

    logEvaluation({
      candidateId, jobId, stage: 'STAGE_2', durationMs: llmDurationMs,
      success: true, retryCount: (existingMatch.length > 0 ? (existingMatch[0].retry_count || 0) + 1 : 1)
    });

    return { success: true, score: finalScore, llm_score: finalScore, breakdown, rationale, cacheHit: false };
  } catch (error) {
    const llmDurationMs = Date.now() - evalStartTime;

    logEvaluation({
      candidateId, jobId, stage: 'STAGE_2', durationMs: llmDurationMs,
      success: false, failureReason: error.message
    });

    // Store failure metadata in the database instead of silently losing the candidate
    try {
      const [existingMatch] = await pool.query(
        'SELECT id, retry_count FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
        [jobId, candidateId]
      );

      if (existingMatch.length > 0) {
        await pool.query(`
          UPDATE job_candidate_matches 
          SET evaluation_status = 'FAILED', retry_count = ?, last_error = ?
          WHERE id = ?
        `, [(existingMatch[0].retry_count || 0) + 1, error.message, existingMatch[0].id]);
      } else {
        await pool.query(`
          INSERT INTO job_candidate_matches 
          (job_id, candidate_id, evaluation_status, retry_count, last_error) 
          VALUES (?, ?, 'FAILED', 1, ?)
        `, [jobId, candidateId, error.message]);
      }
    } catch (dbErr) {
      console.error(`Failed to store failure metadata for candidate ${candidateId}:`, dbErr.message);
    }

    // Return structured failure instead of throwing — candidate must not disappear
    return { success: false, score: null, llm_score: null, breakdown: null, rationale: null, error: error.message };
  }
}

/**
 * Retry failed evaluations for a specific job.
 * Only re-evaluates candidates with evaluation_status = 'FAILED'.
 */
async function retryFailedEvaluations(jobId) {
  const [failedRows] = await pool.query(
    'SELECT candidate_id, retry_count FROM job_candidate_matches WHERE job_id = ? AND evaluation_status = ?',
    [jobId, 'FAILED']
  );

  if (failedRows.length === 0) {
    return { retried: 0, succeeded: 0, failed: 0, details: [] };
  }

  const batchStart = Date.now();
  const details = [];

  const results = await Promise.allSettled(
    failedRows.map(async (row) => {
      const result = await calculateStage2Match(jobId, row.candidate_id, 0, null);
      return { candidateId: row.candidate_id, result };
    })
  );

  let succeeded = 0;
  let failed = 0;

  for (const settledResult of results) {
    if (settledResult.status === 'fulfilled') {
      const { candidateId, result } = settledResult.value;
      if (result.success) {
        succeeded++;
        details.push({ candidateId, status: 'COMPLETED' });
      } else {
        failed++;
        details.push({ candidateId, status: 'FAILED', error: result.error });
      }
    } else {
      failed++;
      details.push({ candidateId: null, status: 'FAILED', error: settledResult.reason?.message || 'Unknown error' });
    }
  }

  logBatchSummary({
    jobId,
    totalCandidates: failedRows.length,
    evaluated: failedRows.length,
    succeeded,
    failed,
    totalDurationMs: Date.now() - batchStart
  });

  return { retried: failedRows.length, succeeded, failed, details };
}

module.exports = {
  calculateStage1Matches,
  calculateStage2Match,
  retryFailedEvaluations
};