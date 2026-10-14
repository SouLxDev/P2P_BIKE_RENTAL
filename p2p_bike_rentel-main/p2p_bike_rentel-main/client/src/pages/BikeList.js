import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './BikeList.css';

const BikeList = () => {
  const [bikes, setBikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    location: '',
    minPrice: '',
    maxPrice: '',
    available: 'true'
  });

  useEffect(() => {
    const fetchBikes = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        Object.keys(filters).forEach(key => {
          if (filters[key]) {
            params.append(key, filters[key]);
          }
        });
        const response = await axios.get(`/api/bikes?${params.toString()}`);
        setBikes(response.data);
      } catch (error) {
        console.error('Error fetching bikes:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchBikes();
  }, [filters]);

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value
    });
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      location: '',
      minPrice: '',
      maxPrice: '',
      available: 'true'
    });
  };

  return (
    <div className="bike-list-page">
      <div className="container">
        <h1>Browse Bikes</h1>
        
        {/* Filters */}
        <div className="filters">
          <div className="filter-group">
            <input
              type="text"
              name="search"
              placeholder="Search by title or brand"
              value={filters.search}
              onChange={handleFilterChange}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <input
              type="text"
              name="location"
              placeholder="Search by location"
              value={filters.location}
              onChange={handleFilterChange}
              className="filter-input"
            />
          </div>
          
          <div className="filter-group">
            <input
              type="number"
              name="minPrice"
              placeholder="Min price"
              value={filters.minPrice}
              onChange={handleFilterChange}
              className="filter-input"
            />
          </div>
          
          <div className="filter-group">
            <input
              type="number"
              name="maxPrice"
              placeholder="Max price"
              value={filters.maxPrice}
              onChange={handleFilterChange}
              className="filter-input"
            />
          </div>
          
          <div className="filter-group">
            <select
              name="available"
              value={filters.available}
              onChange={handleFilterChange}
              className="filter-select"
            >
              <option value="true">Available</option>
              <option value="false">Not Available</option>
              <option value="">All</option>
            </select>
          </div>
          
          <button onClick={clearFilters} className="btn btn-outline">
            Clear Filters
          </button>
        </div>

        {/* Results */}
        <div className="results-info">
          {!loading && <p>{bikes.length} bikes found</p>}
        </div>

        {/* Bikes Grid */}
        {loading ? (
          <div className="loading">Loading bikes...</div>
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
                  <p className="bike-description">{bike.description}</p>
                  <div className="bike-footer">
                    <span className="bike-price">₹{bike.price_per_day}/day</span>
                    <span className={`bike-status ${bike.available ? 'available' : 'unavailable'}`}>
                      {bike.available ? 'Available' : 'Not Available'}
                    </span>
                  </div>
                  <div className="bike-actions">
                    <Link to={`/bikes/${bike.id}`} className="btn btn-primary">
                      View Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && bikes.length === 0 && (
          <div className="no-results">
            <h3>No bikes found</h3>
            <p>Try adjusting your search criteria or browse all available bikes.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BikeList;