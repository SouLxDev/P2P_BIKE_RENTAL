import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/');
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('')
    : 'U';

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <span className="nav-logo-mark">🚴</span>
          <span>BikeRent</span>
        </Link>

        <div className="nav-menu">
          <div className="nav-primary-links">
            <Link to="/" className="nav-link">Home</Link>
            <Link to="/bikes" className="nav-link">Browse Bikes</Link>
            {user && <Link to="/add-bike" className="nav-link nav-link-emphasis">Add Bike</Link>}
          </div>

          {user ? (
            <div className="profile-menu" ref={menuRef}>
              <button
                type="button"
                className={`profile-trigger ${menuOpen ? 'open' : ''}`}
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="profile-avatar">{initials}</span>
                <span className="profile-copy">
                  <span className="profile-label">Account</span>
                  <span className="profile-name">{user.name || user.email}</span>
                </span>
                <span className="profile-caret">{menuOpen ? '▴' : '▾'}</span>
              </button>

              {menuOpen && (
                <div className="profile-dropdown" role="menu">
                  {user?.isAdmin && <Link to="/admin" className="dropdown-link" role="menuitem">Admin Dashboard</Link>}
                  <Link to="/my-bikes" className="dropdown-link" role="menuitem">My Bikes</Link>
                  <Link to="/my-bookings" className="dropdown-link" role="menuitem">My Bookings</Link>
                  <Link to="/owner-bookings" className="dropdown-link" role="menuitem">Owner Bookings</Link>
                  <Link to="/messages" className="dropdown-link" role="menuitem">Messages</Link>
                  <Link to="/payments" className="dropdown-link" role="menuitem">Payments</Link>
                  <Link to="/profile" className="dropdown-link" role="menuitem">Profile</Link>
                  <button type="button" onClick={handleLogout} className="dropdown-link dropdown-danger" role="menuitem">
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="nav-auth-links">
              <Link to="/login" className="nav-link">Login</Link>
              <Link to="/register" className="nav-link nav-link-emphasis">Register</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
