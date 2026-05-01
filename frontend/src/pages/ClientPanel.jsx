import React, { useState, useEffect, useContext } from 'react';
import ChatInterface from '../components/ChatInterface';
import { LogOut, FileText } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/App.css';

const ClientPanel = () => {
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { token, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_URL}/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  };

  useEffect(() => {
    if (token) fetchDocuments();
  }, [token]);

  return (
    <div className="app-container">
      <nav className="top-nav">
        <div className="nav-brand">
          <div className="logo-glow"></div>
          <h1>DocuVision <span>AI</span></h1>
        </div>
        <div className="nav-status" style={{display: 'flex', alignItems: 'center'}}>
          <span className="dot green"></span> Client Access
          <button onClick={() => logout(navigate)} className="new-upload-btn" style={{ marginLeft: '15px', padding: '5px 10px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <main className="app-main">
        <div className="workspace">
          <div className="sidebar">
            <div className="info-panel document-panel">
              <h3>Stored Documents ({documents.length})</h3>
              {documents.length === 0 ? (
                <p className="no-docs">No documents currently stored.</p>
              ) : (
                <>
                  <input 
                    type="text" 
                    placeholder="Search documents..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '8px', marginBottom: '10px', background: '#1f2937', color: 'white', border: '1px solid #374151', borderRadius: '5px' }}
                  />
                  <ul className="document-list">
                    {documents.filter(d => d.filename && d.filename.toLowerCase().includes(searchQuery.toLowerCase())).map((doc) => (
                      <li key={doc.file_id} className="doc-item" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px' }}>
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="doc-info">
                            <FileText size={16} className="doc-icon" />
                            <span className="doc-name">{doc.filename}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '5px', display: 'flex', gap: '15px' }}>
                          <span>Size: {formatBytes(doc.size_bytes)}</span>
                          <span>Uploaded: {new Date(doc.created_at).toLocaleDateString()}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="info-panel glass-panel">
              <h3>System Intelligence</h3>
              <ul>
                <li><span className="dot green"></span> Vector DB Active</li>
                <li><span className="dot green"></span> Multi-Modal Vision Ready</li>
              </ul>
            </div>
          </div>
          <div className="chat-area">
            <ChatInterface />
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClientPanel;
