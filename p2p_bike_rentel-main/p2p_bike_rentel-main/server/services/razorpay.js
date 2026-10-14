const axios = require('axios');
const crypto = require('crypto');

const baseURL = process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1';
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

const api = axios.create({
  baseURL,
  auth: {
    username: keyId,
    password: keySecret,
  },
  headers: {
    'Content-Type': 'application/json',
  },
});

const safeEqual = (expected, received) => {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const ensureCredentials = () => {
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
};

const createOrder = async ({ amount, currency = 'INR', receipt, notes }) => {
  ensureCredentials();
  const response = await api.post('/orders', {
    amount,
    currency,
    receipt,
    notes,
  });
  return response.data;
};

const fetchPayment = async (paymentId) => {
  ensureCredentials();
  const response = await api.get(`/payments/${paymentId}`);
  return response.data;
};

const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  ensureCredentials();
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  return safeEqual(expected, signature);
};

const verifyWebhookSignature = ({ rawBody, signature }) => {
  if (!webhookSecret) {
    throw new Error('Razorpay webhook secret is missing. Set RAZORPAY_WEBHOOK_SECRET.');
  }

  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  return safeEqual(expected, signature);
};

const createLinkedAccount = async (payload) => {
  ensureCredentials();
  const response = await api.post('/accounts', payload);
  return response.data;
};

const fetchLinkedAccount = async (accountId) => {
  ensureCredentials();
  const response = await api.get(`/accounts/${accountId}`);
  return response.data;
};

const createDirectTransfer = async ({ accountId, amount, currency = 'INR', notes }) => {
  ensureCredentials();
  const response = await api.post('/transfers', {
    account: accountId,
    amount,
    currency,
    notes,
  });
  return response.data;
};

const createRefund = async ({ paymentId, amount, notes }) => {
  ensureCredentials();
  const response = await api.post(`/payments/${paymentId}/refund`, {
    amount,
    notes,
  });
  return response.data;
};

module.exports = {
  keyId,
  createOrder,
  fetchPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createLinkedAccount,
  fetchLinkedAccount,
  createDirectTransfer,
  createRefund,
};
