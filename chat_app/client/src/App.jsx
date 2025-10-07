// client/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Setup socket listeners
  useEffect(() => {
    const handleConnect = () => {
      console.log('✅ Connected to server');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
    };

    const handleUserListUpdate = (userList) => {
      const otherUsers = userList.filter(user => user !== username);
      setUsers(otherUsers);
    };

    const handleReceiveMessage = (data) => {
      console.log('📨 Received message:', data.type, data.fileName);
      // Clear progress when message is received
      if (data.fileName) {
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[data.fileName];
          return newProgress;
        });
      }
      
      setMessages(prev => [...prev, {
        id: data.id,
        from: data.from,
        type: data.type,
        content: data.content,
        timestamp: data.timestamp,
        isOwn: data.isOwn || false,
        isSystem: data.isSystem || false,
        isBlocked: data.isBlocked || false,
        wasBlocked: data.wasBlocked || false,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        blockedReason: data.blockedReason
      }]);
    };

    const handleMessageDeleted = (data) => {
      setMessages(prev => prev.filter(msg => msg.id !== data.deletedMessageId));
    };

    const handleUploadProgress = (data) => {
      console.log('📊 Upload progress:', data.progress, '%');
      setUploadProgress(prev => ({
        ...prev,
        [data.fileName]: {
          progress: data.progress,
          uploaded: data.uploaded,
          total: data.total,
          from: data.from,
          fileName: data.fileName
        }
      }));
    };

    const handleConnectError = (error) => {
      console.error('❌ Connection error:', error);
    };

    // Register event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('user_list_update', handleUserListUpdate);
    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('upload_progress', handleUploadProgress);
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user_list_update', handleUserListUpdate);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('upload_progress', handleUploadProgress);
      socket.off('connect_error', handleConnectError);
    };
  }, [username]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, uploadProgress]);

  const joinChat = (e) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (trimmedUsername) {
      socket.emit('user_join', trimmedUsername);
      setHasJoined(true);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && selectedUser) {
      // Detect if message contains URLs
      const urlRegex = /https?:\/\/[^\s]+/g;
      const urls = message.match(urlRegex);
      
      if (urls) {
        socket.emit('send_message', {
          to: selectedUser,
          type: 'link',
          content: message
        });
      } else {
        socket.emit('send_message', {
          to: selectedUser,
          type: 'text',
          content: message
        });
      }
      setMessage('');
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file || !selectedUser) return;

    console.log('📁 File selected:', file.name, file.type, file.size);

    // File size limit: 25MB
    if (file.size > 25 * 1024 * 1024) {
      alert('❌ File too large. Maximum size is 25MB');
      event.target.value = '';
      return;
    }

    setIsUploading(true);
    
    // Set initial progress
    setUploadProgress(prev => ({
      ...prev,
      [file.name]: {
        progress: 0,
        uploaded: 0,
        total: file.size,
        from: username,
        fileName: file.name,
        isUploading: true
      }
    }));

    const chunkSize = 64 * 1024; // 64KB chunks
    let offset = 0;
    const totalChunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;

    const readNextChunk = () => {
      const chunk = file.slice(offset, offset + chunkSize);
      const reader = new FileReader();

      reader.onload = (e) => {
        currentChunk++;
        const progress = Math.min(100, Math.round((currentChunk / totalChunks) * 100));
        const uploaded = Math.min(file.size, offset + chunkSize);

        // Update progress
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: {
            progress: progress,
            uploaded: uploaded,
            total: file.size,
            from: username,
            fileName: file.name,
            isUploading: true
          }
        }));

        // Send progress update to server
        socket.emit('upload_progress', {
          to: selectedUser,
          progress: progress,
          fileName: file.name,
          uploaded: uploaded,
          total: file.size
        });

        offset += chunkSize;

        if (offset < file.size) {
          // Read next chunk
          readNextChunk();
        } else {
          // File reading complete - send the full file
          const fileReader = new FileReader();
          fileReader.onload = (fullEvent) => {
            console.log('✅ File read completely, sending...');
            
            // Determine file type
            let type = 'file';
            if (file.type.startsWith('image/')) {
              type = 'image';
            } else if (file.type.startsWith('video/')) {
              type = 'video';
            } else if (file.type.startsWith('audio/')) {
              type = 'audio';
            } else if (file.type.includes('pdf')) {
              type = 'pdf';
            } else if (file.type.includes('zip') || file.type.includes('rar')) {
              type = 'archive';
            } else if (file.type.includes('text') || file.name.endsWith('.txt')) {
              type = 'textfile';
            }

            console.log('📤 Sending file:', type, file.name);
            
            socket.emit('send_message', {
              to: selectedUser,
              type: type,
              content: fullEvent.target.result,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size
            });

            setIsUploading(false);
            event.target.value = '';
          };

          fileReader.onerror = (error) => {
            console.error('❌ Final file reading error:', error);
            setIsUploading(false);
            event.target.value = '';
            // Clear progress on error
            setUploadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[file.name];
              return newProgress;
            });
          };

          fileReader.readAsDataURL(file);
        }
      };

      reader.onerror = (error) => {
        console.error('❌ Chunk reading error:', error);
        setIsUploading(false);
        event.target.value = '';
        // Clear progress on error
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[file.name];
          return newProgress;
        });
      };

      reader.readAsArrayBuffer(chunk);
    };

    // Start reading the first chunk
    readNextChunk();
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const selectUser = (user) => {
    setSelectedUser(user);
  };

  // Get messages for current conversation
  const getFilteredMessages = () => {
    if (!selectedUser) return [];
    return messages.filter(msg => 
      (msg.from === selectedUser) || (msg.isOwn) || msg.isSystem
    );
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format progress percentage
  const formatProgress = (progress) => {
    return Math.round(progress) + '%';
  };

  // Render upload progress
  const renderUploadProgress = () => {
    const progressEntries = Object.entries(uploadProgress);
    if (progressEntries.length === 0) return null;

    return progressEntries.map(([fileName, progressData]) => (
      <div key={fileName} className="upload-progress-item">
        <div className="progress-header">
          <span className="progress-filename">{fileName}</span>
          <span className="progress-percentage">{formatProgress(progressData.progress)}</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ width: `${progressData.progress}%` }}
          ></div>
        </div>
        <div className="progress-details">
          <span className="progress-stats">
            {formatFileSize(progressData.uploaded)} / {formatFileSize(progressData.total)}
          </span>
          <span className="progress-speed">
            {progressData.from === username ? 'Uploading...' : `${progressData.from} is sending...`}
          </span>
        </div>
      </div>
    ));
  };

  // Render different content based on message type
  const renderMessageContent = (msg) => {
    // Handle blocked messages
    if (msg.isBlocked) {
      return (
        <div className="blocked-message">
          <div className="blocked-header">
            <span className="blocked-icon">🚫</span>
            <strong>Security Blocked</strong>
          </div>
          <div className="blocked-content">
            <p>{msg.content}</p>
            {msg.detectedThreats && (
              <div className="threat-details">
                <small>Detected threats: {msg.detectedThreats.join(', ')}</small>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Handle messages that were blocked for receiver
    if (msg.wasBlocked) {
      return (
        <div className="warning-message">
          <div className="warning-header">
            <span className="warning-icon">⚠️</span>
            <strong>Message Blocked for Receiver</strong>
          </div>
          <div className="warning-content">
            <p>Your message was blocked for security reasons:</p>
            <div className="original-message">
              <em>File: {msg.fileName}</em>
            </div>
            {msg.blockedReason && (
              <div className="blocked-reason">
                <small>Reason: {msg.blockedReason}</small>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Handle system messages
    if (msg.isSystem) {
      return <div className="message-text">{msg.content}</div>;
    }

    // Handle different file types
    switch (msg.type) {
      case 'image':
        return (
          <div className="media-content">
            <img 
              src={msg.content} 
              alt={msg.fileName || 'Shared image'} 
              className="media-element"
              onClick={() => window.open(msg.content, '_blank')}
            />
            <div className="file-info">
              <span className="file-name">{msg.fileName}</span>
              {msg.fileSize && <span className="file-size">{formatFileSize(msg.fileSize)}</span>}
            </div>
          </div>
        );
      
      case 'video':
        return (
          <div className="media-content">
            <video 
              controls 
              className="media-element"
            >
              <source src={msg.content} type={msg.fileType} />
              Your browser does not support the video tag.
            </video>
            <div className="file-info">
              <span className="file-name">{msg.fileName}</span>
              {msg.fileSize && <span className="file-size">{formatFileSize(msg.fileSize)}</span>}
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="audio-content">
            <audio controls className="audio-element">
              <source src={msg.content} type={msg.fileType} />
              Your browser does not support the audio element.
            </audio>
            <div className="file-info">
              <span className="file-name">{msg.fileName}</span>
              {msg.fileSize && <span className="file-size">{formatFileSize(msg.fileSize)}</span>}
            </div>
          </div>
        );

      case 'pdf':
        return (
          <div className="file-content">
            <div className="file-icon">📄</div>
            <div className="file-details">
              <div className="file-name">{msg.fileName}</div>
              <div className="file-type">PDF Document</div>
              {msg.fileSize && <div className="file-size">{formatFileSize(msg.fileSize)}</div>}
            </div>
            <button 
              className="download-btn"
              onClick={() => window.open(msg.content, '_blank')}
            >
              Download
            </button>
          </div>
        );

      case 'archive':
        return (
          <div className="file-content">
            <div className="file-icon">📦</div>
            <div className="file-details">
              <div className="file-name">{msg.fileName}</div>
              <div className="file-type">Archive File</div>
              {msg.fileSize && <div className="file-size">{formatFileSize(msg.fileSize)}</div>}
            </div>
            <button 
              className="download-btn"
              onClick={() => window.open(msg.content, '_blank')}
            >
              Download
            </button>
          </div>
        );

      case 'textfile':
        return (
          <div className="file-content">
            <div className="file-icon">📝</div>
            <div className="file-details">
              <div className="file-name">{msg.fileName}</div>
              <div className="file-type">Text File</div>
              {msg.fileSize && <div className="file-size">{formatFileSize(msg.fileSize)}</div>}
            </div>
            <button 
              className="download-btn"
              onClick={() => window.open(msg.content, '_blank')}
            >
              View
            </button>
          </div>
        );

      case 'file':
        return (
          <div className="file-content">
            <div className="file-icon">📎</div>
            <div className="file-details">
              <div className="file-name">{msg.fileName}</div>
              <div className="file-type">{msg.fileType || 'File'}</div>
              {msg.fileSize && <div className="file-size">{formatFileSize(msg.fileSize)}</div>}
            </div>
            <button 
              className="download-btn"
              onClick={() => window.open(msg.content, '_blank')}
            >
              Download
            </button>
          </div>
        );

      case 'link':
        const urlRegex = /https?:\/\/[^\s]+/g;
        const contentWithLinks = msg.content.split(urlRegex).reduce((acc, part, index, array) => {
          acc.push(part);
          if (index < array.length - 1) {
            const url = msg.content.match(urlRegex)[index];
            acc.push(
              <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="message-link">
                {url}
              </a>
            );
          }
          return acc;
        }, []);
        
        return <div className="text-content">{contentWithLinks}</div>;
      
      default:
        return <div className="text-content">{msg.content}</div>;
    }
  };

  // Show connection status
  if (!isConnected) {
    return (
      <div className="container">
        <div className="connection-status">
          <h1>Private Chat App</h1>
          <div className="status error">
            <p>🔴 Not Connected to Server</p>
            <p>Please check if server is running on http://localhost:3001</p>
          </div>
        </div>
      </div>
    );
  }

  // Show join form
  if (!hasJoined) {
    return (
      <div className="container">
        <div className="join-form">
          <h1>Join Chat App</h1>
          <div className="status success">
            <p>🟢 Connected to Server</p>
          </div>
          <form onSubmit={joinChat}>
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <button type="submit">Join Chat</button>
          </form>
        </div>
      </div>
    );
  }

  const filteredMessages = getFilteredMessages();

  return (
    <div className="container">
      <div className="chat-header">
        <h1>Chat Application</h1>
        <div className="user-info">
          <span>Welcome, <strong>{username}</strong></span>
          <span className="status-connected">🟢 Online</span>
          {selectedUser && <span>Chatting with: <strong>{selectedUser}</strong></span>}
        </div>
      </div>
      
      <div className="chat-layout">
        {/* Users Sidebar */}
        <div className="users-sidebar">
          <h3>Online Users ({users.length})</h3>
          <div className="users-list">
            {users.map((user, index) => (
              <div
                key={index}
                className={`user-item ${selectedUser === user ? 'selected' : ''}`}
                onClick={() => selectUser(user)}
              >
                <span className="online-dot"></span>
                {user}
              </div>
            ))}
            {users.length === 0 && (
              <div className="no-users">
                <p>No other users online</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-area">
          {selectedUser ? (
            <>
              <div className="chat-with">
                <h3>Chatting with {selectedUser}</h3>
                <p className="auto-delete-notice">
                  ⏰ Messages auto-delete after 2 minutes • 
                  📎 Share any file type (25MB max)
                </p>
              </div>
              
              <div className="messages-container">
                {filteredMessages.length === 0 && Object.keys(uploadProgress).length === 0 ? (
                  <div className="no-messages">
                    <p>No messages yet. Start the conversation!</p>
                    <p className="help-text">
                      Send text messages, files, images, videos, audio, documents, and more
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Show upload progress items */}
                    {renderUploadProgress()}
                    
                    {/* Show messages */}
                    {filteredMessages.map((msg) => (
                      <div 
                        key={msg.id} 
                        className={`message ${
                          msg.isSystem ? 'system-message' : 
                          msg.isBlocked ? 'blocked-message' :
                          msg.wasBlocked ? 'warning-message' :
                          msg.isOwn ? 'own-message' : 'other-message'
                        } ${msg.type}-message`}
                      >
                        {msg.isSystem || msg.isBlocked || msg.wasBlocked ? (
                          renderMessageContent(msg)
                        ) : (
                          <>
                            <div className="message-header">
                              <span className="sender">{msg.from}</span>
                              <span className="timestamp">{msg.timestamp}</span>
                            </div>
                            {renderMessageContent(msg)}
                          </>
                        )}
                      </div>
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="message-form" onSubmit={sendMessage}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="*/*"
                  style={{ display: 'none' }}
                />
                
                <button 
                  type="button" 
                  className="attach-button"
                  onClick={triggerFileInput}
                  disabled={isUploading}
                  title="Attach any file"
                >
                  {isUploading ? '📤' : '📎'}
                </button>
                
                <input
                  type="text"
                  placeholder={`Type a message to ${selectedUser} or share any file...`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                
                <button type="submit" disabled={!message.trim() && !isUploading}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="no-chat-selected">
              <h2>Welcome to the Chat! 👋</h2>
              <p>Select a user from the sidebar to start chatting</p>
              <div className="instructions">
                <h4>Supported File Types:</h4>
                <ul>
                  <li>📝 Text messages & links</li>
                  <li>🖼️ Images (JPEG, PNG, GIF, WebP)</li>
                  <li>🎥 Videos (MP4, WebM, OGG)</li>
                  <li>🎵 Audio files (MP3, WAV, OGG)</li>
                  <li>📄 PDF documents</li>
                  <li>📦 Archives (ZIP, RAR)</li>
                  <li>📎 Any other file type</li>
                </ul>
                <p><strong>Max file size: 25MB</strong></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;