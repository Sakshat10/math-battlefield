/**
 * Entry point — Express + Socket.io server
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const { verifyToken } = require('@clerk/backend');
const { registerHandlers } = require('./socket/handlers');
const { connectMongo } = require('./db/mongo');
const { ensureUser, getLeaderboard } = require('./services/userStats');

dotenv.config();

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    req.auth = {
      userId: payload.sub,
      username: payload.username || payload.email || payload.sub,
    };

    await ensureUser({
      clerkId: req.auth.userId,
      username: req.auth.username,
    });

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/me', authMiddleware, async (req, res) => {
  res.json({
    userId: req.auth.userId,
    username: req.auth.username,
  });
});

app.get('/leaderboard', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const leaderboard = await getLeaderboard(limit);
  res.json({ leaderboard });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  const fallbackName = socket.handshake.auth?.name || 'Anonymous';

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    socket.userId = payload.sub;
    socket.userName = fallbackName;

    await ensureUser({
      clerkId: socket.userId,
      username: socket.userName,
    });

    next();
  } catch (err) {
    next(new Error('Invalid authentication token'));
  }
});

// Register all Socket.io event handlers
registerHandlers(io);

connectMongo()
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.log(`✅ Math Battle server running on http://localhost:${PORT}`);
    });
  });
