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
const { connectMongo, isMongoConnected } = require('./db/mongo');
const {
  ensureUser,
  getLeaderboard,
  getUserProfile,
  getRecentMatchesForUser,
} = require('./services/userStats');

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

    ensureUser({
      clerkId: req.auth.userId,
      username: req.auth.username,
    }).catch((err) => {
      console.warn('[stats] ensureUser failed in authMiddleware:', err.message);
    });

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/db-status', (req, res) => {
  res.json({
    mongodb: isMongoConnected() ? 'connected' : 'disconnected',
    canPersistStats: isMongoConnected() && Boolean(process.env.MONGODB_URI),
  });
});

app.get('/me', authMiddleware, async (req, res) => {
  const profile = await getUserProfile({
    clerkId: req.auth.userId,
    username: req.auth.username,
  });

  const recentMatches = await getRecentMatchesForUser({
    clerkId: req.auth.userId,
    username: req.auth.username,
    limit: 10,
  });

  res.json({
    userId: req.auth.userId,
    username: req.auth.username,
    ...(profile || {}),
    recentMatches,
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

  if (token) {
    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      socket.userId = payload.sub;
      socket.userName = fallbackName;

      ensureUser({
        clerkId: socket.userId,
        username: socket.userName,
      }).catch((err) => {
        console.warn('[stats] ensureUser failed in socket auth:', err.message);
      });
    } catch (err) {
      console.warn('[auth] Token verification failed:', err.message);
      socket.userId = null;
    }
  } else {
    socket.userId = null;
  }

  next();
});

// Register all Socket.io event handlers
registerHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`✅ Math Battle server running on http://localhost:${PORT}`);
});

connectMongo();
