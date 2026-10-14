const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      WITH conversation_messages AS (
        SELECT
          m.*,
          CASE
            WHEN m.sender_id = $1 THEN m.receiver_id
            ELSE m.sender_id
          END AS other_user_id
        FROM messages m
        WHERE m.sender_id = $1 OR m.receiver_id = $1
      ),
      latest_messages AS (
        SELECT DISTINCT ON (other_user_id)
          id,
          other_user_id,
          content,
          sent_at,
          sender_id,
          receiver_id,
          read
        FROM conversation_messages
        ORDER BY other_user_id, sent_at DESC
      ),
      unread_counts AS (
        SELECT
          sender_id AS other_user_id,
          COUNT(*)::int AS unread_count
        FROM messages
        WHERE receiver_id = $1 AND read = false
        GROUP BY sender_id
      )
      SELECT
        lm.other_user_id,
        u.name AS other_user_name,
        u.email AS other_user_email,
        lm.content AS latest_message,
        lm.sent_at AS latest_message_at,
        COALESCE(uc.unread_count, 0) AS unread_count
      FROM latest_messages lm
      JOIN users u ON u.id = lm.other_user_id
      LEFT JOIN unread_counts uc ON uc.other_user_id = lm.other_user_id
      ORDER BY lm.sent_at DESC
    `, [req.userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const userCheck = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(`
      SELECT
        m.*,
        sender.name AS sender_name,
        receiver.name AS receiver_name
      FROM messages m
      JOIN users sender ON sender.id = m.sender_id
      JOIN users receiver ON receiver.id = m.receiver_id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.sent_at ASC
    `, [req.userId, userId]);

    res.json({
      otherUser: userCheck.rows[0],
      messages: result.rows
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, [
  body('receiver_id').isNumeric().withMessage('Valid receiver ID is required'),
  body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Message content is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { receiver_id, content } = req.body;

    if (Number(receiver_id) === req.userId) {
      return res.status(400).json({ error: 'You cannot message yourself' });
    }

    const receiverCheck = await pool.query('SELECT id FROM users WHERE id = $1', [receiver_id]);
    if (receiverCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Receiver not found' });
    }

    const result = await pool.query(`
      INSERT INTO messages (sender_id, receiver_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [req.userId, receiver_id, content.trim()]);

    res.status(201).json({
      message: 'Message sent successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:userId/read', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query(`
      UPDATE messages
      SET read = true
      WHERE sender_id = $1
        AND receiver_id = $2
        AND read = false
    `, [userId, req.userId]);

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
