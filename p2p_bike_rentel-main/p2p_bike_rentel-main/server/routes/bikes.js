const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Get all bikes
router.get('/', async (req, res) => {
  try {
    const { search, location, minPrice, maxPrice, available } = req.query;

    let query = `
      SELECT b.*, u.name as owner_name, u.phone as owner_phone 
      FROM bikes b 
      JOIN users u ON b.owner_id = u.id 
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (b.title ILIKE $${paramCount} OR b.brand ILIKE $${paramCount} OR b.model ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (location) {
      paramCount++;
      query += ` AND b.location ILIKE $${paramCount}`;
      params.push(`%${location}%`);
    }

    if (minPrice) {
      paramCount++;
      query += ` AND b.price_per_day >= $${paramCount}`;
      params.push(minPrice);
    }

    if (maxPrice) {
      paramCount++;
      query += ` AND b.price_per_day <= $${paramCount}`;
      params.push(maxPrice);
    }

    if (available !== undefined && available !== '') {
      paramCount++;
      query += ` AND b.available = $${paramCount}`;
      params.push(available === 'true');
    }

    query += ' ORDER BY b.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bikes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single bike
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT b.*, u.name as owner_name, u.phone as owner_phone, u.email as owner_email
      FROM bikes b 
      JOIN users u ON b.owner_id = u.id 
      WHERE b.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching bike:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new bike (protected route)
router.post('/', authMiddleware, [
  body('title').trim().isLength({ min: 3 }).withMessage('Title must be at least 3 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('price_per_day').isNumeric().withMessage('Price must be a number'),
  body('location').trim().isLength({ min: 3 }).withMessage('Location must be at least 3 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      title,
      description,
      brand,
      model,
      year,
      price_per_day,
      location,
      latitude,
      longitude,
      image_url
    } = req.body;

    const yearValue = year ? Number(year) : null;
    const latitudeValue = latitude ? Number(latitude) : null;
    const longitudeValue = longitude ? Number(longitude) : null;

    const result = await pool.query(`
      INSERT INTO bikes (owner_id, title, description, brand, model, year, price_per_day, location, latitude, longitude, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [req.userId, title, description, brand, model, yearValue, price_per_day, location, latitudeValue, longitudeValue, image_url]);

    res.status(201).json({
      message: 'Bike created successfully',
      bike: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating bike:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update bike (protected route)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      brand,
      model,
      year,
      price_per_day,
      location,
      latitude,
      longitude,
      image_url,
      available
    } = req.body;

    // Check if bike belongs to user
    const bikeCheck = await pool.query('SELECT owner_id FROM bikes WHERE id = $1', [id]);
    if (bikeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' });
    }
    if (bikeCheck.rows[0].owner_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update this bike' });
    }

    const result = await pool.query(`
      UPDATE bikes 
      SET title = $1, description = $2, brand = $3, model = $4, year = $5, 
          price_per_day = $6, location = $7, latitude = $8, longitude = $9, 
          image_url = $10, available = $11, updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [title, description, brand, model, year, price_per_day, location, latitude, longitude, image_url, available, id]);

    res.json({
      message: 'Bike updated successfully',
      bike: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating bike:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete bike (protected route)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if bike belongs to user
    const bikeCheck = await pool.query('SELECT owner_id FROM bikes WHERE id = $1', [id]);
    if (bikeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' });
    }
    if (bikeCheck.rows[0].owner_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this bike' });
    }

    await pool.query('DELETE FROM bikes WHERE id = $1', [id]);
    res.json({ message: 'Bike deleted successfully' });
  } catch (error) {
    console.error('Error deleting bike:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
