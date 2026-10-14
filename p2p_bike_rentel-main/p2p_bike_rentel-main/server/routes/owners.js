const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/auth');
const { createLinkedAccount, fetchLinkedAccount } = require('../services/razorpay');

const router = express.Router();

router.post('/route-account', authMiddleware, async (req, res) => {
  try {
    const {
      legal_business_name,
      business_type,
      contact_name,
      phone,
      email,
      street1,
      city,
      state,
      postal_code,
    } = req.body;

    const account = await createLinkedAccount({
      email,
      phone,
      type: 'route',
      reference_id: `owner-${req.userId}`,
      legal_business_name,
      business_type: business_type || 'individual',
      contact_name,
      profile: {
        category: 'transportation',
        subcategory: 'bike_rental',
        addresses: {
          registered: {
            street1,
            city,
            state,
            postal_code,
            country: 'IN',
          },
        },
      },
      notes: {
        owner_id: String(req.userId),
      },
    });

    const result = await pool.query(`
      INSERT INTO owner_linked_accounts (
        owner_id,
        razorpay_account_id,
        onboarding_status,
        kyc_status,
        beneficiary_status,
        last_synced_at
      )
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (owner_id)
      DO UPDATE SET
        razorpay_account_id = EXCLUDED.razorpay_account_id,
        onboarding_status = EXCLUDED.onboarding_status,
        kyc_status = EXCLUDED.kyc_status,
        beneficiary_status = EXCLUDED.beneficiary_status,
        last_synced_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      req.userId,
      account.id,
      account.status || 'created',
      account.status || 'created',
      account.status || 'created',
    ]);

    res.status(201).json({
      message: 'Owner linked account created successfully',
      account: result.rows[0],
      razorpay: account,
    });
  } catch (error) {
    console.error('Owner linked account error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.error?.description || error.message || 'Internal server error' });
  }
});

router.get('/route-account/status', authMiddleware, async (req, res) => {
  try {
    const localAccount = await pool.query(`
      SELECT *
      FROM owner_linked_accounts
      WHERE owner_id = $1
      LIMIT 1
    `, [req.userId]);

    if (localAccount.rows.length === 0) {
      return res.json(null);
    }

    let remote = null;
    try {
      remote = await fetchLinkedAccount(localAccount.rows[0].razorpay_account_id);
      await pool.query(`
        UPDATE owner_linked_accounts
        SET onboarding_status = $1,
            kyc_status = $2,
            beneficiary_status = $3,
            last_synced_at = CURRENT_TIMESTAMP
        WHERE owner_id = $4
      `, [
        remote.status || localAccount.rows[0].onboarding_status,
        remote.status || localAccount.rows[0].kyc_status,
        remote.status || localAccount.rows[0].beneficiary_status,
        req.userId,
      ]);
    } catch (syncError) {
      console.error('Owner linked account sync error:', syncError.response?.data || syncError.message);
    }

    const refreshed = await pool.query(`
      SELECT *
      FROM owner_linked_accounts
      WHERE owner_id = $1
      LIMIT 1
    `, [req.userId]);

    res.json({
      ...refreshed.rows[0],
      razorpay: remote,
    });
  } catch (error) {
    console.error('Owner linked account status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
