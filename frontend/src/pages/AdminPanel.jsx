import React, { useState, useEffect, useContext } from 'react';
import Uploader from '../components/Uploader';
import ChatInterface from '../components/ChatInterface';
import { Trash2, FileText, LogOut } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/App.css';

const AdminPanel = () => {
  const [hasUploaded, setHasUploaded] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const { token, logout } = useContext(AuthContext);
  const navigate = useNavigate();

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
        if (data.documents.length > 0) {
          setHasUploaded(true);
        } else {
          setHasUploaded(false);
        }
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchDocuments();
      fetchAnalytics();
    }
  }, [token]);

  const handleDelete = async (fileId) => {
    if (!window.confirm(`Are you sure you want to delete ${fileId} from the vector storage?`)) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`${API_URL}/documents/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        await fetchDocuments();
      } else {
        alert("Failed to delete document.");
      }
    } catch (err) {
      console.error("Error deleting:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="app-container">
      <nav className="top-nav">
        <div className="nav-brand">
          <div className="logo-glow"></div>
          <h1>DocuVision <span>AI</span></h1>
        </div>
        <div className="nav-status" style={{display: 'flex', alignItems: 'center'}}>
          <span className="dot green"></span> Admin Active
          <button onClick={() => logout(navigate)} className="new-upload-btn" style={{ marginLeft: '15px', padding: '5px 10px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <main className="app-main">
        {!hasUploaded ? (
          <Uploader onUploadComplete={fetchDocuments} onSkip={() => setHasUploaded(true)} />
        ) : (
          <div className="workspace">
            <div className="sidebar">
              <button className="new-upload-btn" onClick={() => setHasUploaded(false)}>
                + Upload New Documents
              </button>

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
                            <button
                              className="delete-btn"
                              onClick={() => handleDelete(doc.file_id)}
                              disabled={isDeleting}
                              title="Delete Document"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '5px', display: 'flex', gap: '15px' }}>
                            <span>Size: {formatBytes(doc.size_bytes)}</span>
                            <span>Uploaded: {new Date(doc.created_at).toLocaleDateString()}</span>
                            <span>By: {doc.uploader}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="info-panel glass-panel">
                <h3>System Intelligence</h3>
                {analytics ? (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    <li style={{ padding: '8px 0', borderBottom: '1px solid #374151' }}>
                      <span style={{ color: '#9ca3af' }}>Total Users:</span> <strong style={{ color: '#4ade80', float: 'right' }}>{analytics.total_users}</strong>
                    </li>
                    <li style={{ padding: '8px 0', borderBottom: '1px solid #374151' }}>
                      <span style={{ color: '#9ca3af' }}>Active Documents:</span> <strong style={{ color: '#4ade80', float: 'right' }}>{analytics.total_documents}</strong>
                    </li>
                    <li style={{ padding: '8px 0' }}>
                      <span style={{ color: '#9ca3af' }}>Chat Sessions:</span> <strong style={{ color: '#4ade80', float: 'right' }}>{analytics.total_conversations}</strong>
                    </li>
                  </ul>
                ) : (
                  <ul>
                    <li><span className="dot green"></span> Vector DB Active</li>
                    <li><span className="dot green"></span> Multi-Modal Vision Ready</li>
                  </ul>
                )}
              </div>
            </div>
            <div className="chat-area">
              <ChatInterface />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminPanel;
