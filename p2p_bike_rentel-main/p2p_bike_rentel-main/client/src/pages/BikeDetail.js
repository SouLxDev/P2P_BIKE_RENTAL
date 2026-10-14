import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import './BikeList.css';
import './FeaturePages.css';

const BikeDetails = () => {
  const { id } = useParams();
  const [bike, setBike] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingData, setBookingData] = useState({ start_date: '', end_date: '' });
  const [bookingLoading, setBookingLoading] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ average_rating: 0, review_count: 0 });
  const [reviewForm, setReviewForm] = useState({ rating: '5', comment: '' });
  const [reviewLoading, setReviewLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBike();
    fetchReviews();
    // eslint-disable-next-line
  }, [id]);

  const fetchBike = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/bikes/${id}`);
      setBike(response.data);
    } catch (error) {
      setBike(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async () => {
    try {
      const response = await axios.get(`/api/reviews/bike/${id}`);
      setReviews(response.data.reviews || []);
      setReviewSummary(response.data.summary || { average_rating: 0, review_count: 0 });
    } catch (error) {
      console.error('Error fetching reviews:', error);
    }
  };

  const handleBookNow = () => {
    if (!user) {
      navigate('/login');
    } else {
      setShowBooking(true);
    }
  };

  const handleBookingChange = (e) => {
    setBookingData({ ...bookingData, [e.target.name]: e.target.value });
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setBookingLoading(true);

    if (!bookingData.start_date || !bookingData.end_date) {
      toast.error('Please select both start and end dates.');
      setBookingLoading(false);
      return;
    }

    if (new Date(bookingData.end_date) < new Date(bookingData.start_date)) {
      toast.error('End date cannot be before start date.');
      setBookingLoading(false);
      return;
    }

    try {
      await axios.post('/api/bookings', {
        bike_id: bike.id,
        start_date: bookingData.start_date,
        end_date: bookingData.end_date
      });
      setShowBooking(false);
      setBookingData({ start_date: '', end_date: '' });
      toast.success('Booking created successfully. Complete payment from My Bookings.');
    } catch (error) {
      const serverErrors = error.response?.data?.errors;
      if (Array.isArray(serverErrors) && serverErrors.length > 0) {
        toast.error(serverErrors[0].msg || 'Failed to book. Please check your details.');
      } else {
        toast.error(error.response?.data?.error || 'Failed to book. Please try again.');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setReviewLoading(true);

    try {
      await axios.post(`/api/reviews/bike/${id}`, {
        rating: Number(reviewForm.rating),
        comment: reviewForm.comment
      });
      toast.success('Review saved successfully!');
      setReviewForm({ rating: '5', comment: '' });
      fetchReviews();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save review.');
    } finally {
      setReviewLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading bike details...</div>;
  }

  if (!bike) {
    return (
      <div className="container">
        <h2>Bike Not Found</h2>
        <p>The bike you are looking for does not exist.</p>
        <Link to="/bikes" className="btn btn-primary">Back to Bikes</Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 900, marginTop: 32 }}>
      <div className="bike-card" style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'flex-start', padding: 0 }}>
        <img
          src={bike.image_url || '/placeholder-bike.jpg'}
          alt={bike.title}
          className="bike-image"
          style={{ width: 320, height: 240, objectFit: 'cover', borderRadius: '16px 0 0 16px', margin: 0 }}
        />
        <div className="bike-info" style={{ flex: 1, padding: 24 }}>
          <h2 style={{ color: '#4f8cff' }}>{bike.title}</h2>
          <p className="bike-brand">{bike.brand} {bike.model} ({bike.year})</p>
          <p className="bike-location">📍 {bike.location}</p>
          <p className="bike-description">{bike.description}</p>
          <div className="bike-footer" style={{ margin: '18px 0' }}>
            <span className="bike-price">₹{bike.price_per_day}/day</span>
            <span className={`bike-status ${bike.available ? 'available' : 'unavailable'}`}>
              {bike.available ? 'Available' : 'Not Available'}
            </span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <strong>Owner:</strong> {bike.owner_name} <br />
            <strong>Contact:</strong> {bike.owner_phone} {bike.owner_email && <>| {bike.owner_email}</>}
          </div>
          <div className="bike-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {bike.available ? (
              <button className="btn btn-primary" onClick={handleBookNow}>
                Book Now
              </button>
            ) : (
              <button className="btn btn-outline" disabled>
                Not Available
              </button>
            )}
            {user && bike.owner_id !== user.id && (
              <button
                className="btn btn-outline"
                onClick={() => navigate(`/messages?user=${bike.owner_id}`)}
              >
                Message Owner
              </button>
            )}
            <Link to="/bikes" className="btn btn-outline">
              Back to List
            </Link>
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginTop: 24 }}>
        <div className="section-header-row">
          <h3>Reviews</h3>
          <span className="summary-pill">
            {reviewSummary.average_rating} / 5 ({reviewSummary.review_count} reviews)
          </span>
        </div>

        {user && bike.owner_id !== user.id && (
          <form onSubmit={handleReviewSubmit} className="stack-form" style={{ marginBottom: 20 }}>
            <select
              name="rating"
              value={reviewForm.rating}
              onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}
              className="filter-select"
            >
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
            <textarea
              value={reviewForm.comment}
              onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
              rows={3}
              className="filter-input"
              placeholder="Share your experience with this bike"
            />
            <button type="submit" className="btn btn-primary" disabled={reviewLoading}>
              {reviewLoading ? 'Saving...' : 'Save Review'}
            </button>
          </form>
        )}

        {reviews.length === 0 ? (
          <p className="empty-state-inline">No reviews yet.</p>
        ) : (
          <div className="list-stack">
            {reviews.map((review) => (
              <div key={review.id} className="list-item-card">
                <div className="section-header-row">
                  <strong>{review.reviewer_name}</strong>
                  <span className="summary-pill">{review.rating} / 5</span>
                </div>
                <p style={{ margin: '8px 0 4px 0' }}>{review.comment || 'No written comment provided.'}</p>
                <small style={{ color: '#666' }}>
                  {new Date(review.created_at).toLocaleDateString()}
                </small>
              </div>
            ))}
          </div>
        )}
      </div>

      {showBooking && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Book {bike.title}</h3>
            <form onSubmit={handleBookingSubmit} className="stack-form">
              <label>
                Start Date:
                <input type="date" name="start_date" value={bookingData.start_date} onChange={handleBookingChange} required />
              </label>
              <label>
                End Date:
                <input type="date" name="end_date" value={bookingData.end_date} onChange={handleBookingChange} required />
              </label>
              <button type="submit" className="btn btn-primary" disabled={bookingLoading}>
                {bookingLoading ? 'Booking...' : 'Confirm Booking'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setShowBooking(false)}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BikeDetails;
