const pool = require('../db');

const logBookingEvent = async (bookingId, eventType, metadata = {}) => {
  try {
    await pool.query(`
      INSERT INTO booking_audit_logs (booking_id, event_type, metadata)
      VALUES ($1, $2, $3)
    `, [bookingId, eventType, metadata]);
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = {
  logBookingEvent,
};
