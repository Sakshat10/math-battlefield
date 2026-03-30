import React, { useState, useEffect, useRef, useCallback } from 'react';
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

/* ── Particle system ───────────────────────────────────────────────── */
function DustParticles({ side, active }) {
  const [particles, setParticles] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    const burst = Array.from({ length: 8 }, () => {
      const id = ++idRef.current;
      const angle = side === 'left'
        ? (Math.random() * 120 + 120) * (Math.PI / 180) // spray to right-ish
        : (Math.random() * 120 - 60) * (Math.PI / 180); // spray to left-ish
      const speed = 18 + Math.random() * 28;
      return {
        id,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 10,
        life: 1,
        size: 2 + Math.random() * 4,
      };
    });
    setParticles(p => [...p, ...burst]);
    const cleanup = setTimeout(() => {
      setParticles(p => p.filter(pt => !burst.find(b => b.id === pt.id)));
    }, 600);
    return () => clearTimeout(cleanup);
  }, [active, side]);

  return (
    <svg
      style={{ position: 'absolute', bottom: 0, [side === 'left' ? 'right' : 'left']: 0, width: 80, height: 80, overflow: 'visible', pointerEvents: 'none', zIndex: 5 }}
      viewBox="0 0 80 80"
    >
      {particles.map(p => (
        <circle
          key={p.id}
          cx={40 + p.vx * 0.4}
          cy={70 - p.vy * 0.4}
          r={p.size}
          fill={side === 'left' ? 'rgba(34,211,238,0.55)' : 'rgba(249,115,22,0.55)'}
          style={{ animation: 'dustFade 0.55s ease-out forwards' }}
        />
      ))}
    </svg>
  );
}

/* ── Realistic rope SVG ────────────────────────────────────────────── */
function RopeSVG({ ropePosition, tensionLevel, pullSide, isVictoryMoment, frame }) {
  // ropePosition: -100 to +100
  const W = 760, H = 130;
  const knotX = W / 2 + (ropePosition / 100) * (W * 0.40);
  const knotY = H * 0.48;

  const leftEndX  = 20;
  const rightEndX = W - 20;

  // Sag increases with tension — when both teams pull hard the rope goes taut (less sag)
  // Base sag is high, and as tension increases (abs ropePosition) it sags less (more taut)
  const baseSag = 30;
  const tensionSag = Math.max(6, baseSag - Math.abs(ropePosition) * 0.22);

  // Add micro-jitter when actively being pulled
  const jitter = pullSide ? Math.sin(frame * 0.8) * 2.5 : 0;
  const jitterY = pullSide ? Math.cos(frame * 1.1) * 1.5 : 0;

  // Left CP sags more on the left side when rope goes right
  const leftCPsag  = tensionSag + (ropePosition > 0 ? ropePosition * 0.08 : 0) + jitter;
  const rightCPsag = tensionSag + (ropePosition < 0 ? -ropePosition * 0.08 : 0) - jitter;

  const cpLeftX  = (leftEndX + knotX) / 2;
  const cpLeftY  = knotY + leftCPsag + jitterY;
  const cpRightX = (knotX + rightEndX) / 2;
  const cpRightY = knotY + rightCPsag + jitterY;

  // Number of rope strand points for the braided look
  const N = 28;

  function bezierPts(x1, y1, x2, y2, cpx, cpy, n) {
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      const mt = 1 - t;
      return {
        x: mt * mt * x1 + 2 * mt * t * cpx + t * t * x2,
        y: mt * mt * y1 + 2 * mt * t * cpy + t * t * y2,
      };
    });
  }

  const leftPts  = bezierPts(leftEndX,  knotY, knotX, knotY, cpLeftX,  cpLeftY,  N);
  const rightPts = bezierPts(knotX, knotY, rightEndX, knotY, cpRightX, cpRightY, N);

  const leftD  = `M ${leftPts.map(p  => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
  const rightD = `M ${rightPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;

  // Shadow path offset downward
  const leftShadowPts  = bezierPts(leftEndX,  knotY + 5, knotX, knotY + 5, cpLeftX,  cpLeftY  + 4, N);
  const rightShadowPts = bezierPts(knotX, knotY + 5, rightEndX, knotY + 5, cpRightX, cpRightY + 4, N);
  const leftShadowD  = `M ${leftShadowPts.map(p  => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
  const rightShadowD = `M ${rightShadowPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;

  // Braid offset paths (secondary strands for thickness illusion)
  function shiftedPath(pts, oy) {
    return `M ${pts.map(p => `${p.x.toFixed(1)},${(p.y + oy).toFixed(1)}`).join(' L ')}`;
  }

  const knoteR = isVictoryMoment ? 15 : 12;

  // Flag
  const flagPole = 26;
  const flagDir  = ropePosition >= 0 ? 1 : -1;

  // Taut indicator — show tension lines when close to edge
  const isTaut = Math.abs(ropePosition) > 65;

  const glowColor  = pullSide === 'left' ? '34,211,238' : pullSide === 'right' ? '249,115,22' : '196,163,90';
  const glowAmount = pullSide ? 5 : 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="ropeGL" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.95" />
          <stop offset="50%"  stopColor="#c4a35a" stopOpacity="0.90" />
          <stop offset="100%" stopColor="#c4a35a" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="ropeGR" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#c4a35a" stopOpacity="0.85" />
          <stop offset="50%"  stopColor="#c4a35a" stopOpacity="0.90" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.95" />
        </linearGradient>
        <filter id="ropeBlur">
          <feGaussianBlur stdDeviation={glowAmount} result="blur"/>
          <feColorMatrix type="matrix" in="blur"
            values={`0 0 0 0 ${parseInt(glowColor.split(',')[0])/255}
                     0 0 0 0 ${parseInt(glowColor.split(',')[1])/255}
                     0 0 0 0 ${parseInt(glowColor.split(',')[2])/255}
                     0 0 0 0.7 0`}
            result="coloredBlur"
          />
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="knotGlow">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="shadowFilter">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feColorMatrix type="matrix" in="blur"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.4 0"
            result="shadow"
          />
          <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Ground / mud pit */}
      <rect x={leftEndX - 10} y={knotY + 38} width={W - leftEndX * 2 + 20} height={14}
        rx="4"
        fill="rgba(20,40,30,0.55)"
      />
      <line x1={leftEndX - 14} y1={knotY + 38} x2={rightEndX + 14} y2={knotY + 38}
        stroke="rgba(103,232,249,0.18)" strokeWidth="1.5"/>

      {/* Win zone flags at edges */}
      <rect x={leftEndX - 10} y={knotY - 38} width={5} height={82}
        fill="rgba(34,211,238,0.45)" rx="2"
        filter="url(#knotGlow)"
      />
      <rect x={rightEndX + 5} y={knotY - 38} width={5} height={82}
        fill="rgba(249,115,22,0.45)" rx="2"
        filter="url(#knotGlow)"
      />
      <text x={leftEndX - 7} y={knotY - 44} textAnchor="middle"
        fill="rgba(34,211,238,0.8)" fontSize="10" fontFamily="monospace" fontWeight="bold">WIN</text>
      <text x={rightEndX + 7} y={knotY - 44} textAnchor="middle"
        fill="rgba(249,115,22,0.8)" fontSize="10" fontFamily="monospace" fontWeight="bold">WIN</text>

      {/* Center dashed line */}
      <line x1={W/2} y1={knotY - 34} x2={W/2} y2={knotY + 42}
        stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" strokeDasharray="5,4"/>

      {/* === ROPE SHADOW (depth) === */}
      <path d={leftShadowD}  stroke="rgba(0,0,0,0.35)" strokeWidth="9" fill="none" strokeLinecap="round"/>
      <path d={rightShadowD} stroke="rgba(0,0,0,0.35)" strokeWidth="9" fill="none" strokeLinecap="round"/>

      {/* === MAIN ROPE STRANDS === */}
      {/* Thick base strand */}
      <path d={leftD}  stroke="url(#ropeGL)" strokeWidth="8" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        filter="url(#ropeBlur)" opacity="0.95"/>
      <path d={rightD} stroke="url(#ropeGR)" strokeWidth="8" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
        filter="url(#ropeBlur)" opacity="0.95"/>

      {/* Secondary strand (braid illusion) shifted up */}
      <path d={shiftedPath(leftPts,  -2.5)} stroke="rgba(255,255,255,0.22)" strokeWidth="3" fill="none"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6,5"/>
      <path d={shiftedPath(rightPts, -2.5)} stroke="rgba(255,255,255,0.22)" strokeWidth="3" fill="none"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6,5"/>

      {/* Highlight strand */}
      <path d={shiftedPath(leftPts,  -3)} stroke="rgba(255,255,255,0.14)" strokeWidth="2" fill="none"
        strokeLinecap="round" strokeLinejoin="round"/>
      <path d={shiftedPath(rightPts, -3)} stroke="rgba(255,255,255,0.14)" strokeWidth="2" fill="none"
        strokeLinecap="round" strokeLinejoin="round"/>

      {/* Knot texture dots along rope */}
      {leftPts.filter((_,i) => i % 4 === 2).map((p, i) => (
        <circle key={`lt-${i}`} cx={p.x} cy={p.y - 1} r={2.8}
          fill="rgba(255,255,255,0.25)"/>
      ))}
      {rightPts.filter((_,i) => i % 4 === 2).map((p, i) => (
        <circle key={`rt-${i}`} cx={p.x} cy={p.y - 1} r={2.8}
          fill="rgba(255,255,255,0.25)"/>
      ))}

      {/* Taut stress marks when rope near edge */}
      {isTaut && leftPts.filter((_,i) => i % 6 === 0 && i > 0).map((p, i) => (
        <line key={`ts-${i}`}
          x1={p.x - 3} y1={p.y - 5}
          x2={p.x + 3} y2={p.y + 5}
          stroke="rgba(255,220,50,0.5)" strokeWidth="1.2" strokeLinecap="round"/>
      ))}

      {/* === FLAG POLE ON KNOT === */}
      <line x1={knotX} y1={knotY - flagPole - 4} x2={knotX} y2={knotY + 8}
        stroke="#e2c97e" strokeWidth="2.5" strokeLinecap="round"
        filter="url(#knotGlow)"/>
      <polygon
        points={`${knotX},${knotY - flagPole} ${knotX + flagDir * 20},${knotY - flagPole + 9} ${knotX},${knotY - flagPole + 18}`}
        fill={Math.abs(ropePosition) > 80 ? '#ef4444' : '#f97316'}
        opacity="0.95"
        filter="url(#knotGlow)"
      />

      {/* === MAIN KNOT === */}
      {/* Outer glow ring */}
      <circle cx={knotX} cy={knotY} r={knoteR + 6}
        fill="none"
        stroke={isVictoryMoment ? 'rgba(251,191,36,0.5)' : 'rgba(196,163,90,0.2)'}
        strokeWidth="2"
      />
      {/* Knot body */}
      <circle cx={knotX} cy={knotY} r={knoteR}
        fill={isVictoryMoment ? '#fbbf24' : '#b8873a'}
        stroke={isVictoryMoment ? '#fff' : '#e2c97e'}
        strokeWidth={isVictoryMoment ? 3 : 2}
        filter="url(#knotGlow)"
      />
      {/* Rope wrap lines on knot */}
      <line x1={knotX - knoteR + 3} y1={knotY - 3} x2={knotX + knoteR - 3} y2={knotY + 3}
        stroke="rgba(80,40,10,0.7)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1={knotX - knoteR + 3} y1={knotY + 3} x2={knotX + knoteR - 3} y2={knotY - 3}
        stroke="rgba(80,40,10,0.7)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1={knotX} y1={knotY - knoteR + 2} x2={knotX} y2={knotY + knoteR - 2}
        stroke="rgba(80,40,10,0.45)" strokeWidth="1.5" strokeLinecap="round"/>

      {/* Victory pulse ring */}
      {isVictoryMoment && (
        <circle cx={knotX} cy={knotY} r={knoteR + 10}
          fill="none" stroke="rgba(251,191,36,0.6)"
          strokeWidth="3"
          style={{ animation: 'knotVictoryPulse 0.5s ease-in-out infinite alternate' }}
        />
      )}
    </svg>
  );
}

/* ── Animated stick figure team ───────────────────────────────────── */
function TeamFigures({ side, ropePosition, isPulling, isWinning, isFrozen, name, frame }) {
  const isLeft  = side === 'left';
  const color   = isLeft ? '#22d3ee' : '#f97316';
  const shadow  = isLeft ? 'rgba(34,211,238,0.45)' : 'rgba(249,115,22,0.45)';

  // How hard they're pulling — based on rope position relative to them
  const dominance = isLeft ? Math.max(0, ropePosition) : Math.max(0, -ropePosition);
  const oppPressure = isLeft ? Math.max(0, -ropePosition) : Math.max(0, ropePosition);

  // Lean angle: lean back harder the more you're winning, forward when losing
  const baseLean = isLeft ? -18 : 18;
  const leanDeg  = isLeft
    ? -(10 + dominance * 0.18 + (isPulling ? 8 : 0))
    : (10 + dominance * 0.18 + (isPulling ? 8 : 0));

  // When LOSING (opponent is dominant), figures are being dragged forward
  const dragAngle = isLeft
    ? Math.max(0, -ropePosition * 0.12)   // being dragged right
    : Math.max(0, ropePosition * 0.12);   // being dragged left

  const bodyAngle = isFrozen ? 0 : (leanDeg - (isLeft ? dragAngle : -dragAngle));

  // Arm extension — arms reach further toward the rope when pulling
  const armExtend = isPulling ? 6 : 0;

  // Leg cycle for walking animation (digging in)
  const legSwing = Math.sin(frame * 0.22) * (isPulling ? 14 : 6);
  const legSwing2 = -legSwing;

  // Sweat drops when under pressure
  const stressed = oppPressure > 50;

  const figures = [0, 1, 2]; // 3 figures

  function Figure({ idx }) {
    const scale = idx === 1 ? 1 : 0.78;
    const offsetX = isLeft
      ? (idx === 0 ? -28 : idx === 2 ? -54 : -6)
      : (idx === 0 ? 28 : idx === 2 ? 54 : 6);
    const opacity = idx === 1 ? 1 : 0.75;

    // Each figure slightly different leg phase
    const phaseOff = idx * 1.2;
    const ls1 = Math.sin((frame * 0.22) + phaseOff) * (isPulling ? 14 : 5);
    const ls2 = -ls1;

    // Arm y spread depends on pulling effort
    const armYSpread = isPulling ? 10 : 7;

    // Where arms go — toward rope side
    const armDir = isLeft ? 1 : -1;

    const W = 40, H = 72;
    const cx = 20;
    const headY = 12, bodyTop = 20, bodyBot = 44, hipY = 44;

    return (
      <g transform={`translate(${offsetX * scale}, 0) scale(${scale}) rotate(${bodyAngle * 0.7}, ${cx}, ${hipY})`}
         style={{ transformOrigin: `${cx}px ${hipY}px`, opacity }}>
        {/* Shadow under feet */}
        <ellipse cx={cx} cy={H - 4} rx={isLeft ? 8 : 10} ry={3}
          fill="rgba(0,0,0,0.28)" />

        {/* Head */}
        <circle cx={cx} cy={headY} r={8.5} fill={color} opacity={0.97}
          filter={isPulling ? `drop-shadow(0 0 6px ${color})` : undefined}
        />

        {/* Sweat drops */}
        {stressed && (
          <>
            <ellipse cx={isLeft ? cx - 7 : cx + 7} cy={headY - 4} rx={1.5} ry={3}
              fill="rgba(103,232,249,0.7)" transform={`rotate(${isLeft ? 15 : -15}, ${cx}, ${headY})`}/>
            <ellipse cx={cx + (isLeft ? -10 : 10)} cy={headY + 2} rx={1.2} ry={2.2}
              fill="rgba(103,232,249,0.55)" transform={`rotate(${isLeft ? 20 : -20}, ${cx}, ${headY})`}/>
          </>
        )}

        {/* Body */}
        <line x1={cx} y1={bodyTop} x2={cx} y2={bodyBot}
          stroke={color} strokeWidth={3.5} strokeLinecap="round"/>

        {/* Arms reaching toward rope */}
        <line x1={cx} y1={28}
          x2={cx + armDir * (14 + armExtend)} y2={28 - armYSpread * 0.5}
          stroke={color} strokeWidth={3} strokeLinecap="round"/>
        <line x1={cx} y1={30}
          x2={cx + armDir * (14 + armExtend)} y2={30 + armYSpread * 0.5}
          stroke={color} strokeWidth={3} strokeLinecap="round"/>

        {/* Far arm (counter-balance) */}
        <line x1={cx} y1={28}
          x2={cx - armDir * 9} y2={24}
          stroke={color} strokeWidth={2.5} strokeLinecap="round" opacity={0.7}/>

        {/* Legs — animated digging in */}
        <line x1={cx} y1={hipY}
          x2={cx - 9 + ls1 * 0.4} y2={H - 14 + Math.abs(ls1) * 0.1}
          stroke={color} strokeWidth={3.2} strokeLinecap="round"/>
        <line x1={cx} y1={hipY}
          x2={cx + 9 + ls2 * 0.4} y2={H - 14 + Math.abs(ls2) * 0.1}
          stroke={color} strokeWidth={3.2} strokeLinecap="round"/>

        {/* Feet */}
        <line x1={cx - 9 + ls1 * 0.4} y1={H - 14}
          x2={cx - 9 + ls1 * 0.4 + armDir * (-6)} y2={H - 14}
          stroke={color} strokeWidth={2.8} strokeLinecap="round"/>
        <line x1={cx + 9 + ls2 * 0.4} y1={H - 14}
          x2={cx + 9 + ls2 * 0.4 + armDir * (-6)} y2={H - 14}
          stroke={color} strokeWidth={2.8} strokeLinecap="round"/>

        {/* Effort lines when pulling */}
        {isPulling && (
          <>
            <line x1={cx + armDir * 16} y1={26} x2={cx + armDir * 22} y2={22}
              stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.55}/>
            <line x1={cx + armDir * 16} y1={30} x2={cx + armDir * 23} y2={32}
              stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.40}/>
            <line x1={cx + armDir * 17} y1={28} x2={cx + armDir * 24} y2={27}
              stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.30}/>
          </>
        )}
      </g>
    );
  }

  return (
    <div className={`tug-team-figures tug-team-${side} ${isPulling ? 'tug-team-pulling' : ''} ${isWinning ? 'tug-team-winning' : ''}`}>
      <div className="tug-player-name" style={{ color }}>
        {name}
        {isFrozen && <span style={{ marginLeft: 4 }}>❄️</span>}
      </div>

      <div className="tug-figures-wrap" style={{ position: 'relative' }}>
        <svg
          viewBox={`${isLeft ? -80 : -10} 0 160 80`}
          width={isLeft ? 140 : 140}
          height={90}
          style={{ overflow: 'visible', filter: `drop-shadow(0 6px 16px ${shadow})` }}
        >
          {figures.map(i => <Figure key={i} idx={i} />)}
        </svg>

        {/* Ground dust */}
        {isPulling && (
          <div style={{
            position: 'absolute', bottom: -4,
            [isLeft ? 'right' : 'left']: 6,
            width: 60, height: 10,
            background: `radial-gradient(ellipse, ${isLeft ? 'rgba(34,211,238,0.35)' : 'rgba(249,115,22,0.35)'} 0%, transparent 70%)`,
            borderRadius: '50%',
            animation: 'dustPuff 0.4s ease-out',
          }} />
        )}
      </div>

      {isPulling && (
        <div className="tug-effort-text" style={{ color }}>
          {side === 'left' ? '💪 HEAVE!' : 'HEAVE! 💪'}
        </div>
      )}
    </div>
  );
}

/* ── Ground / mud streak ───────────────────────────────────────────── */
function MudStreak({ ropePosition }) {
  const streak = ropePosition / 100; // -1 to 1
  const streakColor = streak > 0 ? 'rgba(34,211,238,0.22)' : 'rgba(249,115,22,0.22)';
  const streakWidth = Math.abs(streak) * 38;

  return (
    <div style={{ position: 'absolute', bottom: 0, left: '50%', height: 4, display: 'flex', alignItems: 'center' }}>
      <div style={{
        position: 'absolute',
        [streak > 0 ? 'left' : 'right']: 0,
        width: `${streakWidth}%`,
        height: 4,
        background: streakColor,
        borderRadius: 2,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

/* ── Main screen ─────────────────────────────────────────────────── */
export default function TugOfWarScreen({ roomId, playerName, opponentWinStreak = 0, onGameEnd }) {
  const [countdown, setCountdown]             = useState(3);
  const [gameStarted, setGameStarted]         = useState(false);
  const [question, setQuestion]               = useState(null);
  const [answer, setAnswer]                   = useState('');
  const [scores, setScores]                   = useState([]);
  const [timeLeft, setTimeLeft]               = useState(TOTAL_TIME);
  const [ropePosition, setRopePosition]       = useState(0);
  const [pulling, setPulling]                 = useState(null);
  const [flash, setFlash]                     = useState(null);
  const [notice, setNotice]                   = useState('');
  const [comboBanner, setComboBanner]         = useState('');
  const [dominanceBanner, setDominanceBanner] = useState('');
  const [comebackBanner, setComebackBanner]   = useState('');
  const [tensionWarning, setTensionWarning]   = useState(false);
  const [isCritical, setIsCritical]           = useState(false);
  const [isVictoryMoment, setIsVictoryMoment] = useState(false);
  const [finalRush, setFinalRush]             = useState(false);
  const [isInputFrozen, setIsInputFrozen]     = useState(false);
  const [isInputSlowed, setIsInputSlowed]     = useState(false);
  const [freezeFx, setFreezeFx]               = useState(false);
  const [slowFx, setSlowFx]                   = useState(false);
  const [streakText, setStreakText]           = useState('');
  const [myPulling, setMyPulling]             = useState(false);
  const [screenShake, setScreenShake]         = useState(false);
  const [frame, setFrame]                     = useState(0);

  // Animation loop for stick figures
  useEffect(() => {
    let raf;
    let f = 0;
    function tick() {
      f += 1;
      setFrame(f);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const inputRef             = useRef(null);
  const socketRef            = useRef(null);
  const noticeTimerRef       = useRef(null);
  const dominanceTimerRef    = useRef(null);
  const comebackTimerRef     = useRef(null);
  const comboBannerTimerRef  = useRef(null);
  const pullingTimerRef      = useRef(null);
  const myPullingTimerRef    = useRef(null);
  const slowTimerRef         = useRef(null);
  const freezeFxTimerRef     = useRef(null);
  const slowFxTimerRef       = useRef(null);
  const streakTimerRef       = useRef(null);
  const shakeTimerRef        = useRef(null);

  // Countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { setCountdown(null); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const triggerShake = useCallback(() => {
    setScreenShake(true);
    clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => setScreenShake(false), 350);
  }, []);

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
      pullingTimerRef.current = setTimeout(() => setPulling(null), 520);
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
      setTensionWarning(abs >= 65);
      setIsCritical(abs >= 85);
      setIsVictoryMoment(abs >= 100);
      if (abs >= 65) triggerShake();
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
      setComebackBanner(isMe ? '🔥 COMEBACK!' : '😱 Opponent coming back!');
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
        if (effect.type === 'double')  showNotice('Next pull = x2 ⚡');
        if (effect.type === 'bonus')   showNotice('BONUS pull ready! 🎯');
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
      ].forEach(e => socket.off(e));
      [noticeTimerRef, dominanceTimerRef, comebackTimerRef, comboBannerTimerRef,
       pullingTimerRef, myPullingTimerRef, slowTimerRef, freezeFxTimerRef,
       slowFxTimerRef, streakTimerRef, shakeTimerRef
      ].forEach(r => clearTimeout(r.current));
    };
  }, [roomId, playerName, triggerShake]);

  function triggerFlash(type) {
    setFlash(type);
    if (!type) return;
    setTimeout(() => setFlash(null), 420);
  }

  function submitAnswer() {
    if (!question || answer.trim() === '' || isInputFrozen || isInputSlowed) return;
    const socket = socketRef.current;
    setMyPulling(true);
    clearTimeout(myPullingTimerRef.current);
    myPullingTimerRef.current = setTimeout(() => setMyPulling(false), 520);
    socket.emit('game:answer', { roomId, questionId: question.id, answer: answer.trim() });
    setAnswer('');
  }

  const myId     = socketRef.current?.id;
  const myScore  = scores.find(s => s.id === myId);
  const oppScore = scores.find(s => s.id !== myId);

  const progress   = timeLeft / TOTAL_TIME;
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const isUrgent   = finalRush || timeLeft <= 10;
  const questionType = question?.type || 'normal';
  const questionMeta = QUESTION_META[questionType] || QUESTION_META.normal;

  // Tension level 0..1
  const tensionLevel = Math.abs(ropePosition) / 100;

  // Left is always "me", right is always opponent
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
    <div className={[
      'tug-screen',
      isUrgent       ? 'rush-pulse'          : '',
      isCritical     ? 'tug-critical-screen' : '',
      screenShake    ? 'tug-shake'           : '',
      isVictoryMoment? 'tug-victory-screen'  : '',
    ].join(' ')}>
      {freezeFx && <div className="fx-overlay freeze-overlay"><div className="fx-text">FROZEN</div></div>}
      {slowFx   && <div className="fx-overlay slow-overlay"><div className="fx-text">SLOWED</div></div>}
      {countdown !== null && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown === 0 ? 'GO!' : countdown}</div>
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────────── */}
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

      {/* ── Main arena ──────────────────────────────────────────── */}
      <div className="tug-field">
        {/* Left team (me) */}
        <TeamFigures
          side="left"
          ropePosition={ropePosition}
          isPulling={pulling === 'left' || myPulling}
          isWinning={ropePosition > 50}
          isFrozen={isInputFrozen}
          name={myScore?.name || playerName}
          frame={frame}
        />

        {/* Rope */}
        <div className="tug-rope-container">
          <RopeSVG
            ropePosition={ropePosition}
            tensionLevel={tensionLevel}
            pullSide={pulling}
            isVictoryMoment={isVictoryMoment}
            frame={frame}
          />

          {/* Power bar below rope */}
          <div className="tug-pos-indicator">
            <div
              className="tug-pos-arrow"
              style={{
                left: `calc(50% + ${ropePosition * 0.40}%)`,
                color: ropePosition > 0 ? '#22d3ee' : ropePosition < 0 ? '#f97316' : '#9bb9c9',
              }}
            >▼</div>
            <div className="tug-pos-bar">
              {/* Gradient fill showing dominance */}
              <div className="tug-pos-fill-left"
                style={{ width: `${Math.max(0, -ropePosition / 2)}%` }} />
              <div className="tug-pos-fill-right"
                style={{ width: `${Math.max(0, ropePosition / 2)}%` }} />
              {/* Tension shimmer */}
              {tensionWarning && (
                <div className="tug-bar-shimmer"
                  style={{ background: isCritical
                    ? 'linear-gradient(90deg, transparent, rgba(239,68,68,0.3), transparent)'
                    : 'linear-gradient(90deg, transparent, rgba(251,191,36,0.25), transparent)',
                  }}
                />
              )}
            </div>
          </div>

          {/* Tension warning */}
          {tensionWarning && !isVictoryMoment && (
            <div className={`tug-tension-warning ${isCritical ? 'tug-tension-critical' : ''}`}>
              {isCritical ? '🚨 ALMOST THERE — PULL HARDER!' : '⚠️ Almost there!'}
            </div>
          )}
        </div>

        {/* Right team (opponent) */}
        <TeamFigures
          side="right"
          ropePosition={ropePosition}
          isPulling={pulling === 'right'}
          isWinning={ropePosition < -50}
          isFrozen={false}
          name={oppScore?.name || '?'}
          frame={frame}
        />
      </div>

      {/* ── Banners ───────────────────────────────────────────── */}
      <div className="tug-banners">
        {dominanceBanner && <div className="tug-dominance-banner">{dominanceBanner}</div>}
        {comebackBanner  && <div className="tug-comeback-banner">{comebackBanner}</div>}
        {comboBanner     && <div className="tug-combo-banner">{comboBanner}</div>}
        {notice && <div className="status-banner" role="status" aria-live="polite">{notice}</div>}
        {streakText && <div className="streak-banner">{streakText}</div>}
      </div>

      {/* ── Question + input ───────────────────────────────────── */}
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
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAnswer()}
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
