const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/bike/:bikeId', async (req, res) => {
  try {
    const { bikeId } = req.params;
    const result = await pool.query(`
      SELECT r.*, u.name AS reviewer_name
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.bike_id = $1
      ORDER BY r.created_at DESC
    `, [bikeId]);

    const summary = await pool.query(`
      SELECT COALESCE(ROUND(AVG(rating), 1), 0) AS average_rating, COUNT(*)::int AS review_count
      FROM reviews
      WHERE bike_id = $1
    `, [bikeId]);

    res.json({
      reviews: result.rows,
      summary: summary.rows[0]
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/bike/:bikeId', authMiddleware, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 1000 }).withMessage('Comment is too long'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bikeId } = req.params;
    const { rating, comment } = req.body;

    const bikeResult = await pool.query('SELECT owner_id FROM bikes WHERE id = $1', [bikeId]);
    if (bikeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' });
    }

    if (bikeResult.rows[0].owner_id === req.userId) {
      return res.status(400).json({ error: 'You cannot review your own bike' });
    }

    const eligibleBooking = await pool.query(`
      SELECT id
      FROM bookings
      WHERE bike_id = $1
        AND renter_id = $2
        AND status IN ('confirmed', 'completed')
      LIMIT 1
    `, [bikeId, req.userId]);

    if (eligibleBooking.rows.length === 0) {
      return res.status(403).json({ error: 'You can only review bikes you have booked' });
    }

    const existingReview = await pool.query(
      'SELECT id FROM reviews WHERE bike_id = $1 AND reviewer_id = $2 LIMIT 1',
      [bikeId, req.userId]
    );

    let reviewResult;
    if (existingReview.rows.length > 0) {
      reviewResult = await pool.query(`
        UPDATE reviews
        SET rating = $1, comment = $2, created_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [rating, comment || null, existingReview.rows[0].id]);
    } else {
      reviewResult = await pool.query(`
        INSERT INTO reviews (bike_id, reviewer_id, rating, comment)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [bikeId, req.userId, rating, comment || null]);
    }

    res.status(201).json({
      message: 'Review saved successfully',
      review: reviewResult.rows[0]
    });
  } catch (error) {
    console.error('Error saving review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
