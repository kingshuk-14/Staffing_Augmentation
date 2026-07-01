const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { sendVerificationEmail, sendLoginOtpEmail } = require('../services/emailService');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_me_in_production';

// Send Verification Email Endpoint
router.post('/send-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    // Generate a token valid for 5 minutes
    const token = jwt.sign({ email, type: 'verification' }, JWT_SECRET, { expiresIn: '5m' });

    // Store in database
    await pool.query(
      `INSERT INTO pending_verifications (email, token, status) VALUES (?, ?, 'pending')
       ON DUPLICATE KEY UPDATE token = VALUES(token), status = 'pending', created_at = CURRENT_TIMESTAMP`,
      [email, token]
    );

    // Send the email
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const originUrl = `${protocol}://${host}`;
    await sendVerificationEmail(email, token, originUrl);
    
    res.status(200).json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Error sending verification email:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Verify Email Link Endpoint (clicked from email)
router.get('/verify-email-link', async (req, res) => {
  try {
    const { token, action } = req.query;
    if (!token || !action) {
      return res.status(400).send('<h1>Invalid Link</h1><p>Missing token or action.</p>');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).send('<h1>Link Expired or Invalid</h1><p>Please request a new verification email.</p>');
    }

    const { email } = decoded;
    const newStatus = action === 'yes' ? 'verified' : 'rejected';

    await pool.query('UPDATE pending_verifications SET status = ? WHERE email = ?', [newStatus, email]);

    if (action === 'yes') {
      res.send(`
        <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #22c55e;">Email Verified Successfully!</h1>
          <p>You can now close this tab and return to your original device to continue the signup process.</p>
        </body>
        </html>
      `);
    } else {
      res.send(`
        <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #ef4444;">Verification Rejected</h1>
          <p>We've recorded that you did not make this request. You can close this tab safely.</p>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Verify email link error:', error);
    res.status(500).send('<h1>Internal Server Error</h1>');
  }
});

// Verification Status Polling Endpoint
router.get('/verification-status', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const [rows] = await pool.query('SELECT status, token FROM pending_verifications WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No verification found for this email' });
    }

    res.json({ status: rows[0].status, token: rows[0].token });
  } catch (error) {
    console.error('Verification status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Signup endpoint
router.post('/signup', async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      gender,
      date_of_birth,
      company,
      role,
      password,
      confirm_password,
      verificationToken,
    } = req.body;

    // --- Required field validation ---
    if (!first_name || !last_name || !email || !company || !role || !password) {
      return res.status(400).json({ error: 'First name, last name, email, company, role and password are required.' });
    }

    if (!verificationToken) {
      return res.status(400).json({ error: 'Email verification token is required.' });
    }

    // --- Verify Token ---
    try {
      const decoded = jwt.verify(verificationToken, JWT_SECRET);
      if (decoded.email !== email || decoded.type !== 'verification') {
        return res.status(400).json({ error: 'Invalid verification token for this email.' });
      }
    } catch (err) {
      return res.status(400).json({ error: 'Verification token is invalid or expired. Please verify your email again.' });
    }

    // --- Password confirmation check ---
    if (confirm_password !== undefined && password !== confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    // --- Password strength: rules check ---
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one uppercase letter.' });
    }
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one lowercase letter.' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one number.' });
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain at least one special character.' });
    }

    // --- Phone format: basic E.164 / digits only, optional ---
    if (phone && !/^[+]?[\d\s\-().]{7,20}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number format.' });
    }

    // --- Gender: must be one of the allowed enum values ---
    const allowedGenders = ['male', 'female', 'non_binary', 'prefer_not_to_say'];
    if (gender && !allowedGenders.includes(gender)) {
      return res.status(400).json({ error: 'Invalid gender value.' });
    }

    // --- Duplicate email check ---
    const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // --- Hash password ---
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // --- Insert user ---
    const [result] = await pool.query(
      `INSERT INTO users
        (first_name, last_name, email, phone, gender, date_of_birth, company, role, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        first_name,
        last_name,
        email,
        phone || null,
        gender || null,
        date_of_birth || null,
        company,
        role,
        password_hash,
      ]
    );

    res.status(201).json({
      message: 'Account created successfully.',
      userId: result.insertId,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 1: Login OTP Request
router.post('/login-otp', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find user
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Calculate expiration (5 minutes from now)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Save OTP to DB
    await pool.query(
      `INSERT INTO login_otps (email, otp, expires_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at), created_at = CURRENT_TIMESTAMP`,
      [email, otp, expiresAt]
    );

    // Send OTP email
    await sendLoginOtpEmail(email, otp);

    res.status(200).json({ message: 'OTP sent to email', step: 'otp' });
  } catch (error) {
    console.error('Login OTP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 2: Verify OTP and Login
router.post('/login-verify', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    // Find OTP
    const [otps] = await pool.query('SELECT * FROM login_otps WHERE email = ?', [email]);
    if (otps.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    const record = otps[0];
    const now = new Date();

    if (record.otp !== otp || new Date(record.expires_at) < now) {
      return res.status(401).json({ error: 'Invalid or expired OTP.' });
    }

    // OTP is valid, delete it
    await pool.query('DELETE FROM login_otps WHERE email = ?', [email]);

    // Find user to issue token
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    const user = users[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        date_of_birth: user.date_of_birth,
        company: user.company,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login verify error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;



