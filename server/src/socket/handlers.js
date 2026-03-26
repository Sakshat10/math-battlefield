/**
 * Socket.io event handlers — wires matchmaking, rooms, and game sessions
 */

const { MatchmakingService } = require('../services/matchmaking');
const { GameSession } = require('../services/gameSession');

const matchmaking = new MatchmakingService();
const activeSessions = {}; // roomId -> GameSession

function registerHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    // Helper — the player object we pass around
    const player = () => ({
      id: socket.id,
      name: socket.handshake.auth?.name || `Player_${socket.id.slice(0, 5)}`,
    });

    // ── Matchmaking ─────────────────────────────────────────────────────────

    socket.on('matchmaking:join', () => {
      const p = player();
      console.log(`[matchmaking] ${p.name} joining queue`);
      const match = matchmaking.addToQueue(p);

      if (match) {
        const { player1, player2, roomId } = match;

        // Put both sockets in the same Socket.io room
        io.sockets.sockets.get(player1.id)?.join(roomId);
        io.sockets.sockets.get(player2.id)?.join(roomId);

        // Notify both players
        io.to(player1.id).emit('matchmaking:found', {
          roomId,
          opponent: { id: player2.id, name: player2.name },
        });
        io.to(player2.id).emit('matchmaking:found', {
          roomId,
          opponent: { id: player1.id, name: player1.name },
        });

        console.log(`[match] ${player1.name} vs ${player2.name} in room ${roomId}`);

        // Start the game session
        const session = new GameSession(io, player1, player2, roomId);
        activeSessions[roomId] = session;
        session.start();
      }
    });

    socket.on('matchmaking:cancel', () => {
      matchmaking.removeFromQueue(socket.id);
    });

    // ── Private Rooms ───────────────────────────────────────────────────────

    socket.on('room:create', () => {
      const p = player();
      const code = matchmaking.createRoom(p);
      socket.join(`room_${code}`);
      socket.emit('room:created', { code, roomId: `room_${code}` });
      console.log(`[room] ${p.name} created room ${code}`);
    });

    socket.on('room:join', ({ code }) => {
      const p = player();

      if (!code || typeof code !== 'string') {
        return socket.emit('room:error', { message: 'Invalid room code' });
      }

      const result = matchmaking.joinRoom(code.trim(), p);

      if (result.error) {
        return socket.emit('room:error', { message: result.error });
      }

      socket.join(`room_${code}`);
      socket.emit('room:joined', { code, roomId: `room_${code}` });

      if (result.ready) {
        const { player1, player2, roomId } = result;

        // Notify both players that the room is full and match is starting
        io.to(roomId).emit('matchmaking:found', {
          roomId,
          opponent: null, // each client derives opponent from game:start
        });

        console.log(`[room] ${player1.name} vs ${player2.name} via code ${code}`);

        const session = new GameSession(io, player1, player2, roomId);
        activeSessions[roomId] = session;
        session.start();
      }
    });

    // ── Game Answer ─────────────────────────────────────────────────────────

    socket.on('game:answer', ({ roomId, questionId, answer }) => {
      const session = activeSessions[roomId];
      if (!session) return;
      session.handleAnswer(socket.id, { questionId, answer });
    });

    // ── Disconnect ──────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`[-] Disconnected: ${socket.id}`);
      matchmaking.removeFromQueue(socket.id);
      matchmaking.removePlayerFromRoom(socket.id);

      // Notify all active sessions this player was in
      for (const [roomId, session] of Object.entries(activeSessions)) {
        if (session.players[socket.id] && !session.ended) {
          io.to(roomId).emit('game:opponentLeft', {
            message: 'Opponent disconnected. Match ended.',
          });
          session._end();
        }
      }
    });
  });
}

module.exports = { registerHandlers };
