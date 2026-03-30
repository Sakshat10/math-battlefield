import React, { useState, useEffect, useRef } from 'react';
import { getSocket } from '../socket/client';

const TOTAL_TIME = 60;
const CIRCUMFERENCE = 2 * Math.PI * 36;

const QUESTION_META = {
  normal:  { icon: '🧮', label: 'Normal' },
  freeze:  { icon: '❄️', label: 'Freeze' },
  double:  { icon: '⚡', label: 'Double Pull' },
  slow:    { icon: '🐢', label: 'Slow' },
  bonus:   { icon: '🎯', label: 'Bonus Pull' },
  lottery: { icon: '🎰', label: 'Lottery' },
};

/* ── SVG Rope component ──────────────────────────────────────────────────── */
function RopeSVG({ ropePosition, pulling, isCritical, isVictoryMoment }) {
  // ropePosition: -100 to +100
  // rope knot moves along x: center is at 50%, each unit = 0.4% shift
  const W = 700, H = 110;
  const knotX = W / 2 + (ropePosition / 100) * (W * 0.38);
  const knotY = H / 2;

  // Rope segments — dots spaced along quadratic bezier from left end to knot, knot to right end
  const numSegments = 18;
  const leftEndX = 32;
  const rightEndX = W - 32;

  // Control point sags downward slightly for a natural rope curve
  const sag = 18 + Math.abs(ropePosition) * 0.12;

  function ropePoints(x1, y1, x2, y2, cpX, cpY, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cpX + t * t * x2;
      const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cpY + t * t * y2;
      pts.push({ x, y });
    }
    return pts;
  }

  const cpLeftX = (leftEndX + knotX) / 2;
  const cpLeftY = knotY + sag;
  const cpRightX = (knotX + rightEndX) / 2;
  const cpRightY = knotY + sag;

  const leftPts  = ropePoints(leftEndX,  knotY, knotX, knotY, cpLeftX,  cpLeftY,  numSegments);
  const rightPts = ropePoints(knotX, knotY, rightEndX, knotY, cpRightX, cpRightY, numSegments);

  const leftPath  = `M ${leftPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
  const rightPath = `M ${rightPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;

  const flagX = knotX;
  const flagPole = 22;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      className={`tug-rope-svg ${pulling === 'left' ? 'rope-glow-left' : ''} ${pulling === 'right' ? 'rope-glow-right' : ''}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="ropeGradL" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#c4a35a" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="ropeGradR" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c4a35a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.9" />
        </linearGradient>
        <filter id="ropeGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="flagGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Ground line */}
      <line x1={leftEndX - 10} y1={knotY + 28} x2={rightEndX + 10} y2={knotY + 28}
        stroke="rgba(103,232,249,0.12)" strokeWidth="2" />

      {/* Win zone markers */}
      <rect x={leftEndX - 12} y={knotY - 28} width={4} height={60}
        fill="rgba(34,211,238,0.35)" rx="2" />
      <rect x={rightEndX + 8} y={knotY - 28} width={4} height={60}
        fill="rgba(249,115,22,0.35)" rx="2" />
      <text x={leftEndX - 8} y={knotY - 32} textAnchor="middle"
        fill="rgba(34,211,238,0.6)" fontSize="9" fontFamily="monospace">WIN</text>
      <text x={rightEndX + 10} y={knotY - 32} textAnchor="middle"
        fill="rgba(249,115,22,0.6)" fontSize="9" fontFamily="monospace">WIN</text>

      {/* Center mark */}
      <line x1={W / 2} y1={knotY - 20} x2={W / 2} y2={knotY + 32}
        stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4,4" />

      {/* Left rope half */}
      <path d={leftPath} stroke="url(#ropeGradL)" strokeWidth="6"
        fill="none" strokeLinecap="round" strokeLinejoin="round"
        filter="url(#ropeGlow)" opacity="0.92" />
      {/* Rope texture dots */}
      {leftPts.filter((_, i) => i % 3 === 0).map((p, i) => (
        <circle key={`ld-${i}`} cx={p.x} cy={p.y} r={2.2}
          fill="rgba(255,255,255,0.28)" />
      ))}

      {/* Right rope half */}
      <path d={rightPath} stroke="url(#ropeGradR)" strokeWidth="6"
        fill="none" strokeLinecap="round" strokeLinejoin="round"
        filter="url(#ropeGlow)" opacity="0.92" />
      {rightPts.filter((_, i) => i % 3 === 0).map((p, i) => (
        <circle key={`rd-${i}`} cx={p.x} cy={p.y} r={2.2}
          fill="rgba(255,255,255,0.28)" />
      ))}

      {/* Center flag pole */}
      <line x1={flagX} y1={knotY - flagPole} x2={flagX} y2={knotY + 8}
        stroke="#e2c97e" strokeWidth="2.5" strokeLinecap="round"
        filter="url(#flagGlow)" />

      {/* Flag (red) — waves to the side being pulled */}
      <polygon
        points={`${flagX},${knotY - flagPole} ${flagX + (ropePosition >= 0 ? 18 : -18)},${knotY - flagPole + 7} ${flagX},${knotY - flagPole + 14}`}
        fill={isCritical ? '#ef4444' : '#f97316'}
        opacity="0.92"
        filter="url(#flagGlow)"
      />

      {/* Knot circle */}
      <circle cx={knotX} cy={knotY} r={isVictoryMoment ? 16 : 11}
        fill={isVictoryMoment ? '#fbbf24' : '#c4a35a'}
        stroke={isVictoryMoment ? '#fff' : '#e2c97e'}
        strokeWidth={isVictoryMoment ? 3 : 2}
        filter="url(#flagGlow)"
        className={isVictoryMoment ? 'knot-victory-pulse' : ''}
      />
      {/* Knot X pattern */}
      <line x1={knotX - 5} y1={knotY - 5} x2={knotX + 5} y2={knotY + 5}
        stroke={isVictoryMoment ? '#7c3aed' : '#5c3d0a'} strokeWidth="2.5" strokeLinecap="round" />
      <line x1={knotX + 5} y1={knotY - 5} x2={knotX - 5} y2={knotY + 5}
        stroke={isVictoryMoment ? '#7c3aed' : '#5c3d0a'} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Team figure component ───────────────────────────────────────────────── */
function TeamFigures({ side, lean, isPulling, isWinning, isFrozen, name }) {
  // side: 'left' | 'right'
  // lean: 0-100 (how hard they're leaning back)
  const leanDeg = side === 'left' ? -Math.min(lean * 0.3, 28) : Math.min(lean * 0.3, 28);
  const color = side === 'left' ? '#22d3ee' : '#f97316';
  const shadowColor = side === 'left' ? 'rgba(34,211,238,0.4)' : 'rgba(249,115,22,0.4)';

  return (
    <div
      className={`tug-team-figures tug-team-${side} ${isPulling ? 'tug-team-pulling' : ''} ${isWinning ? 'tug-team-winning' : ''}`}
    >
      <div className="tug-player-name" style={{ color }}>
        {name}
        {isFrozen && <span style={{ marginLeft: 4 }}>❄️</span>}
      </div>
      <div
        className="tug-figures-row"
        style={{
          transform: `rotate(${leanDeg}deg)`,
          filter: `drop-shadow(0 4px 12px ${shadowColor})`,
        }}
      >
        {/* 3 stick figures per side */}
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 40 70"
            width={i === 1 ? 36 : 28}
            height={i === 1 ? 64 : 50}
            style={{ opacity: i === 1 ? 1 : 0.7 }}
          >
            {/* Body */}
            <circle cx="20" cy="12" r="8" fill={color} opacity="0.95" />
            <line x1="20" y1="20" x2="20" y2="44" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
            {/* Arms — angled back as if pulling */}
            {side === 'left' ? (
              <>
                <line x1="20" y1="28" x2="34" y2="22" stroke={color} strokeWidth="3" strokeLinecap="round" />
                <line x1="20" y1="28" x2="34" y2="34" stroke={color} strokeWidth="3" strokeLinecap="round" />
              </>
            ) : (
              <>
                <line x1="20" y1="28" x2="6" y2="22" stroke={color} strokeWidth="3" strokeLinecap="round" />
                <line x1="20" y1="28" x2="6" y2="34" stroke={color} strokeWidth="3" strokeLinecap="round" />
              </>
            )}
            {/* Legs — planted wide */}
            <line x1="20" y1="44" x2="10" y2="62" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <line x1="20" y1="44" x2="30" y2="62" stroke={color} strokeWidth="3" strokeLinecap="round" />
            {/* Feet */}
            <line x1="10" y1="62" x2={side === 'left' ? 4 : 16} y2="62" stroke={color} strokeWidth="3" strokeLinecap="round" />
            <line x1="30" y1="62" x2={side === 'left' ? 24 : 36} y2="62" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </svg>
        ))}
      </div>
      {/* Effort grunt */}
      {isPulling && (
        <div className="tug-effort-text" style={{ color }}>
          {side === 'left' ? '💪 PULL!' : 'PULL! 💪'}
        </div>
      )}
    </div>
  );
}

/* ── Main screen ─────────────────────────────────────────────────────────── */
export default function TugOfWarScreen({ roomId, playerName, opponentWinStreak = 0, onGameEnd }) {
  const [countdown, setCountdown]           = useState(3);
  const [gameStarted, setGameStarted]       = useState(false);
  const [question, setQuestion]             = useState(null);
  const [answer, setAnswer]                 = useState('');
  const [scores, setScores]                 = useState([]);
  const [timeLeft, setTimeLeft]             = useState(TOTAL_TIME);
  const [ropePosition, setRopePosition]     = useState(0);
  const [pulling, setPulling]               = useState(null);   // 'left'|'right'|null
  const [flash, setFlash]                   = useState(null);
  const [notice, setNotice]                 = useState('');
  const [comboBanner, setComboBanner]       = useState('');
  const [dominanceBanner, setDominanceBanner] = useState('');
  const [comebackBanner, setComebackBanner] = useState('');
  const [tensionWarning, setTensionWarning] = useState(false);
  const [isCritical, setIsCritical]         = useState(false);
  const [isVictoryMoment, setIsVictoryMoment] = useState(false);
  const [finalRush, setFinalRush]           = useState(false);
  const [isInputFrozen, setIsInputFrozen]   = useState(false);
  const [isInputSlowed, setIsInputSlowed]   = useState(false);
  const [freezeFx, setFreezeFx]             = useState(false);
  const [slowFx, setSlowFx]                 = useState(false);
  const [streakText, setStreakText]          = useState('');
  const [myPulling, setMyPulling]           = useState(false);

  const inputRef            = useRef(null);
  const socketRef           = useRef(null);
  const noticeTimerRef      = useRef(null);
  const dominanceTimerRef   = useRef(null);
  const comebackTimerRef    = useRef(null);
  const comboBannerTimerRef = useRef(null);
  const pullingTimerRef     = useRef(null);
  const myPullingTimerRef   = useRef(null);
  const slowTimerRef        = useRef(null);
  const freezeFxTimerRef    = useRef(null);
  const slowFxTimerRef      = useRef(null);
  const streakTimerRef      = useRef(null);

  // Countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function showNotice(text, ms = 1600) {
      setNotice(text);
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(''), ms);
    }

    function triggerPull(side) {
      setPulling(side);
      clearTimeout(pullingTimerRef.current);
      pullingTimerRef.current = setTimeout(() => setPulling(null), 500);
    }

    socket.on('game:start', ({ players, ropePosition: rp }) => {
      setScores(players);
      setGameStarted(true);
      if (rp !== undefined) setRopePosition(rp);
    });

    socket.on('game:question', (q) => {
      setGameStarted(true);
      setQuestion(q);
      setAnswer('');
      setIsInputFrozen(Boolean(q?.isFrozenForQuestion));

      if (q?.isSlowedForQuestion) {
        setIsInputSlowed(true);
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = setTimeout(() => setIsInputSlowed(false), q?.slowMsLeft || 400);
      } else {
        setIsInputSlowed(false);
      }

      if (q?.type && q.type !== 'normal') {
        const meta = QUESTION_META[q.type] || QUESTION_META.normal;
        showNotice(`${meta.icon} ${meta.label}`, 1400);
      }

      setTimeout(() => inputRef.current?.focus(), 50);
    });

    socket.on('game:tick', ({ timeLeft: t }) => {
      setGameStarted(true);
      setTimeLeft(t);
      if (t <= 10) setFinalRush(true);
    });

    socket.on('game:ropeUpdate', ({ ropePosition: rp }) => {
      setRopePosition(rp);
      const abs = Math.abs(rp);
      setTensionWarning(abs >= 75);
      setIsCritical(abs >= 90);
      setIsVictoryMoment(abs >= 100);
    });

    socket.on('game:updateScore', ({ scores: s, lastCorrect, comboMultiplier }) => {
      setGameStarted(true);
      setScores(s);

      if (lastCorrect) {
        const myId = socket.id;
        const wasMe = lastCorrect.playerId === myId;
        triggerPull(wasMe ? 'left' : 'right');
        triggerFlash(wasMe ? 'correct' : null);

        if (wasMe) {
          if (comboMultiplier >= 3) setComboBanner('STRONG PULL x3 🔥');
          else if (comboMultiplier >= 2) setComboBanner('DOUBLE PULL x2 💪');
          else setComboBanner('');
          clearTimeout(comboBannerTimerRef.current);
          comboBannerTimerRef.current = setTimeout(() => setComboBanner(''), 1200);
        }
      }
    });

    socket.on('game:wrongAnswer', ({ playerId }) => {
      if (playerId === socket.id) triggerFlash('wrong');
    });

    socket.on('game:dominance', ({ playerId }) => {
      const isMe = playerId === socket.id;
      setDominanceBanner(isMe ? "😈 YOU'RE DOMINATING" : 'Opponent is dominating…');
      clearTimeout(dominanceTimerRef.current);
      dominanceTimerRef.current = setTimeout(() => setDominanceBanner(''), 2000);
    });

    socket.on('game:comeback', ({ playerId }) => {
      const isMe = playerId === socket.id;
      setComebackBanner(isMe ? '🔥 COMEBACK!' : '😱 Opponent is coming back!');
      clearTimeout(comebackTimerRef.current);
      comebackTimerRef.current = setTimeout(() => setComebackBanner(''), 2000);
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
          showNotice('You earned FREEZE! ❄️');
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
          slowTimerRef.current = setTimeout(() => setIsInputSlowed(false), effect.delayMs || 400);
        } else if (effect.fromPlayerId === myId) {
          showNotice('You earned SLOW! 🐢');
        }
      }

      if (effect.fromPlayerId === myId && effect.status !== 'blocked') {
        if (effect.type === 'double') showNotice('Next pull = x2 ⚡');
        if (effect.type === 'bonus')  showNotice('BONUS pull ready! 🎯');
        if (effect.type === 'lottery') showNotice('Lottery hit! 🎰');
      }
    });

    socket.on('game:streakReward', ({ playerId, reward }) => {
      const mine = playerId === socket.id;
      setStreakText(mine
        ? `🔥 Streak x3! Reward: ${String(reward).toUpperCase()}`
        : `Opponent streak: ${String(reward).toUpperCase()}`
      );
      if (mine) showNotice(`Streak reward: ${String(reward).toUpperCase()}!`, 1700);
      clearTimeout(streakTimerRef.current);
      streakTimerRef.current = setTimeout(() => setStreakText(''), 1800);
    });

    socket.on('game:timeWarning', () => { setFinalRush(true); showNotice('⏰ Final 10 seconds!'); });
    socket.on('game:finalRush',   () => { setFinalRush(true); showNotice('FINAL RUSH 🔥 Pull hard!', 1800); });
    socket.on('game:end',         (data) => onGameEnd({ ...data, roomId }));
    socket.on('game:opponentLeft',(data) => onGameEnd({ ...data, opponentLeft: true }));

    return () => {
      ['game:start','game:question','game:tick','game:ropeUpdate','game:updateScore',
       'game:wrongAnswer','game:dominance','game:comeback','game:powerupEffect',
       'game:streakReward','game:timeWarning','game:finalRush','game:end','game:opponentLeft'
      ].forEach((e) => socket.off(e));
      [noticeTimerRef, dominanceTimerRef, comebackTimerRef, comboBannerTimerRef,
       pullingTimerRef, myPullingTimerRef, slowTimerRef, freezeFxTimerRef,
       slowFxTimerRef, streakTimerRef
      ].forEach((r) => clearTimeout(r.current));
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
    // Show my pull effort immediately
    setMyPulling(true);
    clearTimeout(myPullingTimerRef.current);
    myPullingTimerRef.current = setTimeout(() => setMyPulling(false), 500);
    socket.emit('game:answer', { roomId, questionId: question.id, answer: answer.trim() });
    setAnswer('');
  }

  const myId    = socketRef.current?.id;
  const myScore = scores.find((s) => s.id === myId);
  const oppScore = scores.find((s) => s.id !== myId);

  const progress   = timeLeft / TOTAL_TIME;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const isUrgent   = finalRush || timeLeft <= 10;
  const questionType = question?.type || 'normal';
  const questionMeta = QUESTION_META[questionType] || QUESTION_META.normal;

  // Lean amount for figures: 0–100 based on how far rope is on each side
  const myLean  = Math.max(0, ropePosition);    // positive = my side pulled more
  const oppLean = Math.max(0, -ropePosition);   // negative = opp side pulled more

  if (!gameStarted) {
    return (
      <div className="screen">
        {countdown !== null && (
          <div className="countdown-overlay">
            <div className="countdown-number">{countdown === 0 ? 'GO!' : countdown}</div>
          </div>
        )}
        <div className="countdown-wait">
          <p className="subtitle">🪢 Tug of War — Preparing…</p>
          {opponentWinStreak > 0 && <p className="streak-pressure">🔥 Opponent on {opponentWinStreak} win streak</p>}
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className={`tug-screen ${isUrgent ? 'rush-pulse' : ''} ${isCritical ? 'tug-critical-screen' : ''}`}>
      {freezeFx && <div className="fx-overlay freeze-overlay"><div className="fx-text">FROZEN</div></div>}
      {slowFx   && <div className="fx-overlay slow-overlay"><div className="fx-text">SLOWED</div></div>}
      {countdown !== null && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown === 0 ? 'GO!' : countdown}</div>
        </div>
      )}

      {/* ── Top bar: timer + labels ─────────────────────────── */}
      <div className="tug-topbar">
        <div className="tug-topbar-side tug-side-you">
          <span className="tug-topbar-name">⚔️ {myScore?.name || playerName}</span>
          <span className="tug-topbar-combo">x{myScore?.comboMultiplier ?? 1}</span>
        </div>

        <div className="timer-wrap">
          <div className={`timer-ring ${isUrgent ? 'urgent' : ''}`}>
            <svg viewBox="0 0 80 80" width="72" height="72">
              <circle className="bg-ring" cx="40" cy="40" r="36" />
              <circle className="fg-ring" cx="40" cy="40" r="36"
                strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset} />
            </svg>
            <div className="timer-text">{timeLeft}</div>
          </div>
        </div>

        <div className="tug-topbar-side tug-side-opp">
          <span className="tug-topbar-combo">x{oppScore?.comboMultiplier ?? 1}</span>
          <span className="tug-topbar-name">{oppScore?.name || '?'} ⚔️</span>
        </div>
      </div>

      {/* ── Main tug-of-war field ───────────────────────────── */}
      <div className="tug-field">
        {/* Players left */}
        <TeamFigures
          side="left"
          lean={myLean}
          isPulling={pulling === 'left' || myPulling}
          isWinning={ropePosition > 50}
          isFrozen={isInputFrozen}
          name={myScore?.name || playerName}
        />

        {/* Rope */}
        <div className="tug-rope-container">
          <RopeSVG
            ropePosition={ropePosition}
            pulling={pulling}
            isCritical={isCritical}
            isVictoryMoment={isVictoryMoment}
          />

          {/* Position indicator */}
          <div className="tug-pos-indicator">
            <div
              className="tug-pos-arrow"
              style={{
                left: `calc(50% + ${ropePosition * 0.38}%)`,
                color: ropePosition > 0 ? '#22d3ee' : ropePosition < 0 ? '#f97316' : '#9bb9c9',
              }}
            >
              ▼
            </div>
            <div className="tug-pos-bar">
              <div className="tug-pos-fill-left"
                style={{ width: `${Math.max(0, -ropePosition / 2)}%` }} />
              <div className="tug-pos-fill-right"
                style={{ width: `${Math.max(0, ropePosition / 2)}%` }} />
            </div>
          </div>

          {/* Tension warning */}
          {tensionWarning && !isVictoryMoment && (
            <div className={`tug-tension-warning ${isCritical ? 'tug-tension-critical' : ''}`}>
              {isCritical ? '🚨 ALMOST THERE!' : '⚠️ Almost there!'}
            </div>
          )}
        </div>

        {/* Players right */}
        <TeamFigures
          side="right"
          lean={oppLean}
          isPulling={pulling === 'right'}
          isWinning={ropePosition < -50}
          isFrozen={false}
          name={oppScore?.name || '?'}
        />
      </div>

      {/* ── Banners ─────────────────────────────────────────── */}
      <div className="tug-banners">
        {dominanceBanner && <div className="tug-dominance-banner">{dominanceBanner}</div>}
        {comebackBanner  && <div className="tug-comeback-banner">{comebackBanner}</div>}
        {comboBanner     && <div className="tug-combo-banner">{comboBanner}</div>}
        {notice && <div className="status-banner" role="status" aria-live="polite">{notice}</div>}
        {streakText && <div className="streak-banner">{streakText}</div>}
      </div>

      {/* ── Question + input ─────────────────────────────────── */}
      <div className="tug-question-section">
        <div
          className={`question-card question-type-${questionType}
            ${flash === 'correct' ? 'flash-correct' : ''}
            ${flash === 'wrong' ? 'flash-wrong' : ''}
          `}
          id="question-display"
        >
          <div className={`question-type-pill q-pill-${questionType}`}>
            {questionMeta.icon} {questionMeta.label}
          </div>
          <p className="label" style={{ marginBottom: 6 }}>Solve:</p>
          <div className="question-text">{question?.question ?? '…'}</div>
        </div>

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
            PULL ➤
          </button>
        </div>

        <div className="effect-indicator-row">
          {myScore?.nextAnswerMultiplier === 2 && <span className="effect-pill x2">Next pull = x2 ⚡</span>}
          {myScore?.nextAnswerMultiplier === 3 && <span className="effect-pill x3">BONUS pull 🎯</span>}
        </div>
      </div>

      {isInputFrozen && <p className="freeze-note">Input frozen ❄️ — wait for next question</p>}
      {isInputSlowed && <p className="freeze-note">Input slowed 🐢</p>}
    </div>
  );
}
