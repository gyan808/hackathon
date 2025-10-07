// server/index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());

// Store connected users
const users = new Map(); // socket.id -> username

// Store messages with timestamps for auto-deletion
const messages = new Map(); // messageId -> { messageData, createdAt }

// Auto-deletion time (2 minutes in milliseconds)
const MESSAGE_TTL = 2 * 60 * 1000; // 2 minutes

// Function to cleanup old messages
const cleanupOldMessages = () => {
  const now = Date.now();
  let deletedCount = 0;
  
  for (let [messageId, messageData] of messages) {
    if (now - messageData.createdAt > MESSAGE_TTL) {
      messages.delete(messageId);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`🧹 Cleaned up ${deletedCount} old messages`);
  }
};

// Run cleanup every 30 seconds
setInterval(cleanupOldMessages, 30000);

// Function to get all usernames
const getAllUsernames = () => {
  return Array.from(users.values());
};

// Function to broadcast user list to all clients
const broadcastUserList = () => {
  const userList = getAllUsernames();
  console.log('📢 Broadcasting user list to all clients:', userList);
  io.emit('user_list_update', userList);
};

io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  // Handle user joining
  socket.on('user_join', (username) => {
    console.log('👤 User joining:', username, 'Socket ID:', socket.id);
    
    // Store user with socket ID
    users.set(socket.id, username);
    
    console.log('📊 Total users after join:', getAllUsernames());
    
    // Broadcast updated user list to ALL connected clients
    broadcastUserList();
    
    console.log(`✅ ${username} successfully joined the chat`);
  });

  // Handle private messages
  socket.on('private_message', (data) => {
    console.log('📨 Private message request:', data);
    
    const fromUsername = users.get(socket.id);
    if (!fromUsername) {
      console.log('❌ Sender not found in users map');
      return;
    }

    // Find recipient's socket ID
    let recipientSocketId = null;
    for (let [socketId, username] of users) {
      if (username === data.to) {
        recipientSocketId = socketId;
        break;
      }
    }

    if (recipientSocketId) {
      const messageId = Date.now().toString();
      const messageData = {
        id: messageId,
        from: fromUsername,
        to: data.to,
        text: data.text,
        timestamp: new Date().toLocaleTimeString(),
        createdAt: Date.now()
      };

      // Store the message for auto-deletion tracking
      messages.set(messageId, {
        data: messageData,
        createdAt: Date.now()
      });

      // Send to recipient
      io.to(recipientSocketId).emit('private_message', messageData);
      
      // Also send back to sender (for their own chat display)
      socket.emit('private_message', {
        ...messageData,
        isOwn: true
      });

      console.log('✅ Message delivered from', fromUsername, 'to', data.to);
      
      // Schedule auto-deletion for this specific message
      setTimeout(() => {
        if (messages.has(messageId)) {
          messages.delete(messageId);
          console.log(`⏰ Auto-deleted message ${messageId} after 2 minutes`);
          
          // Notify both users that the message was deleted
          const deleteNotification = {
            id: Date.now(),
            deletedMessageId: messageId,
            timestamp: new Date().toLocaleTimeString(),
            isSystem: true
          };
          
          // Notify sender
          socket.emit('message_deleted', deleteNotification);
          
          // Notify recipient if still connected
          if (users.has(recipientSocketId)) {
            io.to(recipientSocketId).emit('message_deleted', deleteNotification);
          }
        }
      }, MESSAGE_TTL);

    } else {
      console.log('❌ Recipient not found:', data.to);
      // Notify sender that recipient is not available
      socket.emit('private_message', {
        from: 'System',
        text: `User ${data.to} is not available`,
        timestamp: new Date().toLocaleTimeString(),
        id: Date.now(),
        isSystem: true
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      console.log(`✅ ${username} removed from users`);
      console.log('📊 Remaining users:', getAllUsernames());
      
      // Broadcast updated user list to all remaining clients
      broadcastUserList();
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Chat Server running on http://localhost:${PORT}`);
  console.log(`⏰ Message auto-deletion enabled: 2 minutes`);
});