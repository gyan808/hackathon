// server/index.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const virusTotal = require('./virustotal');

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

// Store connected users
const users = new Map();
const messages = new Map();
const MESSAGE_TTL = 2 * 60 * 1000; // 2 minutes

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

  // Handle user joining
  socket.on('user_join', (username) => {
    console.log('👤 User joining:', username);
    
    // Store user with socket ID
    users.set(socket.id, username);
    
    console.log('📊 Total users after join:', Array.from(users.values()));
    
    // Broadcast updated user list to ALL connected clients
    const userList = Array.from(users.values());
    io.emit('user_list_update', userList);
    
    console.log(`✅ ${username} successfully joined the chat`);
  });

  // Handle file upload progress
  socket.on('upload_progress', (data) => {
    console.log('📊 Upload progress received:', data.fileName, data.progress + '%');
    
    // Broadcast progress to the recipient
    const recipientSocketId = Array.from(users.entries()).find(
      ([id, username]) => username === data.to
    )?.[0];
    
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('upload_progress', {
        from: users.get(socket.id),
        to: data.to,
        progress: data.progress,
        fileName: data.fileName,
        uploaded: data.uploaded,
        total: data.total
      });
      console.log(`📤 Progress sent to ${data.to}: ${data.progress}%`);
    } else {
      console.log('❌ Recipient not found for progress update:', data.to);
    }
  });

  // Enhanced message handling with VirusTotal scanning
  socket.on('send_message', async (data) => {
    console.log('📨 Message received - Type:', data.type, 'Content length:', data.content?.length);
    
    const fromUsername = users.get(socket.id);
    if (!fromUsername) {
      console.log('❌ Sender not found');
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

    if (!recipientSocketId) {
      socket.emit('receive_message', {
        from: 'System',
        type: 'text',
        content: `User ${data.to} is not available`,
        timestamp: new Date().toLocaleTimeString(),
        id: Date.now(),
        isSystem: true
      });
      return;
    }

    // VirusTotal scanning logic
    let scanResult = null;
    let isSafe = true;
    let detectedThreats = [];

    try {
      // Scan files (all types)
      if (data.type !== 'text' && data.type !== 'link' && virusTotal.apiKey) {
        console.log('🛡️ Scanning file for malware...', data.fileName);
        
        // Convert base64 to buffer for scanning
        if (data.content && data.content.includes('base64')) {
          const base64Data = data.content.split('base64,')[1];
          if (base64Data) {
            const fileBuffer = Buffer.from(base64Data, 'base64');
            scanResult = await virusTotal.scanFile(fileBuffer, data.fileName || 'file');
            isSafe = virusTotal.isSafe(scanResult);
          }
        }
      }
      
      // Scan URLs in text messages
      else if ((data.type === 'text' || data.type === 'link') && virusTotal.apiKey) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        const urls = data.content.match(urlRegex);
        
        if (urls && urls.length > 0) {
          console.log('🛡️ Scanning URL for threats...');
          scanResult = await virusTotal.quickURLCheck(urls[0]);
          isSafe = virusTotal.isSafe(scanResult);
        }
      }

      // Always use pattern scanning as additional protection
      const contentToScan = data.fileName || data.content || '';
      const patternScan = virusTotal.patternScan(contentToScan, data.type);
      if (patternScan.malicious > 0) {
        isSafe = false;
        detectedThreats = patternScan.detectedPatterns;
        console.log(`🚫 Pattern detection blocked: ${detectedThreats.join(', ')}`);
      }

    } catch (error) {
      console.error('🛡️ VirusTotal scan failed:', error.message);
      // Fallback to pattern scanning
      const contentToScan = data.fileName || data.content || '';
      const patternScan = virusTotal.patternScan(contentToScan, data.type);
      if (patternScan.malicious > 0) {
        isSafe = false;
        detectedThreats = patternScan.detectedPatterns;
      }
    }

    const messageId = Date.now().toString();

    if (!isSafe) {
      console.log('🚫 Blocked malicious content - sending blocked version to receiver');
      
      // Send BLOCKED VERSION to RECEIVER
      const blockedMessage = {
        id: messageId,
        from: fromUsername,
        to: data.to,
        type: 'text',
        content: `🚫 SECURITY BLOCKED: A suspicious ${data.type} was blocked for your safety.`,
        timestamp: new Date().toLocaleTimeString(),
        createdAt: Date.now(),
        isBlocked: true,
        originalContent: data.content,
        detectedThreats: detectedThreats,
        isSystem: true
      };

      // Send blocked message to RECEIVER only
      io.to(recipientSocketId).emit('receive_message', blockedMessage);
      
      // Send ORIGINAL message to SENDER (so they know what they sent)
      socket.emit('receive_message', {
        id: messageId,
        from: fromUsername,
        to: data.to,
        type: data.type,
        content: data.content,
        timestamp: new Date().toLocaleTimeString(),
        createdAt: Date.now(),
        isOwn: true,
        wasBlocked: true,
        blockedReason: `Blocked for: ${detectedThreats.join(', ')}`,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize
      });

      console.log(`✅ Sent blocked version to ${data.to}, original to ${fromUsername}`);

    } else {
      // Send safe message to both parties
      const messageData = {
        id: messageId,
        from: fromUsername,
        to: data.to,
        type: data.type,
        content: data.content,
        timestamp: new Date().toLocaleTimeString(),
        createdAt: Date.now(),
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        isSafe: true
      };

      // Store only safe messages
      messages.set(messageId, { data: messageData, createdAt: Date.now() });

      // Send to recipient
      io.to(recipientSocketId).emit('receive_message', messageData);
      
      // Send to sender
      socket.emit('receive_message', {
        ...messageData,
        isOwn: true
      });

      console.log(`✅ ${data.type} delivered from`, fromUsername, 'to', data.to);

      // Add security notification if content was scanned
      if (scanResult && data.type !== 'text') {
        const securityMsg = {
          id: Date.now() + 1,
          from: 'Security System',
          type: 'text',
          content: `✅ Security Scan: ${data.type} scanned and verified as safe`,
          timestamp: new Date().toLocaleTimeString(),
          isSystem: true,
          isSecurityNotice: true
        };
        
        socket.emit('receive_message', securityMsg);
        io.to(recipientSocketId).emit('receive_message', securityMsg);
      }

      // Auto-deletion for safe messages only
      setTimeout(() => {
        if (messages.has(messageId)) {
          messages.delete(messageId);
          
          // Notify clients about deletion
          const deleteNotification = {
            deletedMessageId: messageId,
            timestamp: new Date().toLocaleTimeString()
          };
          
          socket.emit('message_deleted', deleteNotification);
          io.to(recipientSocketId).emit('message_deleted', deleteNotification);
        }
      }, MESSAGE_TTL);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    const username = users.get(socket.id);
    if (username) {
      users.delete(socket.id);
      console.log(`✅ ${username} removed from users`);
      
      // Broadcast updated user list to all remaining clients
      const userList = Array.from(users.values());
      console.log('📊 Remaining users:', userList);
      io.emit('user_list_update', userList);
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    users: Array.from(users.values()),
    totalConnections: users.size,
    virusTotal: process.env.VIRUSTOTAL_API_KEY ? 'ACTIVE' : 'DISABLED'
  });
});

// Security status endpoint
app.get('/security-status', (req, res) => {
  res.json({
    virusTotal: {
      enabled: !!process.env.VIRUSTOTAL_API_KEY,
      apiKey: process.env.VIRUSTOTAL_API_KEY ? 'SET' : 'NOT_SET'
    },
    features: {
      fileScanning: true,
      urlScanning: true,
      patternDetection: true,
      immediateBlocking: true,
      autoDeletion: true,
      uploadProgress: true
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Secure Chat Server running on http://localhost:${PORT}`);
  console.log(`🛡️ VirusTotal integration: ${process.env.VIRUSTOTAL_API_KEY ? 'ACTIVE' : 'DISABLED'}`);
  console.log(`📊 Upload progress: ENABLED`);
  console.log(`📁 File sharing: ENABLED (All file types)`);
  console.log(`⏰ Auto-deletion: ENABLED (2 minutes)`);
  
  if (!process.env.VIRUSTOTAL_API_KEY) {
    console.log('⚠️  VirusTotal API key not found. Pattern detection will still work.');
  }
  
  console.log(`📊 Check health: http://localhost:${PORT}/health`);
  console.log(`🔍 Security status: http://localhost:${PORT}/security-status`);
});