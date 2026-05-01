import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, User, Bot, Loader2, Image as ImageIcon, X, Mic, Volume2 } from 'lucide-react';
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

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const scrollToBottom = () => {
    if (endOfMessagesRef.current) {
      const container = endOfMessagesRef.current.parentElement;
      container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsProcessingAudio(true);
        
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice_input.webm');

        try {
          const res = await fetch(`${API_URL}/transcribe`, {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          if (data.text) {
            setInputVal(prev => prev + (prev ? ' ' : '') + data.text);
          }
        } catch (err) {
          console.error("Transcription failed", err);
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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const userQuery = inputVal.trim();
    setMessages(prev => [...prev, { role: 'user', content: userQuery }]);
    setInputVal('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    <div className="chat-container">
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
