const dotenv = require('dotenv');
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add a long random value to server/.env before starting the server.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const pool = require('./db');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 5050;

// Middleware
app.use(cors());
app.use('/api/webhooks/razorpay', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

// Routes
const authRoutes = require('./routes/auth');
const bikeRoutes = require('./routes/bikes');
const bookingRoutes = require('./routes/bookings');
const userRoutes = require('./routes/users');
const reviewRoutes = require('./routes/reviews');
const messageRoutes = require('./routes/messages');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owners');

app.use('/api/auth', authRoutes);
app.use('/api/bikes', bikeRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/webhooks', webhookRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Bike Rental API is running!' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ connected: true, time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Uploaded image is too large. Please choose a smaller image.'
    });
  }

  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing process or change PORT in .env.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
