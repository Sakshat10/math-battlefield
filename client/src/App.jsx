import React, { useState, useRef } from 'react';
import HomeScreen from './screens/HomeScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import ResultScreen from './screens/ResultScreen';
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

  function handleMatchFound({ roomId }) {
    const socket = getSocket();
    myIdRef.current = socket?.id || null;
    setGameInfo({ roomId, playerName: lobbyInfo.playerName });
    setScreen('game');
  }

  function handleGameEnd(data) {
    // Capture myId at game-end time (socket still connected)
    const socket = getSocket();
    myIdRef.current = socket?.id || myIdRef.current;
    setResult(data);
    setScreen('result');
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
      {screen === 'home' && (
        <HomeScreen
          onJoinQueue={handleJoinQueue}
          onGoLobby={handleGoLobby}
        />
      )}

      {screen === 'lobby' && lobbyInfo && (
        <LobbyScreen
          lobbyInfo={lobbyInfo}
          onMatchFound={handleMatchFound}
          onCancel={handlePlayAgain}
        />
      )}

      {screen === 'game' && gameInfo && (
        <GameScreen
          roomId={gameInfo.roomId}
          playerName={gameInfo.playerName}
          onGameEnd={handleGameEnd}
        />
      )}

      {screen === 'result' && result && (
        <ResultScreen
          result={result}
          myId={myIdRef.current}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </>
  );
}
