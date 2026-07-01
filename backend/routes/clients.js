const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/clients - Fetch all clients
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [clients] = await pool.query('SELECT * FROM clients ORDER BY company_name ASC');
    res.status(200).json(clients);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients list' });
  }
});

// POST /api/clients - Register a new client
router.post('/', authenticateToken, async (req, res) => {
  const { company_name, contact_person, email, phone, address } = req.body;
  if (!company_name) {
    return res.status(400).json({ error: 'Company Name is required' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO clients (company_name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)',
      [company_name.trim(), contact_person || null, email || null, phone || null, address || null]
    );
    res.status(201).json({
      message: 'Client registered successfully',
      clientId: result.insertId
    });
  } catch (error) {
    console.error('Error creating client:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'A client with this company name or email already exists' });
    }
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id - Update existing client details
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { company_name, contact_person, email, phone, address } = req.body;

  if (!company_name) {
    return res.status(400).json({ error: 'Company Name is required' });
  }

  try {
    await pool.query(
      'UPDATE clients SET company_name = ?, contact_person = ?, email = ?, phone = ?, address = ? WHERE id = ?',
      [company_name.trim(), contact_person || null, email || null, phone || null, address || null, id]
    );
    res.status(200).json({ message: 'Client details updated successfully' });
  } catch (error) {
    console.error('Error updating client:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'A client with this company name or email already exists' });
    }
    res.status(500).json({ error: 'Failed to update client details' });
  }
});

// DELETE /api/clients/:id - Remove a client
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM clients WHERE id = ?', [id]);
    res.status(200).json({ message: 'Client removed successfully' });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

module.exports = router;
