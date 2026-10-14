import React from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

const NotFound = () => (
  <div className="home">
    <section className="hero" style={{ minHeight: '60vh' }}>
      <div className="hero-content">
        <h1>404 — Page Not Found</h1>
        <p>The page you are looking for does not exist or has been moved.</p>
        <div className="hero-buttons">
          <Link to="/" className="btn btn-primary">Go Home</Link>
          <Link to="/bikes" className="btn btn-secondary">Browse Bikes</Link>
        </div>
      </div>
    </section>
  </div>
);

export default NotFound;
