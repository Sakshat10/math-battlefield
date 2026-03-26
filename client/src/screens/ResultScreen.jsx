import React from 'react';

/**
 * ResultScreen — end of match.
 * Props:
 *   result: { scores, winner, winnerName, opponentLeft, message }
 *   myId: string
 *   onPlayAgain: () => void
 */
export default function ResultScreen({ result, myId, onPlayAgain }) {
  const { scores = [], winner, opponentLeft, message } = result;

  const isWin = winner === myId;
  const isDraw = !winner && !opponentLeft;

  let badgeClass = 'draw';
  let badgeText = "It's a Draw!";
  if (opponentLeft) { badgeClass = 'win'; badgeText = '🏆 Opponent Left — You Win!'; }
  else if (isWin) { badgeClass = 'win'; badgeText = '🏆 You Win!'; }
  else if (!isDraw) { badgeClass = 'loss'; badgeText = '💀 You Lose'; }

  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div className="screen">
      <h1 className="title">Match Over</h1>

      <div className="card stack-lg center">

        {/* Result badge */}
        <div className={`winner-badge ${badgeClass}`} id="result-badge">
          {badgeText}
        </div>

        {opponentLeft && message && (
          <p className="microcopy">{message}</p>
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

        <button id="btn-play-again" className="btn btn-primary" onClick={onPlayAgain}>
          ⚡ Play Again
        </button>
      </div>
    </div>
  );
}
