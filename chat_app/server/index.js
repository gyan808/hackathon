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

io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  // Handle user joining - ADDED EXTRA LOGGING
  socket.on('user_join', (username) => {
    console.log('🎯 SERVER RECEIVED user_join event for username:', username);
    console.log('📧 Data received:', { username, socketId: socket.id });
    
    if (!username || username.trim() === '') {
      console.log('❌ Invalid username received');
      return;
    }

    // Store user
    users.set(socket.id, username.trim());
    
    // Get all usernames
    const userList = Array.from(users.values());
    console.log('📋 Current users:', userList);
    
    // Broadcast to ALL clients
    io.emit('user_list_update', userList);
    console.log('📢 Broadcasted user list to all clients');
    
    console.log(`✅ ${username} successfully joined the chat`);
  });

  // Handle private messages
  socket.on('private_message', (data) => {
    console.log('📨 Private message:', data);
    
    const fromUsername = users.get(socket.id);
    if (!fromUsername) {
      console.log('❌ Sender not found');
      return;
    }

    // Find recipient
    let toSocketId = null;
    for (let [id, username] of users) {
      if (username === data.to) {
        toSocketId = id;
        break;
      }
    }

    if (toSocketId) {
      const messageData = {
        from: fromUsername,
        to: data.to,
        text: data.text,
        timestamp: new Date().toLocaleTimeString(),
        id: Date.now()
      };

      // Send to recipient
      io.to(toSocketId).emit('private_message', messageData);
      
      // Send to sender
      socket.emit('private_message', {
        ...messageData,
        isOwn: true
      });

      console.log('✅ Message delivered');
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      
      const userList = Array.from(users.values());
      console.log('📋 Users after disconnect:', userList);
      
      io.emit('user_list_update', userList);
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});