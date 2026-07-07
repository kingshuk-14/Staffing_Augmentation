const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');
const aiService = require('../services/aiService');
const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;

// @route   POST /api/mail-integration/register
// @desc    Register an email address for mail integration
router.post('/register', authenticateToken, async (req, res) => {
  const { email_address } = req.body;
  if (!email_address) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  try {
    const [existing] = await pool.query('SELECT id FROM registered_mail_integrations WHERE email_address = ?', [email_address]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'This email is already registered.' });
    }

    await pool.query(
      'INSERT INTO registered_mail_integrations (user_id, email_address) VALUES (?, ?)',
      [req.user.userId, email_address]
    );

    res.json({ message: 'Email registered successfully for mail integration.' });
  } catch (err) {
    console.error('Mail Integration Register Error:', err.message);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// @route   POST /api/mail-integration/import
// @desc    Import a job from an email body
router.post('/import', authenticateToken, async (req, res) => {
  const { sender_email, email_content } = req.body;

  if (!sender_email || !email_content) {
    return res.status(400).json({ error: 'sender_email and email_content are required.' });
  }

  try {
    // 1. (Removed) We no longer verify against registered_mail_integrations 
    // because users authenticate directly with IMAP app passwords on the frontend.

    // 2. Parse email using LLM
    const parsedJob = await aiService.parseJobDescriptionMultiLLM(email_content);

    if (!parsedJob || !parsedJob.title) {
      return res.status(400).json({ error: 'Failed to extract a valid job description from the email.' });
    }

    // 3. Insert Job into DB
    const [jobResult] = await pool.query(
      'INSERT INTO jobs (title, budget, experience_years, raw_text, status) VALUES (?, ?, ?, ?, ?)',
      [
        parsedJob.title,
        parsedJob.budget || null,
        parsedJob.experience_years || null,
        email_content,
        'OPEN'
      ]
    );

    const newJobId = jobResult.insertId;

    // 4. Insert Required Skills
    let reqSkills = [];
    if (parsedJob.skills_required) {
      reqSkills = Array.isArray(parsedJob.skills_required) ? parsedJob.skills_required : (typeof parsedJob.skills_required === 'string' ? parsedJob.skills_required.split(',') : []);
    } else if (parsedJob.skills) {
      reqSkills = Array.isArray(parsedJob.skills) ? parsedJob.skills : (typeof parsedJob.skills === 'string' ? parsedJob.skills.split(',') : []);
    }

    for (const skill of reqSkills) {
      if (skill && skill.trim() !== '') {
        await pool.query(
          'INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, ?)',
          [newJobId, skill.trim(), true]
        );
      }
    }

    // Insert Preferred Skills
    let prefSkills = [];
    if (parsedJob.skills_preferred) {
      prefSkills = Array.isArray(parsedJob.skills_preferred) ? parsedJob.skills_preferred : (typeof parsedJob.skills_preferred === 'string' ? parsedJob.skills_preferred.split(',') : []);
    }

    for (const skill of prefSkills) {
      if (skill && skill.trim() !== '') {
        await pool.query(
          'INSERT IGNORE INTO job_skills (job_id, skill, is_required) VALUES (?, ?, ?)',
          [newJobId, skill.trim(), false]
        );
      }
    }

    res.json({ message: 'Job successfully created from email.', job_id: newJobId, job: parsedJob });
  } catch (err) {
    console.error('Mail Integration Import Error:', err.message);
    res.status(500).json({ error: 'Server error during job import.' });
  }
});

router.post('/fetch-emails', authenticateToken, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and App Password are required' });
  }

  const config = {
    imap: {
      user: email,
      password: password,
      host: 'imap.gmail.com', // Assuming Gmail for now
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    }
  };

  try {
    const connection = await imaps.connect(config);
    const box = await connection.openBox('INBOX');

    const totalMessages = box.messages.total;
    if (totalMessages === 0) {
      connection.end();
      return res.json({ emails: [] });
    }

    // Get sequence numbers for the last 50 messages
    const start = Math.max(1, totalMessages - 49);
    const searchCriteria = [`${start}:${totalMessages}`];
    
    const fetchOptions = {
      bodies: [''],
      markSeen: false,
      struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);

    // Get the last 50 (reverse to show newest first)
    const recentMessages = messages.reverse();

    const emails = [];
    for (const item of recentMessages) {
      const all = item.parts.find(part => part.which === '');
      const id = item.attributes.uid;
      const idHeader = 'Imap-Id: ' + id + '\r\n';
      
      const mail = await simpleParser(idHeader + all.body);
      
      emails.push({
        id: id,
        sender: mail.from.text,
        subject: mail.subject,
        content: mail.text || mail.html,
        date: mail.date,
        imported: false
      });
    }

    connection.end();
    res.json({ emails });
  } catch (err) {
    console.error('IMAP Fetch Error:', err);
    res.status(500).json({ error: 'Failed to authenticate or fetch emails. Please check your App Password.' });
  }
});

module.exports = router;
