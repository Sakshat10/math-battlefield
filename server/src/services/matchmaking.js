/**
 * Matchmaking Service
 * Manages the global queue and private rooms (all in-memory)
 */

const { v4: uuidv4 } = require('uuid');

class MatchmakingService {
  constructor() {
    this.queue = []; // waiting players: [{ id, name, socket }]
    this.rooms = {}; // roomCode -> { players: [], started: false }
  }

  // ── Global queue ──────────────────────────────────────────────────────────

  addToQueue(player) {
    // Avoid duplicate entries
    if (this.queue.find((p) => p.id === player.id)) return null;
    this.queue.push(player);

    if (this.queue.length >= 2) {
      const p1 = this.queue.shift();
      const p2 = this.queue.shift();
      const roomId = uuidv4();
      return { player1: p1, player2: p2, roomId };
    }
    return null;
  }

  removeFromQueue(playerId) {
    this.queue = this.queue.filter((p) => p.id !== playerId);
  }

  // ── Private rooms ─────────────────────────────────────────────────────────

  createRoom(player, options = {}) {
    const code = this._generateCode();
    this.rooms[code] = {
      roomId: `room_${code}`,
      code,
      players: [player],
      started: false,
      gameMode: options.gameMode || 'classic',
    };
    return code;
  }

  joinRoom(code, player) {
    const room = this.rooms[code];
    if (!room) return { error: 'Room not found' };
    if (room.started) return { error: 'Match already started' };
    if (room.players.length >= 2) return { error: 'Room is full' };

    // Prevent same player ID joining twice
    if (room.players.find((p) => p.id === player.id)) {
      return { error: 'Already in room' };
    }

    room.players.push(player);

    if (room.players.length === 2) {
      room.started = true;
      return {
        ready: true,
        player1: room.players[0],
        player2: room.players[1],
        roomId: room.roomId,
        code,
        gameMode: room.gameMode || 'classic',
      };
    }

    return { ready: false, code };
  }

  removePlayerFromRoom(playerId) {
    for (const code of Object.keys(this.rooms)) {
      const room = this.rooms[code];
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length === 0) {
        delete this.rooms[code];
      }
    }
  }

  _generateCode() {
    let code;
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
    } while (this.rooms[code]);
    return code;
  }
}

module.exports = { MatchmakingService };
