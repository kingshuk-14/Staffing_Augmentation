const express = require('express');
const path = require('path');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const { calculateStage2Match, retryFailedEvaluations } = require('../services/matchingService');
const { normalizeBreakdown } = require('../services/breakdownNormalizer');
const { sendClientProposal } = require('../services/emailService');
const router = express.Router();

// Helper to trigger vendor metrics update (copied from vendors.js to maintain isolation)
async function triggerVendorRecalculation(vendorId) {
  try {
    // 1. Calculate Response Rate
    const [outreachRows] = await pool.query('SELECT COUNT(*) as total FROM vendor_outreach WHERE vendor_id = ?', [vendorId]);
    const totalOutreach = outreachRows[0].total;

    let responseRate = 100.0;
    if (totalOutreach > 0) {
      const [responseRows] = await pool.query(`
        SELECT COUNT(DISTINCT job_id) as responded 
        FROM vendor_submissions 
        WHERE vendor_id = ? AND job_id IN (SELECT job_id FROM vendor_outreach WHERE vendor_id = ?)
      `, [vendorId, vendorId]);
      responseRate = (responseRows[0].responded / totalOutreach) * 100;
    }

    // 2. Calculate Average Match Score
    const [scoreRows] = await pool.query(`
      SELECT AVG(m.llm_score) as avg_score 
      FROM job_candidate_matches m
      JOIN candidates c ON m.candidate_id = c.id
      JOIN resumes r ON c.resume_id = COALESCE(r.duplicate_of, r.id)
      JOIN vendor_submissions vs ON vs.resume_id = r.id
      WHERE vs.vendor_id = ?
    `, [vendorId]);
    const avgMatchScore = scoreRows[0].avg_score || 0.0;

    // 3. Calculate Speed Score
    const [speedRows] = await pool.query(`
      SELECT AVG(TIMESTAMPDIFF(HOUR, o.sent_at, s.created_at)) as avg_hours
      FROM vendor_submissions s
      JOIN vendor_outreach o ON s.vendor_id = o.vendor_id AND s.job_id = o.job_id
      WHERE s.vendor_id = ?
    `, [vendorId]);
    const avgHours = speedRows[0].avg_hours || 0.0;
    const speedScore = Math.max(0, 100 - (avgHours * 2));

    // 4. Calculate Conversion Rate
    const [convRows] = await pool.query(`
      SELECT 
        COUNT(CASE WHEN m.status = 'HIRED' THEN 1 END) as hires,
        COUNT(m.id) as total
      FROM job_candidate_matches m
      JOIN candidates c ON m.candidate_id = c.id
      JOIN resumes r ON c.resume_id = COALESCE(r.duplicate_of, r.id)
      JOIN vendor_submissions vs ON vs.resume_id = r.id
      WHERE vs.vendor_id = ?
    `, [vendorId]);

    let conversionRate = 0.0;
    if (convRows[0].total > 0) {
      conversionRate = (convRows[0].hires / convRows[0].total) * 100;
    }

    // 5. Compute Overall Score
    let overallScore = 100.0;
    const [subCountRows] = await pool.query('SELECT COUNT(*) as count FROM vendor_submissions WHERE vendor_id = ?', [vendorId]);
    if (subCountRows[0].count > 0 || totalOutreach > 0) {
      overallScore = (Math.min(100, responseRate) * 0.5) + (conversionRate * 0.5);
    }

    await pool.query('UPDATE vendors SET overall_score = ? WHERE id = ?', [overallScore, vendorId]);
  } catch (error) {
    console.error(`Error background recalculating vendor metrics:`, error);
  }
}

/**
 * Endpoint: POST /api/matches/:jobId/:candidateId/evaluate
 * Triggers a deep LLM candidate analysis on demand.
 */
router.post('/:jobId/:candidateId/evaluate', authenticateToken, async (req, res) => {
  const { jobId, candidateId } = req.params;
  const { semanticScore, breakdown } = req.body;
  try {
    const result = await calculateStage2Match(
      parseInt(jobId),
      parseInt(candidateId),
      semanticScore || 50,
      breakdown || { skillFit: 50, experienceFit: 50, budgetFit: 50 }
    );

    // Normalize breakdown in response
    if (result.breakdown) {
      result.breakdown = normalizeBreakdown(result.breakdown);
    }

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Evaluation failed', result });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error triggering LLM evaluation:', error);
    res.status(500).json({ error: 'Failed to complete LLM analysis' });
  }
});

/**
 * Endpoint: POST /api/matches/:jobId/retry-failed
 * Retries LLM evaluation for all failed candidates in a job.
 */
router.post('/:jobId/retry-failed', authenticateToken, async (req, res) => {
  const { jobId } = req.params;
  try {
    const result = await retryFailedEvaluations(parseInt(jobId));
    res.status(200).json(result);
  } catch (error) {
    console.error('Error retrying failed evaluations:', error);
    res.status(500).json({ error: 'Failed to retry evaluations' });
  }
});

/**
 * Endpoint: POST /api/matches/:jobId/:candidateId/status
 * Updates candidate selection stage for a specific job description.
 * Triggers position fill counts and recomputes vendor conversion scores.
 */
router.post('/:jobId/:candidateId/status', authenticateToken, async (req, res) => {
  const { jobId, candidateId } = req.params;
  const { status } = req.body;

  const validStatuses = ['SUGGESTED', 'SENT_TO_CLIENT', 'REJECTED', 'HIRED'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    // 1. Fetch current match status
    const [matchRows] = await pool.query(
      'SELECT status FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
      [jobId, candidateId]
    );

    if (matchRows.length === 0) {
      return res.status(404).json({ error: 'Match record not found' });
    }

    const previousStatus = matchRows[0].status;

    // 2. Update status in job_candidate_matches
    await pool.query(
      'UPDATE job_candidate_matches SET status = ? WHERE job_id = ? AND candidate_id = ?',
      [status, jobId, candidateId]
    );

    // Sync candidate global status + log HIRED/REJECTED transitions to history
    if (status === 'SENT_TO_CLIENT') {
      await pool.query("UPDATE candidates SET status = 'OUTSOURCED' WHERE id = ?", [candidateId]);
    } else if (status === 'HIRED') {
      await pool.query("UPDATE candidates SET status = 'HIRED', hired_at = NOW() WHERE id = ?", [candidateId]);
      // Update latest OUTSOURCED history row for this candidate+job to ACCEPTED
      await pool.query(
        `UPDATE candidate_client_history SET status = 'ACCEPTED', event_at = NOW() WHERE candidate_id = ? AND job_id = ? AND status = 'OUTSOURCED' ORDER BY id DESC LIMIT 1`,
        [candidateId, jobId]
      );
    } else if (status === 'SUGGESTED' || status === 'REJECTED') {
      // Set global status back to ACTIVE if they are not hired/outsourced on other matches
      const [otherMatches] = await pool.query(
        "SELECT status FROM job_candidate_matches WHERE candidate_id = ? AND status IN ('HIRED', 'SENT_TO_CLIENT') AND job_id != ?",
        [candidateId, jobId]
      );
      if (otherMatches.length === 0) {
        await pool.query(`
          UPDATE candidates 
          SET status = 'ACTIVE', 
              hired_at = NULL, 
              hired_by_company = NULL, 
              employment_start_date = NULL, 
              tenure_months = NULL 
          WHERE id = ?
        `, [candidateId]);
      }
      // Log rejection in history if previously outsourced to a client for this job
      if (status === 'REJECTED') {
        await pool.query(
          `UPDATE candidate_client_history SET status = 'REJECTED', event_at = NOW() WHERE candidate_id = ? AND job_id = ? AND status = 'OUTSOURCED' ORDER BY id DESC LIMIT 1`,
          [candidateId, jobId]
        );
      }
    }

    // 3. Update Job Positions filled count if needed
    if (previousStatus !== 'HIRED' && status === 'HIRED') {
      // Increment positions filled
      await pool.query('UPDATE jobs SET positions_filled = positions_filled + 1 WHERE id = ?', [jobId]);
    } else if (previousStatus === 'HIRED' && status !== 'HIRED') {
      // Decrement positions filled
      await pool.query('UPDATE jobs SET positions_filled = GREATEST(0, positions_filled - 1) WHERE id = ?', [jobId]);
    }

    // 4. Update Vendor metrics if candidate was submitted by a vendor
    const [candRows] = await pool.query('SELECT resume_id FROM candidates WHERE id = ?', [candidateId]);
    if (candRows.length > 0) {
      const resumeId = candRows[0].resume_id;
      const [subRows] = await pool.query(`
        SELECT DISTINCT vs.vendor_id 
        FROM vendor_submissions vs
        JOIN resumes r ON vs.resume_id = r.id
        WHERE COALESCE(r.duplicate_of, r.id) = ? AND vs.job_id = ?
      `, [resumeId, jobId]);

      if (subRows.length > 0) {
        const vendorId = subRows[0].vendor_id;
        // Recalculate vendor statistics
        await triggerVendorRecalculation(vendorId);
      }
    }

    res.status(200).json({ message: 'Match status updated successfully', previousStatus, newStatus: status });
  } catch (error) {
    console.error('Error updating match status:', error);
    res.status(500).json({ error: 'Failed to update match status' });
  }
});

// POST /api/matches/:jobId/outsource (Batch Outsource candidates to client)
router.post('/:jobId/outsource', authenticateToken, async (req, res) => {
  const jobId = req.params.jobId;
  const { candidateIds, clientEmail, subject, body, attachResume } = req.body;

  if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
    return res.status(400).json({ error: 'Candidate IDs are required' });
  }

  try {
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #F55036; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
            .content { border: 1px solid #ddd; padding: 20px; border-radius: 0 0 5px 5px; background: #fafafa; }
            .meta { font-size: 12px; color: #666; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Alphaxine Candidate Proposal Dispatch (Batch)</h2>
          </div>
          <div class="content">
            <div class="meta">
              <strong>To:</strong> ${clientEmail}<br/>
              <strong>Subject:</strong> ${subject}<br/>
              <strong>Date:</strong> ${new Date().toLocaleString()}
            </div>
            <div style="white-space: pre-wrap;">${body}</div>
          </div>
        </body>
      </html>
    `;

    // Handle Attachments
    const attachments = [];
    if (attachResume && candidateIds && candidateIds.length > 0) {
      const placeholders = candidateIds.map(() => '?').join(',');
      const [resumeRows] = await pool.query(`
        SELECT r.file_name, r.file_path
        FROM candidates c
        JOIN resumes r ON c.resume_id = r.id
        WHERE c.id IN (${placeholders})
      `, candidateIds);

      resumeRows.forEach(row => {
        if (row.file_path) {
          const absolutePath = path.isAbsolute(row.file_path) 
            ? row.file_path 
            : path.join(__dirname, '..', row.file_path);
            
          attachments.push({
            filename: row.file_name || path.basename(row.file_path),
            path: absolutePath
          });
        }
      });
    }

    // 1. Send live email and keep local log via emailService
    const emailResult = await sendClientProposal(clientEmail, subject, htmlContent, jobId, attachments);

    // 2. Loop through candidates and update statuses
    for (const candidateId of candidateIds) {
      const [matchRows] = await pool.query(
        'SELECT status FROM job_candidate_matches WHERE job_id = ? AND candidate_id = ?',
        [jobId, candidateId]
      );

      if (matchRows.length === 0) {
        // If candidate was never processed by LLM but we sent them anyway, create a dummy entry
        await pool.query(
          'INSERT INTO job_candidate_matches (job_id, candidate_id, semantic_score, status) VALUES (?, ?, 80, "SENT_TO_CLIENT")',
          [jobId, candidateId]
        );
      } else {
        await pool.query(
          'UPDATE job_candidate_matches SET status = "SENT_TO_CLIENT" WHERE job_id = ? AND candidate_id = ?',
          [jobId, candidateId]
        );
      }

      // Sync candidate global status
      await pool.query("UPDATE candidates SET status = 'OUTSOURCED' WHERE id = ?", [candidateId]);

      // Log to candidate_client_history
      await pool.query(
        `INSERT INTO candidate_client_history (candidate_id, job_id, client_email, status) VALUES (?, ?, ?, 'OUTSOURCED')`,
        [candidateId, jobId, clientEmail]
      );

      // Update Vendor metrics if candidate was submitted by a vendor
      const [candRows] = await pool.query('SELECT resume_id FROM candidates WHERE id = ?', [candidateId]);
      if (candRows.length > 0) {
        const resumeId = candRows[0].resume_id;
        const [subRows] = await pool.query(`
          SELECT DISTINCT vs.vendor_id 
          FROM vendor_submissions vs
          JOIN resumes r ON vs.resume_id = r.id
          WHERE COALESCE(r.duplicate_of, r.id) = ? AND vs.job_id = ?
        `, [resumeId, jobId]);

        if (subRows.length > 0) {
          const vendorId = subRows[0].vendor_id;
          await triggerVendorRecalculation(vendorId);
        }
      }
    }

    res.status(200).json({
      message: 'Batch candidate outsourcing completed successfully',
      filePath: emailResult ? emailResult.filePath : 'sent_emails/fallback.html'
    });
  } catch (error) {
    console.error('Error in batch outsourcing:', error);
    res.status(500).json({ error: 'Failed to complete batch outsourcing' });
  }
});

// POST /api/matches/:jobId/:candidateId/outsource-email
router.post('/:jobId/:candidateId/outsource-email', authenticateToken, async (req, res) => {
  const { jobId, candidateId } = req.params;
  const { clientEmail, subject, body, attachResume } = req.body;

  try {
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { background: #F55036; color: white; padding: 15px; border-radius: 5px 5px 0 0; }
            .content { border: 1px border-slate-200; padding: 20px; border-radius: 0 0 5px 5px; background: #fafafa; }
            .meta { font-size: 12px; color: #666; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Alphaxine Candidate Proposal Dispatch</h2>
          </div>
          <div class="content">
            <div class="meta">
              <strong>To:</strong> ${clientEmail}<br/>
              <strong>Subject:</strong> ${subject}<br/>
              <strong>Date:</strong> ${new Date().toLocaleString()}
            </div>
            <div style="white-space: pre-wrap;">${body}</div>
          </div>
        </body>
      </html>
    `;

    // Handle Attachment
    const attachments = [];
    if (attachResume) {
      const [resumeRows] = await pool.query(`
        SELECT r.file_name, r.file_path
        FROM candidates c
        JOIN resumes r ON c.resume_id = r.id
        WHERE c.id = ?
      `, [candidateId]);

      if (resumeRows.length > 0 && resumeRows[0].file_path) {
        const row = resumeRows[0];
        const absolutePath = path.isAbsolute(row.file_path) 
          ? row.file_path 
          : path.join(__dirname, '..', row.file_path);
          
        attachments.push({
          filename: row.file_name || path.basename(row.file_path),
          path: absolutePath
        });
      }
    }

    const emailResult = await sendClientProposal(clientEmail, subject, htmlContent, jobId, attachments);

    res.status(200).json({
      message: 'Client email sent successfully',
      filePath: emailResult ? emailResult.filePath : 'sent_emails/fallback.html'
    });
  } catch (error) {
    console.error('Error saving client proposal email:', error);
    res.status(500).json({ error: 'Failed to dispatch email' });
  }
});

// GET /api/matches/candidate/:id/history — full outsource/acceptance/rejection timeline
router.get('/candidate/:id/history', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT h.id, h.status, h.client_email, h.client_name, h.notes, h.event_at,
             j.title AS job_title, j.id AS job_id
      FROM candidate_client_history h
      JOIN jobs j ON h.job_id = j.id
      WHERE h.candidate_id = ?
      ORDER BY h.event_at DESC
    `, [req.params.id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching candidate history:', error);
    res.status(500).json({ error: 'Failed to fetch candidate history' });
  }
});

module.exports = router;