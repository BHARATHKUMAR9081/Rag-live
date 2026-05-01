import React, { useState, useRef, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { AuthContext } from '../context/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, User, Bot, Loader2, Image as ImageIcon, X, Mic, Volume2, Download, Menu, PlusCircle, Trash2 } from 'lucide-react';
import '../styles/ChatInterface.css';

const ChatInterface = () => {
  const [messages, setMessages] = useState([{
    role: 'bot',
    content: "Hi! I've processed your documents. Ask me anything about them, and I'll cite the exact pages and show relevant images.",
    sources: []
  }]);
  const [inputVal, setInputVal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [readingMessageIdx, setReadingMessageIdx] = useState(null);
  
  const endOfMessagesRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const { token } = useContext(AuthContext);

  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const suggestedPrompts = [
    "Summarize the key points from the documents.",
    "What are the main risks or challenges mentioned?",
    "List the key deliverables discussed.",
    "Are there any specific dates or deadlines?"
  ];

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const downloadReport = () => {
    let report = "# DocuVision AI Analysis Report\n\n";
    messages.forEach(msg => {
      report += `### ${msg.role === 'user' ? 'User' : 'DocuVision AI'}\n`;
      report += `${msg.content}\n\n`;
      if (msg.sources && msg.sources.length > 0) {
        report += `**Citations:**\n`;
        msg.sources.forEach(src => {
          report += `- Page ${src.page_number} (${src.file_id})\n`;
        });
        report += '\n';
      }
    });

    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DocuVision_Report_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/conversations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadConversation = async (convId) => {
    try {
      const res = await fetch(`${API_URL}/conversations/${convId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const formattedMessages = data.map(m => ({
          role: m.role,
          content: m.content,
          sources: m.sources ? JSON.parse(m.sources) : []
        }));
        setMessages(formattedMessages.length ? formattedMessages : [{
          role: 'bot',
          content: "Hi! I've processed your documents. Ask me anything about them, and I'll cite the exact pages and show relevant images.",
          sources: []
        }]);
        setCurrentConvId(convId);
        setIsSidebarOpen(false);
      }
    } catch (err) {
      console.error(err);
    }
  };
  
  const startNewChat = () => {
    setCurrentConvId(null);
    setMessages([{
      role: 'bot',
      content: "Hi! I've processed your documents. Ask me anything about them, and I'll cite the exact pages and show relevant images.",
      sources: []
    }]);
    setIsSidebarOpen(false);
  };

  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this chat?")) return;
    try {
      const res = await fetch(`${API_URL}/conversations/${convId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== convId));
        if (currentConvId === convId) {
          startNewChat();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const scrollToBottom = () => {
    if (endOfMessagesRef.current) {
      const container = endOfMessagesRef.current.parentElement;
      container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (token) fetchConversations();
  }, [token]);

  const handleReadAloud = (text, idx) => {
    if (readingMessageIdx === idx) {
      window.speechSynthesis.cancel();
      setReadingMessageIdx(null);
      return;
    }
    
    window.speechSynthesis.cancel(); // Stop any current speech
    
    // Strip markdown formatting for cleaner reading
    const cleanText = text.replace(/[*_#`~]/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => setReadingMessageIdx(null);
    utterance.onerror = () => setReadingMessageIdx(null);
    
    setReadingMessageIdx(idx);
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine the best supported mime type for the current browser
      const options = {};
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Use the actual mime type the recorder used
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const fileExtension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsProcessingAudio(true);
        
        const formData = new FormData();
        formData.append('file', audioBlob, `voice_input.${fileExtension}`);

        try {
          const res = await fetch(`${API_URL}/transcribe`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData,
          });
          
          if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
          }
          
          const data = await res.json();
          if (data.text) {
            setInputVal(prev => prev + (prev ? ' ' : '') + data.text);
          } else if (data.error) {
            alert("Transcription error from backend: " + data.error);
          }
        } catch (err) {
          console.error("Transcription failed", err);
          alert(`Transcription failed. Could not connect to backend at ${API_URL}. Error: ` + err.message);
        } finally {
          setIsProcessingAudio(false);
        }
        
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSend = async (e, forcedQuery = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const queryToUse = forcedQuery || inputVal.trim();
    if (!queryToUse) return;

    const userQuery = queryToUse;
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setInputVal('');
    setIsLoading(true);

    let activeConvId = currentConvId;
    if (!activeConvId) {
      try {
        const res = await fetch(`${API_URL}/conversations`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          activeConvId = data.id;
          setCurrentConvId(data.id);
          fetchConversations();
        }
      } catch (err) { console.error(err); }
    }

    if (activeConvId) {
      fetch(`${API_URL}/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ role: 'user', content: userQuery })
      });
    }

    try {
      const res = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ question: userQuery })
      });

      if (!res.ok) throw new Error('Query failed');

      setIsLoading(false); // remove loader since stream started

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");

      // Initialize an empty bot message
      let currentBotMessage = { role: 'bot', content: '', sources: [], isGenerating: true };
      setMessages(prev => [...prev, currentBotMessage]);

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'sources') {
              currentBotMessage.sources = parsed.data;
            } else if (parsed.type === 'chunk') {
              currentBotMessage.content += parsed.data;
            }

            // Update UI
            setMessages(prev => {
              const newMsgs = [...prev];
              newMsgs[newMsgs.length - 1] = { ...currentBotMessage };
              return newMsgs;
            });
          } catch (e) {
            console.error("Error parsing stream line:", e);
          }
        }
      }

      // Stream finished
      currentBotMessage.isGenerating = false;
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = { ...currentBotMessage };
        return newMsgs;
      });

      if (activeConvId && currentBotMessage.content) {
        fetch(`${API_URL}/conversations/${activeConvId}/messages`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
          },
          body: JSON.stringify({ 
            role: 'bot', 
            content: currentBotMessage.content,
            sources: currentBotMessage.sources && currentBotMessage.sources.length > 0 ? JSON.stringify(currentBotMessage.sources) : null
          })
        });
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      setMessages(prev => {
        const newMsgs = [...prev];
        if (newMsgs[newMsgs.length - 1] && newMsgs[newMsgs.length - 1].isGenerating) {
          newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], isGenerating: false };
        }
        return [...newMsgs, {
          role: 'bot',
          content: "Sorry, there was an error processing your query. Make sure the backend and Ollama are running.",
          sources: []
        }];
      });
    }
  };

  return (
    <div className="chat-container" style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{ position: 'absolute', top: '15px', left: '15px', zIndex: 10, background: '#1f2937', color: '#4ade80', border: '1px solid #374151', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
      >
        <Menu size={16} /> History
      </button>

      {isSidebarOpen && (
        <div style={{ position: 'absolute', top: '0', left: '0', width: '250px', height: '100%', background: '#111827', zIndex: 20, borderRight: '1px solid #374151', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ color: 'white', margin: 0 }}>Chat History</h3>
            <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><X size={20}/></button>
          </div>
          <button onClick={startNewChat} style={{ background: '#4ade80', color: 'black', border: 'none', padding: '10px', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center', cursor: 'pointer', marginBottom: '20px', fontWeight: 'bold' }}>
            <PlusCircle size={16} /> New Chat
          </button>
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {conversations.length === 0 && <p style={{color: '#9ca3af', fontSize: '14px', textAlign: 'center'}}>No past conversations.</p>}
            {conversations.map(conv => (
              <div key={conv.id} style={{ display: 'flex', alignItems: 'center', background: currentConvId === conv.id ? '#374151' : 'transparent', borderRadius: '5px', borderBottom: '1px solid #1f2937' }}>
                <button 
                  onClick={() => loadConversation(conv.id)}
                  style={{ flex: 1, background: 'transparent', color: 'white', border: 'none', padding: '10px', textAlign: 'left', cursor: 'pointer' }}
                >
                  {conv.title} <br/><small style={{color: '#9ca3af'}}>{new Date(conv.created_at).toLocaleDateString()}</small>
                </button>
                <button 
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '10px', cursor: 'pointer' }}
                  title="Delete Chat"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {messages.length > 1 && (
        <button 
          onClick={downloadReport} 
          style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10, background: '#1f2937', color: '#4ade80', border: '1px solid #374151', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
          title="Export Chat as Report"
        >
          <Download size={16} /> Export
        </button>
      )}
      <div className="messages-area">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-wrapper ${msg.role}`}>
            <div className={`avatar ${msg.isGenerating ? 'is-generating' : ''}`}>
              {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>
            <div className="message-content">
              <div className="text-content">
                {msg.role === 'bot' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content + (msg.isGenerating ? ' ▋' : '')}
                  </ReactMarkdown>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>

              {msg.role === 'bot' && !msg.isGenerating && (
                <button 
                  className={`read-aloud-btn ${readingMessageIdx === idx ? 'reading' : ''}`}
                  onClick={() => handleReadAloud(msg.content, idx)}
                  title={readingMessageIdx === idx ? "Stop reading" : "Read aloud"}
                >
                  <Volume2 size={16} />
                  <span>{readingMessageIdx === idx ? "Stop" : "Read"}</span>
                </button>
              )}

              {msg.role === 'bot' && !msg.isGenerating && msg.sources && msg.sources.length > 0 && (
                <div className="sources-container">
                  <div className="sources-label">Extracted Context</div>
                  <div className="sources-grid">
                    {msg.sources.map((src, sIdx) => (
                      <div key={sIdx} className="source-card">
                        <div className="source-meta">
                          <span className="page-badge">Page {src.page_number}</span>
                          <span className="file-name">{src.file_id}</span>
                        </div>
                        {src.images && src.images.length > 0 && (
                          <div className="source-images">
                            {src.images.map((imgUrl, iIdx) => (
                              <div key={iIdx} className="image-wrapper">
                                <img
                                  src={imgUrl.startsWith('http') ? imgUrl : `${API_URL}${imgUrl}`}
                                  alt={`Extracted from page ${src.page_number}`}
                                  onClick={() => setSelectedImage(imgUrl.startsWith('http') ? imgUrl : `${API_URL}${imgUrl}`)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="source-snippet"> "...{src.text_snippet.trim()}" </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="message-wrapper bot">
            <div className="avatar"><Bot size={20} /></div>
            <div className="message-content loading">
              <Loader2 className="spinner" size={24} />
              <span>Synthesizing answer from documents...</span>
            </div>
          </div>
        )}

        {messages.length === 1 && !isLoading && (
          <div className="suggested-prompts" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '20px', justifyContent: 'center', marginTop: '20px' }}>
            {suggestedPrompts.map((prompt, idx) => (
              <button 
                key={idx} 
                onClick={(e) => {
                  setInputVal(prompt);
                  handleSend(e, prompt);
                }}
                style={{ background: '#1f2937', color: '#4ade80', border: '1px solid #374151', padding: '10px 15px', borderRadius: '20px', cursor: 'pointer', transition: 'all 0.3s', fontSize: '14px' }}
                onMouseOver={(e) => e.target.style.background = '#374151'}
                onMouseOut={(e) => e.target.style.background = '#1f2937'}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div ref={endOfMessagesRef} />
      </div>

      <div className="input-area">
        <form onSubmit={handleSend} className="input-form">
          <input
            type="text"
            placeholder={isRecording ? "Listening..." : "Ask a question about your documents..."}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            disabled={isLoading || isProcessingAudio || isRecording}
          />
          <button 
            type="button" 
            className={`mic-btn ${isRecording ? 'recording' : ''}`} 
            onClick={toggleRecording}
            disabled={isLoading || isProcessingAudio}
            title="Voice Input"
          >
            {isProcessingAudio ? <Loader2 size={20} className="spinner" /> : <Mic size={20} />}
          </button>
          <button type="submit" disabled={isLoading || isProcessingAudio || !inputVal.trim()} className="send-btn">
            <Send size={20} />
          </button>
        </form>
      </div>

      {selectedImage && createPortal(
        <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal-btn" onClick={() => setSelectedImage(null)}>
              <X size={24} />
            </button>
            <img src={selectedImage} alt="Expanded view" className="expanded-image" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ChatInterface;
