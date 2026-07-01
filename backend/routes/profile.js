const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

// Get Profile Info
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [rows] = await db.query(
      'SELECT id, first_name, last_name, email, phone, gender, date_of_birth, company, role FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update Profile Info
router.put('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { first_name, last_name, phone, gender, date_of_birth, company } = req.body;

    await db.query(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ?, gender = ?, date_of_birth = ?, company = ? WHERE id = ?',
      [first_name, last_name, phone || null, gender || null, date_of_birth || null, company || '', userId]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Generate OTP for password change
router.post('/change-password-otp', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get user email
    const [users] = await db.query('SELECT email FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    const email = users[0].email;

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Insert or update OTP in database
    await db.query(
      `INSERT INTO password_reset_otps (email, otp, expires_at) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE otp = ?, expires_at = ?, created_at = CURRENT_TIMESTAMP`,
      [email, otp, expiresAt, otp, expiresAt]
    );

    // Send email
    await emailService.sendPasswordResetOTP(email, otp);

    res.json({ message: 'OTP sent successfully to your email' });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP and change password
router.post('/change-password-verify', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otp, newPassword } = req.body;

    if (!otp || !newPassword) {
      return res.status(400).json({ error: 'OTP and new password are required' });
    }

    // Get user email
    const [users] = await db.query('SELECT email FROM users WHERE id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    const email = users[0].email;

    // Verify OTP
    const [otps] = await db.query(
      'SELECT * FROM password_reset_otps WHERE email = ? AND otp = ? AND expires_at > NOW()',
      [email, otp]
    );

    if (otps.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

    // Delete used OTP
    await db.query('DELETE FROM password_reset_otps WHERE email = ?', [email]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
