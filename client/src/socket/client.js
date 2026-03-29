/**
 * Socket.io client — always creates a fresh connection per game session.
 * Use connectSocket(name) to get a connected socket (Promise-based).
 */

import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

let socket = null;

/**
 * Returns a Promise that resolves with a fully-connected socket.
 * Creates a fresh connection every call (after disconnecting old one).
 */
export function connectSocket(name, token) {
  return new Promise((resolve, reject) => {
    // Always start fresh
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    socket = io(SERVER_URL, {
      auth: { name: name || 'Anonymous', token },
      autoConnect: true,
      reconnection: false, // don't auto-reconnect mid-session
    });

    console.log(`[socket] Connecting to ${SERVER_URL} as "${name}"...`);

    socket.once('connect', () => {
      console.log(`[socket] Connected! Socket ID: ${socket.id}`);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      console.error(`[socket] Connection error:`, err);
      reject(err);
    });
  });
}

/** Get the current socket (already connected). */
export function getSocket() {
  return socket;
}

/** Fully disconnect and clear. */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
