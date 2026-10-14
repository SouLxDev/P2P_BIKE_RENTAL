import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import './BikeList.css';

const loadRazorpayScript = () => new Promise((resolve) => {
  if (window.Razorpay) {
    resolve(true);
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

const formatBookingStatus = (status) => status?.replace(/_/g, ' ') || 'pending';

const MyBookings = () => {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingBookingId, setPayingBookingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) fetchBookings();
    // eslint-disable-next-line
  }, [user]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/bookings/my-bookings');
      setBookings(response.data);
    } catch (error) {
      toast.error('Failed to fetch your bookings.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (booking) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await axios.post(`/api/bookings/${booking.id}/cancel`);
      toast.success('Booking cancelled successfully.');

      if (booking.payment_status === 'captured') {
        await axios.post(`/api/payments/refund/${booking.id}`);
        toast.success('50% refund initiated successfully.');
      }

      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to cancel booking.');
    }
  };

  const handlePayment = async (booking) => {
    try {
      setPayingBookingId(booking.id);
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        toast.error('Razorpay checkout failed to load.');
        return;
      }

      const orderResponse = await axios.post(`/api/bookings/${booking.id}/payment-order`);
      const { key, order } = orderResponse.data;

      const options = {
        key,
        amount: order.amount,
        currency: order.currency,
        name: 'BikeRent',
        description: `Payment for ${booking.title}`,
        order_id: order.id,
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.phone || '',
        },
        notes: order.notes,
        theme: {
          color: '#4f8cff',
        },
        handler: async (response) => {
          try {
            await axios.post('/api/payments/verify', {
              booking_id: booking.id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success('Payment verified successfully. Booking is awaiting admin approval.');
            fetchBookings();
          } catch (verifyError) {
            toast.error(verifyError.response?.data?.error || 'Payment verification failed.');
          }
        },
        modal: {
          ondismiss: () => {
            setPayingBookingId(null);
          },
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to start payment.');
    } finally {
      setPayingBookingId(null);
    }
  };

  if (authLoading || (!user && !authLoading)) {
    return <div className="loading">Checking authentication...</div>;
  }

  return (
    <div className="bike-list-page">
      <div className="container">
        <h1>My Bookings</h1>
        {loading ? (
          <div className="loading">Loading your bookings...</div>
        ) : bookings.length === 0 ? (
          <div className="no-results">
            <h3>You have not made any bookings yet.</h3>
            <Link to="/bikes" className="btn btn-primary" style={{ marginTop: 16 }}>
              Browse Bikes
            </Link>
          </div>
        ) : (
          <div className="bikes-grid">
            {bookings.map((booking) => (
              <div key={booking.id} className="bike-card">
                <img
                  src={booking.image_url || '/placeholder-bike.jpg'}
                  alt={booking.title}
                  className="bike-image"
                />
                <div className="bike-info">
                  <h3>{booking.title}</h3>
                  <p className="bike-brand">{booking.brand} {booking.model}</p>
                  <p className="bike-location">📍 {booking.location}</p>
                  <div className="bike-footer">
                    <span className="bike-price">₹{booking.price_per_day}/day</span>
                    <span className={`bike-status ${booking.status}`}>
                      {formatBookingStatus(booking.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                    <strong>From:</strong> {new Date(booking.start_date).toLocaleDateString()}<br />
                    <strong>To:</strong> {new Date(booking.end_date).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                    <strong>Total:</strong> ₹{booking.total_price}<br />
                    <strong>Payment:</strong> {booking.payment_status || booking.payment_status_display || 'created'}<br />
                    <strong>Payout:</strong> {booking.payout_status || 'not_ready'}
                  </div>
                  <div className="bike-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={`/bikes/${booking.bike_id}`} className="btn btn-primary" style={{ flex: 1 }}>
                      View Bike
                    </Link>
                    <button
                      className="btn btn-outline"
                      style={{ flex: 1 }}
                      onClick={() => navigate(`/messages?user=${booking.owner_id}`)}
                    >
                      Message
                    </button>
                    {booking.payment_status !== 'captured' && booking.status !== 'cancelled' && booking.status !== 'refunded' && (
                      <button
                        className="btn btn-outline"
                        style={{ flex: 1 }}
                        onClick={() => handlePayment(booking)}
                        disabled={payingBookingId === booking.id}
                      >
                        {payingBookingId === booking.id ? 'Opening...' : 'Pay With Razorpay'}
                      </button>
                    )}
                    {booking.status !== 'cancelled' && booking.status !== 'completed' && booking.status !== 'refunded' && (
                      <button
                        className="btn btn-outline"
                        style={{ flex: 1, color: '#e74c3c', borderColor: '#e74c3c' }}
                        onClick={() => handleCancel(booking)}
                      >
                        Cancel
                      </button>
                    )}
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

export default MyBookings;
