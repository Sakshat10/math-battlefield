import React, { useState, useRef } from 'react';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import ResultScreen from './screens/ResultScreen';
import ProfileScreen from './screens/ProfileScreen';
import { getSocket, disconnectSocket } from './socket/client';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [lobbyInfo, setLobbyInfo] = useState(null);
  const [gameInfo, setGameInfo] = useState(null);
  const [result, setResult] = useState(null);
  const myIdRef = useRef(null);

  function handleJoinQueue(playerName) {
    setLobbyInfo({ type: 'queue', playerName });
    setScreen('lobby');
  }

  function handleGoLobby(info) {
    setLobbyInfo(info);
    setScreen('lobby');
  }

  function handleMatchFoundWithMeta({ roomId, opponent, playerNameOverride }) {
    const socket = getSocket();
    myIdRef.current = socket?.id || null;
    setGameInfo({
      roomId,
      playerName: playerNameOverride || lobbyInfo?.playerName || 'Player',
      opponent: opponent || null,
      opponentWinStreak: opponent?.winStreak || 0,
    });
    setScreen('game');
  }

  function handleGameEnd(data) {
    // Capture myId at game-end time (socket still connected)
    const socket = getSocket();
    myIdRef.current = socket?.id || myIdRef.current;
    setResult({ ...data, roomId: gameInfo?.roomId });
    setScreen('result');
  }

  function handleRematchStart() {
    setResult(null);
    setScreen('game');
  }

  function handlePlayAgain() {
    disconnectSocket();
    setLobbyInfo(null);
    setGameInfo(null);
    setResult(null);
    myIdRef.current = null;
    setScreen('home');
  }

  return (
    <>
      <Show when="signed-out">
        <div className="screen">
          <h1 className="title">⚡ Math Battle</h1>
          <p className="subtitle">Sign in to keep your XP, wins, and streaks.</p>

          <div className="card stack-md center" style={{ maxWidth: 460 }}>
            <SignInButton>
              <button className="btn btn-primary">Sign In</button>
            </SignInButton>

            <SignUpButton>
              <button className="btn btn-secondary">Sign Up</button>
            </SignUpButton>
          </div>
        </div>
      </Show>

      <Show when="signed-in">
        <div className="auth-userbar">
          {screen !== 'profile' && (
            <button
              className="btn-icon"
              onClick={() => setScreen('profile')}
              title="View Profile"
            >
              👤
            </button>
          )}
          <UserButton afterSignOutUrl="/" />
        </div>

        {screen === 'home' && (
          <HomeScreen
            onJoinQueue={handleJoinQueue}
            onGoLobby={handleGoLobby}
            onQuickMatchFound={handleMatchFoundWithMeta}
          />
        )}

        {screen === 'profile' && (
          <ProfileScreen onBack={() => setScreen('home')} />
        )}

        {screen === 'lobby' && lobbyInfo && (
          <LobbyScreen
            lobbyInfo={lobbyInfo}
            onMatchFound={handleMatchFoundWithMeta}
            onCancel={handlePlayAgain}
          />
        )}

        {screen === 'game' && gameInfo && (
          <GameScreen
            roomId={gameInfo.roomId}
            playerName={gameInfo.playerName}
            opponentWinStreak={gameInfo.opponentWinStreak || 0}
            onGameEnd={handleGameEnd}
          />
        )}

        {screen === 'result' && result && (
          <ResultScreen
            result={result}
            myId={myIdRef.current}
            roomId={gameInfo?.roomId}
            onRematchStart={handleRematchStart}
            onPlayAgain={handlePlayAgain}
          />
        )}
      </Show>
    </>
  );
}
