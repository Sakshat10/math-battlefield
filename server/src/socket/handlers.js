/**
 * Socket.io event handlers — wires matchmaking, rooms, and game sessions
 */

const { MatchmakingService } = require('../services/matchmaking');
const { GameSession } = require('../services/gameSession');
const { TugOfWarSession } = require('../services/TugOfWarSession');
const { recordMatchResult, recordDraw } = require('../services/userStats');

const matchmaking = new MatchmakingService();
const activeSessions = {}; // roomId -> GameSession
const winStreaks = {}; // stablePlayerKey -> streak count
const rematchStates = {}; // roomId -> { requests:Set<string>, timeout, players:string[] }

function stablePlayerKey(player) {
  return player?.userId || player?.id || null;
}

function getWinStreak(playerKey) {
  return playerKey ? winStreaks[playerKey] || 0 : 0;
}

function randomCoins() {
  return Math.floor(10 + Math.random() * 41);
}

function createSession(io, player1, player2, roomId, gameMode) {
  const SessionClass = gameMode === 'tug' ? TugOfWarSession : GameSession;
  const session = new SessionClass(io, player1, player2, roomId, {
    getWinStreak,
    onGameEnd: (result, endedSession) => {
      if (endedSession.disconnected) return;

      const playerIds = Object.keys(endedSession.players);

      if (result.winner) {
        for (const id of playerIds) {
          const p = endedSession.players[id];
          const key = stablePlayerKey(p);
          if (!key) continue;
          if (!winStreaks[key]) winStreaks[key] = 0;
          winStreaks[key] = id === result.winner ? winStreaks[key] + 1 : 0;
        }
      }

      for (const id of playerIds) {
        const p = endedSession.players[id];
        const key = stablePlayerKey(p);
        io.to(roomId).emit('game:streakUpdate', {
          playerId: id,
          winStreak: getWinStreak(key),
        });
      }

      if (result.winner) {
        const winnerPlayer = endedSession.players[result.winner];
        const loserId = playerIds.find((id) => id !== result.winner);
        const loserPlayer = loserId ? endedSession.players[loserId] : null;
        const scoreById = Object.fromEntries((result.scores || []).map((s) => [s.id, s.score]));

        const winnerCoins = randomCoins();
        const loserCoins = randomCoins();

        if (winnerPlayer) {
          io.to(winnerPlayer.id).emit('game:reward', { coins: winnerCoins });
        }
        if (loserPlayer) {
          io.to(loserPlayer.id).emit('game:reward', { coins: loserCoins });
        }

        recordMatchResult({
          winnerPlayer: {
            clerkId: winnerPlayer?.userId || null,
            username: winnerPlayer?.name || 'Winner',
            score: scoreById[result.winner] || 0,
          },
          loserPlayer: {
            clerkId: loserPlayer?.userId || null,
            username: loserPlayer?.name || 'Loser',
            score: loserId ? scoreById[loserId] || 0 : 0,
          },
          winnerCoins,
          loserCoins,
          roomId,
          durationSec: 60,
        }).catch((err) => {
          console.error('[stats] recordMatchResult failed', err.message);
        });
      } else {
        const scoreById = Object.fromEntries((result.scores || []).map((s) => [s.id, s.score]));
        const drawPlayers = [];
        const coinsByUserKey = {};

        for (const id of playerIds) {
          const p = endedSession.players[id];
          if (!p) continue;

          const rewardCoins = randomCoins();
          io.to(id).emit('game:reward', {
            coins: rewardCoins,
          });

          const userKey = p.userId ? `clerk:${p.userId}` : `guest:${String(p.name || 'anonymous').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'anonymous'}`;
          coinsByUserKey[userKey] = rewardCoins;
          drawPlayers.push({
            clerkId: p.userId || null,
            username: p.name || 'Anonymous',
            score: scoreById[id] || 0,
          });
        }

        if (drawPlayers.length) {
          recordDraw({
            players: drawPlayers,
            coinsByUserKey,
            roomId,
            durationSec: 60,
          }).catch((err) => {
            console.error('[stats] recordDraw failed', err.message);
          });
        }
      }

      if (rematchStates[roomId]) {
        clearTimeout(rematchStates[roomId].timeout);
      }

      rematchStates[roomId] = {
        requests: new Set(),
        players: playerIds,
        timeout: setTimeout(() => {
          io.to(roomId).emit('game:rematchDeclined', { reason: 'timeout' });
          delete rematchStates[roomId];
        }, 10000),
      };
    },
  });

  activeSessions[roomId] = session;
  return session;
}

function registerHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    const player = () => ({
      id: socket.id,
      userId: socket.userId,
      name: socket.handshake.auth?.name || `Player_${socket.id.slice(0, 5)}`,
    });

    // Matchmaking
    socket.on('matchmaking:join', () => {
      const p = player();
      const gameMode = socket.handshake.auth?.gameMode || 'classic';
      console.log(`[matchmaking] ${p.name} joining queue (mode: ${gameMode})`);
      const match = matchmaking.addToQueue(p);

      if (!match) return;

      const { player1, player2, roomId } = match;

      io.sockets.sockets.get(player1.id)?.join(roomId);
      io.sockets.sockets.get(player2.id)?.join(roomId);

      io.to(player1.id).emit('matchmaking:found', {
        roomId,
        gameMode,
        opponent: {
          id: player2.id,
          name: player2.name,
          winStreak: getWinStreak(stablePlayerKey(player2)),
        },
      });
      io.to(player2.id).emit('matchmaking:found', {
        roomId,
        gameMode,
        opponent: {
          id: player1.id,
          name: player1.name,
          winStreak: getWinStreak(stablePlayerKey(player1)),
        },
      });

      console.log(`[match] ${player1.name} vs ${player2.name} in room ${roomId} (mode: ${gameMode})`);

      const session = createSession(io, player1, player2, roomId, gameMode);
      session.start();
    });

    socket.on('matchmaking:cancel', () => {
      matchmaking.removeFromQueue(socket.id);
    });

    // Private rooms
    socket.on('room:create', () => {
      const p = player();
      const gameMode = socket.handshake.auth?.gameMode || 'classic';
      const code = matchmaking.createRoom(p, { gameMode });
      socket.join(`room_${code}`);
      socket.emit('room:created', { code, roomId: `room_${code}`, gameMode });
      console.log(`[room] ${p.name} created room ${code} (mode: ${gameMode})`);
    });

    socket.on('room:join', ({ code }) => {
      const p = player();

      if (!code || typeof code !== 'string') {
        return socket.emit('room:error', { message: 'Invalid room code' });
      }

      const trimmedCode = code.trim();
      const result = matchmaking.joinRoom(trimmedCode, p);

      if (result.error) {
        return socket.emit('room:error', { message: result.error });
      }

      socket.join(`room_${trimmedCode}`);
      socket.emit('room:joined', { code: trimmedCode, roomId: `room_${trimmedCode}` });

      if (!result.ready) return;

      const { player1, player2, roomId } = result;
      const gameMode = result.gameMode || socket.handshake.auth?.gameMode || 'classic';

      io.to(player1.id).emit('matchmaking:found', {
        roomId,
        gameMode,
        opponent: {
          id: player2.id,
          name: player2.name,
          winStreak: getWinStreak(stablePlayerKey(player2)),
        },
      });
      io.to(player2.id).emit('matchmaking:found', {
        roomId,
        gameMode,
        opponent: {
          id: player1.id,
          name: player1.name,
          winStreak: getWinStreak(stablePlayerKey(player1)),
        },
      });

      console.log(`[room] ${player1.name} vs ${player2.name} via code ${trimmedCode} (mode: ${gameMode})`);

      const session = createSession(io, player1, player2, roomId, gameMode);
      session.start();
    });

    // Answers
    socket.on('game:answer', ({ roomId, questionId, answer }) => {
      const session = activeSessions[roomId];
      if (!session) return;
      session.handleAnswer(socket.id, { questionId, answer });
    });

    // Rematch
    socket.on('game:rematchRequest', ({ roomId }) => {
      const session = activeSessions[roomId];
      const state = rematchStates[roomId];
      if (!session || !state || !session.ended) return;
      if (!state.players.includes(socket.id)) return;

      if (state.requests.has(socket.id)) return;
      state.requests.add(socket.id);

      if (state.requests.size === 1) {
        const requester = session.players[socket.id];
        const targetId = state.players.find((id) => id !== socket.id);
        if (targetId) {
          io.to(targetId).emit('game:rematchOffer', {
            roomId,
            fromPlayerId: socket.id,
            fromPlayerName: requester?.name || 'Opponent',
          });
        }
      }

      if (state.requests.size < 2) return;

      clearTimeout(state.timeout);
      delete rematchStates[roomId];

      const players = Object.values(session.players).map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.name,
      }));

      const [player1, player2] = players;
      if (!player1 || !player2) return;

      io.to(roomId).emit('game:rematchStart', { roomId });
      const nextSession = createSession(io, player1, player2, roomId);
      nextSession.start();
    });

    socket.on('game:rematchDecline', ({ roomId }) => {
      const session = activeSessions[roomId];
      const state = rematchStates[roomId];
      if (!session || !state || !session.ended) return;
      if (!state.players.includes(socket.id)) return;

      clearTimeout(state.timeout);
      delete rematchStates[roomId];

      io.to(roomId).emit('game:rematchDeclined', {
        reason: 'declined',
        declinedBy: socket.id,
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[-] Disconnected: ${socket.id}`);
      matchmaking.removeFromQueue(socket.id);
      matchmaking.removePlayerFromRoom(socket.id);

      for (const [roomId, state] of Object.entries(rematchStates)) {
        if (state.players.includes(socket.id)) {
          clearTimeout(state.timeout);
          io.to(roomId).emit('game:rematchDeclined', { reason: 'opponent_left' });
          delete rematchStates[roomId];
        }
      }

      for (const [roomId, session] of Object.entries(activeSessions)) {
        if (session.players[socket.id] && !session.ended) {
          session.disconnected = true;

          if (rematchStates[roomId]) {
            clearTimeout(rematchStates[roomId].timeout);
            delete rematchStates[roomId];
          }

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
