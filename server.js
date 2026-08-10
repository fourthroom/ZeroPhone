const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ANONYMOUS IN-MEMORY USAGE STATS
const usageStats = {
  activeConnections: 0,
  totalVideoCallsStarted: 0,
  totalVoiceCallsStarted: 0,
  totalWebTextsSent: 0,
  totalRoomsJoined: 0
};

// Public Stats Endpoint (No personal data, only aggregate counts)
app.get('/stats', (req, res) => {
  res.json({
    status: "online",
    stats: usageStats,
    timestamp: new Date().toISOString()
  });
});

io.on('connection', (socket) => {
  usageStats.activeConnections++;
  console.log(`[Connect] Active sockets: ${usageStats.activeConnections}`);

  // Room Joining
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    usageStats.totalRoomsJoined++;
    socket.to(roomId).emit('user-joined', { socketId: socket.id });
  });

  // Call Handshakes (Increments Video vs Voice counters)
  socket.on('offer', (data) => {
    if (data.isAudioOnly) {
      usageStats.totalVoiceCallsStarted++;
    } else {
      usageStats.totalVideoCallsStarted++;
    }
    socket.to(data.targetId).emit('offer', { offer: data.offer, senderId: socket.id });
  });

  socket.on('answer', (data) => {
    socket.to(data.targetId).emit('answer', { answer: data.answer, senderId: socket.id });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.targetId).emit('ice-candidate', { candidate: data.candidate, senderId: socket.id });
  });

  // WebText Counter (Increments count only, ignores text content)
  socket.on('send-web-chat', (data) => {
    usageStats.totalWebTextsSent++;
    socket.to(data.roomId).emit('receive-web-chat', { message: data.message, sender: data.sender });
  });

  // Disconnect Handling
  socket.on('disconnect', () => {
    usageStats.activeConnections = Math.max(0, usageStats.activeConnections - 1);
    console.log(`[Disconnect] Active sockets: ${usageStats.activeConnections}`);
    io.emit('user-disconnected', { socketId: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
