import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Home.css';

const Home = () => {
  const [featuredBikes, setFeaturedBikes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeaturedBikes();
  }, []);

  const fetchFeaturedBikes = async () => {
    try {
      const response = await axios.get('/api/bikes?available=true');
      setFeaturedBikes(response.data.slice(0, 3)); // Show only first 3 bikes
    } catch (error) {
      console.error('Error fetching featured bikes:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>Rent Bikes from Your Neighbors</h1>
          <p>Discover amazing bikes in your area and start your adventure today!</p>
          <div className="hero-buttons">
            <Link to="/bikes" className="btn btn-primary">Browse Bikes</Link>
            <Link to="/add-bike" className="btn btn-secondary">List Your Bike</Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <h2>Why Choose BikeRent?</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🚴‍♂️</div>
              <h3>Wide Selection</h3>
              <p>Choose from hundreds of bikes including mountain bikes, road bikes, and city cruisers.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💰</div>
              <h3>Affordable Prices</h3>
              <p>Rent bikes at competitive prices starting from just $15 per day.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Safe & Secure</h3>
              <p>All transactions are secured and bikes are verified by our community.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📱</div>
              <h3>Easy Booking</h3>
              <p>Book your perfect bike in just a few clicks with our simple booking system.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Bikes Section */}
      <section className="featured-bikes">
        <div className="container">
          <h2>Featured Bikes</h2>
          {loading ? (
            <div className="loading">Loading bikes...</div>
          ) : (
            <div className="bikes-grid">
              {featuredBikes.map(bike => (
                <div key={bike.id} className="bike-card">
                  <img 
                    src={bike.image_url || '/placeholder-bike.jpg'} 
                    alt={bike.title}
                    className="bike-image"
                  />
                  <div className="bike-info">
                    <h3>{bike.title}</h3>
                    <p className="bike-location">📍 {bike.location}</p>
                    <p className="bike-price">₹{bike.price_per_day}/day</p>
                    <Link to={`/bikes/${bike.id}`} className="btn btn-primary">
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && featuredBikes.length === 0 && (
            <p className="no-bikes">No bikes available at the moment.</p>
          )}
          <div className="text-center">
            <Link to="/bikes" className="btn btn-outline">View All Bikes</Link>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <div className="container">
          <h2>How It Works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3>Browse</h3>
              <p>Search for bikes in your area and find the perfect one for your needs.</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>Book</h3>
              <p>Select your dates and send a booking request to the bike owner.</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>Ride</h3>
              <p>Meet the owner, pick up your bike, and enjoy your adventure!</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;