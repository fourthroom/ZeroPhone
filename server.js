const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).send('ZeroPhone signaling server is healthy');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
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

    console.log(`SMS sent successfully! SID: ${result.sid}`);
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