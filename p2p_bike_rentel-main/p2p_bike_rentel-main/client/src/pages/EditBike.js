import React, { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import './BikeList.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

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

const LocationPicker = ({ setLatLng, latitude, longitude }) => {
  useMapEvents({
    click(e) {
      setLatLng(e.latlng);
    },
  });

  return latitude && longitude ? <Marker position={[latitude, longitude]} /> : null;
};

const EditBike = () => {
  const { id } = useParams();
  const navigate = useNavigate();
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
    image_url: '',
    available: true
  });
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchBike = async () => {
      try {
        const response = await axios.get(`/api/bikes/${id}`);
        setFormData({
          title: response.data.title || '',
          description: response.data.description || '',
          brand: response.data.brand || '',
          model: response.data.model || '',
          year: response.data.year || '',
          price_per_day: response.data.price_per_day || '',
          location: response.data.location || '',
          latitude: response.data.latitude || '',
          longitude: response.data.longitude || '',
          image_url: response.data.image_url || '',
          available: response.data.available
        });
        setImagePreview(response.data.image_url || null);
      } catch (error) {
        toast.error('Failed to load bike details.');
        navigate('/my-bikes');
      } finally {
        setLoading(false);
      }
    };

    fetchBike();
  }, [id, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const compressedImage = await resizeImageToDataUrl(file);
      setFormData((prev) => ({ ...prev, image_url: compressedImage }));
      setImagePreview(compressedImage);
    } catch (error) {
      toast.error('Failed to process image. Please try another file.');
    }
  };

  const setLatLng = (latlng) => {
    setFormData((prev) => ({
      ...prev,
      latitude: latlng.lat,
      longitude: latlng.lng,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await axios.put(`/api/bikes/${id}`, formData);
      toast.success('Bike updated successfully!');
      navigate('/my-bikes');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update bike.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading bike...</div>;
  }

  return (
    <div className="container" style={{ maxWidth: 700, marginTop: 32 }}>
      <div className="bike-card" style={{ maxWidth: '100%', padding: 32 }}>
        <h2 style={{ color: '#4f8cff', marginBottom: 24 }}>Edit Bike</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="title">Title*</label>
            <input id="title" name="title" value={formData.title} onChange={handleChange} required className="filter-input" />
          </div>
          <div className="form-group">
            <label htmlFor="description">Description*</label>
            <textarea id="description" name="description" value={formData.description} onChange={handleChange} rows={3} required className="filter-input" />
          </div>
          <div className="form-group">
            <label htmlFor="brand">Brand</label>
            <input id="brand" name="brand" value={formData.brand} onChange={handleChange} className="filter-input" />
          </div>
          <div className="form-group">
            <label htmlFor="model">Model</label>
            <input id="model" name="model" value={formData.model} onChange={handleChange} className="filter-input" />
          </div>
          <div className="form-group">
            <label htmlFor="year">Year</label>
            <input id="year" type="number" name="year" value={formData.year} onChange={handleChange} className="filter-input" />
          </div>
          <div className="form-group">
            <label htmlFor="price_per_day">Price per Day ($)*</label>
            <input id="price_per_day" type="number" name="price_per_day" value={formData.price_per_day} onChange={handleChange} required className="filter-input" />
          </div>
          <div className="form-group">
            <label htmlFor="location">Location*</label>
            <input id="location" name="location" value={formData.location} onChange={handleChange} required className="filter-input" />
          </div>
          <div className="form-group" style={{ alignItems: 'flex-start' }}>
            <label htmlFor="available">
              <input
                id="available"
                type="checkbox"
                name="available"
                checked={formData.available}
                onChange={handleChange}
                style={{ marginRight: 8 }}
              />
              Available for booking
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="image_upload">Replace Image</label>
            <input id="image_upload" type="file" accept="image/*" onChange={handleImageChange} className="filter-input" />
            {imagePreview && (
              <img src={imagePreview} alt="Preview" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, marginTop: 8 }} />
            )}
          </div>
          <div className="form-group">
            <label>Update Location on Map</label>
            <div style={{ height: 250, width: '100%', marginBottom: 8, borderRadius: 8, overflow: 'hidden' }}>
              <MapContainer
                center={[formData.latitude || 18.5204, formData.longitude || 73.8567]}
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
          <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditBike;
