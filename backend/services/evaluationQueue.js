const pool = require('../db');
const { calculateStage2Match } = require('./matchingService');

class EvaluationQueue {
  constructor() {
    this.queue = []; // Array of { jobId, candidateId, candidateName, semanticScore, breakdown }
    this.isProcessing = false;
    this.progress = {}; // Map of jobId -> { total, completed, currentCandidateName }
  }

  // Add candidates to the queue for a job
  async addJob(jobId, candidates) {
    if (!candidates || candidates.length === 0) return;

    // 1. Filter candidates: only those with semantic score > 50%
    const eligibleCandidates = candidates.filter(c => {
      const score = c.semanticScore || c.semantic_score || 0;
      return score > 50;
    });

    // 2. Initialize progress if not already present
    if (!this.progress[jobId]) {
      this.progress[jobId] = {
        total: 0,
        completed: 0,
        currentCandidateName: null
      };
    }

    // 3. Update database status and queue candidate evaluations
    for (const cand of candidates) {
      const candidateId = cand.candidateId || cand.id;
      const semanticScore = cand.semanticScore || cand.semantic_score || 0;
      const breakdown = cand.breakdown || {};

      const [existingMatch] = await pool.query(
        'SELECT id, evaluation_status FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
        [jobId, candidateId]
      );

      if (semanticScore > 50) {
        // Must be evaluated
        if (existingMatch.length === 0) {
          await pool.query(`
            INSERT INTO job_candidate_matches 
            (job_id, candidate_id, semantic_score, evaluation_status, status) 
            VALUES (?, ?, ?, 'PENDING', 'SUGGESTED')
          `, [jobId, candidateId, semanticScore]);
        } else if (existingMatch[0].evaluation_status !== 'COMPLETED') {
          await pool.query(`
            UPDATE job_candidate_matches 
            SET evaluation_status = 'PENDING'
            WHERE id = ?
          `, [existingMatch[0].id]);
        }

        // Check if candidate is already in memory queue
        const inQueue = this.queue.some(item => item.jobId === jobId && item.candidateId === candidateId);
        if (!inQueue) {
          this.queue.push({
            jobId,
            candidateId,
            candidateName: cand.candidateName || cand.name || `Candidate #${candidateId}`,
            semanticScore,
            breakdown
          });
          this.progress[jobId].total++;
        }
      } else {
        // Skip from LLM analysis as semantic match is low (avoid wasting tokens)
        if (existingMatch.length === 0) {
          await pool.query(`
            INSERT INTO job_candidate_matches 
            (job_id, candidate_id, semantic_score, evaluation_status, status) 
            VALUES (?, ?, ?, 'SKIPPED', 'SUGGESTED')
          `, [jobId, candidateId, semanticScore]);
        } else if (existingMatch[0].evaluation_status === 'PENDING') {
          await pool.query(`
            UPDATE job_candidate_matches 
            SET evaluation_status = 'SKIPPED'
            WHERE id = ?
          `, [existingMatch[0].id]);
        }
      }
    }

    // 4. Start worker if not currently processing
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  // Get current progress for a job
  getProgress(jobId) {
    return this.progress[jobId] || { total: 0, completed: 0, currentCandidateName: null };
  }

  // Sequential queue worker
  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();
    const { jobId, candidateId, candidateName, semanticScore, breakdown } = task;

    // Update progress state
    if (this.progress[jobId]) {
      this.progress[jobId].currentCandidateName = candidateName;
    }

    try {
      console.log(`[Queue] Evaluating Candidate: ${candidateName} for Job #${jobId}...`);
      const result = await calculateStage2Match(jobId, candidateId, semanticScore, breakdown);
      
      if (this.progress[jobId]) {
        this.progress[jobId].completed++;
      }
      
      // If it was a cache hit, wait 500ms. If it was a live LLM call, wait 60 seconds (1 minute) to satisfy rate limits.
      const delay = (result && result.cacheHit) ? 500 : 60000;
      console.log(`[Queue] Evaluation done. Sleeping for ${delay}ms before next candidate.`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (err) {
      console.error(`[Queue] Error evaluating candidate ${candidateId}:`, err);
      // Wait 60 seconds on error as a cooldown measure
      await new Promise(resolve => setTimeout(resolve, 60000));
    }

    // Clear current candidate label if progress completed
    if (this.progress[jobId] && this.progress[jobId].completed >= this.progress[jobId].total) {
      this.progress[jobId].currentCandidateName = null;
    }

    // Process next item in queue
    this.processQueue();
  }
}

module.exports = new EvaluationQueue();
