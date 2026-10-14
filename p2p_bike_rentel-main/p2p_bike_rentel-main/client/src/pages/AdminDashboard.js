import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './BikeList.css';
import './FeaturePages.css';

const TABS = ['bookings', 'users', 'bikes', 'reviews', 'payments', 'messages'];

const StatCard = ({ label, value, hint }) => (
  <div className="list-item-card">
    <div className="admin-kpi-label">{label}</div>
    <div className="admin-kpi-value">{value}</div>
    {hint && <div className="admin-kpi-hint">{hint}</div>}
  </div>
);

const BarChart = ({ title, data, colorClass }) => {
  const maxValue = Math.max(...data.map((item) => Number(item.value) || 0), 1);

  return (
    <div className="section-card">
      <div className="section-header-row">
        <h3>{title}</h3>
      </div>
      <div className="chart-bars">
        {data.length === 0 ? (
          <p className="empty-state-inline">No chart data available.</p>
        ) : (
          data.map((item) => (
            <div key={item.label} className="chart-bar-row">
              <div className="chart-bar-meta">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
              <div className="chart-bar-track">
                <div
                  className={`chart-bar-fill ${colorClass}`}
                  style={{ width: `${(Number(item.value) / maxValue) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const Pagination = ({ page, totalPages, onChange }) => (
  <div className="admin-pagination">
    <button type="button" className="btn btn-outline" onClick={() => onChange(page - 1)} disabled={page <= 1}>
      Previous
    </button>
    <span className="summary-pill">Page {page} of {totalPages}</span>
    <button type="button" className="btn btn-outline" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
      Next
    </button>
  </div>
);

const AdminDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('bookings');
  const [resourceState, setResourceState] = useState(
    TABS.reduce((acc, tab) => ({
      ...acc,
      [tab]: { items: [], page: 1, totalPages: 1, total: 0, loading: false }
    }), {})
  );

  const currentResource = resourceState[activeTab];

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/dashboard');
      setDashboard(response.data);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const fetchResource = async (tab, page = 1) => {
    try {
      setResourceState((prev) => ({
        ...prev,
        [tab]: { ...prev[tab], loading: true }
      }));

      const params = new URLSearchParams({
        page: String(page),
        search,
      });

      if (tab === 'bookings') {
        params.set('status', bookingStatusFilter);
      }

      const response = await axios.get(`/api/admin/${tab}?${params.toString()}`);
      setResourceState((prev) => ({
        ...prev,
        [tab]: {
          ...response.data,
          loading: false
        }
      }));
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to load ${tab}.`);
      setResourceState((prev) => ({
        ...prev,
        [tab]: { ...prev[tab], loading: false }
      }));
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    fetchResource(activeTab, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search, bookingStatusFilter]);

  const updateBookingStatus = async (bookingId, status) => {
    try {
      await axios.put(`/api/admin/bookings/${bookingId}/status`, { status });
      toast.success(`Booking marked as ${status}.`);
      await Promise.all([fetchDashboard(), fetchResource('bookings', resourceState.bookings.page)]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update booking.');
    }
  };

  const approveBooking = async (bookingId) => {
    try {
      await axios.post(`/api/admin/bookings/${bookingId}/approve`);
      toast.success('Booking approved successfully.');
      await Promise.all([fetchDashboard(), fetchResource('bookings', resourceState.bookings.page)]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to approve booking.');
    }
  };

  const releasePayout = async (bookingId) => {
    try {
      await axios.post(`/api/admin/bookings/${bookingId}/release-payout`);
      toast.success('Payout released successfully.');
      await Promise.all([fetchDashboard(), fetchResource('bookings', resourceState.bookings.page), fetchResource('payments', resourceState.payments.page)]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to release payout.');
    }
  };

  const updatePaymentStatus = async (paymentId, status) => {
    try {
      await axios.put(`/api/admin/payments/${paymentId}/status`, { status });
      toast.success(`Payment marked as ${status}.`);
      await Promise.all([fetchDashboard(), fetchResource('payments', resourceState.payments.page)]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update payment.');
    }
  };

  const updateMessageRead = async (messageId, read) => {
    try {
      await axios.put(`/api/admin/messages/${messageId}/read`, { read });
      toast.success(`Message marked as ${read ? 'read' : 'unread'}.`);
      await Promise.all([fetchDashboard(), fetchResource('messages', resourceState.messages.page)]);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update message.');
    }
  };

  const deleteEntity = async (type, id, label) => {
    if (!window.confirm(`Delete this ${label}? This action cannot be undone.`)) return;

    try {
      await axios.delete(`/api/admin/${type}/${id}`);
      toast.success(`${label} deleted successfully.`);
      await Promise.all([fetchDashboard(), fetchResource(activeTab, currentResource.page)]);
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to delete ${label}.`);
    }
  };

  const exportCsv = async (tab) => {
    try {
      const params = new URLSearchParams({ search });
      if (tab === 'bookings') {
        params.set('status', bookingStatusFilter);
      }
      const response = await axios.get(`/api/admin/export/${tab}?${params.toString()}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${tab}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(`Failed to export ${tab}.`);
    }
  };

  const currentItems = useMemo(() => currentResource.items || [], [currentResource.items]);

  if (loading) {
    return <div className="loading">Loading admin dashboard...</div>;
  }

  if (!dashboard) {
    return <div className="loading">Dashboard data is unavailable.</div>;
  }

  const { stats, charts } = dashboard;

  return (
    <div className="bike-list-page">
      <div className="container">
        <h1>Admin Dashboard</h1>

        <div className="admin-toolbar section-card">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="filter-input"
            placeholder="Search current tab data"
          />
          <button type="button" className="btn btn-primary" onClick={() => setSearch(searchInput.trim())}>
            Search
          </button>
          <button type="button" className="btn btn-outline" onClick={() => { setSearch(''); setSearchInput(''); }}>
            Clear
          </button>
          {activeTab === 'bookings' && (
            <select
              value={bookingStatusFilter}
              onChange={(e) => setBookingStatusFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Booking Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}
          <button type="button" className="btn btn-outline" onClick={() => exportCsv(activeTab)}>
            Export CSV
          </button>
        </div>

        <div className="admin-kpi-grid">
          <StatCard label="Users" value={stats.total_users} hint="Registered accounts" />
          <StatCard label="Bikes" value={stats.total_bikes} hint={`${stats.available_bikes} currently available`} />
          <StatCard label="Bookings" value={stats.total_bookings} hint={`${stats.pending_bookings} pending approval`} />
          <StatCard label="Revenue" value={`₹${stats.total_revenue}`} hint={`${stats.total_payments} completed payments`} />
          <StatCard label="Reviews" value={stats.total_reviews} hint={`Average rating ${stats.average_rating}/5`} />
          <StatCard label="Messages" value={stats.total_messages} hint={`${stats.unread_messages} unread`} />
        </div>

        <div className="admin-chart-grid">
          <BarChart title="Revenue By Month" data={charts.revenueByMonth} colorClass="chart-bar-fill-blue" />
          <BarChart title="Bookings By Month" data={charts.bookingsByMonth} colorClass="chart-bar-fill-cyan" />
          <BarChart title="Booking Status Distribution" data={charts.bookingStatus} colorClass="chart-bar-fill-indigo" />
        </div>

        <div className="admin-tabs">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="section-card">
          <div className="section-header-row">
            <h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Management</h3>
            <span className="summary-pill">{currentResource.total} total</span>
          </div>

          {currentResource.loading ? (
            <div className="loading">Loading {activeTab}...</div>
          ) : (
            <div className="list-stack">
              {activeTab === 'bookings' && currentItems.map((booking) => (
                <div key={booking.id} className="list-item-card">
                  <div className="section-header-row">
                    <strong>{booking.bike_title}</strong>
                    <span className={`bike-status ${booking.status}`}>{booking.status}</span>
                  </div>
                  <div className="admin-muted-text">
                    {booking.renter_name} booked from {new Date(booking.start_date).toLocaleDateString()} to {new Date(booking.end_date).toLocaleDateString()}
                  </div>
                  <div className="admin-muted-text">
                    Owner: {booking.owner_name} | Total: ${booking.total_price}
                  </div>
                  <div className="admin-muted-text">
                    Payment: {booking.payment_status} | Payout: {booking.payout_status} | Linked account: {booking.razorpay_account_id ? booking.onboarding_status : 'missing'}
                  </div>
                  <div className="admin-action-row">
                    {booking.status === 'paid_pending_confirmation' && <button className="btn btn-outline" onClick={() => approveBooking(booking.id)}>Approve Paid Booking</button>}
                    {booking.status === 'confirmed' && <button className="btn btn-outline" onClick={() => updateBookingStatus(booking.id, 'in_progress')}>Mark In Progress</button>}
                    {booking.status !== 'cancelled' && booking.status !== 'refunded' && <button className="btn btn-outline" onClick={() => updateBookingStatus(booking.id, 'cancelled')}>Cancel</button>}
                    {booking.status !== 'completed' && booking.status !== 'cancelled' && <button className="btn btn-outline" onClick={() => updateBookingStatus(booking.id, 'completed')}>Complete</button>}
                    {booking.status === 'completed' && booking.payout_status !== 'transferred' && <button className="btn btn-outline" onClick={() => releasePayout(booking.id)}>Release Payout</button>}
                  </div>
                </div>
              ))}

              {activeTab === 'users' && currentItems.map((user) => (
                <div key={user.id} className="list-item-card">
                  <div className="section-header-row">
                    <strong>{user.name}</strong>
                    <button className="btn btn-outline admin-danger-button" onClick={() => deleteEntity('users', user.id, 'user')}>Delete User</button>
                  </div>
                  <div className="admin-muted-text">{user.email}</div>
                  <div className="admin-muted-text">{user.phone || 'No phone provided'}</div>
                </div>
              ))}

              {activeTab === 'bikes' && currentItems.map((bike) => (
                <div key={bike.id} className="list-item-card">
                  <div className="section-header-row">
                    <strong>{bike.title}</strong>
                    <span className={`bike-status ${bike.available ? 'available' : 'unavailable'}`}>{bike.available ? 'available' : 'unavailable'}</span>
                  </div>
                  <div className="admin-muted-text">{bike.location} | ${bike.price_per_day}/day</div>
                  <div className="admin-muted-text">Owner: {bike.owner_name}</div>
                  <div className="admin-action-row">
                    <button className="btn btn-outline admin-danger-button" onClick={() => deleteEntity('bikes', bike.id, 'bike')}>Delete Bike</button>
                  </div>
                </div>
              ))}

              {activeTab === 'reviews' && currentItems.map((review) => (
                <div key={review.id} className="list-item-card">
                  <div className="section-header-row">
                    <strong>{review.bike_title}</strong>
                    <span className="summary-pill">{review.rating}/5</span>
                  </div>
                  <div className="admin-muted-text">By {review.reviewer_name}</div>
                  <p style={{ margin: '10px 0' }}>{review.comment || 'No comment provided.'}</p>
                  <div className="admin-action-row">
                    <button className="btn btn-outline admin-danger-button" onClick={() => deleteEntity('reviews', review.id, 'review')}>Delete Review</button>
                  </div>
                </div>
              ))}

              {activeTab === 'payments' && currentItems.map((payment) => (
                <div key={payment.id} className="list-item-card">
                  <div className="section-header-row">
                    <strong>{payment.bike_title}</strong>
                    <span className={`bike-status ${payment.status === 'completed' ? 'available' : payment.status === 'failed' ? 'cancelled' : 'pending'}`}>{payment.status}</span>
                  </div>
                  <div className="admin-muted-text">{payment.payer_name} paid ${payment.amount}</div>
                  <div className="admin-muted-text">{payment.payment_method} | {payment.razorpay_order_id || payment.transaction_id}</div>
                  <div className="admin-muted-text">{payment.razorpay_payment_id || 'awaiting capture'}</div>
                  <div className="admin-action-row">
                    {payment.status !== 'captured' && payment.status !== 'completed' && <button className="btn btn-outline" onClick={() => updatePaymentStatus(payment.id, 'captured')}>Mark Captured</button>}
                    {payment.status !== 'completed' && <button className="btn btn-outline" onClick={() => updatePaymentStatus(payment.id, 'completed')}>Mark Completed</button>}
                    {payment.status !== 'failed' && <button className="btn btn-outline" onClick={() => updatePaymentStatus(payment.id, 'failed')}>Mark Failed</button>}
                    {payment.status !== 'pending' && <button className="btn btn-outline" onClick={() => updatePaymentStatus(payment.id, 'pending')}>Mark Pending</button>}
                    {payment.status !== 'refunded' && <button className="btn btn-outline" onClick={() => updatePaymentStatus(payment.id, 'refunded')}>Mark Refunded</button>}
                    <button className="btn btn-outline admin-danger-button" onClick={() => deleteEntity('payments', payment.id, 'payment')}>Delete Payment</button>
                  </div>
                </div>
              ))}

              {activeTab === 'messages' && currentItems.map((message) => (
                <div key={message.id} className="list-item-card">
                  <div className="section-header-row">
                    <strong>{message.sender_name} to {message.receiver_name}</strong>
                    <span className={`bike-status ${message.read ? 'available' : 'pending'}`}>{message.read ? 'read' : 'unread'}</span>
                  </div>
                  <p style={{ margin: '10px 0' }}>{message.content}</p>
                  <div className="admin-muted-text">{new Date(message.sent_at).toLocaleString()}</div>
                  <div className="admin-action-row">
                    <button className="btn btn-outline" onClick={() => updateMessageRead(message.id, !message.read)}>
                      Mark as {message.read ? 'Unread' : 'Read'}
                    </button>
                    <button className="btn btn-outline admin-danger-button" onClick={() => deleteEntity('messages', message.id, 'message')}>Delete Message</button>
                  </div>
                </div>
              ))}

              {currentItems.length === 0 && <p className="empty-state-inline">No records match the current filters.</p>}
            </div>
          )}

          {!currentResource.loading && currentResource.totalPages > 1 && (
            <Pagination
              page={currentResource.page}
              totalPages={currentResource.totalPages}
              onChange={(nextPage) => fetchResource(activeTab, nextPage)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
