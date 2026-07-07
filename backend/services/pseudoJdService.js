const pool = require('../db');
const aiService = require('./aiService');
const { normalizeString } = require('./normalizationService');

/**
 * Normalizes different role inputs into a standard role name.
 */
async function standardizeRole(primarySkill) {
  const systemPrompt = `You are a technical recruiter. Your task is to normalize the given job title or primary skill into a single standard job role name.
  Examples:
  - "SAP PP", "SAP Production Planning", "SAP PP QM", "SAP PP/QM Consultant" -> "SAP PP/QM Consultant"
  - "Java Dev", "Java Backend Developer", "Java Software Engineer" -> "Java Backend Developer"
  
  Return ONLY a valid JSON object matching this structure:
  {
    "standardRole": "...",
    "synonyms": ["...", "..."]
  }`;
  
  const userPrompt = `Normalize this primary skill or role: "${primarySkill}"`;
  
  try {
    const result = await aiService.executeConsensus(systemPrompt, userPrompt, "Output JSON only");
    if (result && result.finalJson) {
      return {
        standardRole: result.finalJson.standardRole || primarySkill + " Consultant",
        synonyms: result.finalJson.synonyms || [primarySkill]
      };
    }
  } catch (error) {
    console.error("Error standardizing role with LLM:", error);
  }
  
  return {
    standardRole: primarySkill + " Consultant",
    synonyms: [primarySkill]
  };
}

/**
 * Pipeline to generate Pseudo Job Description.
 */
async function generatePseudoJd(inputs, config = {}) {
  const {
    primarySkill,
    experience,
    secondarySkills = [],
    location = "",
    industry = "",
    clientName = "",
    employmentType = "",
    additionalNotes = ""
  } = inputs;

  const mandatoryThreshold = config.mandatoryThreshold || 0.70;
  const preferredThreshold = config.preferredThreshold || 0.30;

  // Step 1: Standardize Job Role
  const { standardRole, synonyms } = await standardizeRole(primarySkill);

  // Step 2: Retrieve Historical JDs
  const [historicalJds] = await pool.query(
    "SELECT id, title, raw_text, parsed_summary, experience_years FROM jobs WHERE is_pseudo = FALSE OR is_pseudo IS NULL"
  );

  // Step 3: Filter Relevant JDs
  const targetExp = parseInt(experience.toString().replace(/[^0-9]/g, '')) || 0;
  const searchTerms = [standardRole, primarySkill, ...synonyms, ...(Array.isArray(secondarySkills) ? secondarySkills : [])].map(t => t.toLowerCase());

  let filteredJds = historicalJds.filter(jd => {
    // Filter by experience (+/- 2 years)
    if (jd.experience_years !== null) {
      const expDiff = Math.abs(jd.experience_years - targetExp);
      if (expDiff > 2) return false;
    }
    
    // Filter by similarity / keyword overlap
    const titleMatch = searchTerms.some(term => jd.title.toLowerCase().includes(term));
    const textMatch = jd.raw_text ? searchTerms.some(term => jd.raw_text.toLowerCase().includes(term)) : false;
    return titleMatch || textMatch;
  });

  // If we don't have enough matches, fall back to matching by just primary skill / title keywords
  if (filteredJds.length === 0) {
    const primaryLower = primarySkill.toLowerCase();
    filteredJds = historicalJds.filter(jd => 
      jd.title.toLowerCase().includes(primaryLower) || 
      (jd.raw_text && jd.raw_text.toLowerCase().includes(primaryLower))
    );
  }

  // Remove duplicates by title
  const seenTitles = new Set();
  filteredJds = filteredJds.filter(jd => {
    const titleNorm = jd.title.trim().toLowerCase();
    if (seenTitles.has(titleNorm)) return false;
    seenTitles.add(titleNorm);
    return true;
  });

  // Limit to top 5 relevant historical JDs to manage token usage
  filteredJds = filteredJds.slice(0, 5);

  let extractedData = [];
  if (filteredJds.length > 0) {
    // Step 4: Extract Structured Information from historical JDs
    const jdTexts = filteredJds.map((jd, idx) => `JD #${idx+1} [Title: ${jd.title}]:\n${jd.raw_text || ''}`).join('\n\n---\n\n');
    
    const extractionSystemPrompt = `You are a technical recruiting parser. Analyze the historical job descriptions provided and extract structured info.
    Return ONLY a valid JSON object matching this structure:
    {
      "jds": [
        {
          "technicalSkills": ["skill1", "skill2"],
          "responsibilities": ["resp1", "resp2"],
          "tools": ["tool1", "tool2"],
          "sapVersions": ["version1"],
          "projectTypes": ["type1"],
          "industries": ["ind1"],
          "certifications": ["cert1"],
          "softSkills": ["soft1"]
        }
      ]
    }`;

    const extractionUserPrompt = `Extract structured details for these historical JDs:\n\n${jdTexts}`;
    
    try {
      const result = await aiService.executeConsensus(extractionSystemPrompt, extractionUserPrompt, "Extract fields for each JD");
      if (result && result.finalJson && Array.isArray(result.finalJson.jds)) {
        extractedData = result.finalJson.jds;
      }
    } catch (e) {
      console.error("Error extracting structured details from historical JDs:", e);
    }
  }

  // Step 5: Aggregate Historical Knowledge
  // Helper to aggregate arrays
  const aggregateField = (itemsList) => {
    const counts = {};
    const displayValues = {}; // map normalized key back to most frequent original casing
    
    itemsList.forEach(items => {
      if (!Array.isArray(items)) return;
      const seenInThisJd = new Set();
      items.forEach(item => {
        if (!item || item === "Not Found") return;
        const norm = normalizeString(item);
        if (!norm) return;
        seenInThisJd.add(norm);
        
        // Count overall frequency across JDs
        counts[norm] = (counts[norm] || 0) + 1;
        
        // Save the casing
        displayValues[norm] = displayValues[norm] || {};
        displayValues[norm][item] = (displayValues[norm][item] || 0) + 1;
      });
    });

    const totalJds = Math.max(1, extractedData.length);
    const aggregated = Object.keys(counts).map(norm => {
      // Find the most popular original casing
      const casings = displayValues[norm];
      const bestCasing = Object.keys(casings).reduce((a, b) => casings[a] > casings[b] ? a : b);
      const freq = counts[norm] / totalJds;
      
      return {
        value: bestCasing,
        frequency: Math.round(freq * 100),
        confidence: Math.round(freq * 100) // basic confidence based on frequency
      };
    });

    return aggregated.sort((a, b) => b.frequency - a.frequency);
  };

  const allTechSkills = extractedData.map(d => d.technicalSkills || []);
  const allResps = extractedData.map(d => d.responsibilities || []);
  const allTools = extractedData.map(d => d.tools || []);
  const allVersions = extractedData.map(d => d.sapVersions || []);
  const allProjectTypes = extractedData.map(d => d.projectTypes || []);
  const allIndustries = extractedData.map(d => d.industries || []);
  const allCerts = extractedData.map(d => d.certifications || []);
  const allSoft = extractedData.map(d => d.softSkills || []);

  const aggSkills = aggregateField(allTechSkills);
  const aggResps = aggregateField(allResps);
  const aggTools = aggregateField(allTools);
  const aggVersions = aggregateField(allVersions);
  const aggProjectTypes = aggregateField(allProjectTypes);
  const aggIndustries = aggregateField(allIndustries);
  const aggCerts = aggregateField(allCerts);
  const aggSoft = aggregateField(allSoft);

  // Step 6: Classify Requirements (Mandatory/Preferred/Optional)
  const mandatorySkills = aggSkills.filter(s => s.frequency >= (mandatoryThreshold * 100)).map(s => s.value);
  const preferredSkills = aggSkills.filter(s => s.frequency >= (preferredThreshold * 100) && s.frequency < (mandatoryThreshold * 100)).map(s => s.value);
  const optionalSkills = aggSkills.filter(s => s.frequency < (preferredThreshold * 100)).map(s => s.value);

  // Step 7: Infer Missing Job Attributes
  // We call LLM to predict missing inputs from inputs + aggregated historical trends
  const inferenceSystemPrompt = `You are a recruiting intelligence engine. Based on the target primary skill, standardized role, and aggregated historical facts, infer the missing job attributes.
  Attributes to infer:
  - projectType (e.g. Implementation, Support, Rollout, Upgrade)
  - industry (e.g. Manufacturing, Automotive, Retail)
  - sapVersion (e.g. S/4HANA, ECC 6.0)
  - clientFacingRequirement (e.g. High, Medium, Low)
  - teamSize (e.g. 5-10 members)
  - travelRequirement (e.g. Occasional, None, High)
  - workMode (e.g. Hybrid, Remote, On-site)

  For each prediction, provide a confidence score (0-100%).
  Return ONLY a valid JSON object with this exact structure:
  {
    "projectType": { "value": "...", "confidence": 80 },
    "industry": { "value": "...", "confidence": 85 },
    "sapVersion": { "value": "...", "confidence": 90 },
    "clientFacingRequirement": { "value": "...", "confidence": 75 },
    "teamSize": { "value": "...", "confidence": 60 },
    "travelRequirement": { "value": "...", "confidence": 70 },
    "workMode": { "value": "...", "confidence": 80 }
  }`;

  const inferenceUserPrompt = `
  Target Job Details:
  - Standardized Role: ${standardRole}
  - Primary Skill: ${primarySkill}
  - Experience Required: ${experience}
  - Secondary Skills: ${secondarySkills.join(', ')}
  - Location: ${location || 'Not Specified'}
  - Industry (input): ${industry || 'Not Specified'}
  - Employment Type: ${employmentType || 'Not Specified'}
  
  Aggregated Historical Trends:
  - Project Types Found: ${aggProjectTypes.slice(0, 3).map(p => `${p.value} (${p.frequency}%)`).join(', ')}
  - Industries Found: ${aggIndustries.slice(0, 3).map(i => `${i.value} (${i.frequency}%)`).join(', ')}
  - SAP Versions Found: ${aggVersions.slice(0, 3).map(v => `${v.value} (${v.frequency}%)`).join(', ')}
  `;

  let inferredAttributes = {
    projectType: { value: "Implementation", confidence: 50 },
    industry: { value: industry || "Manufacturing", confidence: 50 },
    sapVersion: { value: "S/4HANA", confidence: 50 },
    clientFacingRequirement: { value: "Medium", confidence: 50 },
    teamSize: { value: "5-10 members", confidence: 50 },
    travelRequirement: { value: "Occasional", confidence: 50 },
    workMode: { value: "Hybrid", confidence: 50 }
  };

  try {
    const inferResult = await aiService.executeConsensus(inferenceSystemPrompt, inferenceUserPrompt, "Predict missing job attributes");
    if (inferResult && inferResult.finalJson) {
      inferredAttributes = { ...inferredAttributes, ...inferResult.finalJson };
    }
  } catch (e) {
    console.error("Error predicting missing attributes:", e);
  }

  const generationSystemPrompt = `You are a professional hiring manager and JD writer.
  Your task is to write a highly professional, comprehensive, client-ready Job Description based on the provided details.
  The output MUST contain:
  1. Job Title
  2. Experience Requirement
  3. Job Summary
  4. Key Responsibilities
  5. Mandatory Technical Skills
  6. Preferred Technical Skills
  7. Project Context
  8. Predicted Assumptions
  9. Confidence Score (integer between 0 and 100)

  CRITICAL CURRENCY RULE: All currency and budget details (such as salary ranges, package structures, annual budgets, etc.) MUST be strictly expressed in Indian Rupees (INR / ₹), using Indian formatting (e.g. ₹X Lakhs per annum / LPA or ₹X Crores). Do NOT mention USD or other currencies.

  CRITICAL: Return ONLY a valid JSON object matching this structure exactly:
  {
    "jobTitle": "...",
    "experience": "...",
    "jobSummary": "...",
    "responsibilities": ["...", "..."],
    "mandatorySkills": ["...", "..."],
    "preferredSkills": ["...", "..."],
    "projectContext": "...",
    "predictedAssumptions": ["...", "..."],
    "overallConfidenceScore": 85,
    "rawJdText": "..."
  }
  
  The "rawJdText" should be a fully formatted, human-readable markdown string containing all the JD details (Summary, Responsibilities, Skills, Context, etc.) styled professionally as a real job description.`;

  const generationUserPrompt = `
  Inputs:
  - Standardized Role: ${standardRole}
  - Experience Required: ${experience}
  - Primary Skill: ${primarySkill}
  - Secondary Skills: ${secondarySkills.join(', ')}
  - Location: ${location || 'Not Specified'}
  - Industry: ${inferredAttributes.industry.value}
  - Client Name: ${clientName || 'Confidential Client'}
  - Employment Type: ${employmentType || 'Full-time'}
  - Additional Notes: ${additionalNotes || 'None'}
  
  Aggregated Technical Knowledge:
  - Mandatory Skills: ${mandatorySkills.join(', ') || primarySkill}
  - Preferred Skills: ${preferredSkills.join(', ') || 'None listed'}
  - Common Tools: ${aggTools.slice(0, 5).map(t => t.value).join(', ')}
  - Top Responsibilities: ${aggResps.slice(0, 5).map(r => r.value).join('; ')}
  
  Inferred Assumptions:
  - Project Type: ${inferredAttributes.projectType.value} (Confidence: ${inferredAttributes.projectType.confidence}%)
  - SAP Version: ${inferredAttributes.sapVersion.value} (Confidence: ${inferredAttributes.sapVersion.confidence}%)
  - Client Facing: ${inferredAttributes.clientFacingRequirement.value} (Confidence: ${inferredAttributes.clientFacingRequirement.confidence}%)
  - Team Size: ${inferredAttributes.teamSize.value} (Confidence: ${inferredAttributes.teamSize.confidence}%)
  - Travel: ${inferredAttributes.travelRequirement.value} (Confidence: ${inferredAttributes.travelRequirement.confidence}%)
  - Work Mode: ${inferredAttributes.workMode.value} (Confidence: ${inferredAttributes.workMode.confidence}%)
  `;

  let finalJdResult = null;
  try {
    const genResponse = await aiService.executeConsensus(generationSystemPrompt, generationUserPrompt, "Generate final Pseudo JD JSON");
    if (genResponse && genResponse.finalJson) {
      finalJdResult = genResponse.finalJson;
    }
  } catch (e) {
    console.error("Error generating final Pseudo JD text:", e);
  }

  if (!finalJdResult) {
    // Basic fallback if generation failed
    finalJdResult = {
      jobTitle: standardRole,
      experience: experience,
      jobSummary: `Looking for a skilled ${standardRole} with ${experience} years experience.`,
      responsibilities: ["Responsible for configuring and supporting systems."],
      mandatorySkills: [primarySkill],
      preferredSkills: secondarySkills,
      projectContext: `This is a project in ${inferredAttributes.industry.value} industry.`,
      predictedAssumptions: ["Assumed Hybrid work mode", `Assumed ${inferredAttributes.sapVersion.value} environment`],
      overallConfidenceScore: 60,
      rawJdText: `# ${standardRole}\n\nExperience: ${experience}\n\nSummary:\nLooking for a skilled ${standardRole}...`
    };
  }

  // Combine metadata to store
  const metadata = {
    inputs: { primarySkill, experience, secondarySkills, location, industry, clientName, employmentType, additionalNotes },
    standardRole,
    synonyms,
    historicalJdsUsed: filteredJds.map(f => ({ id: f.id, title: f.title })),
    parsedSkills: { mandatorySkills, preferredSkills, optionalSkills },
    extractedResponsibilities: aggResps.map(r => r.value),
    skillFrequencies: aggSkills,
    roleSynonyms: synonyms,
    inferredAttributes,
    predictedAssumptions: finalJdResult.predictedAssumptions,
    confidenceScore: finalJdResult.overallConfidenceScore
  };

  return {
    jobTitle: finalJdResult.jobTitle,
    rawJdText: finalJdResult.rawJdText,
    parsedSummary: {
      positions: [finalJdResult.jobTitle],
      experience_required: { minimum: targetExp.toString(), maximum: "" },
      critical_requirements: mandatorySkills.map(s => ({ category: "Technical Skill", priority: "Critical", match_type: "Skill", value: s })),
      important_requirements: finalJdResult.responsibilities.map(r => ({ category: "Responsibility", priority: "Important", match_type: "Practical", value: r })),
      preferred_requirements: preferredSkills.map(s => ({ category: "Tool", priority: "Preferred", match_type: "Normalized", value: s })),
      sap_modules: aggVersions.slice(0, 3).map(v => v.value),
      domains: aggIndustries.slice(0, 3).map(i => i.value),
      integrations: [],
      tools: aggTools.slice(0, 5).map(t => t.value),
      industry: [inferredAttributes.industry.value],
      locations: location ? [location] : [],
      work_mode: inferredAttributes.workMode.value,
      employment_type: employmentType || "Full-time",
      budget: "Not Found",
      certifications: aggCerts.slice(0, 3).map(c => c.value),
      summary: [finalJdResult.jobSummary],
      reasoning: "Generated dynamically via historical similarity engine"
    },
    metadata
  };
}

module.exports = {
  standardizeRole,
  generatePseudoJd
};
