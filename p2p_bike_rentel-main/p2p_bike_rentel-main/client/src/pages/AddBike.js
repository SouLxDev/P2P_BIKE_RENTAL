import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './BikeList.css';

// Fix default marker icon issue in leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const LocationPicker = ({ setLatLng, latitude, longitude }) => {
  useMapEvents({
    click(e) {
      setLatLng(e.latlng);
    },
  });
  return latitude && longitude ? <Marker position={[latitude, longitude]} /> : null;
};

const resizeImageToDataUrl = (file, maxWidth = 1400, quality = 0.8) => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = reject;
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  })
);

const AddBike = () => {
  const { user, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    brand: '',
    model: '',
    year: '',
    price_per_day: '',
    location: '',
    latitude: '',
    longitude: '',
    image_url: '' // Will store base64 string or uploaded URL
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  // Handle image file upload
  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressedImage = await resizeImageToDataUrl(file);
        setFormData((prev) => ({ ...prev, image_url: compressedImage }));
        setImagePreview(compressedImage);
      } catch (error) {
        toast.error('Failed to process image. Please try another file.');
      }
    }
  };

  // Handle map click to set latitude/longitude
  const setLatLng = (latlng) => {
    setFormData((prev) => ({
      ...prev,
      latitude: latlng.lat,
      longitude: latlng.lng,
    }));
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      ...formData,
      year: formData.year ? Number(formData.year) : null,
      latitude: formData.latitude ? Number(formData.latitude) : null,
      longitude: formData.longitude ? Number(formData.longitude) : null,
      price_per_day: formData.price_per_day ? Number(formData.price_per_day) : null,
    };

    try {
      await axios.post('/api/bikes', payload);
      toast.success('Bike added successfully!');
      navigate('/bikes');
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
        'Failed to add bike. Please check your input and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || (!user && !authLoading)) {
    return <div className="loading">Checking authentication...</div>;
  }

  return (
    <div className="container" style={{ maxWidth: 700, marginTop: 32 }}>
      <div className="bike-card" style={{ maxWidth: '100%', padding: 32 }}>
        <h2 style={{ color: '#4f8cff', marginBottom: 24 }}>Add a New Bike</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="title">Title*</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="e.g. Mountain Bike"
              className="filter-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">Description*</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              placeholder="Describe your bike"
              rows={3}
              className="filter-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="brand">Brand</label>
            <input
              type="text"
              id="brand"
              name="brand"
              value={formData.brand}
              onChange={handleChange}
              placeholder="e.g. Trek"
              className="filter-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="model">Model</label>
            <input
              type="text"
              id="model"
              name="model"
              value={formData.model}
              onChange={handleChange}
              placeholder="e.g. Marlin 7"
              className="filter-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="year">Year</label>
            <input
              type="number"
              id="year"
              name="year"
              value={formData.year}
              onChange={handleChange}
              placeholder="e.g. 2022"
              className="filter-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="price_per_day">Price per Day ($)*</label>
            <input
              type="number"
              id="price_per_day"
              name="price_per_day"
              value={formData.price_per_day}
              onChange={handleChange}
              required
              min="1"
              placeholder="e.g. 20"
              className="filter-input"
            />
          </div>
          <div className="form-group">
            <label htmlFor="location">Location*</label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              required
              placeholder="e.g. New York"
              className="filter-input"
            />
          </div>
          {/* Image Upload */}
          <div className="form-group">
            <label htmlFor="image_upload">Image Upload</label>
            <input
              type="file"
              id="image_upload"
              accept="image/*"
              onChange={handleImageChange}
              className="filter-input"
            />
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview"
                style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
              />
            )}
          </div>
          {/* Map Integration */}
          <div className="form-group">
            <label>Pick Location on Map</label>
            <div style={{ height: 250, width: '100%', marginBottom: 8, borderRadius: 8, overflow: 'hidden' }}>
              <MapContainer
                center={[
                  formData.latitude || 18.5204, // Pune latitude
                  formData.longitude || 73.8567 // Pune longitude
                ]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <LocationPicker
                  setLatLng={setLatLng}
                  latitude={formData.latitude}
                  longitude={formData.longitude}
                />
              </MapContainer>
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>
              Lat: {formData.latitude || '--'} | Lng: {formData.longitude || '--'}
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
            style={{ marginTop: 16 }}
          >
            {loading ? 'Adding...' : 'Add Bike'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddBike;
