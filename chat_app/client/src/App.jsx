// client/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// Create socket connection
const socket = io('http://localhost:3001');

function App() {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const messagesEndRef = useRef(null);

  // Setup socket listeners
  useEffect(() => {
    console.log('Setting up socket listeners');

    const handleConnect = () => {
      console.log('✅ Connected to server');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('❌ Disconnected from server');
      setIsConnected(false);
    };

    const handleUserListUpdate = (userList) => {
      console.log('📋 User list updated:', userList);
      const otherUsers = userList.filter(user => user !== username);
      setUsers(otherUsers);
    };

    const handlePrivateMessage = (data) => {
      console.log('📨 Received message:', data);
      setMessages(prev => [...prev, {
        id: data.id,
        from: data.from,
        text: data.text,
        timestamp: data.timestamp,
        isOwn: data.isOwn || false
      }]);
    };

    const handleMessageDeleted = (data) => {
      console.log('🗑️ Message deleted:', data);
      // Remove the deleted message from the UI
      setMessages(prev => prev.filter(msg => msg.id !== data.deletedMessageId));
      
      // Add a system message about deletion
      setMessages(prev => [...prev, {
        id: Date.now(),
        from: 'System',
        text: '💬 Message auto-deleted after 2 minutes',
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
    socket.on('private_message', handlePrivateMessage);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('connect_error', handleConnectError);

    // Cleanup function
    return () => {
      console.log('Cleaning up socket listeners');
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user_list_update', handleUserListUpdate);
      socket.off('private_message', handlePrivateMessage);
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
      console.log('Joining as:', trimmedUsername);
      socket.emit('user_join', trimmedUsername);
      setHasJoined(true);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && selectedUser) {
      socket.emit('private_message', {
        to: selectedUser,
        text: message
      });
      setMessage('');
    }
  };

  const selectUser = (user) => {
    setSelectedUser(user);
  };

  // Get messages for current conversation
  const getFilteredMessages = () => {
    if (!selectedUser) return [];
    
    return messages.filter(msg => 
      (msg.from === selectedUser) || 
      (msg.isOwn)
    );
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
            <button type="submit">
              Join Chat
            </button>
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
                <p className="help-text">Open another browser window and join with a different username</p>
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
                <p className="auto-delete-notice">⏰ Messages auto-delete after 2 minutes</p>
              </div>
              
              <div className="messages-container">
                {filteredMessages.length === 0 ? (
                  <div className="no-messages">
                    <p>No messages yet. Start the conversation!</p>
                    <p className="help-text">Messages will automatically disappear after 2 minutes</p>
                  </div>
                ) : (
                  filteredMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`message ${
                        msg.isSystem ? 'system-message' : 
                        msg.isOwn ? 'own-message' : 'other-message'
                      }`}
                    >
                      {msg.isSystem ? (
                        <div className="message-text">{msg.text}</div>
                      ) : (
                        <>
                          <div className="message-header">
                            <span className="sender">{msg.from}</span>
                            <span className="timestamp">{msg.timestamp}</span>
                          </div>
                          <div className="message-text">{msg.text}</div>
                        </>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="message-form" onSubmit={sendMessage}>
                <input
                  type="text"
                  placeholder={`Type a message to ${selectedUser}...`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button type="submit" disabled={!message.trim()}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="no-chat-selected">
              <h2>Welcome to the Chat! 👋</h2>
              <p>Select a user from the sidebar to start chatting</p>
              <div className="instructions">
                <h4>How to test:</h4>
                <ol>
                  <li>Open a new browser window or tab</li>
                  <li>Go to: http://localhost:5173</li>
                  <li>Join with a different username</li>
                  <li>Come back here and select that user</li>
                  <li>Start messaging! 💬</li>
                </ol>
                <div className="feature-info">
                  <p><strong>Auto-delete feature:</strong> All messages automatically disappear after 2 minutes</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;