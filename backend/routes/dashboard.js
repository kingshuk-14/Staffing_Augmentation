const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');

/**
 * Endpoint: GET /api/dashboard/stats
 * Fetches KPIs and metrics for the recruiter dashboard overview.
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // 1. Fetch KPI metrics
    const [[jobsStats]] = await pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COALESCE(SUM(positions_needed), 0) as total_needed,
        COALESCE(SUM(positions_filled), 0) as total_filled
      FROM jobs 
      WHERE status = 'OPEN'
    `);

    const [[clientsStats]] = await pool.query('SELECT COUNT(*) as total_clients FROM clients');
    const [[candidatesStats]] = await pool.query('SELECT COUNT(*) as total_candidates FROM candidates');
    const [[hiredStats]] = await pool.query("SELECT COUNT(*) as total_hired FROM candidates WHERE status = 'HIRED'");
    const [[outsourcedStats]] = await pool.query("SELECT COUNT(*) as total_outsourced FROM candidates WHERE status = 'OUTSOURCED'");

    // 2. Fetch recent ingested candidates/resumes
    const [recentCandidates] = await pool.query(`
      SELECT c.id, c.name, c.email, c.created_at, r.file_name
      FROM candidates c
      JOIN resumes r ON c.resume_id = r.id
      ORDER BY c.created_at DESC
      LIMIT 5
    `);

    // 3. Fetch active open jobs tracker
    const [activeJobs] = await pool.query(`
      SELECT j.id, j.title, j.positions_needed, j.positions_filled, j.created_at, c.company_name as client_name
      FROM jobs j
      LEFT JOIN clients c ON j.client_id = c.id
      WHERE j.status = 'OPEN'
      ORDER BY j.created_at DESC
      LIMIT 5
    `);

    // 4. Fetch and calculate top performing vendors
    const [vendors] = await pool.query(`
      SELECT v.*,
        (SELECT COUNT(*) FROM vendor_outreach WHERE vendor_id = v.id) as total_outreach,
        (SELECT COUNT(*) FROM vendor_submissions WHERE vendor_id = v.id) as total_submissions,
        (
          SELECT COUNT(*) 
          FROM candidates c 
          JOIN resumes r ON c.resume_id = r.id 
          WHERE c.status = 'HIRED' AND r.id IN (
            SELECT resume_id FROM vendor_submissions WHERE vendor_id = v.id
          )
        ) as total_hires
      FROM vendors v
    `);

    const scoredVendors = vendors.map(v => {
      const totalOutreach = parseInt(v.total_outreach) || 0;
      const totalSubmissions = parseInt(v.total_submissions) || 0;
      const totalHires = parseInt(v.total_hires) || 0;

      // Response Rate (submissions / outreach): weight 50%
      const responseRate = totalOutreach > 0 ? (totalSubmissions / totalOutreach) * 100 : 0;
      // Acceptance Rate (hires / submissions): weight 50%
      const conversionRate = totalSubmissions > 0 ? (totalHires / totalSubmissions) * 100 : 0;
      
      const overallScore = (responseRate * 0.5) + (conversionRate * 0.5);

      return {
        id: v.id,
        name: v.name,
        contact_person: v.contact_person,
        overall_score: overallScore,
        total_submissions: totalSubmissions
      };
    });

    // Sort descending by performance and take top 5
    scoredVendors.sort((a, b) => b.overall_score - a.overall_score);
    const topVendors = scoredVendors.slice(0, 5);

    res.status(200).json({
      kpis: {
        activeJobsCount: jobsStats.total_jobs,
        positionsNeeded: jobsStats.total_needed,
        positionsFilled: jobsStats.total_filled,
        clientsCount: clientsStats.total_clients,
        candidatesCount: candidatesStats.total_candidates,
        hiredCount: hiredStats.total_hired,
        outsourcedCount: outsourcedStats.total_outsourced
      },
      recentCandidates,
      activeJobs,
      topVendors
    });
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

module.exports = router;
