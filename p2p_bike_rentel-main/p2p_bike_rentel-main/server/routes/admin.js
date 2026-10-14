const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { createDirectTransfer } = require('../services/razorpay');
const { logBookingEvent } = require('../services/audit');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

const PAGE_SIZE = 10;

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value).replace(/"/g, '""');
  return /[",\n]/.test(stringValue) ? `"${stringValue}"` : stringValue;
};

const sendCsv = (res, filename, rows) => {
  if (!rows.length) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('');
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
};

const parsePage = (value) => {
  const page = Number.parseInt(value, 10);
  return Number.isNaN(page) || page < 1 ? 1 : page;
};

const buildTextFilter = (fields, search, startIndex = 1) => {
  if (!search) {
    return { clause: '', params: [], nextIndex: startIndex };
  }

  const like = `%${search}%`;
  const params = fields.map(() => like);
  const clause = ` WHERE (${fields.map((field, index) => `${field} ILIKE $${startIndex + index}`).join(' OR ')})`;
  return { clause, params, nextIndex: startIndex + fields.length };
};

router.get('/dashboard', async (req, res) => {
  try {
    const [
      userCount,
      bikeCount,
      bookingCount,
      paymentStats,
      reviewCount,
      messageCount,
      revenueByMonth,
      bookingsByMonth,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total_users FROM users'),
      pool.query('SELECT COUNT(*)::int AS total_bikes, COUNT(*) FILTER (WHERE available = true)::int AS available_bikes FROM bikes'),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_bookings,
          COUNT(*) FILTER (WHERE status IN ('pending_payment', 'paid_pending_confirmation'))::int AS pending_bookings,
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_bookings,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_bookings,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_bookings
        FROM bookings
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_payments,
          COALESCE(SUM(amount), 0)::numeric(10,2) AS total_revenue
        FROM payments
        WHERE status IN ('captured', 'completed')
      `),
      pool.query('SELECT COUNT(*)::int AS total_reviews, COALESCE(ROUND(AVG(rating), 1), 0) AS average_rating FROM reviews'),
      pool.query('SELECT COUNT(*)::int AS total_messages, COUNT(*) FILTER (WHERE read = false)::int AS unread_messages FROM messages'),
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS label,
          COALESCE(SUM(amount), 0)::numeric(10,2) AS value
        FROM payments
        WHERE created_at >= NOW() - INTERVAL '5 months'
          AND status IN ('captured', 'completed')
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
      `),
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS label,
          COUNT(*)::int AS value
        FROM bookings
        WHERE created_at >= NOW() - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
      `),
    ]);

    res.json({
      stats: {
        ...userCount.rows[0],
        ...bikeCount.rows[0],
        ...bookingCount.rows[0],
        ...paymentStats.rows[0],
        ...reviewCount.rows[0],
        ...messageCount.rows[0],
      },
      charts: {
        revenueByMonth: revenueByMonth.rows,
        bookingsByMonth: bookingsByMonth.rows,
        bookingStatus: [
          { label: 'Pending', value: bookingCount.rows[0].pending_bookings },
          { label: 'Confirmed', value: bookingCount.rows[0].confirmed_bookings },
          { label: 'Completed', value: bookingCount.rows[0].completed_bookings },
          { label: 'Cancelled', value: bookingCount.rows[0].cancelled_bookings },
        ],
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/bookings', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const search = (req.query.search || '').trim();
    const status = (req.query.status || 'all').trim();
    const offset = (page - 1) * PAGE_SIZE;

    const filter = buildTextFilter(['bike.title', 'owner.name', 'renter.name'], search);
    let whereClause = filter.clause;
    const params = [...filter.params];
    let nextIndex = filter.nextIndex;

    if (status !== 'all') {
      whereClause += whereClause ? ` AND b.status = $${nextIndex}` : ` WHERE b.status = $${nextIndex}`;
      params.push(status);
      nextIndex += 1;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM bookings b
       JOIN bikes bike ON bike.id = b.bike_id
       JOIN users owner ON owner.id = b.owner_id
       JOIN users renter ON renter.id = b.renter_id
       ${whereClause}`,
      params
    );

    const result = await pool.query(
      `SELECT
        b.id,
        b.start_date,
        b.end_date,
        b.total_price,
        b.status,
        b.payment_status,
        b.payout_status,
        b.owner_amount,
        b.trip_completed_at,
        b.owner_id,
        b.renter_id,
        bike.id AS bike_id,
        bike.title AS bike_title,
        owner.name AS owner_name,
        renter.name AS renter_name,
        linked.razorpay_account_id,
        linked.onboarding_status
       FROM bookings b
       JOIN bikes bike ON bike.id = b.bike_id
       JOIN users owner ON owner.id = b.owner_id
       JOIN users renter ON renter.id = b.renter_id
       LEFT JOIN owner_linked_accounts linked ON linked.owner_id = b.owner_id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      [...params, PAGE_SIZE, offset]
    );

    res.json({
      items: result.rows,
      page,
      pageSize: PAGE_SIZE,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / PAGE_SIZE)),
    });
  } catch (error) {
    console.error('Admin bookings list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * PAGE_SIZE;
    const filter = buildTextFilter(['name', 'email', 'COALESCE(phone, \'\')'], search);

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM users ${filter.clause}`, filter.params);
    const result = await pool.query(
      `SELECT id, name, email, phone, created_at
       FROM users
       ${filter.clause}
       ORDER BY created_at DESC
       LIMIT $${filter.nextIndex} OFFSET $${filter.nextIndex + 1}`,
      [...filter.params, PAGE_SIZE, offset]
    );

    res.json({
      items: result.rows,
      page,
      pageSize: PAGE_SIZE,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / PAGE_SIZE)),
    });
  } catch (error) {
    console.error('Admin users list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/bikes', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * PAGE_SIZE;
    const filter = buildTextFilter(['b.title', 'b.location', 'u.name'], search);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM bikes b
       JOIN users u ON u.id = b.owner_id
       ${filter.clause}`,
      filter.params
    );

    const result = await pool.query(
      `SELECT b.id, b.title, b.location, b.price_per_day, b.available, u.name AS owner_name
       FROM bikes b
       JOIN users u ON u.id = b.owner_id
       ${filter.clause}
       ORDER BY b.created_at DESC
       LIMIT $${filter.nextIndex} OFFSET $${filter.nextIndex + 1}`,
      [...filter.params, PAGE_SIZE, offset]
    );

    res.json({
      items: result.rows,
      page,
      pageSize: PAGE_SIZE,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / PAGE_SIZE)),
    });
  } catch (error) {
    console.error('Admin bikes list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/reviews', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * PAGE_SIZE;
    const filter = buildTextFilter(['bike.title', 'reviewer.name', 'COALESCE(r.comment, \'\')'], search);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM reviews r
       JOIN bikes bike ON bike.id = r.bike_id
       JOIN users reviewer ON reviewer.id = r.reviewer_id
       ${filter.clause}`,
      filter.params
    );

    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, bike.title AS bike_title, reviewer.name AS reviewer_name
       FROM reviews r
       JOIN bikes bike ON bike.id = r.bike_id
       JOIN users reviewer ON reviewer.id = r.reviewer_id
       ${filter.clause}
       ORDER BY r.created_at DESC
       LIMIT $${filter.nextIndex} OFFSET $${filter.nextIndex + 1}`,
      [...filter.params, PAGE_SIZE, offset]
    );

    res.json({
      items: result.rows,
      page,
      pageSize: PAGE_SIZE,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / PAGE_SIZE)),
    });
  } catch (error) {
    console.error('Admin reviews list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * PAGE_SIZE;
    const filter = buildTextFilter(['bike.title', 'payer.name', 'p.transaction_id'], search);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM payments p
       JOIN bookings bk ON bk.id = p.booking_id
       JOIN bikes bike ON bike.id = bk.bike_id
       JOIN users payer ON payer.id = p.payer_id
       ${filter.clause}`,
      filter.params
    );

    const result = await pool.query(
       `SELECT p.id, p.amount, p.payment_method, p.status, p.transaction_id, p.created_at, p.razorpay_order_id, p.razorpay_payment_id, bike.title AS bike_title, payer.name AS payer_name
       FROM payments p
       JOIN bookings bk ON bk.id = p.booking_id
       JOIN bikes bike ON bike.id = bk.bike_id
       JOIN users payer ON payer.id = p.payer_id
       ${filter.clause}
       ORDER BY p.created_at DESC
       LIMIT $${filter.nextIndex} OFFSET $${filter.nextIndex + 1}`,
      [...filter.params, PAGE_SIZE, offset]
    );

    res.json({
      items: result.rows,
      page,
      pageSize: PAGE_SIZE,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / PAGE_SIZE)),
    });
  } catch (error) {
    console.error('Admin payments list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/messages', async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * PAGE_SIZE;
    const filter = buildTextFilter(['sender.name', 'receiver.name', 'm.content'], search);

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM messages m
       JOIN users sender ON sender.id = m.sender_id
       JOIN users receiver ON receiver.id = m.receiver_id
       ${filter.clause}`,
      filter.params
    );

    const result = await pool.query(
      `SELECT m.id, m.content, m.sent_at, m.read, sender.name AS sender_name, receiver.name AS receiver_name
       FROM messages m
       JOIN users sender ON sender.id = m.sender_id
       JOIN users receiver ON receiver.id = m.receiver_id
       ${filter.clause}
       ORDER BY m.sent_at DESC
       LIMIT $${filter.nextIndex} OFFSET $${filter.nextIndex + 1}`,
      [...filter.params, PAGE_SIZE, offset]
    );

    res.json({
      items: result.rows,
      page,
      pageSize: PAGE_SIZE,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / PAGE_SIZE)),
    });
  } catch (error) {
    console.error('Admin messages list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/export/:resource', async (req, res) => {
  try {
    const resource = req.params.resource;
    const search = (req.query.search || '').trim();
    const status = (req.query.status || 'all').trim();

    if (resource === 'bookings') {
      const filter = buildTextFilter(['bike.title', 'owner.name', 'renter.name'], search);
      let whereClause = filter.clause;
      const params = [...filter.params];
      let nextIndex = filter.nextIndex;
      if (status !== 'all') {
        whereClause += whereClause ? ` AND b.status = $${nextIndex}` : ` WHERE b.status = $${nextIndex}`;
        params.push(status);
      }
      const result = await pool.query(
        `SELECT b.id, bike.title AS bike_title, renter.name AS renter_name, owner.name AS owner_name, b.start_date, b.end_date, b.total_price, b.status
         FROM bookings b
         JOIN bikes bike ON bike.id = b.bike_id
         JOIN users owner ON owner.id = b.owner_id
         JOIN users renter ON renter.id = b.renter_id
         ${whereClause}
         ORDER BY b.created_at DESC`,
        params
      );
      return sendCsv(res, 'bookings.csv', result.rows);
    }

    if (resource === 'users') {
      const filter = buildTextFilter(['name', 'email', 'COALESCE(phone, \'\')'], search);
      const result = await pool.query(
        `SELECT id, name, email, phone, created_at FROM users ${filter.clause} ORDER BY created_at DESC`,
        filter.params
      );
      return sendCsv(res, 'users.csv', result.rows);
    }

    if (resource === 'bikes') {
      const filter = buildTextFilter(['b.title', 'b.location', 'u.name'], search);
      const result = await pool.query(
        `SELECT b.id, b.title, b.location, b.price_per_day, b.available, u.name AS owner_name
         FROM bikes b
         JOIN users u ON u.id = b.owner_id
         ${filter.clause}
         ORDER BY b.created_at DESC`,
        filter.params
      );
      return sendCsv(res, 'bikes.csv', result.rows);
    }

    if (resource === 'reviews') {
      const filter = buildTextFilter(['bike.title', 'reviewer.name', 'COALESCE(r.comment, \'\')'], search);
      const result = await pool.query(
        `SELECT r.id, bike.title AS bike_title, reviewer.name AS reviewer_name, r.rating, r.comment, r.created_at
         FROM reviews r
         JOIN bikes bike ON bike.id = r.bike_id
         JOIN users reviewer ON reviewer.id = r.reviewer_id
         ${filter.clause}
         ORDER BY r.created_at DESC`,
        filter.params
      );
      return sendCsv(res, 'reviews.csv', result.rows);
    }

    if (resource === 'payments') {
      const filter = buildTextFilter(['bike.title', 'payer.name', 'p.transaction_id'], search);
      const result = await pool.query(
         `SELECT p.id, bike.title AS bike_title, payer.name AS payer_name, p.amount, p.payment_method, p.status, p.transaction_id, p.razorpay_order_id, p.razorpay_payment_id, p.created_at
         FROM payments p
         JOIN bookings bk ON bk.id = p.booking_id
         JOIN bikes bike ON bike.id = bk.bike_id
         JOIN users payer ON payer.id = p.payer_id
         ${filter.clause}
         ORDER BY p.created_at DESC`,
        filter.params
      );
      return sendCsv(res, 'payments.csv', result.rows);
    }

    if (resource === 'messages') {
      const filter = buildTextFilter(['sender.name', 'receiver.name', 'm.content'], search);
      const result = await pool.query(
        `SELECT m.id, sender.name AS sender_name, receiver.name AS receiver_name, m.content, m.read, m.sent_at
         FROM messages m
         JOIN users sender ON sender.id = m.sender_id
         JOIN users receiver ON receiver.id = m.receiver_id
         ${filter.clause}
         ORDER BY m.sent_at DESC`,
        filter.params
      );
      return sendCsv(res, 'messages.csv', result.rows);
    }

    return res.status(400).json({ error: 'Unsupported export resource' });
  } catch (error) {
    console.error('Admin export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/bookings/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending_payment', 'paid_pending_confirmation', 'confirmed', 'in_progress', 'completed', 'cancelled', 'refund_initiated', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(
      'UPDATE bookings SET status = $1, booking_status = $1, trip_completed_at = CASE WHEN $1 = \'completed\' THEN CURRENT_TIMESTAMP ELSE trip_completed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    await logBookingEvent(id, 'admin_booking_status_update', { status });
    res.json({ message: 'Booking updated successfully', booking: result.rows[0] });
  } catch (error) {
    console.error('Admin booking update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/bookings/:id/approve', async (req, res) => {
  try {
    const bookingResult = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.payment_status !== 'captured') {
      return res.status(400).json({ error: 'Booking must have a captured payment before approval' });
    }

    const result = await pool.query(`
      UPDATE bookings
      SET status = 'confirmed',
          booking_status = 'confirmed',
          payout_status = 'awaiting_admin_release',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);

    await logBookingEvent(req.params.id, 'admin_booking_approved', { adminUserId: req.userId });
    res.json({ message: 'Booking approved successfully', booking: result.rows[0] });
  } catch (error) {
    console.error('Admin booking approve error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/bookings/:id/release-payout', async (req, res) => {
  try {
    const bookingResult = await pool.query(`
      SELECT b.*, linked.id AS linked_account_row_id, linked.razorpay_account_id, linked.onboarding_status
      FROM bookings b
      LEFT JOIN owner_linked_accounts linked ON linked.owner_id = b.owner_id
      WHERE b.id = $1
    `, [req.params.id]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'Booking must be completed before payout release' });
    }

    if (!booking.razorpay_account_id) {
      return res.status(400).json({ error: 'Owner linked account is missing' });
    }

    if (booking.payout_status === 'transferred') {
      return res.status(400).json({ error: 'Payout has already been transferred' });
    }

    const transfer = await createDirectTransfer({
      accountId: booking.razorpay_account_id,
      amount: Math.round(Number(booking.owner_amount || 0) * 100),
      currency: 'INR',
      notes: {
        booking_id: String(booking.id),
        owner_id: String(booking.owner_id),
      },
    });

    const payoutResult = await pool.query(`
      INSERT INTO payouts (
        booking_id,
        owner_id,
        linked_account_id,
        transfer_amount,
        platform_commission,
        razorpay_transfer_id,
        transfer_status,
        released_by_admin_id,
        released_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'transferred', $7, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      booking.id,
      booking.owner_id,
      booking.linked_account_row_id,
      booking.owner_amount,
      booking.platform_fee,
      transfer.id,
      req.userId,
    ]);

    await pool.query(`
      UPDATE bookings
      SET payout_status = 'transferred',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [booking.id]);

    await logBookingEvent(booking.id, 'admin_payout_released', { transferId: transfer.id, adminUserId: req.userId });

    res.json({
      message: 'Payout released successfully',
      payout: payoutResult.rows[0],
      transfer,
    });
  } catch (error) {
    console.error('Admin release payout error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.description || error.message || 'Internal server error' });
  }
});

router.put('/payments/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'captured', 'completed', 'failed', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
    const result = await pool.query(
      'UPDATE payments SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json({ message: 'Payment updated successfully', payment: result.rows[0] });
  } catch (error) {
    console.error('Admin payment update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM payments WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Admin payment delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/messages/:id/read', async (req, res) => {
  try {
    const { read } = req.body;
    const result = await pool.query(
      'UPDATE messages SET read = $1 WHERE id = $2 RETURNING *',
      [Boolean(read), req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json({ message: 'Message updated successfully', data: result.rows[0] });
  } catch (error) {
    console.error('Admin message update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM messages WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Admin message delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Admin user delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/bikes/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM bikes WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bike not found' });
    }
    res.json({ message: 'Bike deleted successfully' });
  } catch (error) {
    console.error('Admin bike delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Admin review delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/audit-logs/:bookingId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM booking_audit_logs WHERE booking_id = $1 ORDER BY created_at ASC',
      [req.params.bookingId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Admin audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
