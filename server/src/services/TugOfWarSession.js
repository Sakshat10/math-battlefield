/**
 * TugOfWarSession
 * Server-authoritative game session for "Tug of War" mode.
 * Rope starts at 0; player1 side = +1, player2 side = -1.
 * Win by reaching ±100, or by position at time-end.
 */

const { generateQuestion } = require('./questionGenerator');

const MATCH_DURATION = 60;
const SLOW_MIN_DELAY_MS = 300;
const SLOW_MAX_DELAY_MS = 500;
const LOTTERY_POOL = ['freeze', 'double', 'slow', 'bonus']; // skip excluded from tug

// Pull deltas per combo tier
const PULL_BY_COMBO = { 1: 10, 2: 20, 3: 35 };

class TugOfWarSession {
  constructor(io, player1, player2, roomId, options = {}) {
    const { getWinStreak, onGameEnd } = options;

    this.io = io;
    this.roomId = roomId;
    this.getWinStreak = typeof getWinStreak === 'function' ? getWinStreak : () => 0;
    this.onGameEnd = typeof onGameEnd === 'function' ? onGameEnd : null;

    const playerIds = [player1.id, player2.id];

    // +1 = toward positive end (player1's goal), -1 = toward negative (player2's goal)
    this.playerSide = {
      [player1.id]: +1,
      [player2.id]: -1,
    };

    this.players = {
      [player1.id]: {
        id: player1.id,
        userId: player1.userId || null,
        name: player1.name,
        comboCount: 0,
        comboMultiplier: 1,
        streakCount: 0,
        nextAnswerMultiplier: 1,
        freezeNextQuestion: false,
        slowNextQuestion: false,
        freezeOnQuestionId: null,
        slowOnQuestionId: null,
        slowUntil: 0,
      },
      [player2.id]: {
        id: player2.id,
        userId: player2.userId || null,
        name: player2.name,
        comboCount: 0,
        comboMultiplier: 1,
        streakCount: 0,
        nextAnswerMultiplier: 1,
        freezeNextQuestion: false,
        slowNextQuestion: false,
        freezeOnQuestionId: null,
        slowOnQuestionId: null,
        slowUntil: 0,
      },
    };

    this.ropePosition = 0;           // -100 to +100
    this.lastCorrectAnswerAt = null; // for neutral drift

    this.currentQuestion = null;
    this.playerQuestionOverrides = {};
    this.globalQuestionCount = 0;
    this.timeLeft = MATCH_DURATION;
    this.timer = null;
    this.ended = false;
    this.timeWarningSent = false;
    this.finalRushSent = false;
    this.disconnected = false;

    // For comeback detection — track previous rope position each second
    this._prevRopePosition = 0;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  _getOpponentId(playerId) {
    return Object.keys(this.players).find((id) => id !== playerId) || null;
  }

  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _randomPowerup() {
    return LOTTERY_POOL[this._randomInt(0, LOTTERY_POOL.length - 1)];
  }

  _getDifficulty() {
    const elapsed = MATCH_DURATION - this.timeLeft;
    if (elapsed < 20) return 'easy';
    if (elapsed < 40) return 'medium';
    return 'hard';
  }

  _comboMultiplier(comboCount) {
    if (comboCount >= 3) return 3;
    if (comboCount === 2) return 2;
    return 1;
  }

  _isPlayerFrozen(player) {
    return Boolean(player.freezeOnQuestionId);
  }

  _getActiveQuestionForPlayer(playerId) {
    // In tug mode there are no per-player overrides (skip disabled), but guard anyway
    return this.currentQuestion;
  }

  getScoresPayload() {
    const now = Date.now();
    return Object.values(this.players).map((p) => ({
      id: p.id,
      name: p.name,
      score: 0, // not used in tug; kept for interface compatibility
      winStreak: this.getWinStreak(p.userId || p.id),
      comboCount: p.comboCount,
      comboMultiplier: p.comboMultiplier,
      streakCount: p.streakCount,
      nextAnswerMultiplier: p.nextAnswerMultiplier,
      freezeIncoming: p.freezeNextQuestion,
      slowIncoming: p.slowNextQuestion,
      isFrozen: p.freezeOnQuestionId !== null,
      isSlowed: p.slowOnQuestionId !== null && now < p.slowUntil,
      slowMsLeft: p.slowOnQuestionId ? Math.max(0, p.slowUntil - now) : 0,
    }));
  }

  // ─── questions ────────────────────────────────────────────────────────────

  _questionPayload(question, playerId) {
    const player = this.players[playerId];
    const now = Date.now();
    return {
      id: question.id,
      question: question.question,
      difficulty: question.difficulty,
      type: question.type || 'normal',
      isFrozenForQuestion: Boolean(player?.freezeOnQuestionId === question.id),
      isSlowedForQuestion:
        Boolean(player?.slowOnQuestionId === question.id) && now < (player?.slowUntil || 0),
      slowMsLeft:
        player?.slowOnQuestionId === question.id ? Math.max(0, (player?.slowUntil || 0) - now) : 0,
    };
  }

  _applyQuestionStartEffects(playerId, question) {
    const player = this.players[playerId];
    if (!player) return;

    player.freezeOnQuestionId = null;
    player.slowOnQuestionId = null;
    player.slowUntil = 0;

    if (player.freezeNextQuestion) {
      player.freezeOnQuestionId = question.id;
      player.freezeNextQuestion = false;
      this.io.to(this.roomId).emit('game:powerupEffect', {
        type: 'freeze',
        status: 'applied',
        targetPlayerId: playerId,
        questionId: question.id,
      });
    }

    if (player.slowNextQuestion) {
      const delayMs = this._randomInt(SLOW_MIN_DELAY_MS, SLOW_MAX_DELAY_MS);
      player.slowOnQuestionId = question.id;
      player.slowUntil = Date.now() + delayMs;
      player.slowNextQuestion = false;
      this.io.to(this.roomId).emit('game:powerupEffect', {
        type: 'slow',
        status: 'applied',
        targetPlayerId: playerId,
        questionId: question.id,
        delayMs,
      });
    }
  }

  _emitQuestionToRoom(question) {
    for (const playerId of Object.keys(this.players)) {
      this._applyQuestionStartEffects(playerId, question);
      this.io.to(playerId).emit('game:question', this._questionPayload(question, playerId));
    }
  }

  _nextQuestion() {
    const difficulty = this._getDifficulty();
    this.globalQuestionCount += 1;
    // In tug mode skip power-up must not appear – regenerate if we get one
    let question;
    let attempts = 0;
    do {
      const forcePowerup = this.globalQuestionCount % 5 === 0;
      question = generateQuestion(difficulty, { forcePowerup });
      attempts++;
    } while (question.type === 'skip' && attempts < 5);

    if (question.type === 'skip') {
      question.type = 'normal'; // final safety fallback
    }

    this.currentQuestion = question;
    this.playerQuestionOverrides = {};
    this._emitQuestionToRoom(this.currentQuestion);
  }

  // ─── power-ups ────────────────────────────────────────────────────────────

  _grantPowerup(playerId, type, source = 'question') {
    const player = this.players[playerId];
    const opponentId = this._getOpponentId(playerId);
    const opponent = opponentId ? this.players[opponentId] : null;
    if (!player) return;

    let resolvedType = type;
    if (type === 'lottery') {
      resolvedType = this._randomPowerup();
    }

    // skip is disabled — silently convert to neutral
    if (resolvedType === 'skip') {
      resolvedType = 'normal';
      this.io.to(this.roomId).emit('game:powerupEffect', {
        type: 'skip',
        status: 'disabled_in_tug',
        fromPlayerId: playerId,
        targetPlayerId: playerId,
        message: `Skip unavailable in Tug of War`,
      });
      return;
    }

    if (resolvedType === 'freeze' && opponent) {
      opponent.freezeNextQuestion = true;
    }

    if (resolvedType === 'slow' && opponent) {
      opponent.slowNextQuestion = true;
    }

    if (resolvedType === 'double') {
      player.nextAnswerMultiplier = 2;
    }

    if (resolvedType === 'bonus') {
      player.nextAnswerMultiplier = 3;
    }

    this.io.to(this.roomId).emit('game:powerupEffect', {
      type: resolvedType,
      source,
      fromPlayerId: playerId,
      targetPlayerId:
        resolvedType === 'freeze' || resolvedType === 'slow' ? opponentId : playerId,
      questionType: type,
      message:
        type === 'lottery'
          ? `${player.name} rolled ${resolvedType.toUpperCase()}!`
          : `${player.name} earned ${resolvedType.toUpperCase()}!`,
    });
  }

  _resetOpponentMomentum(playerId) {
    const opponentId = this._getOpponentId(playerId);
    if (!opponentId) return;
    const opponent = this.players[opponentId];
    opponent.comboCount = 0;
    opponent.comboMultiplier = 1;
    opponent.streakCount = 0;
  }

  _handleStreakReward(playerId) {
    const player = this.players[playerId];
    if (!player) return;
    if (player.streakCount < 3) return;

    player.streakCount = 0;
    const reward = this._randomPowerup();
    this._grantPowerup(playerId, reward, 'streak');

    this.io.to(this.roomId).emit('game:streakReward', { playerId, reward });
  }

  // ─── rope logic ───────────────────────────────────────────────────────────

  _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  _computePull(player) {
    const combo = this._clamp(player.comboMultiplier, 1, 3);
    let delta = PULL_BY_COMBO[combo] || 10;

    // double / bonus via nextAnswerMultiplier
    if (player.nextAnswerMultiplier === 2) {
      delta *= 2;
      player.nextAnswerMultiplier = 1;
    } else if (player.nextAnswerMultiplier === 3) {
      // bonus: convert to additive +25 on top of pull
      delta += 25;
      player.nextAnswerMultiplier = 1;
    }

    return delta;
  }

  _updateRope(playerId, delta) {
    const side = this.playerSide[playerId]; // +1 or -1
    const prevPosition = this.ropePosition;
    this.ropePosition = this._clamp(this.ropePosition + side * delta, -100, 100);
    this.ropePosition = Math.round(this.ropePosition * 100) / 100; // 2dp

    this.io.to(this.roomId).emit('game:ropeUpdate', {
      ropePosition: this.ropePosition,
    });

    this._checkDominance(prevPosition);
    this._checkComeback(prevPosition, side, delta);

    if (Math.abs(this.ropePosition) >= 100) {
      this._end();
    }
  }

  _checkDominance(prevPosition) {
    if (Math.abs(this.ropePosition) >= 60) {
      const leadingId =
        this.ropePosition > 0
          ? Object.keys(this.playerSide).find((id) => this.playerSide[id] === +1)
          : Object.keys(this.playerSide).find((id) => this.playerSide[id] === -1);

      // Only emit if we just crossed 60 (not every tick while above 60)
      if (Math.abs(prevPosition) < 60) {
        this.io.to(this.roomId).emit('game:dominance', { playerId: leadingId });
      }
    }
  }

  _checkComeback(prevPosition, side, delta) {
    // Comeback = rope shifted direction by > 20 in one answer
    const prevSign = Math.sign(prevPosition) || 0;
    const newSign = Math.sign(this.ropePosition) || 0;
    const shift = Math.abs(this.ropePosition - prevPosition);

    if (prevSign !== 0 && newSign !== 0 && prevSign !== newSign && shift > 20) {
      // The player who just pulled caused the comeback
      const comingBackId =
        side === +1
          ? Object.keys(this.playerSide).find((id) => this.playerSide[id] === +1)
          : Object.keys(this.playerSide).find((id) => this.playerSide[id] === -1);
      this.io.to(this.roomId).emit('game:comeback', { playerId: comingBackId });
    } else if (Math.abs(prevPosition) >= 20 && delta >= 20 && Math.sign(prevPosition) !== side) {
      // Big pull against the leading direction
      const comingBackId =
        side === +1
          ? Object.keys(this.playerSide).find((id) => this.playerSide[id] === +1)
          : Object.keys(this.playerSide).find((id) => this.playerSide[id] === -1);
      this.io.to(this.roomId).emit('game:comeback', { playerId: comingBackId });
    }
  }

  // ─── answer handler ───────────────────────────────────────────────────────

  handleAnswer(playerId, { questionId, answer }) {
    if (this.ended) return;
    const player = this.players[playerId];
    if (!player) return;
    const activeQuestion = this._getActiveQuestionForPlayer(playerId);
    if (!activeQuestion) return;

    // Blocked by freeze
    if (player.freezeOnQuestionId && player.freezeOnQuestionId === activeQuestion.id) {
      this.io.to(playerId).emit('game:powerupEffect', {
        type: 'freeze',
        status: 'blocked',
        fromPlayerId: this._getOpponentId(playerId),
        targetPlayerId: playerId,
        questionId: activeQuestion.id,
      });
      return;
    }

    // Blocked by slow
    if (
      player.slowOnQuestionId &&
      player.slowOnQuestionId === activeQuestion.id &&
      Date.now() < player.slowUntil
    ) {
      this.io.to(playerId).emit('game:powerupEffect', {
        type: 'slow',
        status: 'blocked',
        fromPlayerId: this._getOpponentId(playerId),
        targetPlayerId: playerId,
        delayMs: Math.max(0, player.slowUntil - Date.now()),
        questionId: activeQuestion.id,
      });
      return;
    }

    if (questionId !== activeQuestion.id) return;

    const isCorrect = parseInt(String(answer).trim(), 10) === activeQuestion.answer;

    if (isCorrect) {
      player.comboCount += 1;
      player.comboMultiplier = this._comboMultiplier(player.comboCount);
      player.streakCount += 1;
      this._resetOpponentMomentum(playerId);

      const delta = this._computePull(player);

      this.lastCorrectAnswerAt = Date.now();

      // Broadcast score payload (for combo display)
      this.io.to(this.roomId).emit('game:updateScore', {
        scores: this.getScoresPayload(),
        lastCorrect: { playerId, questionId },
        pointsAwarded: delta,
        comboMultiplier: player.comboMultiplier,
        streakCount: player.streakCount,
      });

      if (activeQuestion.type && activeQuestion.type !== 'normal') {
        this._grantPowerup(playerId, activeQuestion.type, 'question');
      }

      this._handleStreakReward(playerId);

      // Update rope (may end game)
      this._updateRope(playerId, delta);

      if (!this.ended) {
        this._nextQuestion();
      }
    } else {
      player.comboCount = 0;
      player.comboMultiplier = 1;
      player.streakCount = 0;

      this.io.to(playerId).emit('game:wrongAnswer', { questionId, playerId });

      this.io.to(this.roomId).emit('game:updateScore', {
        scores: this.getScoresPayload(),
        lastWrong: { playerId, questionId },
      });
    }
  }

  // ─── timer ────────────────────────────────────────────────────────────────

  start() {
    this.io.to(this.roomId).emit('game:start', {
      players: this.getScoresPayload(),
      duration: MATCH_DURATION,
      gameMode: 'tug',
      ropePosition: 0,
    });

    setTimeout(() => {
      this._nextQuestion();
      this._startTimer();
    }, 3200);
  }

  _startTimer() {
    this.lastCorrectAnswerAt = Date.now(); // don't drift immediately at start

    this.timer = setInterval(() => {
      this.timeLeft--;

      this.io.to(this.roomId).emit('game:tick', { timeLeft: this.timeLeft });

      if (!this.timeWarningSent && this.timeLeft <= 10) {
        this.timeWarningSent = true;
        this.io.to(this.roomId).emit('game:timeWarning', { timeLeft: this.timeLeft });
      }

      if (!this.finalRushSent && this.timeLeft <= 5) {
        this.finalRushSent = true;
        this.io.to(this.roomId).emit('game:finalRush', { timeLeft: this.timeLeft });
      }

      // Neutral rope drift: if no correct answer for 2+ seconds
      if (this.lastCorrectAnswerAt !== null) {
        const idleMs = Date.now() - this.lastCorrectAnswerAt;
        if (idleMs >= 2000 && Math.abs(this.ropePosition) >= 0.5) {
          const before = this.ropePosition;
          this.ropePosition = Math.round(this.ropePosition * 0.98 * 100) / 100;
          if (Math.abs(this.ropePosition - before) >= 0.5) {
            this.io.to(this.roomId).emit('game:ropeUpdate', {
              ropePosition: this.ropePosition,
            });
          }
        }
      }

      if (this.timeLeft <= 0) {
        this._end();
      }
    }, 1000);
  }

  // ─── end ──────────────────────────────────────────────────────────────────

  _end() {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer);

    const playerIds = Object.keys(this.players);
    let winnerId = null;
    if (this.ropePosition > 0) {
      winnerId = playerIds.find((id) => this.playerSide[id] === +1) || null;
    } else if (this.ropePosition < 0) {
      winnerId = playerIds.find((id) => this.playerSide[id] === -1) || null;
    }
    // ropePosition === 0 → draw

    const winner = winnerId ? this.players[winnerId] : null;
    const scores = this.getScoresPayload();

    this.io.to(this.roomId).emit('game:end', {
      scores,
      winner: winnerId,
      winnerName: winner ? winner.name : null,
      ropePosition: this.ropePosition,
      gameMode: 'tug',
    });

    if (this.onGameEnd) {
      this.onGameEnd(
        { scores, winner: winnerId, winnerName: winner ? winner.name : null },
        this
      );
    }
  }
}

module.exports = { TugOfWarSession };
