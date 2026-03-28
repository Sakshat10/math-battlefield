import React, { useEffect, useMemo, useState } from 'react';
import { getSocket } from '../socket/client';

/**
 * ResultScreen — end of match.
 * Props:
 *   result: { scores, winner, winnerName, opponentLeft, message }
 *   myId: string
 *   roomId: string
 *   onRematchStart: () => void
 *   onPlayAgain: () => void
 */
export default function ResultScreen({ result, myId, roomId, onRematchStart, onPlayAgain }) {
  const { scores = [], winner, opponentLeft, message } = result;
  const [coins, setCoins] = useState(null);
  const [waitingRematch, setWaitingRematch] = useState(false);
  const [rematchMsg, setRematchMsg] = useState('');
  const [myWinStreak, setMyWinStreak] = useState(0);
  const [rematchOffer, setRematchOffer] = useState(null);

  const isWin = winner === myId;
  const isDraw = !winner && !opponentLeft;

  let badgeClass = 'draw';
  let badgeText = "It's a Draw!";
  if (opponentLeft) { badgeClass = 'win'; badgeText = '🏆 Opponent Left — You Win!'; }
  else if (isWin) { badgeClass = 'win'; badgeText = '🏆 You Win!'; }
  else if (!isDraw) { badgeClass = 'loss'; badgeText = '💀 You Lose'; }

  const sortedScores = [...scores].sort((a, b) => b.score - a.score);
  const myScore = scores.find((p) => p.id === myId)?.score ?? 0;
  const oppScore = scores.find((p) => p.id !== myId)?.score ?? 0;

  const shareText = useMemo(() => {
    const verb = isWin ? 'won' : isDraw ? 'drew' : 'lost';
    return `I just ${verb} ${myScore}-${oppScore} in Math Battle 😎 Try to beat me!`;
  }, [isWin, isDraw, myScore, oppScore]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleReward(data) {
      if (typeof data?.coins === 'number') setCoins(data.coins);
    }

    function handleRematchStart() {
      setWaitingRematch(false);
      setRematchOffer(null);
      setRematchMsg('Rematch starting...');
      onRematchStart();
    }

    function handleRematchDeclined() {
      setWaitingRematch(false);
      setRematchMsg('Rematch declined or timed out.');
      setTimeout(() => onPlayAgain(), 900);
    }

    function handleStreakUpdate(data) {
      if (data?.playerId === myId) setMyWinStreak(data.winStreak || 0);
    }

    function handleRematchOffer(data) {
      if (data?.fromPlayerId === myId) return;
      setRematchOffer({
        fromPlayerId: data?.fromPlayerId,
        fromPlayerName: data?.fromPlayerName || 'Opponent',
      });
      setRematchMsg('Opponent asked for a rematch.');
    }

    socket.on('game:reward', handleReward);
    socket.on('game:rematchOffer', handleRematchOffer);
    socket.on('game:rematchStart', handleRematchStart);
    socket.on('game:rematchDeclined', handleRematchDeclined);
    socket.on('game:streakUpdate', handleStreakUpdate);

    return () => {
      socket.off('game:reward', handleReward);
      socket.off('game:rematchOffer', handleRematchOffer);
      socket.off('game:rematchStart', handleRematchStart);
      socket.off('game:rematchDeclined', handleRematchDeclined);
      socket.off('game:streakUpdate', handleStreakUpdate);
    };
  }, [myId, onPlayAgain, onRematchStart]);

  function handleRematch() {
    const socket = getSocket();
    if (!socket || !roomId) return;
    setWaitingRematch(true);
    setRematchOffer(null);
    setRematchMsg('Waiting for opponent...');
    socket.emit('game:rematchRequest', { roomId });
  }

  function handleAcceptRematch() {
    const socket = getSocket();
    if (!socket || !roomId) return;
    setWaitingRematch(true);
    setRematchOffer(null);
    setRematchMsg('Accepted. Starting rematch...');
    socket.emit('game:rematchRequest', { roomId });
  }

  function handleDeclineRematch() {
    const socket = getSocket();
    if (!socket || !roomId) return;
    setRematchOffer(null);
    socket.emit('game:rematchDecline', { roomId });
  }

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }

      await navigator.clipboard.writeText(shareText);
      setRematchMsg('Result copied to clipboard!');
    } catch (err) {
      setRematchMsg('Could not share right now.');
    }
  }

  return (
    <div className="screen">
      {rematchOffer && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card stack-md">
            <p style={{ fontWeight: 700, fontSize: '1rem', textAlign: 'center' }}>
              {rematchOffer.fromPlayerName} wants a rematch
            </p>
            <button className="btn btn-primary" onClick={handleAcceptRematch}>
              Accept
            </button>
            <button className="btn btn-secondary" onClick={handleDeclineRematch}>
              Decline
            </button>
          </div>
        </div>
      )}

      <h1 className="title">Match Over</h1>

      <div className="card stack-lg center">

        {/* Result badge */}
        <div className={`winner-badge ${badgeClass}`} id="result-badge">
          {badgeText}
        </div>

        {opponentLeft && message && (
          <p className="microcopy">{message}</p>
        )}

        {coins !== null && (
          <div className="reward-pop">🎁 You earned {coins} coins!</div>
        )}

        {myWinStreak > 0 && (
          <p className="streak-pressure">🔥 Your win streak: {myWinStreak}</p>
        )}

        {/* Score breakdown */}
        <div className="results-list">
          <p className="label" style={{ textAlign: 'center' }}>Final Scores</p>
          {sortedScores.map((p, i) => (
            <div
              key={p.id}
              className={`result-row ${p.id === winner ? 'winner' : ''}`}
            >
              <div className="result-left">
                <span className="rank-emoji">{i === 0 ? '🥇' : '🥈'}</span>
                <span className={`result-player ${p.id === myId ? 'you' : ''}`}>
                  {p.name} {p.id === myId ? '(You)' : ''}
                </span>
              </div>
              <span className="result-score">
                {p.score}
              </span>
            </div>
          ))}
        </div>

        <div className="divider" />

        <button id="btn-rematch" className="btn btn-primary" onClick={handleRematch} disabled={waitingRematch}>
          {waitingRematch ? 'Waiting...' : '🔁 Rematch'}
        </button>

        <button id="btn-share-result" className="btn btn-secondary" onClick={handleShare}>
          📣 Share Result
        </button>

        <button id="btn-play-again" className="btn btn-secondary" onClick={onPlayAgain}>
          Back To Home
        </button>

        {rematchMsg && <p className="microcopy">{rematchMsg}</p>}
      </div>
    </div>
  );
}
