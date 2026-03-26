/**
 * Entry point — Express + Socket.io server
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { registerHandlers } = require('./socket/handlers');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Register all Socket.io event handlers
registerHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`✅ Math Battle server running on http://localhost:${PORT}`);
});
