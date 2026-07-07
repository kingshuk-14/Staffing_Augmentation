/**
 * evaluationLogger.js
 * 
 * Structured logging for the candidate evaluation pipeline.
 * Outputs JSON log lines for easy parsing by log aggregators.
 */

/**
 * Log a structured evaluation event.
 * 
 * @param {object} data - Log data
 * @param {number} data.candidateId - Candidate ID
 * @param {number} data.jobId - Job ID
 * @param {string} data.stage - 'STAGE_1' | 'STAGE_2' | 'RETRY' | 'CACHE_HIT' | 'CACHE_MISS' | 'MIGRATION'
 * @param {number} [data.durationMs] - Duration in milliseconds
 * @param {boolean} [data.cacheHit] - Whether a cache hit occurred
 * @param {boolean} [data.success] - Whether the operation succeeded
 * @param {string} [data.failureReason] - Error message if failed
 * @param {number} [data.retryCount] - Current retry attempt number
 * @param {string} [data.detail] - Additional context
 */
function logEvaluation(data) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'matching-engine',
    level: data.success === false ? 'ERROR' : 'INFO',
    candidateId: data.candidateId || null,
    jobId: data.jobId || null,
    stage: data.stage || 'UNKNOWN',
    durationMs: data.durationMs || null,
    cacheHit: data.cacheHit || false,
    success: data.success !== undefined ? data.success : true,
    failureReason: data.failureReason || null,
    retryCount: data.retryCount || 0,
    detail: data.detail || null
  };

  if (entry.level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Log a batch evaluation summary.
 */
function logBatchSummary(data) {
  const entry = {
    timestamp: new Date().toISOString(),
    service: 'matching-engine',
    level: 'INFO',
    stage: 'BATCH_SUMMARY',
    jobId: data.jobId || null,
    totalCandidates: data.totalCandidates || 0,
    evaluated: data.evaluated || 0,
    succeeded: data.succeeded || 0,
    failed: data.failed || 0,
    cached: data.cached || 0,
    migrated: data.migrated || 0,
    totalDurationMs: data.totalDurationMs || null
  };

  console.log(JSON.stringify(entry));
}

module.exports = {
  logEvaluation,
  logBatchSummary
};
