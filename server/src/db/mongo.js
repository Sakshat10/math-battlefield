const mongoose = require('mongoose');

let connected = false;

async function connectMongo() {
  if (connected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[mongo] MONGODB_URI missing. Running without persistence.');
    return;
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || 'math_battle',
  });

  connected = true;
  console.log('[mongo] connected');
}

module.exports = { connectMongo };
