/**
 * Game Session Manager
 * Manages an active 1v1 match — server-authoritative timer, scoring, and questions
 */

const { generateQuestion } = require('./questionGenerator');

const MATCH_DURATION = 60; // seconds
const POINTS_PER_CORRECT = 10;
const SLOW_MIN_DELAY_MS = 1000;
const SLOW_MAX_DELAY_MS = 1500;
const LOTTERY_POOL = ['freeze', 'double', 'skip', 'slow', 'bonus'];

class GameSession {
  constructor(io, player1, player2, roomId, options = {}) {
    const { getWinStreak, onGameEnd } = options;

    this.io = io;
    this.roomId = roomId;
    this.getWinStreak = typeof getWinStreak === 'function' ? getWinStreak : () => 0;
    this.onGameEnd = typeof onGameEnd === 'function' ? onGameEnd : null;
    this.players = {
      [player1.id]: {
        id: player1.id,
        userId: player1.userId || null,
        name: player1.name,
        score: 0,
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
        score: 0,
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
    this.currentQuestion = null;
    this.playerQuestionOverrides = {}; // playerId -> temporary question (used by skip)
    this.globalQuestionCount = 0;
    this.timeLeft = MATCH_DURATION;
    this.timer = null;
    this.ended = false;
    this.timeWarningSent = false;
    this.finalRushSent = false;
    this.disconnected = false;
  }

  getScoresPayload() {
    const now = Date.now();
    return Object.values(this.players).map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
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

  _getDifficulty() {
    const elapsed = MATCH_DURATION - this.timeLeft;
    if (elapsed < 20) return 'easy';
    if (elapsed < 40) return 'medium';
    return 'hard';
  }

  _isFinalRush() {
    return this.timeLeft <= 10;
  }

  _globalRushMultiplier() {
    if (this.timeLeft <= 5) return 3;
    if (this.timeLeft <= 10) return 2;
    return 1;
  }

  _scoreBroadcast(extra = {}) {
    const payload = {
      scores: this.getScoresPayload(),
      ...extra,
    };

    this.io.to(this.roomId).emit('game:updateScore', payload);
    this._emitTension(payload.scores);
  }

  _emitTension(scores) {
    if (!scores || scores.length < 2) return;
    const [a, b] = scores;
    const diff = Math.abs(a.score - b.score);

    if (diff > 10 || diff === 0) return;

    const leader = a.score > b.score ? a : b;
    const trailing = a.score > b.score ? b : a;

    this.io.to(leader.id).emit('game:tension', {
      type: 'pulling_ahead',
      targetPlayerId: leader.id,
      difference: diff,
    });

    this.io.to(trailing.id).emit('game:tension', {
      type: 'catching_up',
      targetPlayerId: trailing.id,
      difference: diff,
    });
  }

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

    // Clear old per-question effects whenever a new question arrives.
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

  _emitQuestionToPlayer(playerId, question, { applyIncomingEffects = false } = {}) {
    if (applyIncomingEffects) {
      this._applyQuestionStartEffects(playerId, question);
    }
    this.io.to(playerId).emit('game:question', this._questionPayload(question, playerId));
  }

  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _randomPowerup() {
    return LOTTERY_POOL[this._randomInt(0, LOTTERY_POOL.length - 1)];
  }

  _nextQuestion() {
    const difficulty = this._getDifficulty();
    this.globalQuestionCount += 1;
    const forcePowerup = this.globalQuestionCount % 5 === 0;
    this.currentQuestion = generateQuestion(difficulty, { forcePowerup });
    this.playerQuestionOverrides = {};
    this._emitQuestionToRoom(this.currentQuestion);
  }

  start() {
    // Send start event with player info
    this.io.to(this.roomId).emit('game:start', {
      players: this.getScoresPayload(),
      duration: MATCH_DURATION,
    });

    // Small delay then send first question
    setTimeout(() => {
      this._nextQuestion();
      this._startTimer();
    }, 3200); // 3.2s to allow clients to render countdown
  }

  _startTimer() {
    this.timer = setInterval(() => {
      this.timeLeft--;

      // Broadcast time update every second
      this.io.to(this.roomId).emit('game:tick', { timeLeft: this.timeLeft });

      if (!this.timeWarningSent && this.timeLeft <= 10) {
        this.timeWarningSent = true;
        this.io.to(this.roomId).emit('game:timeWarning', {
          timeLeft: this.timeLeft,
          multiplier: 2,
        });
      }

      if (!this.finalRushSent && this.timeLeft <= 5) {
        this.finalRushSent = true;
        this.io.to(this.roomId).emit('game:finalRush', {
          timeLeft: this.timeLeft,
          multiplier: 3,
        });
      }

      if (this.timeLeft <= 0) {
        this._end();
      }
    }, 1000);
  }

  _comboMultiplier(comboCount) {
    if (comboCount >= 3) return 3;
    if (comboCount === 2) return 2;
    return 1;
  }

  _getOpponentId(playerId) {
    return Object.keys(this.players).find((id) => id !== playerId) || null;
  }

  _isPlayerFrozen(player) {
    return Boolean(player.freezeOnQuestionId);
  }

  _getActiveQuestionForPlayer(playerId) {
    return this.playerQuestionOverrides[playerId] || this.currentQuestion;
  }

  _grantPowerup(playerId, type, source = 'question') {
    const player = this.players[playerId];
    const opponentId = this._getOpponentId(playerId);
    const opponent = opponentId ? this.players[opponentId] : null;
    if (!player) return;

    let resolvedType = type;
    if (type === 'lottery') {
      resolvedType = this._randomPowerup();
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

    if (resolvedType === 'skip') {
      const difficulty = this._getDifficulty();
      const skipQuestion = generateQuestion(difficulty);
      this.playerQuestionOverrides[playerId] = skipQuestion;
      this._emitQuestionToPlayer(playerId, skipQuestion, { applyIncomingEffects: true });
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

    this._scoreBroadcast({
      powerupGranted: { playerId, type: resolvedType, source, originalType: type },
    });
  }

  _resetOpponentMomentum(playerId) {
    const opponentId = this._getOpponentId(playerId);
    if (!opponentId) return;
    const opponent = this.players[opponentId];
    opponent.streakCount = 0;
    opponent.comboCount = 0;
    opponent.comboMultiplier = 1;
  }

  _handleStreakReward(playerId) {
    const player = this.players[playerId];
    if (!player) return;
    if (player.streakCount < 3) return;

    player.streakCount = 0;
    const reward = this._randomPowerup();
    this._grantPowerup(playerId, reward, 'streak');

    this.io.to(this.roomId).emit('game:streakReward', {
      playerId,
      reward,
    });
  }

  handleAnswer(playerId, { questionId, answer }) {
    if (this.ended) return;
    const player = this.players[playerId];
    if (!player) return;
    const activeQuestion = this._getActiveQuestionForPlayer(playerId);
    if (!activeQuestion) return;

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

    // Mismatch — stale answer for old question, ignore
    if (questionId !== activeQuestion.id) return;

    const isCorrect =
      parseInt(String(answer).trim(), 10) === activeQuestion.answer;

    const answeredOverride = Boolean(this.playerQuestionOverrides[playerId]);

    if (isCorrect) {
      player.comboCount += 1;
      player.comboMultiplier = this._comboMultiplier(player.comboCount);
      player.streakCount += 1;
      this._resetOpponentMomentum(playerId);

      let totalMultiplier = player.comboMultiplier;
      const usedEffectMultiplier = player.nextAnswerMultiplier;
      if (player.nextAnswerMultiplier > 1) {
        totalMultiplier *= player.nextAnswerMultiplier;
        player.nextAnswerMultiplier = 1;
      }

      const rushMultiplier = this._globalRushMultiplier();
      if (rushMultiplier > 1) {
        totalMultiplier *= rushMultiplier;
      }

      const pointsAwarded = POINTS_PER_CORRECT * totalMultiplier;
      player.score += pointsAwarded;

      this._scoreBroadcast({
        lastCorrect: { playerId, questionId },
        pointsAwarded,
        totalMultiplier,
        comboMultiplier: player.comboMultiplier,
        usedEffectMultiplier,
        finalRush: rushMultiplier === 2,
        chaosMode: rushMultiplier === 3,
        streakCount: player.streakCount,
      });

      if (activeQuestion.type && activeQuestion.type !== 'normal') {
        this._grantPowerup(playerId, activeQuestion.type, 'question');
      }

      this._handleStreakReward(playerId);

      if (answeredOverride) {
        delete this.playerQuestionOverrides[playerId];
        if (this.currentQuestion) {
          this._emitQuestionToPlayer(playerId, this.currentQuestion);
        }
      } else {
        // Move to next global question immediately
        this._nextQuestion();
      }
    } else {
      player.comboCount = 0;
      player.comboMultiplier = 1;
      player.streakCount = 0;

      // Notify only the answering player that it was wrong
      this.io
        .to(playerId)
        .emit('game:wrongAnswer', { questionId, playerId });

      this._scoreBroadcast({
        lastWrong: { playerId, questionId },
      });
    }
  }

  _end() {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer);

    const scores = this.getScoresPayload();
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const winner =
      sorted[0].score === sorted[1].score ? null : sorted[0]; // null = draw

    this.io.to(this.roomId).emit('game:end', {
      scores,
      winner: winner ? winner.id : null,
      winnerName: winner ? winner.name : null,
    });

    if (this.onGameEnd) {
      this.onGameEnd(
        {
          scores,
          winner: winner ? winner.id : null,
          winnerName: winner ? winner.name : null,
        },
        this
      );
    }
  }
}

module.exports = { GameSession };
