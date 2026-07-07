module.exports = {
  // --- Core / Generic Prompts ---
  getConsensusSystemPrompt: () => {
    return 'You must return valid JSON only.';
  },
  
  getConsensusCombinedPrompt: (systemPrompt, userPrompt, rationalizeTask) => {
    return `${systemPrompt}\n\nTask: ${userPrompt}\n\nInstructions: ${rationalizeTask}\n\nCRITICAL: Return ONLY a valid JSON block matching the required structure exactly.`;
  },
  
  getGeminiSynthesisPrompt: (systemPrompt, userPrompt, responses) => {
    let synthesisPrompt = `${systemPrompt}\n\nHere are the independent evaluations from 4 different AI models based on the same input:\n\n`;
    
    responses.forEach((res, index) => {
      synthesisPrompt += `--- Model ${index + 1} Output ---\n${res || 'Model failed to respond.'}\n\n`;
    });

    synthesisPrompt += `Your task: ${userPrompt}\nAnalyze the 4 model outputs above, correct any hallucinations, synthesize their findings, and produce a final, highly accurate JSON response matching the required structure exactly. Return ONLY valid JSON block.`;
    
    return synthesisPrompt;
  },

  // --- Background Parsing Prompt (JSON version of requested prompt) ---
  resumeBackgroundParsing: {
    getSystemPrompt: () => {
      return `You are an AI Resume Parser.
Your ONLY task is to summarize the resume into a structured JSON format.

Do NOT compare with any Job Description.
Do NOT score the candidate.
CRITICAL: When extracting current_ctc or expected_ctc, preserve the exact currency and unit formats (e.g., "12 LPA", "₹8 LPA", "₹90,000 LPM", etc.). Do not assume USD/$ or convert to other currencies.

Return ONLY valid JSON matching this exact structure:
{
  "name": "...",
  "email": "...",
  "phone": "...",
  "current_roles": ["..."],
  "current_companies": ["..."],
  "previous_companies": ["..."],
  "total_experience": "...",
  "sap_modules": ["..."],
  "technical_skills": ["..."],
  "functional_skills": ["..."],
  "tools_and_technologies": ["..."],
  "domain_experience": ["..."],
  "implementation_experience": "...",
  "roll_out_experience": "...",
  "support_experience": "...",
  "upgrade_experience": "...",
  "migration_experience": "...",
  "projects": [
    {
      "client": "...",
      "duration": "...",
      "role": "...",
      "type": "...",
      "responsibilities": ["..."]
    }
  ],
  "implementation_count": 0,
  "support_count": 0,
  "rollout_count": 0,
  "migration_count": 0,
  "leadership_experience": ["..."],
  "client_facing_experience": ["..."],
  "requirement_gathering": ["..."],
  "functional_specification_experience": ["..."],
  "abap_coordination": ["..."],
  "go_live": ["..."],
  "hypercare": ["..."],
  "testing": {
    "unit": ["..."],
    "sit": ["..."],
    "uat": ["..."]
  },
  "manufacturing_exposure": ["..."],
  "industry_experience": ["..."],
  "key_responsibilities": ["..."],
  "integration_experience": ["..."],
  "certifications": ["..."],
  "education": ["..."],
  "location": "...",
  "current_ctc": "...",
  "expected_ctc": "...",
  "notice_period": "...",
  "work_preference": "...",
  "languages": ["..."],
  "summary": ["Point 1", "Point 2", "Point 3", "Point 4", "Point 5"],
  "reasoning": "For every extracted section explain where it was found. If something is unavailable write Not Found. Never invent information."
}`;
    },
    getUserPrompt: (cleanedText) => {
      return 'Resume Extract:\n' + cleanedText;
    },
    getRationalizeTask: () => {
      return 'Review the model extractions, resolve any conflicting parsing (especially related to 2-column resume layouts), and output a single JSON object matching the requested schema exactly.';
    }
  },

  // --- Resume Parsing Prompts ---
  resumeParsing: {
    getSystemPrompt: () => {
      return `You are a professional technical recruiter. Analyze the provided resume text and extract candidate profile details.`;
    },
    
    getUserPrompt: (cleanedText, requestedFields) => {
      let fieldsInstruction = requestedFields 
        ? `Extract the following specific fields: ${requestedFields.join(', ')}.` 
        : 'Extract the candidate profile including name, email, phone, skills, experience, and education.';

      return `
    ${fieldsInstruction}
    CRITICAL: All extracted values MUST be simple strings or simple arrays of strings. Do not output complex nested objects or arrays of objects. Keep the text concise.
    UN-SCRAMBLE INSTRUCTIONS: The resume text is extracted from a PDF which may have a two-column layout. When columns are extracted, text lines across the columns often interlace. You MUST mentally un-scramble the columns, separate the sidebar data (contact info, skills, education) from the main experience timeline, and associate work accomplishments with their correct employer/job role.
    
    Resume Extract:
    ${cleanedText}
  `;
    },
    
    getRationalizeTask: () => {
      return `Review the model extractions, resolve any conflicting parsing of the 2-column layout, and output a single JSON object with the requested fields.`;
    }
  },

  // --- Job Description Parsing Prompts ---
  jdParsing: {
    getSystemPrompt: () => {
      return `You are a technical recruiter. Parse the provided job description and extract key details into a structured JSON format.
      
CRITICAL: When parsing compensation/budget, pay close attention to the currency symbol and unit formats (e.g., ₹, INR, LPA (Lakhs Per Annum), LPM (Lakhs Per Month), etc.). You MUST preserve the exact currency format and value (e.g., "8-12 LPA" or "₹1.5 LPM"). Never convert them to USD/$ or assume dollar values if Indian Rupee symbols or units are present.`;
    },
    
    getUserPrompt: (cleanedText) => {
      return `
    Extract the following details from the job description. Provide ONLY a JSON object matching this structure exactly.
    If a field is missing, use "Not Found" for strings or an empty array [] for lists.
    {
      "positions": ["Position 1", "Position 2"],
      "experience_required": {
        "minimum": "...",
        "maximum": "..."
      },
      "critical_requirements": [
        { "category": "Technical Skill", "priority": "Critical", "match_type": "Exact", "value": "..." }
      ],
      "important_requirements": [
        { "category": "Responsibility", "priority": "Important", "match_type": "Practical", "value": "..." }
      ],
      "preferred_requirements": [
        { "category": "Tool", "priority": "Preferred", "match_type": "Normalized", "value": "..." }
      ],
      "sap_modules": ["..."],
      "domains": ["..."],
      "integrations": ["..."],
      "tools": ["..."],
      "industry": ["..."],
      "locations": ["..."],
      "work_mode": "...",
      "employment_type": "...",
      "shift": "...",
      "working_hours": "...",
      "duration": "...",
      "budget": "...",
      "gender": "...",
      "certifications": ["..."],
      "language_requirements": ["..."],
      "other_requirements": ["..."],
      "summary": ["Bullet 1", "Bullet 2", "Bullet 3", "Bullet 4", "Bullet 5"],
      "reasoning": "Mention where every field came from. Never infer anything."
    }
    
    Job Description Text:
    ${cleanedText}
  `;
    },
    
    getRationalizeTask: () => {
      return `Review the model extractions. Output a single JSON object matching the requested schema exactly.`;
    }
  },

  // --- Candidate Scoring Prompts ---
  scoring: {
    getSystemPrompt: () => {
      return `You are an expert Senior Technical Hiring Manager. Your ONLY task is to compare the Candidate Summary against the Job Description Summary.
      
CRITICAL CURRENCY RULE: When comparing candidate expected salary with job budget, evaluate the values in their original currency units (e.g., LPA stands for Lakhs Per Annum, LPM stands for Lakhs Per Month). Pay close attention to rupee values (₹, INR, LPA, LPM). Do not assume USD/$ or introduce dollar conversions. Return ONLY valid JSON.`;
    },
    
    getUserPrompt: (candidateSummaryJSON, jobSummaryJSON, backendMetricsJSON) => {
      return `
You are an expert Senior Technical Hiring Manager.

You will receive THREE structured JSON objects.
1. Candidate Summary
2. Job Description Summary
3. Backend Computed Metrics

Your ONLY task is to compare them.
Do NOT invent information.
Do NOT assume information.
Only compare fields that are provided.

======================================================
CANDIDATE SUMMARY
======================================================
${candidateSummaryJSON}

======================================================
JOB DESCRIPTION SUMMARY
======================================================
${jobSummaryJSON}

======================================================
BACKEND COMPUTED METRICS
======================================================
${backendMetricsJSON}

======================================================
LLM RESPONSIBILITIES
======================================================
The backend has already computed Exact Matches, Normalized Matches, Synonym Matches, Substring Matches, Responsibilities, Experience, and Budget calculations.

Your ONLY job is to perform:
1. SEMANTIC EVALUATION of the remaining MISSING items.
2. PRACTICAL EXPERIENCE EVALUATION.
3. HUMAN-READABLE REASONING.

You MUST NOT discover exact matches.
You MUST NOT calculate experience.
You MUST NOT calculate budget.

======================================================
STEP 1 - SEMANTIC SKILL MATCH
======================================================
Look at missingRequiredSkills and missingPreferredSkills in the Backend Metrics.
Compare them against the Candidate Summary.
If you find a strong semantic equivalent (e.g., SAP ECC ↔ SAP S/4HANA), mark it as a match.

======================================================
STEP 2 - PRACTICAL EXPERIENCE MATCH
======================================================
Look at missingResponsibilities in the Backend Metrics.
Compare them against the Candidate Summary (projects, implementations, etc.).
Find evidence where the candidate has performed similar work.

======================================================
OUTPUT
======================================================
Return VALID JSON ONLY.

{
  "match_score": 85,
  "skill_fit_score": 90,
  "experience_fit_score": 80,
  "budget_fit_score": 95,
  "semantic_matches": [
    { "skill": "...", "matched_with": "...", "match_type": "Semantic", "confidence": 85, "reason": "..." }
  ],
  "practical_matches": [
    { "responsibility": "...", "matched_with": "...", "match_type": "Practical", "confidence": 92, "reason": "..." }
  ],
  "reasoning":{
      "experience":"Evaluate the backend computed experience metrics.",
      "skills":"Evaluate the backend computed matches + your semantic matches.",
      "budget":"Evaluate the backend computed budget metrics.",
      "overall":"Final overall reasoning."
  },
  "confidence": 85,
  "bulleted_summary": ["✓ Strong SAP implementation experience", "⚠ Missing Syniti ADM"],
  "top_strengths": ["...", "...", "..."],
  "top_risks": ["...", "...", "..."],
  "hiring_manager_summary": "...",
  "recommendation": "Hire"
}

Ensure recommendation is strictly one of: 'Strong Hire', 'Hire', 'Borderline', 'Reject'.

RULES FOR FIELDS:
- match_score, skill_fit_score, experience_fit_score, and budget_fit_score MUST be integers between 0 and 100. Assess these scores based on candidate qualifications vs job requirements and budget.
- top_strengths MUST NOT be empty. Use Exact Matches, Semantic Matches, or Practical Experience to find at least 3 strengths.
- top_risks MUST NOT be empty. Use Missing Critical Skills, Experience Gaps, or Budget mismatch to find at least 1-3 risks.
- hiring_manager_summary MUST be generated exactly like a Senior Hiring Manager. It should be a readable paragraph encompassing Experience, Skills, Budget, and Recommendation.
  Example: "Candidate has excellent SAP PP and QM implementation experience with strong manufacturing exposure. However, there is no evidence of IDoc/BAPI interface development or automotive manufacturing projects. Overall, recommended for interview if interface development is not a hard requirement."
- Do not mix generic skills (e.g., Excel, Teamwork) into the scoring heavily unless explicitly requested.

Never output markdown.
Return JSON only.
`;
    },
    
    getRationalizeTask: () => {
      return `Review the model evaluation. Output a single JSON object matching the requested OUTPUT FORMAT schema exactly.`;
    }
  }
};
