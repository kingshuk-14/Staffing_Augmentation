/**
 * breakdownNormalizer.js
 * 
 * Single source of truth for the canonical matchBreakdown schema.
 * Handles legacy numeric formats, missing properties, null values,
 * and JSON string inputs. Every API response passes through this
 * before reaching the frontend.
 */

/**
 * Returns the canonical empty breakdown with every required property.
 */
function getCanonicalBreakdown() {
  return {
    experienceFit: {
      score: 0,
      required: 0,
      candidate: 0,
      difference: 0,
      percentage: "N/A",
      reason: ""
    },
    skillFit: {
      score: 0,
      exact_match_score: 0,
      semantic_match_score: 0,
      practical_match_score: 0,
      required_skills_count: 0,
      exact_matches: [],
      semantic_matches: [],
      transferable_matches: [],
      practical_matches: [],
      missing_skills: [],
      missing_preferred: [],
      matched_responsibilities: [],
      reason: ""
    },
    budgetFit: {
      score: 0,
      jd_budget: null,
      candidate_budget: null,
      difference: null,
      reason: ""
    },
    hiringDecision: "Borderline",
    confidence: 0,
    bulleted_summary: [],
    top_strengths: [],
    top_risks: [],
    hiring_manager_summary: "",
    semanticFit: 0,
    rawOutputs: [],
    backendMetrics: {
      exactMatchCount: 0,
      normalizedMatchCount: 0,
      substringMatchCount: 0,
      semanticMatchCount: 0,
      practicalMatchCount: 0,
      criticalMatched: 0,
      criticalMissing: 0,
      appliedCap: "None"
    }
  };
}

/**
 * Checks if a breakdown conforms to the canonical schema.
 * Returns false if any of the three fit objects are plain numbers
 * or missing entirely.
 */
function isValidBreakdown(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') return false;

  const { skillFit, experienceFit, budgetFit } = breakdown;

  // Legacy format: numeric values instead of objects
  if (typeof skillFit === 'number') return false;
  if (typeof experienceFit === 'number') return false;
  if (typeof budgetFit === 'number') return false;

  // Missing entirely
  if (!skillFit || typeof skillFit !== 'object') return false;
  if (!experienceFit || typeof experienceFit !== 'object') return false;
  if (!budgetFit || typeof budgetFit !== 'object') return false;

  // Check required nested properties exist
  if (typeof skillFit.score !== 'number') return false;
  if (typeof experienceFit.score !== 'number') return false;
  if (typeof budgetFit.score !== 'number') return false;

  return true;
}

/**
 * Normalizes a fit sub-object. If the input is a number (legacy),
 * wraps it in the canonical shape. If it's an object, merges with defaults.
 */
function normalizeFitObject(raw, defaults) {
  if (raw === null || raw === undefined) {
    return { ...defaults };
  }

  // Legacy: plain number → wrap into canonical shape
  if (typeof raw === 'number') {
    return { ...defaults, score: raw };
  }

  // Object: merge defaults under the existing values
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (raw[key] !== undefined && raw[key] !== null) {
        result[key] = raw[key];
      }
    }
    // Preserve extra keys from the raw object (forward compatibility)
    for (const key of Object.keys(raw)) {
      if (result[key] === undefined) {
        result[key] = raw[key];
      }
    }
    return result;
  }

  return { ...defaults };
}

/**
 * Normalizes any matchBreakdown into the canonical schema.
 * Handles: null, undefined, JSON strings, legacy numeric formats,
 * partially-populated objects, and fully-conformant objects.
 * 
 * @param {any} raw - The raw matchBreakdown from the database or Stage 1
 * @returns {object} A guaranteed-conformant canonical breakdown
 */
function normalizeBreakdown(raw) {
  const canonical = getCanonicalBreakdown();

  // Handle null/undefined
  if (!raw) return canonical;

  // Handle JSON strings
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return canonical;
    }
  }

  // Handle non-objects
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return canonical;
  }

  // Normalize the three fit sub-objects
  const result = {
    experienceFit: normalizeFitObject(raw.experienceFit, canonical.experienceFit),
    skillFit: normalizeFitObject(raw.skillFit, canonical.skillFit),
    budgetFit: normalizeFitObject(raw.budgetFit, canonical.budgetFit),

    // Top-level scalar and array properties with defaults
    hiringDecision: raw.hiringDecision || canonical.hiringDecision,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : canonical.confidence,
    bulleted_summary: Array.isArray(raw.bulleted_summary) ? raw.bulleted_summary : canonical.bulleted_summary,
    top_strengths: Array.isArray(raw.top_strengths) ? raw.top_strengths : canonical.top_strengths,
    top_risks: Array.isArray(raw.top_risks) ? raw.top_risks : canonical.top_risks,
    hiring_manager_summary: raw.hiring_manager_summary || canonical.hiring_manager_summary,
    semanticFit: typeof raw.semanticFit === 'number' ? raw.semanticFit : canonical.semanticFit,
    rawOutputs: Array.isArray(raw.rawOutputs) ? raw.rawOutputs : canonical.rawOutputs,
    backendMetrics: raw.backendMetrics && typeof raw.backendMetrics === 'object'
      ? { ...canonical.backendMetrics, ...raw.backendMetrics }
      : canonical.backendMetrics
  };

  // Ensure skillFit arrays are always arrays
  const skillArrayKeys = [
    'exact_matches', 'semantic_matches', 'transferable_matches',
    'practical_matches', 'missing_skills', 'missing_preferred',
    'matched_responsibilities'
  ];
  for (const key of skillArrayKeys) {
    if (!Array.isArray(result.skillFit[key])) {
      result.skillFit[key] = canonical.skillFit[key];
    }
  }

  return result;
}

module.exports = {
  getCanonicalBreakdown,
  isValidBreakdown,
  normalizeBreakdown
};
