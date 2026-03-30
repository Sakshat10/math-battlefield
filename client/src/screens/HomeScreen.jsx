import React, { useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { connectSocket } from '../socket/client';

const STORAGE_KEY = 'mathBattle_playerName';

export default function HomeScreen({ onJoinQueue, onGoLobby, onQuickMatchFound }) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // null | 'join'
  const [gameMode, setGameMode] = useState('classic'); // 'classic' | 'tug'
  const [loadingAction, setLoadingAction] = useState(null); // null | 'quick' | 'create' | 'join'
  const { getToken } = useAuth();
  const { user } = useUser();

  // Load saved name on mount
  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEY);
    if (savedName) {
      setName(savedName);
    }
  }, []);

  // Save name to localStorage whenever it changes
  const handleNameChange = (e) => {
    const newName = e.target.value;
    setName(newName);
    if (newName.trim()) {
      localStorage.setItem(STORAGE_KEY, newName.trim());
    }
  };

  const profileName = user?.username || user?.firstName || user?.fullName || '';
  const playerName = name.trim() || profileName || 'Anonymous';
  const loading = loadingAction !== null;

  async function getSessionToken() {
    try {
      const token = await getToken();
      return token || null;
    } catch (err) {
      return null; // allow gameplay without auth for dev
    }
  }

  function attachMatchFoundFallback(socket) {
    socket.once('matchmaking:found', (data) => {
      setLoadingAction(null);
      if (onQuickMatchFound) {
        onQuickMatchFound({
          ...data,
          playerNameOverride: playerName,
        });
      }
    });
  }

  async function handleQuickMatch() {
    setError('');
    setLoadingAction('quick');
    try {
      const token = await getSessionToken();
      const socket = await connectSocket(playerName, token || undefined, gameMode);

      // Fallback listener: catches an ultra-fast match before Lobby mounts.
      attachMatchFoundFallback(socket);

      socket.emit('matchmaking:join');
      onJoinQueue(playerName, socket.id, gameMode);
    } catch (e) {
      setError('Could not connect. Check auth + server on port 3001.');
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleCreateRoom() {
    setError('');
    setLoadingAction('create');
    try {
      const token = await getSessionToken();
      const socket = await connectSocket(playerName, token || undefined, gameMode);

      // Defensive fallback for very fast room matches.
      attachMatchFoundFallback(socket);

      let roomCreatedTimeout = null;

      const handleRoomCreated = ({ code, roomId }) => {
        if (roomCreatedTimeout) clearTimeout(roomCreatedTimeout);
        setLoadingAction(null);
        onGoLobby({ type: 'created', code, roomId, playerName, gameMode });
      };

      const handleRoomError = ({ message }) => {
        if (roomCreatedTimeout) clearTimeout(roomCreatedTimeout);
        setLoadingAction(null);
        setError(message || 'Failed to create room');
      };

      socket.once('room:created', handleRoomCreated);
      socket.once('room:error', handleRoomError);

      // Timeout after 5 seconds if no response from server.
      roomCreatedTimeout = setTimeout(() => {
        setLoadingAction(null);
        setError('Room creation timed out. Please try again.');
        socket.off('room:created', handleRoomCreated);
        socket.off('room:error', handleRoomError);
      }, 5000);

      socket.emit('room:create');
    } catch (e) {
      setLoadingAction(null);
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

    setLoadingAction('join');
    try {
      const token = await getSessionToken();
      const socket = await connectSocket(playerName, token || undefined, gameMode);

      // Critical fallback: room join can trigger matchmaking:found before Lobby mounts.
      attachMatchFoundFallback(socket);

      socket.once('room:error', ({ message }) => {
        setLoadingAction(null);
        setError(message);
      });

      socket.once('room:joined', ({ code: c, roomId }) => {
        setLoadingAction(null);
        onGoLobby({ type: 'joined', code: c, roomId, playerName, gameMode });
      });

      socket.emit('room:join', { code });
    } catch (e) {
      setLoadingAction(null);
      setError('Could not connect. Check auth + server on port 3001.');
    }
  }

  return (
    <div className="screen">
      <h1 className="title">⚡ Math Battle</h1>
      <p className="subtitle">Challenge players to real-time math duels</p>

      {/* Mode selector */}
      <div className="mode-selector">
        <button
          id="mode-classic"
          className={`mode-btn ${gameMode === 'classic' ? 'active' : ''}`}
          onClick={() => setGameMode('classic')}
          disabled={loading}
        >
          ⚔️ Classic
        </button>
        <button
          id="mode-tug"
          className={`mode-btn ${gameMode === 'tug' ? 'active' : ''}`}
          onClick={() => setGameMode('tug')}
          disabled={loading}
        >
          🪢 Tug of War
        </button>
      </div>

      <div className="card stack-md">
        <div>
          <p className="label" style={{ marginBottom: 6 }}>Your Name</p>
          <input
            id="player-name"
            className="input"
            placeholder="Enter your name..."
            value={name}
            maxLength={20}
            onChange={handleNameChange}
          />
        </div>

        <div className="divider" />

        <button id="btn-quick-match" className="btn btn-primary" onClick={handleQuickMatch} disabled={loading}>
          {loadingAction === 'quick' ? '⏳ Connecting…' : '⚡ Quick Match'}
        </button>

        <button id="btn-create-room" className="btn btn-secondary" onClick={handleCreateRoom} disabled={loading}>
          {loadingAction === 'create' ? '⏳ Connecting…' : '🏠 Create Private Room'}
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
              {loadingAction === 'join' ? '⏳ Joining…' : 'Join Room'}
            </button>
          </div>
        )}

        {error && <div className="alert error">{error}</div>}
      </div>
    </div>
  );
}
