import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import '../styles/App.css'; // Reuse existing styles

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        login(data.access_token, data.role, navigate);
      } else {
        const errData = await res.json();
        setError(errData.detail || 'Login failed');
      }
    } catch (err) {
      setError('Network error');
    }
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
      <div className="info-panel glass-panel" style={{ width: '400px', padding: '30px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>DocuVision <span style={{color: '#4ade80'}}>AI</span> Login</h2>
        {error && <div style={{ color: '#ef4444', marginBottom: '15px', textAlign: 'center' }}>{error}</div>}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #374151', background: '#1f2937', color: 'white' }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #374151', background: '#1f2937', color: 'white' }}
            required
          />
          <button type="submit" className="new-upload-btn" style={{ width: '100%', marginTop: '10px' }}>
            Login
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '20px', color: '#9ca3af' }}>
          Don't have an account? <Link to="/signup" style={{ color: '#4ade80' }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
