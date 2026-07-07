/**
 * Knowledge Service
 * Recursively flattens Candidate Summaries and Job Summaries into a normalized string array (Knowledge Set).
 */
const { normalizeArrayToSet } = require('./normalizationService');

/**
 * Recursively extracts all string values from a JSON object.
 * 
 * @param {any} obj - The JSON object/array/value to traverse
 * @param {Set<string>} stringSet - A set to accumulate extracted strings
 */
function extractStringsRecursively(obj, stringSet) {
  if (!obj) return;

  if (typeof obj === 'string') {
    // Only add non-empty strings
    if (obj.trim()) {
      stringSet.add(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      extractStringsRecursively(item, stringSet);
    }
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      extractStringsRecursively(obj[key], stringSet);
    }
  }
}

/**
 * Generates a normalized Knowledge Set array from any JSON structure.
 * 
 * @param {Object} jsonSummary - The parsed summary from LLM
 * @returns {Array<string>} The flattened, normalized knowledge set
 */
function generateKnowledgeSet(jsonSummary) {
  if (!jsonSummary) return [];

  const stringSet = new Set();
  extractStringsRecursively(jsonSummary, stringSet);

  // Convert Set to Array, normalize everything, and convert back to Set to deduplicate normalized strings
  const rawStringsArray = Array.from(stringSet);
  const normalizedSet = normalizeArrayToSet(rawStringsArray);

  return Array.from(normalizedSet);
}

module.exports = {
  generateKnowledgeSet,
  extractStringsRecursively
};
