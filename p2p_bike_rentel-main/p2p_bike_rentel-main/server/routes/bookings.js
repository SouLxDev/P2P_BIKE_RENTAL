const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { calculateBookingAmounts } = require('../services/bookingPricing');
const { createOrder } = require('../services/razorpay');
const { logBookingEvent } = require('../services/audit');

const router = express.Router();

const ACTIVE_BOOKING_STATES = [
  'pending',
  'pending_payment',
  'paid_pending_confirmation',
  'confirmed',
  'in_progress'
];

// Statuses an owner may move a booking to, keyed by its current status.
// Paid bookings are confirmed by an admin (POST /api/admin/bookings/:id/approve).
const OWNER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  pending_payment: ['cancelled'],
  paid_pending_confirmation: ['cancelled'],
  confirmed: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['completed'],
};

const NON_CANCELLABLE_STATES = ['cancelled', 'completed', 'refund_initiated', 'refunded'];

const isMissingColumnError = (error) => /column .* does not exist/i.test(error?.message || '');

router.get('/my-bookings', authMiddleware, async (req, res) => {
  try {
    let result;
    try {
      result = await pool.query(`
        SELECT
          b.*,
          bk.title,
          bk.brand,
          bk.model,
          bk.image_url,
          bk.location,
          bk.price_per_day,
          u.name as owner_name,
          u.phone as owner_phone,
          p.status as payment_status_display,
          p.razorpay_order_id,
          p.razorpay_payment_id
        FROM bookings b
        JOIN bikes bk ON b.bike_id = bk.id
        JOIN users u ON b.owner_id = u.id
        LEFT JOIN LATERAL (
          SELECT status, razorpay_order_id, razorpay_payment_id
          FROM payments
          WHERE booking_id = b.id AND payer_id = b.renter_id
          ORDER BY created_at DESC
          LIMIT 1
        ) p ON true
        WHERE b.renter_id = $1
        ORDER BY b.created_at DESC
      `, [req.userId]);
    } catch (queryError) {
      if (!isMissingColumnError(queryError)) {
        throw queryError;
      }

      result = await pool.query(`
        SELECT
          b.*,
          bk.title,
          bk.brand,
          bk.model,
          bk.image_url,
          bk.location,
          bk.price_per_day,
          u.name as owner_name,
          u.phone as owner_phone,
          p.status as payment_status_display,
          NULL::text as razorpay_order_id,
          NULL::text as razorpay_payment_id
        FROM bookings b
        JOIN bikes bk ON b.bike_id = bk.id
        JOIN users u ON b.owner_id = u.id
        LEFT JOIN LATERAL (
          SELECT status
          FROM payments
          WHERE booking_id = b.id AND payer_id = b.renter_id
          ORDER BY created_at DESC
          LIMIT 1
        ) p ON true
        WHERE b.renter_id = $1
        ORDER BY b.created_at DESC
      `, [req.userId]);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/bike-bookings', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.*,
        bk.title,
        bk.brand,
        bk.model,
        bk.image_url,
        bk.location,
        bk.price_per_day,
        u.name as renter_name,
        u.phone as renter_phone,
        u.email as renter_email
      FROM bookings b
      JOIN bikes bk ON b.bike_id = bk.id
      JOIN users u ON b.renter_id = u.id
      WHERE b.owner_id = $1
      ORDER BY b.created_at DESC
    `, [req.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bike bookings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, [
  body('bike_id').isNumeric().withMessage('Valid bike ID is required'),
  body('start_date').isISO8601().withMessage('Valid start date is required'),
  body('end_date').isISO8601().withMessage('Valid end date is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { bike_id, start_date, end_date } = req.body;
    const bikeResult = await pool.query(
      'SELECT id, owner_id, price_per_day, available FROM bikes WHERE id = $1',
      [bike_id]
    );

    if (bikeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' });
    }

    const bike = bikeResult.rows[0];
    if (!bike.available) {
      return res.status(400).json({ error: 'Bike is not available' });
    }

    if (bike.owner_id === req.userId) {
      return res.status(400).json({ error: 'You cannot book your own bike' });
    }

    const conflictResult = await pool.query(`
      SELECT id FROM bookings
      WHERE bike_id = $1
      AND status = ANY($2::text[])
      AND (
        (start_date <= $3 AND end_date >= $3) OR
        (start_date <= $4 AND end_date >= $4) OR
        (start_date >= $3 AND end_date <= $4)
      )
    `, [bike_id, ACTIVE_BOOKING_STATES, start_date, end_date]);

    if (conflictResult.rows.length > 0) {
      return res.status(400).json({ error: 'Bike is already booked for these dates' });
    }

    let pricing;
    try {
      pricing = calculateBookingAmounts({
        startDate: start_date,
        endDate: end_date,
        pricePerDay: bike.price_per_day,
      });
    } catch (pricingError) {
      return res.status(400).json({ error: pricingError.message });
    }

    const { totalPrice, platformFee, ownerAmount } = pricing;

    let bookingResult;
    try {
      bookingResult = await pool.query(`
        INSERT INTO bookings (
          bike_id,
          renter_id,
          owner_id,
          start_date,
          end_date,
          total_price,
          status,
          booking_status,
          payment_status,
          payout_status,
          platform_fee,
          owner_amount,
          refund_amount
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment', 'pending_payment', 'created', 'not_ready', $7, $8, 0)
        RETURNING *
      `, [bike_id, req.userId, bike.owner_id, start_date, end_date, totalPrice, platformFee, ownerAmount]);
    } catch (insertError) {
      if (!isMissingColumnError(insertError)) {
        throw insertError;
      }

      // Backward-compatible insert for databases that still use the original schema.
      bookingResult = await pool.query(`
        INSERT INTO bookings (
          bike_id,
          renter_id,
          owner_id,
          start_date,
          end_date,
          total_price,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *
      `, [bike_id, req.userId, bike.owner_id, start_date, end_date, totalPrice]);
    }

    await logBookingEvent(bookingResult.rows[0].id, 'booking_created', {
      renterId: req.userId,
      bikeId: bike_id,
      totalPrice,
    });

    res.status(201).json({
      message: 'Booking created successfully. Complete payment to continue.',
      booking: bookingResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/:bookingId/payment-order', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const bookingResult = await pool.query(`
      SELECT b.*, bike.title AS bike_title
      FROM bookings b
      JOIN bikes bike ON bike.id = b.bike_id
      WHERE b.id = $1
    `, [bookingId]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.renter_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to pay for this booking' });
    }

    if (booking.status === 'cancelled' || booking.status === 'refunded') {
      return res.status(400).json({ error: 'This booking cannot be paid' });
    }

    if (booking.payment_status === 'captured') {
      return res.status(400).json({ error: 'This booking has already been paid' });
    }

    const amountInPaise = Math.round(Number(booking.total_price) * 100);
    const order = await createOrder({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `booking-${booking.id}-${Date.now()}`,
      notes: {
        booking_id: String(booking.id),
        renter_id: String(booking.renter_id),
        bike_title: booking.bike_title,
      },
    });

    const paymentResult = await pool.query(`
      INSERT INTO payments (
        booking_id,
        payer_id,
        amount,
        currency,
        payment_method,
        status,
        transaction_id,
        razorpay_order_id,
        gateway_payload
      )
      VALUES ($1, $2, $3, 'INR', 'razorpay', 'created', $4, $5, $6)
      RETURNING *
    `, [
      booking.id,
      req.userId,
      booking.total_price,
      `ORDER-${Date.now()}`,
      order.id,
      order,
    ]);

    await pool.query(`
      UPDATE bookings
      SET payment_status = 'created',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [booking.id]);

    await logBookingEvent(booking.id, 'payment_order_created', { razorpayOrderId: order.id });

    res.json({
      key: process.env.RAZORPAY_KEY_ID,
      order,
      payment: paymentResult.rows[0],
      booking: {
        id: booking.id,
        total_price: booking.total_price,
        bike_title: booking.bike_title,
      }
    });
  } catch (error) {
    console.error('Error creating payment order:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.description || error.message || 'Internal server error' });
  }
});

router.post('/:bookingId/cancel', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.renter_id !== req.userId && booking.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }

    if (booking.payout_status === 'transferred') {
      return res.status(400).json({ error: 'Booking cannot be cancelled after payout transfer' });
    }

    if (NON_CANCELLABLE_STATES.includes(booking.status)) {
      return res.status(400).json({ error: `A ${booking.status} booking cannot be cancelled` });
    }

    const result = await pool.query(`
      UPDATE bookings
      SET status = 'cancelled',
          booking_status = CASE
            WHEN payment_status = 'captured' THEN 'refund_initiated'
            ELSE 'cancelled'
          END,
          cancelled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [bookingId]);

    await logBookingEvent(bookingId, 'booking_cancel_requested', { userId: req.userId });

    res.json({
      message: 'Booking cancelled successfully',
      booking: result.rows[0],
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        b.*,
        bk.title,
        bk.brand,
        bk.model,
        bk.image_url,
        bk.location,
        bk.price_per_day,
        owner.name AS owner_name,
        owner.phone AS owner_phone,
        owner.email AS owner_email,
        renter.name AS renter_name,
        renter.phone AS renter_phone,
        renter.email AS renter_email
      FROM bookings b
      JOIN bikes bk ON b.bike_id = bk.id
      JOIN users owner ON b.owner_id = owner.id
      JOIN users renter ON b.renter_id = renter.id
      WHERE b.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];
    if (booking.renter_id !== req.userId && booking.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to view this booking' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Only the bike owner can update this booking' });
    }

    const allowedStatuses = OWNER_STATUS_TRANSITIONS[booking.status] || [];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: `Cannot change a ${booking.status} booking to ${status}` });
    }

    const result = await pool.query(`
      UPDATE bookings
      SET status = $1,
          booking_status = CASE
            WHEN $1 = 'cancelled' AND payment_status = 'captured' THEN 'refund_initiated'
            ELSE $1
          END,
          cancelled_at = CASE WHEN $1 = 'cancelled' THEN CURRENT_TIMESTAMP ELSE cancelled_at END,
          trip_completed_at = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE trip_completed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    await logBookingEvent(id, 'booking_status_updated', { status, userId: req.userId });

    res.json({
      message: 'Booking status updated successfully',
      booking: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
