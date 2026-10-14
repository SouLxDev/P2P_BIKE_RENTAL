import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import './BikeList.css';

const MyBikes = () => {
  const { user, loading: authLoading } = useAuth();
  const [bikes, setBikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) fetchMyBikes();
    // eslint-disable-next-line
  }, [user]);

  const fetchMyBikes = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/users/my-bikes');
      setBikes(response.data);
    } catch (error) {
      toast.error('Failed to fetch your bikes.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this bike?')) return;
    try {
      await axios.delete(`/api/bikes/${id}`);
      toast.success('Bike deleted!');
      setBikes(bikes.filter(bike => bike.id !== id));
    } catch (error) {
      toast.error('Failed to delete bike.');
    }
  };

  if (authLoading || (!user && !authLoading)) {
    return <div className="loading">Checking authentication...</div>;
  }

  return (
    <div className="bike-list-page">
      <div className="container">
        <h1>My Bikes</h1>
        {loading ? (
          <div className="loading">Loading your bikes...</div>
        ) : bikes.length === 0 ? (
          <div className="no-results">
            <h3>You have not listed any bikes yet.</h3>
            <Link to="/add-bike" className="btn btn-primary" style={{ marginTop: 16 }}>
              Add Your First Bike
            </Link>
          </div>
        ) : (
          <div className="bikes-grid">
            {bikes.map(bike => (
              <div key={bike.id} className="bike-card">
                <img
                  src={bike.image_url || '/placeholder-bike.jpg'}
                  alt={bike.title}
                  className="bike-image"
                />
                <div className="bike-info">
                  <h3>{bike.title}</h3>
                  <p className="bike-brand">{bike.brand} {bike.model}</p>
                  <p className="bike-location">📍 {bike.location}</p>
                  <div className="bike-footer">
                    <span className="bike-price">₹{bike.price_per_day}/day</span>
                    <span className={`bike-status ${bike.available ? 'available' : 'unavailable'}`}>
                      {bike.available ? 'Available' : 'Not Available'}
                    </span>
                  </div>
                  <div className="bike-actions" style={{ display: 'flex', gap: 8 }}>
                    <Link to={`/bikes/${bike.id}`} className="btn btn-primary" style={{ flex: 1 }}>
                      View
                    </Link>
                    <Link to={`/edit-bike/${bike.id}`} className="btn btn-outline" style={{ flex: 1 }}>
                      Edit
                    </Link>
                    <button
                      className="btn btn-outline"
                      style={{ flex: 1, color: '#e74c3c', borderColor: '#e74c3c' }}
                      onClick={() => handleDelete(bike.id)}
                    >
                      Delete
                    </button>
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

export default MyBikes;
