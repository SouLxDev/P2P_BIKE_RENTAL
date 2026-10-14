const express = require('express');
const pool = require('../db');
const { verifyWebhookSignature } = require('../services/razorpay');
const { logBookingEvent } = require('../services/audit');

const router = express.Router();

router.post('/razorpay', async (req, res) => {
  try {
    const signature = req.header('x-razorpay-signature');
    const rawBody = req.body.toString();

    if (!verifyWebhookSignature({ rawBody, signature })) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    if (event === 'payment.captured') {
      const entity = payload.payload.payment.entity;
      const paymentResult = await pool.query(`
        UPDATE payments
        SET status = 'captured',
            verified = true,
            gateway_payload = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE razorpay_payment_id = $2 OR razorpay_order_id = $3
        RETURNING *
      `, [payload, entity.id, entity.order_id]);

      if (paymentResult.rows.length > 0) {
        await pool.query(`
          UPDATE bookings
          SET payment_status = 'captured',
              booking_status = 'paid_pending_confirmation',
              status = 'paid_pending_confirmation',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [paymentResult.rows[0].booking_id]);
        await logBookingEvent(paymentResult.rows[0].booking_id, 'payment_captured_webhook', { paymentId: entity.id });
      }
    }

    if (event === 'payment.failed') {
      const entity = payload.payload.payment.entity;
      const paymentResult = await pool.query(`
        UPDATE payments
        SET status = 'failed',
            gateway_payload = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE razorpay_order_id = $2
        RETURNING *
      `, [payload, entity.order_id]);

      if (paymentResult.rows.length > 0) {
        await pool.query(`
          UPDATE bookings
          SET payment_status = 'failed',
              booking_status = 'pending_payment',
              status = 'pending_payment',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [paymentResult.rows[0].booking_id]);
        await logBookingEvent(paymentResult.rows[0].booking_id, 'payment_failed_webhook', { orderId: entity.order_id });
      }
    }

    if (event === 'refund.processed') {
      const entity = payload.payload.refund.entity;
      const refundResult = await pool.query(`
        UPDATE refunds
        SET status = 'processed',
            gateway_payload = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE razorpay_refund_id = $2
        RETURNING *
      `, [payload, entity.id]);

      if (refundResult.rows.length > 0) {
        await pool.query(`
          UPDATE bookings
          SET payment_status = 'refunded',
              booking_status = 'refunded',
              status = 'refunded',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [refundResult.rows[0].booking_id]);
        await logBookingEvent(refundResult.rows[0].booking_id, 'refund_processed_webhook', { refundId: entity.id });
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Razorpay webhook error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
