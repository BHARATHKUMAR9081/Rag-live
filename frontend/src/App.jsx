import React, { useState, useEffect } from 'react';
import Uploader from './components/Uploader';
import ChatInterface from './components/ChatInterface';
import { Trash2, FileText } from 'lucide-react';
import './styles/App.css';

function App() {
  const [hasUploaded, setHasUploaded] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('http://localhost:8000/documents');
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

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDelete = async (fileId) => {
    if (!window.confirm(`Are you sure you want to delete ${fileId} from the vector storage?`)) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`http://localhost:8000/documents/${fileId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        // Refresh documents list
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
        <div className="nav-status">
          <span className="dot green"></span> System Online
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
                  <ul className="document-list">
                    {documents.map((docId) => (
                      <li key={docId} className="doc-item">
                        <div className="doc-info">
                          <FileText size={16} className="doc-icon" />
                          <span className="doc-name">{docId}</span>
                        </div>
                        <button
                          className="delete-btn"
                          onClick={() => handleDelete(docId)}
                          disabled={isDeleting}
                          title="Delete Document"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
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
        )}
      </main>
    </div>
  );
}

export default App;
