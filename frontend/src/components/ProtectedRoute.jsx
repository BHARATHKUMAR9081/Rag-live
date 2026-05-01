import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { user, token, loading } = useContext(AuthContext);

  if (loading) {
    return <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return <Navigate to="/client" replace />;
  }

  return children;
};

export default ProtectedRoute;
