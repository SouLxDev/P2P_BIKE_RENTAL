import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import './Auth.css';
import './FeaturePages.css';

const Profile = () => {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: ''
  });
  const [ownerForm, setOwnerForm] = useState({
    legal_business_name: '',
    business_type: 'individual',
    contact_name: '',
    phone: '',
    email: '',
    street1: '',
    city: '',
    state: '',
    postal_code: ''
  });
  const [linkedAccount, setLinkedAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerSaving, setOwnerSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchLinkedAccount();
    }
    // eslint-disable-next-line
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/users/profile');
      setProfile(response.data);
      setFormData({
        name: response.data.name || '',
        phone: response.data.phone || '',
        address: response.data.address || ''
      });
      setOwnerForm((prev) => ({
        ...prev,
        contact_name: response.data.name || '',
        phone: response.data.phone || '',
        email: response.data.email || '',
      }));
    } catch (error) {
      toast.error('Failed to fetch profile.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedAccount = async () => {
    try {
      const response = await axios.get('/api/owners/route-account/status');
      setLinkedAccount(response.data);
    } catch (error) {
      console.error('Linked account fetch error:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleOwnerChange = (e) => {
    setOwnerForm({
      ...ownerForm,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await axios.put('/api/users/profile', formData);
      setProfile(response.data.user);
      toast.success('Profile updated!');
    } catch (error) {
      toast.error('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleOwnerSubmit = async (e) => {
    e.preventDefault();
    setOwnerSaving(true);
    try {
      await axios.post('/api/owners/route-account', ownerForm);
      toast.success('Razorpay linked account submitted successfully.');
      fetchLinkedAccount();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create linked account.');
    } finally {
      setOwnerSaving(false);
    }
  };

  if (authLoading || (!user && !authLoading)) {
    return <div className="loading">Checking authentication...</div>;
  }

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="bike-list-page">
      <div className="container" style={{ maxWidth: 900 }}>
        <h1>My Profile</h1>
        <div className="list-stack">
          <div className="section-card">
            <h3>Profile Details</h3>
            <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={profile.email} disabled className="filter-input" />
              </div>
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required className="filter-input" />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} className="filter-input" />
              </div>
              <div className="form-group">
                <label htmlFor="address">Address</label>
                <textarea id="address" name="address" value={formData.address} onChange={handleChange} rows={3} className="filter-input" />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          <div className="section-card">
            <div className="section-header-row">
              <h3>Owner Payout Onboarding</h3>
              <span className="summary-pill">
                {linkedAccount?.onboarding_status || 'not_started'}
              </span>
            </div>
            {linkedAccount && (
              <div className="admin-muted-text" style={{ marginBottom: 16 }}>
                Linked account: {linkedAccount.razorpay_account_id}<br />
                KYC: {linkedAccount.kyc_status} | Beneficiary: {linkedAccount.beneficiary_status}
              </div>
            )}
            <form onSubmit={handleOwnerSubmit} className="stack-form">
              <input name="legal_business_name" value={ownerForm.legal_business_name} onChange={handleOwnerChange} className="filter-input" placeholder="Legal business name" required />
              <select name="business_type" value={ownerForm.business_type} onChange={handleOwnerChange} className="filter-select">
                <option value="individual">Individual</option>
                <option value="proprietorship">Proprietorship</option>
                <option value="partnership">Partnership</option>
              </select>
              <input name="contact_name" value={ownerForm.contact_name} onChange={handleOwnerChange} className="filter-input" placeholder="Contact name" required />
              <input name="phone" value={ownerForm.phone} onChange={handleOwnerChange} className="filter-input" placeholder="Business phone" required />
              <input name="email" value={ownerForm.email} onChange={handleOwnerChange} className="filter-input" placeholder="Business email" required />
              <input name="street1" value={ownerForm.street1} onChange={handleOwnerChange} className="filter-input" placeholder="Street address" required />
              <input name="city" value={ownerForm.city} onChange={handleOwnerChange} className="filter-input" placeholder="City" required />
              <input name="state" value={ownerForm.state} onChange={handleOwnerChange} className="filter-input" placeholder="State" required />
              <input name="postal_code" value={ownerForm.postal_code} onChange={handleOwnerChange} className="filter-input" placeholder="Postal code" required />
              <button type="submit" className="btn btn-primary" disabled={ownerSaving}>
                {ownerSaving ? 'Submitting...' : 'Create / Update Razorpay Linked Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
