import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';

export default function ProfileScreen({ onBack }) {
  const { getToken } = useAuth();
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);

        const token = await getToken();
        if (!token) {
          throw new Error('Sign in is required to load profile stats.');
        }

        const statsRes = await fetch('http://localhost:3001/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!statsRes.ok) {
          throw new Error('Failed to fetch profile from backend.');
        }
        const statsData = await statsRes.json();
        setStats(statsData);
        setRecentMatches(statsData.recentMatches || []);

        const leaderRes = await fetch('http://localhost:3001/leaderboard?limit=10');
        if (leaderRes.ok) {
          const leaderData = await leaderRes.json();
          setLeaderboard(leaderData.leaderboard || []);
        }

        setError('');
      } catch (err) {
        setError(err.message || 'Could not load profile');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [getToken]);

  if (loading) {
    return (
      <div className="screen">
        <div className="profile-loading">
          <div className="spinner"></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <div className="profile-error-container">
          <p style={{ color: '#ff6b6b', marginBottom: '16px' }}>⚠️ {error}</p>
          <button className="btn btn-secondary" onClick={onBack}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const totalMatches = stats?.totalMatches || ((stats?.wins || 0) + (stats?.losses || 0) + (stats?.draws || 0));
  const winRate = stats?.winRate ?? (totalMatches > 0 ? Math.round(((stats?.wins || 0) / totalMatches) * 100) : 0);

  return (
    <div className="screen profile-screen">
      <button className="profile-back-btn" onClick={onBack} title="Go back">
        ← Back
      </button>

      <div className="profile-wrapper">
        <div className="profile-banner">
          <div className="profile-avatar">👤</div>
          <div className="profile-bio">
            <h1 className="profile-name">{stats?.username || 'Player'}</h1>
            <p className="profile-level">Battle Player</p>
          </div>
        </div>

        <div className="profile-primary-stats">
          <div className="stat-highlight stat-xp">
            <div className="stat-icon">⭐</div>
            <div className="stat-info">
              <div className="stat-num">{stats?.xp || 0}</div>
              <div className="stat-name">Experience Points</div>
            </div>
          </div>

          <div className="stat-highlight stat-coins">
            <div className="stat-icon">💰</div>
            <div className="stat-info">
              <div className="stat-num">{stats?.coins || 0}</div>
              <div className="stat-name">Coins</div>
            </div>
          </div>
        </div>

        <div className="profile-row-section">
          <h3 className="section-title">Match Statistics</h3>
          <div className="profile-match-stats">
            <div className="match-stat">
              <div className="match-stat-value">{stats?.wins || 0}</div>
              <div className="match-stat-label">Wins</div>
              <div className="match-stat-bar win-bar"></div>
            </div>

            <div className="match-stat">
              <div className="match-stat-value">{stats?.losses || 0}</div>
              <div className="match-stat-label">Losses</div>
              <div className="match-stat-bar loss-bar"></div>
            </div>

            <div className="match-stat">
              <div className="match-stat-value">{stats?.draws || 0}</div>
              <div className="match-stat-label">Draws</div>
              <div className="match-stat-bar total-bar"></div>
            </div>

            <div className="match-stat">
              <div className="match-stat-value">{totalMatches}</div>
              <div className="match-stat-label">Total</div>
              <div className="match-stat-bar total-bar"></div>
            </div>

            <div className="match-stat">
              <div className="match-stat-value">{winRate}%</div>
              <div className="match-stat-label">Win Rate</div>
              <div className="match-stat-bar" style={{ width: `${winRate}%` }}></div>
            </div>
          </div>
        </div>

        <div className="profile-row-section">
          <h3 className="section-title">Account Info</h3>
          <div className="profile-info-list">
            <div className="info-item">
              <span className="info-label">Member Since</span>
              <span className="info-value">
                {stats?.createdAt ? new Date(stats.createdAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Status</span>
              <span className="info-value">🟢 Active</span>
            </div>
          </div>
        </div>

        {leaderboard && leaderboard.length > 0 && (
          <div className="profile-row-section">
            <h3 className="section-title">🏆 Global Leaderboard (Top 10)</h3>
            <div className="stats-table-wrapper">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>XP</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Coins</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((player, idx) => (
                    <tr key={player._id || idx}>
                      <td className="rank-badge">#{idx + 1}</td>
                      <td className="player-name">{player.username}</td>
                      <td className="xp-cell">{player.xp || 0}</td>
                      <td className="wins-cell">{player.wins || 0}</td>
                      <td className="losses-cell">{player.losses || 0}</td>
                      <td className="coins-cell">{player.coins || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="profile-row-section">
          <h3 className="section-title">📊 Your Stats Summary</h3>
          <div className="stats-table-wrapper">
            <table className="stats-table">
              <tbody>
                <tr>
                  <td className="stat-key">Total XP</td>
                  <td className="stat-value">{stats?.xp || 0}</td>
                </tr>
                <tr>
                  <td className="stat-key">Total Coins</td>
                  <td className="stat-value">{stats?.coins || 0}</td>
                </tr>
                <tr>
                  <td className="stat-key">Wins</td>
                  <td className="stat-value win-value">{stats?.wins || 0}</td>
                </tr>
                <tr>
                  <td className="stat-key">Losses</td>
                  <td className="stat-value loss-value">{stats?.losses || 0}</td>
                </tr>
                <tr>
                  <td className="stat-key">Draws</td>
                  <td className="stat-value">{stats?.draws || 0}</td>
                </tr>
                <tr>
                  <td className="stat-key">Win Rate</td>
                  <td className="stat-value">{winRate}%</td>
                </tr>
                <tr>
                  <td className="stat-key">Current Win Streak</td>
                  <td className="stat-value">{stats?.currentWinStreak || 0}</td>
                </tr>
                <tr>
                  <td className="stat-key">Best Win Streak</td>
                  <td className="stat-value">{stats?.highestWinStreak || 0}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="profile-row-section">
          <h3 className="section-title">🧾 Recent Matches</h3>
          <div className="stats-table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Result</th>
                  <th>Opponent</th>
                  <th>Score</th>
                  <th>XP</th>
                  <th>Coins</th>
                </tr>
              </thead>
              <tbody>
                {recentMatches.length === 0 && (
                  <tr>
                    <td colSpan={6}>No matches recorded yet.</td>
                  </tr>
                )}
                {recentMatches.map((match) => (
                  <tr key={match.id}>
                    <td>{match.endedAt ? new Date(match.endedAt).toLocaleDateString() : '-'}</td>
                    <td className={match.result === 'win' ? 'wins-cell' : match.result === 'loss' ? 'losses-cell' : ''}>
                      {match.result?.toUpperCase() || 'DRAW'}
                    </td>
                    <td>{match.opponentName || 'Unknown'}</td>
                    <td>{match.myScore || 0} - {match.opponentScore || 0}</td>
                    <td className="xp-cell">+{match.xpAwarded || 0}</td>
                    <td className="coins-cell">+{match.coinsAwarded || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button className="btn btn-primary btn-full-width" onClick={onBack}>
          Play More Battles
        </button>
      </div>
    </div>
  );
}
