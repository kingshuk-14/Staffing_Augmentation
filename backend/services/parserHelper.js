/**
 * Helper utilities for resume and document text parsing
 */

/**
 * Clean and compress extracted text to optimize token usage.
 * Removes excessive whitespace, tabs, and consecutive blank lines
 * while preserving paragraph and line structures.
 * @param {string} text 
 * @returns {string}
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/[ \t]+/g, ' ')          // Compress horizontal spaces/tabs
    .replace(/\r/g, '')               // Normalize line endings
    .replace(/\n\s*\n/g, '\n')        // Compress multiple blank lines to a single newline
    .trim();
}

module.exports = {
  cleanText
};
