const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  res.status(200).send('Signaling server is healthy');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Connected] Socket ID: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', { peerId: socket.id });
  });

  socket.on('offer', ({ offer, roomId }) => {
    socket.to(roomId).emit('offer', { offer, senderId: socket.id });
  });

  socket.on('answer', ({ answer, roomId }) => {
    socket.to(roomId).emit('answer', { answer, senderId: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, roomId }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, senderId: socket.id });
  });

  socket.on('disconnect', () => {
    console.log(`[Disconnected] Socket ID: ${socket.id}`);
    io.emit('user-left', { peerId: socket.id });
  });
});
// Webhook for incoming SMS replies from Twilio
app.post('/api/incoming-sms', (req, res) => {
  const fromNumber = req.body.From;
  const bodyText = req.body.Body;

  console.log(`Incoming SMS from ${fromNumber}: ${bodyText}`);

  // Broadcast to all connected clients via Socket.io
  io.emit('sms-reply', { from: fromNumber, message: bodyText });

  res.type('text/xml').send('<Response></Response>');
});
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server listening on port ${PORT}`);
});
