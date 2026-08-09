const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.status(200).send('ZeroPhone signaling server is healthy');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// In-memory chat storage per room
const roomHistories = {};

io.on('connection', (socket) => {
  console.log(`[Connected] Socket ID: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.currentRoom = roomId; // Track current room on the socket object
    socket.to(roomId).emit('user-joined', { peerId: socket.id });

    // Send existing history if someone is already in the room
    if (roomHistories[roomId]) {
      socket.emit('load-chat-history', roomHistories[roomId]);
    }
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

  // Relay web text & store in room history
  socket.on('send-web-chat', ({ roomId, message, sender }) => {
    const chatEntry = { sender, message, timestamp: new Date().toLocaleTimeString() };

    if (!roomHistories[roomId]) {
      roomHistories[roomId] = [];
    }

    roomHistories[roomId].push(chatEntry);
    if (roomHistories[roomId].length > 50) {
      roomHistories[roomId].shift();
    }

    io.to(roomId).emit('receive-web-chat', chatEntry);
  });

  // Handle Disconnection & Room Memory Reset
  socket.on('disconnect', () => {
    console.log(`[Disconnected] Socket ID: ${socket.id}`);
    const roomId = socket.currentRoom;

    if (roomId) {
      io.to(roomId).emit('user-left', { peerId: socket.id });

      // Check remaining occupants in the room
      const roomClients = io.sockets.adapter.rooms.get(roomId);
      const occupantCount = roomClients ? roomClients.size : 0;

      // If everyone has left, wipe the room history memory
      if (occupantCount === 0) {
        delete roomHistories[roomId];
        console.log(`[Memory Cleared] Room ${roomId} is now empty.`);
      }
    }
  });
});

// Webhook for incoming SMS replies from Twilio
app.post('/api/incoming-sms', (req, res) => {
  const fromNumber = req.body.From;
  const bodyText = req.body.Body;

  if (typeof io !== 'undefined') {
    io.emit('sms-reply', { from: fromNumber, message: bodyText });
  }

  res.type('text/xml').send('<Response></Response>');
});

// Endpoint to handle sending SMS from web page
app.post('/api/send-sms', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ success: false, error: 'Missing phone number or message.' });
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    const client = require('twilio')(accountSid, authToken);

    const result = await client.messages.create({
      body: message,
      from: twilioPhone,
      to: to
    });

    res.json({ success: true, sid: result.sid });
  } catch (error) {
    console.error('Twilio Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`ZeroPhone signaling server listening on port ${PORT}`);
});