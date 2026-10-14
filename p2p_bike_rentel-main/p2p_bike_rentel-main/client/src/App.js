import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar.js';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import BikeList from './pages/BikeList';
import BikeDetail from './pages/BikeDetail';
import AddBike from './pages/AddBike';
import MyBikes from './pages/MyBikes';
import MyBookings from './pages/MyBookings';
import Profile from './pages/Profile';
import EditBike from './pages/EditBike';
import OwnerBookings from './pages/OwnerBookings';
import Messages from './pages/Messages';
import Payments from './pages/Payments';
import AdminDashboard from './pages/AdminDashboard';
import NotFound from './pages/NotFound';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  return user ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return user?.isAdmin ? children : <Navigate to="/" />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/bikes" element={<BikeList />} />
              <Route path="/bikes/:id" element={<BikeDetail />} />
              <Route path="/add-bike" element={
                <ProtectedRoute>
                  <AddBike />
                </ProtectedRoute>
              } />
              <Route path="/my-bikes" element={
                <ProtectedRoute>
                  <MyBikes />
                </ProtectedRoute>
              } />
              <Route path="/edit-bike/:id" element={
                <ProtectedRoute>
                  <EditBike />
                </ProtectedRoute>
              } />
              <Route path="/my-bookings" element={
                <ProtectedRoute>
                  <MyBookings />
                </ProtectedRoute>
              } />
              <Route path="/owner-bookings" element={
                <ProtectedRoute>
                  <OwnerBookings />
                </ProtectedRoute>
              } />
              <Route path="/messages" element={
                <ProtectedRoute>
                  <Messages />
                </ProtectedRoute>
              } />
              <Route path="/payments" element={
                <ProtectedRoute>
                  <Payments />
                </ProtectedRoute>
              } />
              <Route path="/admin" element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
