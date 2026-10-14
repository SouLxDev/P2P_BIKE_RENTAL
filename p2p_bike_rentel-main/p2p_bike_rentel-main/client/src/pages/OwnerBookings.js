import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import './BikeList.css';

const OwnerBookings = () => {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      fetchOwnerBookings();
    }
  }, [user]);

  const fetchOwnerBookings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/bookings/bike-bookings');
      setBookings(response.data);
    } catch (error) {
      toast.error('Failed to fetch owner bookings.');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`/api/bookings/${id}/status`, { status });
      toast.success(`Booking ${status} successfully.`);
      setBookings((prev) => prev.map((booking) => (
        booking.id === id ? { ...booking, status } : booking
      )));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update booking.');
    }
  };

  if (authLoading || (!user && !authLoading)) {
    return <div className="loading">Checking authentication...</div>;
  }

  return (
    <div className="bike-list-page">
      <div className="container">
        <h1>Owner Bookings</h1>
        {loading ? (
          <div className="loading">Loading booking requests...</div>
        ) : bookings.length === 0 ? (
          <div className="no-results">
            <h3>No one has booked your bikes yet.</h3>
            <Link to="/my-bikes" className="btn btn-primary" style={{ marginTop: 16 }}>
              View My Bikes
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
                  <p className="bike-location">📍 {booking.location}</p>
                  <p className="bike-brand">Renter: {booking.renter_name}</p>
                  <p className="bike-brand">{booking.renter_phone} {booking.renter_email ? `| ${booking.renter_email}` : ''}</p>
                  <div className="bike-footer">
                    <span className="bike-price">₹{booking.total_price} total</span>
                    <span className={`bike-status ${booking.status}`}>
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: '#666', marginBottom: 10 }}>
                    <strong>From:</strong> {new Date(booking.start_date).toLocaleDateString()}<br />
                    <strong>To:</strong> {new Date(booking.end_date).toLocaleDateString()}
                  </div>
                  <div className="bike-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={`/bikes/${booking.bike_id}`} className="btn btn-primary">View Bike</Link>
                    <button className="btn btn-outline" onClick={() => navigate(`/messages?user=${booking.renter_id}`)}>
                      Message
                    </button>
                    {booking.status === 'pending' && (
                      <button className="btn btn-outline" onClick={() => updateStatus(booking.id, 'confirmed')}>
                        Confirm
                      </button>
                    )}
                    {['pending', 'pending_payment', 'paid_pending_confirmation', 'confirmed'].includes(booking.status) && (
                      <button className="btn btn-outline" onClick={() => updateStatus(booking.id, 'cancelled')}>
                        Cancel
                      </button>
                    )}
                    {booking.status === 'confirmed' && (
                      <button className="btn btn-outline" onClick={() => updateStatus(booking.id, 'completed')}>
                        Mark Complete
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

export default OwnerBookings;
