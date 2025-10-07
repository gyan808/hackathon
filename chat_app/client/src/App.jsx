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
      console.log('📨 Received message:', data);
      setMessages(prev => [...prev, {
        id: data.id,
        from: data.from,
        type: data.type,
        content: data.content,
        timestamp: data.timestamp,
        isOwn: data.isOwn || false,
        isSystem: data.isSystem || false
      }]);
    };

    const handleMessageDeleted = (data) => {
      setMessages(prev => prev.filter(msg => msg.id !== data.deletedMessageId));
      setMessages(prev => [...prev, {
        id: Date.now(),
        from: 'System',
        type: 'text',
        content: '💬 Message auto-deleted after 2 minutes',
        timestamp: new Date().toLocaleTimeString(),
        isSystem: true
      }]);
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
    socket.on('connect_error', handleConnectError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user_list_update', handleUserListUpdate);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('connect_error', handleConnectError);
    };
  }, [username]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
        // Send as link
        socket.emit('send_message', {
          to: selectedUser,
          type: 'link',
          content: message
        });
      } else {
        // Send as text
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

    setIsUploading(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const fileData = e.target.result;
      
      let type = 'file';
      if (file.type.startsWith('image/')) {
        type = 'image';
      } else if (file.type.startsWith('video/')) {
        type = 'video';
      }

      socket.emit('send_message', {
        to: selectedUser,
        type: type,
        content: fileData,
        fileName: file.name,
        fileType: file.type
      });

      setIsUploading(false);
      event.target.value = ''; // Reset file input
    };

    reader.onerror = () => {
      setIsUploading(false);
      console.error('File reading error');
    };

    reader.readAsDataURL(file);
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

  // Render different content based on message type
  const renderMessageContent = (msg) => {
    switch (msg.type) {
      case 'image':
        return (
          <div className="media-content">
            <img 
              src={msg.content} 
              alt="Shared image" 
              className="media-element"
              onClick={() => window.open(msg.content, '_blank')}
            />
            {msg.fileName && <div className="file-name">{msg.fileName}</div>}
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
            {msg.fileName && <div className="file-name">{msg.fileName}</div>}
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
                  📎 Share images, videos & links
                </p>
              </div>
              
              <div className="messages-container">
                {filteredMessages.length === 0 ? (
                  <div className="no-messages">
                    <p>No messages yet. Start the conversation!</p>
                    <p className="help-text">
                      Send text messages, images, videos, or share links
                    </p>
                  </div>
                ) : (
                  filteredMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`message ${
                        msg.isSystem ? 'system-message' : 
                        msg.isOwn ? 'own-message' : 'other-message'
                      } ${msg.type}-message`}
                    >
                      {msg.isSystem ? (
                        <div className="message-text">{msg.content}</div>
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
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="message-form" onSubmit={sendMessage}>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                />
                
                <button 
                  type="button" 
                  className="attach-button"
                  onClick={triggerFileInput}
                  disabled={isUploading}
                  title="Attach file"
                >
                  {isUploading ? '📤' : '📎'}
                </button>
                
                <input
                  type="text"
                  placeholder={`Type a message to ${selectedUser} or share a link...`}
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
                <h4>Features:</h4>
                <ul>
                  <li>💬 Text messages</li>
                  <li>🖼️ Image sharing</li>
                  <li>🎥 Video sharing</li>
                  <li>🔗 Link sharing</li>
                  <li>⏰ Auto-delete after 2 minutes</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;