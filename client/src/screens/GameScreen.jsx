import React, { useState, useEffect, useRef } from 'react';
import { getSocket } from '../socket/client';

const TOTAL_TIME = 60;
const CIRCUMFERENCE = 2 * Math.PI * 36; // r=36

/**
 * GameScreen — the main battle arena.
 * Props:
 *   roomId: string
 *   playerName: string
 *   onGameEnd: (endData) => void
 */
export default function GameScreen({ roomId, playerName, opponentWinStreak = 0, onGameEnd }) {
  const [countdown, setCountdown] = useState(3);  // 3…2…1 overlay
  const [gameStarted, setGameStarted] = useState(false);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [scores, setScores] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [flash, setFlash] = useState(null); // 'correct' | 'wrong' | null
  const [finalRush, setFinalRush] = useState(false);
  const [chaosMode, setChaosMode] = useState(false);
  const [notice, setNotice] = useState('');
  const [momentumHint, setMomentumHint] = useState('');
  const [streakText, setStreakText] = useState('');
  const [scorePop, setScorePop] = useState(null);
  const [comboPulse, setComboPulse] = useState(null);
  const [isInputFrozen, setIsInputFrozen] = useState(false);
  const [isInputSlowed, setIsInputSlowed] = useState(false);
  const [freezeFx, setFreezeFx] = useState(false);
  const [slowFx, setSlowFx] = useState(false);
  const [questionPulse, setQuestionPulse] = useState(false);
  const [chaosPulse, setChaosPulse] = useState(false);
  const inputRef = useRef(null);
  const socketRef = useRef(null);
  const prevCombosRef = useRef({});
  const noticeTimerRef = useRef(null);
  const streakTimerRef = useRef(null);
  const scorePopTimerRef = useRef(null);
  const comboPulseTimerRef = useRef(null);
  const slowTimerRef = useRef(null);
  const freezeFxTimerRef = useRef(null);
  const slowFxTimerRef = useRef(null);
  const questionPulseTimerRef = useRef(null);
  const chaosPulseTimerRef = useRef(null);

  const QUESTION_META = {
    normal: { icon: '🧮', label: 'Normal Question' },
    freeze: { icon: '❄️', label: 'Freeze Power-Up' },
    double: { icon: '⚡', label: 'Double Points Power-Up' },
    skip: { icon: '⏭️', label: 'Skip Power-Up' },
    slow: { icon: '🐢', label: 'Slow Power-Up' },
    bonus: { icon: '🎯', label: 'Bonus x3 Power-Up' },
    lottery: { icon: '🎰', label: 'Lottery Power-Up' },
  };

  // Countdown timer (3…2…1…GO)
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function showNotice(text, ms = 1500) {
      setNotice(text);
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(''), ms);
    }

    function pulseCombo(which) {
      setComboPulse(which);
      clearTimeout(comboPulseTimerRef.current);
      comboPulseTimerRef.current = setTimeout(() => setComboPulse(null), 420);
    }

    function updateDerivedUiFromScores(nextScores) {
      const myId = socket.id;
      const mine = nextScores.find((s) => s.id === myId);
      const opp = nextScores.find((s) => s.id !== myId);

      setIsInputFrozen(Boolean(mine?.isFrozen));

      const prevMineCombo = prevCombosRef.current[myId] || 1;
      const prevOppCombo = prevCombosRef.current[opp?.id] || 1;

      if (mine && mine.comboMultiplier > prevMineCombo) pulseCombo('you');
      if (opp && opp.comboMultiplier > prevOppCombo) pulseCombo('opponent');

      prevCombosRef.current = Object.fromEntries(
        nextScores.map((s) => [s.id, s.comboMultiplier || 1])
      );
    }

    socket.on('game:start', ({ players }) => {
      setScores(players);
      setGameStarted(true);
      updateDerivedUiFromScores(players);
    });

    socket.on('game:question', (q) => {
      // Recover from missed game:start by unlocking the screen when first question arrives.
      setGameStarted(true);
      setQuestion(q);
      setAnswer('');

      // Question payload is authoritative for one-question freeze/slow effects.
      setIsInputFrozen(Boolean(q?.isFrozenForQuestion));

      if (q?.isSlowedForQuestion) {
        setIsInputSlowed(true);
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = setTimeout(
          () => setIsInputSlowed(false),
          q?.slowMsLeft || 1200
        );
      } else {
        setIsInputSlowed(false);
      }

      if (q?.type && q.type !== 'normal') {
        const meta = QUESTION_META[q.type] || QUESTION_META.normal;
        showNotice(`${meta.icon} ${meta.label}`, 1400);
        setQuestionPulse(true);
        clearTimeout(questionPulseTimerRef.current);
        questionPulseTimerRef.current = setTimeout(() => setQuestionPulse(false), 520);
      }

      setTimeout(() => inputRef.current?.focus(), 50);
    });

    socket.on('game:tick', ({ timeLeft: t }) => {
      setGameStarted(true);
      setTimeLeft(t);
      if (t <= 10) setFinalRush(true);
    });

    socket.on('game:updateScore', (payload) => {
      const {
        scores: s,
        lastCorrect,
        pointsAwarded,
        finalRush: isFinalRushRound,
      } = payload;
      setGameStarted(true);
      setScores(s);
      updateDerivedUiFromScores(s);

      if (isFinalRushRound) setFinalRush(true);

      if (lastCorrect) {
        const wasMe = lastCorrect.playerId === socket.id;
        triggerFlash(wasMe ? 'correct' : null);
        if (wasMe) {
          showNotice(`Great hit! +${pointsAwarded || 10}`);
          setScorePop({ side: 'you', points: pointsAwarded || 10 });
        } else {
          showNotice('Opponent answered!');
          setScorePop({ side: 'opponent', points: pointsAwarded || 10 });
        }
        clearTimeout(scorePopTimerRef.current);
        scorePopTimerRef.current = setTimeout(() => setScorePop(null), 620);
      }
    });

    socket.on('game:wrongAnswer', ({ playerId }) => {
      if (playerId === socket.id) {
        triggerFlash('wrong');
      }
    });

    socket.on('game:powerupEffect', (effect) => {
      if (!effect) return;
      const myId = socket.id;

      if (effect.status === 'applied' && effect.type === 'freeze') {
        if (effect.targetPlayerId === myId) {
          setIsInputFrozen(true);
          showNotice('Frozen for this question ❄️');
          setFreezeFx(true);
          clearTimeout(freezeFxTimerRef.current);
          freezeFxTimerRef.current = setTimeout(() => setFreezeFx(false), 1300);
        } else if (effect.fromPlayerId === myId) {
          showNotice('You earned FREEZE!');
        }
      }

      if (effect.status === 'applied' && effect.type === 'slow') {
        if (effect.targetPlayerId === myId) {
          setIsInputSlowed(true);
          showNotice('You got SLOWED 🐢');
          setSlowFx(true);
          clearTimeout(slowFxTimerRef.current);
          slowFxTimerRef.current = setTimeout(() => setSlowFx(false), 1100);
          clearTimeout(slowTimerRef.current);
          slowTimerRef.current = setTimeout(
            () => setIsInputSlowed(false),
            effect.delayMs || 1200
          );
        } else if (effect.fromPlayerId === myId) {
          showNotice('You earned SLOW!');
        }
      }

      if (effect.fromPlayerId === myId && effect.status !== 'blocked') {
        if (effect.type === 'double') showNotice('Next = x2 ⚡');
        if (effect.type === 'bonus') showNotice('BONUS x3 ready!');
        if (effect.type === 'skip') showNotice('SKIP activated ⏭️');
        if (effect.type === 'lottery') showNotice('Lottery hit! 🎰');
      }

      if (effect.message && effect.fromPlayerId !== myId) {
        showNotice(effect.message, 1400);
      }
    });

    socket.on('game:streakReward', ({ playerId, reward }) => {
      const mine = playerId === socket.id;
      if (mine) {
        setStreakText(`🔥 Streak x3! Reward: ${String(reward).toUpperCase()}`);
        showNotice(`Streak reward: ${String(reward).toUpperCase()}!`, 1700);
      } else {
        setStreakText(`Opponent streak reward: ${String(reward).toUpperCase()}`);
      }

      clearTimeout(streakTimerRef.current);
      streakTimerRef.current = setTimeout(() => setStreakText(''), 1800);
    });

    socket.on('game:timeWarning', () => {
      setFinalRush(true);
      showNotice('Final Rush: all points x2!');
    });

    socket.on('game:finalRush', () => {
      setFinalRush(true);
      setChaosMode(true);
      setChaosPulse(true);
      clearTimeout(chaosPulseTimerRef.current);
      chaosPulseTimerRef.current = setTimeout(() => setChaosPulse(false), 1600);
      showNotice('FINAL RUSH 🔥 x3 points!', 1800);
    });

    socket.on('game:tension', ({ targetPlayerId, type }) => {
      if (targetPlayerId !== socket.id) return;
      if (type === 'catching_up') setMomentumHint("🔥 You're catching up!");
      if (type === 'pulling_ahead') setMomentumHint("🚀 You're pulling ahead!");
      setTimeout(() => setMomentumHint(''), 1200);
    });

    socket.on('game:end', (data) => {
      onGameEnd({ ...data, roomId });
    });

    socket.on('game:opponentLeft', (data) => {
      onGameEnd({ ...data, opponentLeft: true });
    });

    return () => {
      socket.off('game:start');
      socket.off('game:question');
      socket.off('game:tick');
      socket.off('game:updateScore');
      socket.off('game:wrongAnswer');
      socket.off('game:powerupEffect');
      socket.off('game:streakReward');
      socket.off('game:timeWarning');
      socket.off('game:finalRush');
      socket.off('game:tension');
      socket.off('game:end');
      socket.off('game:opponentLeft');
      clearTimeout(noticeTimerRef.current);
      clearTimeout(streakTimerRef.current);
      clearTimeout(scorePopTimerRef.current);
      clearTimeout(comboPulseTimerRef.current);
      clearTimeout(slowTimerRef.current);
      clearTimeout(freezeFxTimerRef.current);
      clearTimeout(slowFxTimerRef.current);
      clearTimeout(questionPulseTimerRef.current);
      clearTimeout(chaosPulseTimerRef.current);
    };
  }, [roomId, playerName]);

  function triggerFlash(type) {
    setFlash(type);
    if (!type) return;
    setTimeout(() => setFlash(null), 420);
  }

  function submitAnswer() {
    if (!question || answer.trim() === '' || isInputFrozen || isInputSlowed) return;
    const socket = socketRef.current;
    socket.emit('game:answer', {
      roomId,
      questionId: question.id,
      answer: answer.trim(),
    });
    setAnswer('');
  }

  // My score vs opponent score
  const mySocket = socketRef.current;
  const myId = mySocket?.id;
  const myScore = scores.find((s) => s.id === myId);
  const oppScore = scores.find((s) => s.id !== myId);

  // Timer ring
  const progress = timeLeft / TOTAL_TIME;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const isUrgent = finalRush || timeLeft <= 10;
  const questionType = question?.type || 'normal';
  const questionMeta = QUESTION_META[questionType] || QUESTION_META.normal;
  const oppPreGameStreak = oppScore?.winStreak || opponentWinStreak;

  if (!gameStarted) {
    return (
      <div className="screen">
        {countdown !== null && (
          <div className="countdown-overlay">
            <div className="countdown-number">{countdown === 0 ? 'GO!' : countdown}</div>
          </div>
        )}
        <div className="countdown-wait">
          <p className="subtitle">Match found! Preparing…</p>
          {opponentWinStreak > 0 && (
            <p className="streak-pressure">🔥 Opponent on {opponentWinStreak} win streak</p>
          )}
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`screen screen-compact ${chaosMode ? 'chaos-mode' : ''} ${isUrgent ? 'rush-pulse' : ''}`}>
      {freezeFx && (
        <div className="fx-overlay freeze-overlay">
          <div className="fx-text">FROZEN</div>
        </div>
      )}

      {slowFx && (
        <div className="fx-overlay slow-overlay">
          <div className="fx-text">SLOWED</div>
        </div>
      )}

      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown === 0 ? 'GO!' : countdown}</div>
        </div>
      )}

      <div className="game-top">
        <div className="score-row">
          <div className="score-box you">
            <div className="score-name">You - {myScore?.name || playerName}</div>
            {(myScore?.winStreak || 0) > 0 && <div className="name-streak">🔥 {myScore.winStreak}W</div>}
            <div className="score-value-wrap">
              <div className="score-value">{myScore?.score ?? 0}</div>
              {scorePop?.side === 'you' && <div className="score-pop">+{scorePop.points}</div>}
            </div>
            <div className={`combo-pill ${comboPulse === 'you' ? 'pulse' : ''}`}>
              🔥 x{myScore?.comboMultiplier ?? 1}
            </div>
          </div>
          <div className="score-box opponent">
            <div className="score-name">Opponent - {oppScore?.name || '?'}</div>
            {(oppScore?.winStreak || 0) > 0 && <div className="name-streak opponent">🔥 {oppScore.winStreak}W</div>}
            <div className="score-value-wrap">
              <div className="score-value">{oppScore?.score ?? 0}</div>
              {scorePop?.side === 'opponent' && <div className="score-pop">+{scorePop.points}</div>}
            </div>
            <div className={`combo-pill combo-opponent ${comboPulse === 'opponent' ? 'pulse' : ''}`}>
              🔥 x{oppScore?.comboMultiplier ?? 1}
            </div>
          </div>
        </div>

        {/* Timer */}
        <div className="timer-wrap">
          <div className={`timer-ring ${isUrgent ? 'urgent' : ''}`}>
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle className="bg-ring" cx="40" cy="40" r="36" />
              <circle
                className="fg-ring"
                cx="40" cy="40" r="36"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="timer-text">{timeLeft}</div>
          </div>
          {isUrgent && <p className="urgent-text">{chaosMode ? 'FINAL RUSH x3' : 'Final Rush x2'}</p>}
        </div>
      </div>

      {oppPreGameStreak > 0 && !chaosMode && (
        <div className="streak-pressure">🔥 Opponent entered on {oppPreGameStreak} win streak</div>
      )}

      {chaosMode && <div className={`chaos-banner ${chaosPulse ? 'pulse' : ''}`}>FINAL RUSH 🔥</div>}

      {(notice || momentumHint) && (
        <div className="status-banner" role="status" aria-live="polite">
          {notice || momentumHint}
        </div>
      )}

      {streakText && <div className="streak-banner">{streakText}</div>}

      {/* Question */}
      <div
        className={`question-card question-type-${questionType} ${questionPulse ? 'question-special-pop' : ''} ${flash === 'correct' ? 'flash-correct' : ''} ${flash === 'wrong' ? 'flash-wrong' : ''}`}
        id="question-display"
      >
        <div className={`question-type-pill q-pill-${questionType}`}>
          {questionMeta.icon} {questionMeta.label}
        </div>
        <p className="label" style={{ marginBottom: 8 }}>
          Solve:
        </p>
        <div className="question-text">{question?.question ?? '…'}</div>
      </div>

      {/* Answer input */}
      <div className="answer-row">
        <input
          ref={inputRef}
          id="answer-input"
          className="input"
          type="number"
          placeholder="Your answer…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
          autoComplete="off"
          disabled={isInputFrozen || isInputSlowed}
        />
        <button
          id="btn-submit-answer"
          className="btn btn-primary answer-submit"
          onClick={submitAnswer}
          disabled={isInputFrozen || isInputSlowed}
        >
          ➤
        </button>
      </div>

      <div className="effect-indicator-row">
        {myScore?.nextAnswerMultiplier === 2 && <span className="effect-pill x2">Next = x2 ⚡</span>}
        {myScore?.nextAnswerMultiplier === 3 && <span className="effect-pill x3">Next = x3 🎯</span>}
      </div>

      <p className="microcopy">
        Power-ups are earned from special questions and 3-hit streak rewards
      </p>

      {isInputFrozen && <p className="freeze-note">Input disabled by Freeze</p>}
      {isInputSlowed && <p className="freeze-note">Input delayed by Slow</p>}
    </div>
  );
}
