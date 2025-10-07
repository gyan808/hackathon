// server/index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Store connected users
const users = new Map();
const messages = new Map();
const MESSAGE_TTL = 2 * 60 * 1000; // 2 minutes

// Function to detect content type
const detectContentType = (content) => {
  // Check if it's a URL
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = content.match(urlRegex);
  if (urls) {
    return 'link';
  }
  
  // Check if it's base64 image
  if (content.startsWith('data:image/')) {
    return 'image';
  }
  
  // Check if it's base64 video
  if (content.startsWith('data:video/')) {
    return 'video';
  }
  
  return 'text';
};

// Auto-cleanup function
const cleanupOldMessages = () => {
  const now = Date.now();
  for (let [messageId, messageData] of messages) {
    if (now - messageData.createdAt > MESSAGE_TTL) {
      messages.delete(messageId);
    }
  }
};
setInterval(cleanupOldMessages, 30000);

io.on('connection', (socket) => {
  console.log('✅ New user connected:', socket.id);

  socket.on('user_join', (username) => {
    console.log('👤 User joining:', username);
    users.set(socket.id, username);
    
    const userList = Array.from(users.values());
    io.emit('user_list_update', userList);
  });

  // Handle all types of messages (text, images, videos, links)
  socket.on('send_message', (data) => {
    console.log('📨 Message received:', data.type);
    
    const fromUsername = users.get(socket.id);
    if (!fromUsername) return;

    // Find recipient
    let recipientSocketId = null;
    for (let [id, username] of users) {
      if (username === data.to) {
        recipientSocketId = id;
        break;
      }
    }

    if (recipientSocketId) {
      const messageId = Date.now().toString();
      const messageData = {
        id: messageId,
        from: fromUsername,
        to: data.to,
        type: data.type,
        content: data.content,
        timestamp: new Date().toLocaleTimeString(),
        createdAt: Date.now()
      };

      // Store message
      messages.set(messageId, { data: messageData, createdAt: Date.now() });

      // Send to recipient
      io.to(recipientSocketId).emit('receive_message', messageData);
      
      // Send to sender
      socket.emit('receive_message', {
        ...messageData,
        isOwn: true
      });

      console.log(`✅ ${data.type} delivered from`, fromUsername, 'to', data.to);

      // Schedule auto-deletion
      setTimeout(() => {
        if (messages.has(messageId)) {
          messages.delete(messageId);
          io.emit('message_deleted', { deletedMessageId: messageId });
        }
      }, MESSAGE_TTL);

    } else {
      socket.emit('receive_message', {
        from: 'System',
        type: 'text',
        content: `User ${data.to} is not available`,
        timestamp: new Date().toLocaleTimeString(),
        id: Date.now(),
        isSystem: true
      });
    }
  });

  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      const userList = Array.from(users.values());
      io.emit('user_list_update', userList);
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 File sharing enabled: images, videos, links`);
});