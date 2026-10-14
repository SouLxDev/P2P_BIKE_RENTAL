const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { fetchPayment, verifyPaymentSignature, createRefund } = require('../services/razorpay');
const { logBookingEvent } = require('../services/audit');

const router = express.Router();

router.get('/my-payments', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        bk.start_date,
        bk.end_date,
        bk.status AS booking_status,
        bk.booking_status AS booking_state,
        bk.payout_status,
        bk.refund_amount,
        bike.id AS bike_id,
        bike.title,
        bike.brand,
        bike.model,
        bike.image_url,
        owner.name AS owner_name
      FROM payments p
      JOIN bookings bk ON bk.id = p.booking_id
      JOIN bikes bike ON bike.id = bk.bike_id
      JOIN users owner ON owner.id = bk.owner_id
      WHERE p.payer_id = $1
      ORDER BY p.created_at DESC
    `, [req.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/booking/:bookingId', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const result = await pool.query(`
      SELECT *
      FROM payments
      WHERE booking_id = $1 AND payer_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [bookingId, req.userId]);

    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Error fetching booking payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify', authMiddleware, [
  body('booking_id').isNumeric().withMessage('Valid booking ID is required'),
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [booking_id]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.renter_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to verify this payment' });
    }

    const isValidSignature = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValidSignature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    const paymentDetails = await fetchPayment(razorpay_payment_id);
    const paymentResult = await pool.query(`
      UPDATE payments
      SET razorpay_payment_id = $1,
          razorpay_signature = $2,
          status = 'captured',
          verified = true,
          gateway_payload = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE booking_id = $4 AND razorpay_order_id = $5
      RETURNING *
    `, [razorpay_payment_id, razorpay_signature, paymentDetails, booking_id, razorpay_order_id]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment order not found for this booking' });
    }

    await pool.query(`
      UPDATE bookings
      SET payment_status = 'captured',
          status = 'paid_pending_confirmation',
          booking_status = 'paid_pending_confirmation',
          payout_status = 'not_ready',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [booking_id]);

    await logBookingEvent(booking_id, 'payment_verified', { paymentId: razorpay_payment_id });

    res.json({
      message: 'Payment verified successfully',
      payment: paymentResult.rows[0]
    });
  } catch (error) {
    console.error('Error verifying payment:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.description || error.message || 'Internal server error' });
  }
});

router.post('/refund/:bookingId', authMiddleware, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.renter_id !== req.userId && booking.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to refund this booking' });
    }

    if (booking.status !== 'cancelled') {
      return res.status(400).json({ error: 'Only cancelled bookings can be refunded' });
    }

    if (booking.payment_status !== 'captured') {
      return res.status(400).json({ error: 'This booking has no captured payment to refund, or it was already refunded' });
    }

    const paymentResult = await pool.query(`
      SELECT *
      FROM payments
      WHERE booking_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [bookingId]);

    if (paymentResult.rows.length === 0 || !paymentResult.rows[0].razorpay_payment_id) {
      return res.status(400).json({ error: 'No captured Razorpay payment found for this booking' });
    }

    const refundAmount = Number((Number(booking.total_price) * 0.5).toFixed(2));
    const refund = await createRefund({
      paymentId: paymentResult.rows[0].razorpay_payment_id,
      amount: Math.round(refundAmount * 100),
      notes: {
        booking_id: String(bookingId),
        policy: '50_percent_refund',
      },
    });

    const refundResult = await pool.query(`
      INSERT INTO refunds (booking_id, payment_id, refund_amount, razorpay_refund_id, reason, status, gateway_payload)
      VALUES ($1, $2, $3, $4, $5, 'created', $6)
      RETURNING *
    `, [bookingId, paymentResult.rows[0].id, refundAmount, refund.id, '50% cancellation refund', refund]);

    await pool.query(`
      UPDATE bookings
      SET refund_amount = $1,
          payment_status = 'refunded',
          status = 'refund_initiated',
          booking_status = 'refund_initiated',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [refundAmount, bookingId]);

    await logBookingEvent(bookingId, 'refund_created', { refundId: refund.id, refundAmount });

    res.status(201).json({
      message: 'Refund initiated successfully',
      refund: refundResult.rows[0]
    });
  } catch (error) {
    console.error('Error creating refund:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.description || error.message || 'Internal server error' });
  }
});

module.exports = router;
