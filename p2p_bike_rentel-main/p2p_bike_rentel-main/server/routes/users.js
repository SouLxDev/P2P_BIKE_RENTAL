const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { isAdminEmail } = require('../utils/admin');

const router = express.Router();

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, address, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      ...result.rows[0],
      isAdmin: isAdminEmail(result.rows[0].email)
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const result = await pool.query(`
      UPDATE users 
      SET name = $1, phone = $2, address = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, name, email, phone, address
    `, [name, phone, address, req.userId]);

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
        ? {
            ...result.rows[0],
            isAdmin: isAdminEmail(result.rows[0].email)
          }
        : null
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's bikes (must be before /:id to avoid conflict)
router.get('/my-bikes', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bikes WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user bikes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get public user profile by ID (for messaging context)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
