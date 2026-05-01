import React, { useState, useCallback, useContext } from 'react';
import { useDropzone } from 'react-dropzone';
import { AuthContext } from '../context/AuthContext';
import { UploadCloud, File, X, Loader2 } from 'lucide-react';
import '../styles/Uploader.css';

const Uploader = ({ onUploadComplete, onSkip }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const { token } = useContext(AuthContext);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const onDrop = useCallback(acceptedFiles => {
    // only accept pdf
    const pdfs = acceptedFiles.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    if (pdfs.length !== acceptedFiles.length) {
      setError('Only PDF files are supported.');
    }
    setFiles(prev => [...prev, ...pdfs]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setError('');

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      console.log('Upload success:', data);
      setIsUploading(false);
      onUploadComplete();
    } catch (err) {
      console.error(err);
      setError('Failed to upload. Make sure backend is running.');
      setIsUploading(false);
    }
  };

  return (
    <div className="uploader-container">
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="dropzone-content">
          <UploadCloud className="upload-icon" size={48} />
          <h3>Drag & Drop PDFs here</h3>
          <p>or click to browse local files</p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="skip-action">
        <button className="skip-btn" onClick={onSkip}>
          Go to Chat Interface &rarr;
        </button>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <h4>Selected Files ({files.length})</h4>
          <ul>
            {files.map((file, idx) => (
              <li key={idx} className="file-item">
                <File className="file-icon" size={20} />
                <span className="file-name">{file.name}</span>
                <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                <button className="remove-btn" onClick={() => removeFile(idx)}>
                  <X size={18} />
                </button>
              </li>
            ))}
          </ul>
          <button
            className="upload-submit-btn"
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="spinner" size={20} />
                Processing (Extracting Multi-Modal Data)...
              </>
            ) : (
              'Process Documents'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default Uploader;
