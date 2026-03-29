const mongoose = require('mongoose');

let connected = false;

// Never buffer model operations while disconnected; fail fast instead of hanging.
mongoose.set('bufferCommands', false);

async function connectMongo() {
  if (connected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[mongo] MONGODB_URI missing. Running without persistence.');
    return;
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || 'math_battle',
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000,
    socketTimeoutMS: 5000,
  });

  connected = true;
  console.log('[mongo] connected');
}

module.exports = { connectMongo };
