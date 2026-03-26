import React, { useEffect } from 'react';
import { getSocket } from '../socket/client';

/**
 * LobbyScreen — shown while waiting for a second player.
 * Props:
 *   lobbyInfo: { type: 'queue' | 'created' | 'joined', code, roomId, playerName }
 *   onMatchFound: ({ roomId }) => void
 *   onCancel: () => void
 */
export default function LobbyScreen({ lobbyInfo, onMatchFound, onCancel }) {
  const { type, code } = lobbyInfo;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleFound(data) {
      onMatchFound(data);
    }

    socket.on('matchmaking:found', handleFound);

    return () => {
      socket.off('matchmaking:found', handleFound);
    };
  }, []);

  function handleCancel() {
    const socket = getSocket();
    if (socket) {
      if (type === 'queue') socket.emit('matchmaking:cancel');
    }
    onCancel();
  }

  return (
    <div className="screen">
      <h1 className="title">⚡ Math Battle</h1>

      <div className="card stack-lg center">
        <div className="spinner" />

        <p style={{ fontSize: '1.05rem', fontWeight: 700 }}>
          {type === 'queue' ? 'Searching for opponent…' : 'Waiting for a friend to join…'}
        </p>

        {type === 'created' && code && (
          <div className="stack-sm center">
            <p className="label">Share this code</p>
            <div className="code-badge" id="room-code-display">{code}</div>
            <p className="microcopy">
              Ask your opponent to enter this code
            </p>
          </div>
        )}

        <div className="divider" />

        <button id="btn-cancel" className="btn btn-secondary" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
