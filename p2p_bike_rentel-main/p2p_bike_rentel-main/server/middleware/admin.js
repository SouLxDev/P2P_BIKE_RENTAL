const pool = require('../db');
const { isAdminEmail } = require('../utils/admin');

const adminMiddleware = async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!isAdminEmail(result.rows[0].email)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = adminMiddleware;
