import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import './BikeList.css';

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/payments/my-payments');
      setPayments(response.data);
    } catch (error) {
      toast.error('Failed to load payments.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bike-list-page">
      <div className="container">
        <h1>Payments</h1>
        {loading ? (
          <div className="loading">Loading payments...</div>
        ) : payments.length === 0 ? (
          <div className="no-results">
            <h3>No payments yet.</h3>
            <Link to="/my-bookings" className="btn btn-primary" style={{ marginTop: 16 }}>
              Go To Bookings
            </Link>
          </div>
        ) : (
          <div className="bikes-grid">
            {payments.map((payment) => (
              <div key={payment.id} className="bike-card">
                <img
                  src={payment.image_url || '/placeholder-bike.jpg'}
                  alt={payment.title}
                  className="bike-image"
                />
                <div className="bike-info">
                  <h3>{payment.title}</h3>
                  <p className="bike-brand">{payment.brand} {payment.model}</p>
                  <p className="bike-location">Owner: {payment.owner_name}</p>
                  <div className="bike-footer">
                    <span className="bike-price">₹{payment.amount}</span>
                    <span className={`bike-status ${payment.status === 'captured' || payment.status === 'completed' ? 'available' : 'unavailable'}`}>
                      {payment.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 10 }}>
                    <strong>Method:</strong> {payment.payment_method}<br />
                    <strong>Order:</strong> {payment.razorpay_order_id || payment.transaction_id || 'n/a'}<br />
                    <strong>Payment:</strong> {payment.razorpay_payment_id || 'pending verification'}<br />
                    <strong>Paid On:</strong> {new Date(payment.created_at).toLocaleString()}
                  </div>
                  <div className="bike-actions">
                    <Link to={`/bikes/${payment.bike_id}`} className="btn btn-outline">
                      View Bike
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Payments;
