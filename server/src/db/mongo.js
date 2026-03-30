const mongoose = require('mongoose');

let connected = false;
let connecting = false;
let retryTimer = null;
const RETRY_MS = Number(process.env.MONGO_RETRY_MS || 5000);

// Never buffer model operations while disconnected; fail fast instead of hanging.
mongoose.set('bufferCommands', false);

async function connectMongo() {
  if (connected || connecting) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[mongo] MONGODB_URI missing. Running without persistence.');
    return;
  }

  connecting = true;

  try {
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB || 'math_battle',
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 5000,
    });

    connected = true;
    console.log('[mongo] connected');
  } catch (err) {
    connected = false;
    console.error(`[mongo] connect failed: ${err.message}`);

    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connectMongo().catch(() => {
          // Swallow here; the next retry will be scheduled in connectMongo catch.
        });
      }, RETRY_MS);
    }
  } finally {
    connecting = false;
  }
}

function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

mongoose.connection.on('disconnected', () => {
  connected = false;
  console.warn('[mongo] disconnected');

  if (!retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectMongo().catch(() => {
        // Swallow here; the next retry will be scheduled in connectMongo catch.
      });
    }, RETRY_MS);
  }
});

mongoose.connection.on('connected', () => {
  connected = true;
});

module.exports = { connectMongo, isMongoConnected };
