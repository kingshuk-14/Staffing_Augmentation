const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/candidates
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, r.file_name, r.file_path 
      FROM candidates c
      LEFT JOIN resumes r ON c.resume_id = r.id
      ORDER BY c.created_at DESC
    `);
    
    // Fetch skills for each candidate
    for (const cand of rows) {
      const [skills] = await pool.query('SELECT skill FROM candidate_skills WHERE candidate_id = ?', [cand.id]);
      cand.skills = skills.map(s => s.skill);
    }
    
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// PATCH /api/candidates/:id/status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, hired_by_company, employment_start_date, tenure_months } = req.body;
  
  try {
    // Validate status
    const validStatuses = ['ACTIVE', 'HIRED', 'OUTSOURCED', 'REJECTED'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid candidate status' });
    }
    
    // Fetch candidate current status
    const [candRows] = await pool.query('SELECT status FROM candidates WHERE id = ?', [id]);
    if (candRows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const currentStatus = candRows[0].status;
    const nextStatus = status || currentStatus;

    if (nextStatus === 'HIRED') {
      const hiredAt = new Date();
      const startDate = employment_start_date || new Date().toISOString().split('T')[0];
      const tenure = tenure_months || 0;
      const company = hired_by_company || 'TBD Company';

      await pool.query(`
        UPDATE candidates 
        SET status = 'HIRED',
            hired_at = ?,
            hired_by_company = ?,
            employment_start_date = ?,
            tenure_months = ?
        WHERE id = ?
      `, [hiredAt, company, startDate, tenure, id]);
    } else {
      // Clear hired details if moving away from HIRED status
      await pool.query(`
        UPDATE candidates 
        SET status = ?,
            hired_at = NULL,
            hired_by_company = NULL,
            employment_start_date = NULL,
            tenure_months = NULL
        WHERE id = ?
      `, [nextStatus, id]);

      if (nextStatus === 'ACTIVE') {
        // Reset any locking matches back to SUGGESTED
        await pool.query(`
          UPDATE job_candidate_matches 
          SET status = 'SUGGESTED' 
          WHERE candidate_id = ? AND status IN ('SENT_TO_CLIENT', 'HIRED')
        `, [id]);
      }
    }
    
    res.status(200).json({ message: 'Candidate status updated successfully' });
  } catch (error) {
    console.error('Error updating candidate status:', error);
    res.status(500).json({ error: 'Failed to update candidate status' });
  }
});

// DELETE /api/candidates/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [result] = await pool.query('DELETE FROM candidates WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    
    res.status(200).json({ message: 'Candidate deleted successfully' });
  } catch (error) {
    console.error('Error deleting candidate:', error);
    res.status(500).json({ error: 'Failed to delete candidate' });
  }
});

module.exports = router;
