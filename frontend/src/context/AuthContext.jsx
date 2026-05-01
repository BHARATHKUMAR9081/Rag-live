import React, { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for token on mount
    const storedToken = localStorage.getItem('token');
    const storedRole = localStorage.getItem('role');
    
    if (storedToken && storedRole) {
      setToken(storedToken);
      setUser({ role: storedRole });
    }
    setLoading(false);
  }, []);

  const login = (newToken, role, navigate) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', role);
    setToken(newToken);
    setUser({ role });
    if (role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/client');
    }
  };

  const logout = (navigate) => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
