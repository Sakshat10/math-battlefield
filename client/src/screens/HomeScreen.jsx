import React, { useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { connectSocket } from '../socket/client';

export default function HomeScreen({ onJoinQueue, onGoLobby }) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // null | 'join'
  const [loading, setLoading] = useState(false);
  const { getToken } = useAuth();
  const { user } = useUser();

  const profileName = user?.username || user?.firstName || user?.fullName || '';
  const playerName = name.trim() || profileName || 'Anonymous';

  async function getSessionToken() {
    const token = await getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return token;
  }

  async function handleQuickMatch() {
    setError('');
    setLoading(true);
    try {
      const token = await getSessionToken();
      const socket = await connectSocket(playerName, token);
      socket.emit('matchmaking:join');
      onJoinQueue(playerName, socket.id);
    } catch (e) {
      setError('Could not connect. Check auth + server on port 3001.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRoom() {
    setError('');
    setLoading(true);
    try {
      const token = await getSessionToken();
      const socket = await connectSocket(playerName, token);

      socket.once('room:created', ({ code, roomId }) => {
        setLoading(false);
        onGoLobby({ type: 'created', code, roomId, playerName });
      });

      socket.emit('room:create');
    } catch (e) {
      setLoading(false);
      setError('Could not connect. Check auth + server on port 3001.');
    }
  }

  async function handleJoinRoom() {
    setError('');
    const code = joinCode.trim();
    if (code.length !== 6 || isNaN(code)) {
      setError('Please enter a valid 6-digit room code.');
      return;
    }

    setLoading(true);
    try {
      const token = await getSessionToken();
      const socket = await connectSocket(playerName, token);

      socket.once('room:error', ({ message }) => {
        setLoading(false);
        setError(message);
      });

      socket.once('room:joined', ({ code: c, roomId }) => {
        setLoading(false);
        onGoLobby({ type: 'joined', code: c, roomId, playerName });
      });

      socket.emit('room:join', { code });
    } catch (e) {
      setLoading(false);
      setError('Could not connect. Check auth + server on port 3001.');
    }
  }

  return (
    <div className="screen">
      <h1 className="title">⚡ Math Battle</h1>
      <p className="subtitle">Challenge players to real-time math duels</p>

      <div className="card stack-md">
        <div>
          <p className="label" style={{ marginBottom: 6 }}>Your Name</p>
          <input
            id="player-name"
            className="input"
            placeholder="Enter your name..."
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="divider" />

        <button id="btn-quick-match" className="btn btn-primary" onClick={handleQuickMatch} disabled={loading}>
          {loading ? '⏳ Connecting…' : '⚡ Quick Match'}
        </button>

        <button id="btn-create-room" className="btn btn-secondary" onClick={handleCreateRoom} disabled={loading}>
          🏠 Create Private Room
        </button>

        <button
          id="btn-join-room-toggle"
          className="btn btn-secondary"
          onClick={() => { setMode(mode === 'join' ? null : 'join'); setError(''); }}
          disabled={loading}
        >
          🔗 Join with Code
        </button>

        {mode === 'join' && (
          <div className="stack-sm">
            <input
              id="room-code-input"
              className="input"
              placeholder="6-digit room code"
              value={joinCode}
              maxLength={6}
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
            />
            <button id="btn-join-submit" className="btn btn-primary" onClick={handleJoinRoom} disabled={loading}>
              Join Room
            </button>
          </div>
        )}

        {error && <div className="alert error">{error}</div>}
      </div>
    </div>
  );
}
