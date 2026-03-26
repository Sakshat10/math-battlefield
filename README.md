# ⚡ Math Battle MVP

A real-time multiplayer math game where two players compete to solve math problems fastest. Built with **Node.js + Socket.io** (backend) and **React + Vite** (frontend).

---

## 🚀 How to Run

### 1. Start the Server

```bash
cd server
npm install       # only needed once
npm run dev       # starts on http://localhost:3001
```

### 2. Start the Client

```bash
cd client
npm install       # only needed once
npm run dev       # starts on http://localhost:5173
```

### 3. Play!

Open **two browser tabs** at `http://localhost:5173` — one per player.

---

## 🎮 Game Flow

1. Enter your name
2. Click **Quick Match** (matches with the next available player) OR
   - **Create Private Room** → share the 6-digit code
   - **Join with Code** → enter the room code
3. Wait in lobby until opponent joins
4. Countdown 3…2…1…
5. Solve math questions — answer correctly to earn **+10 points**
6. Match ends after **60 seconds**
7. See results, click **Play Again**

---

## 📁 Project Structure

```
math battlefield/
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js                  ← Express + Socket.io entry
│       ├── socket/
│       │   └── handlers.js           ← All WebSocket event handlers
│       └── services/
│           ├── matchmaking.js        ← Queue + private rooms (in-memory)
│           ├── gameSession.js        ← Server-authoritative game loop
│           └── questionGenerator.js  ← Math question factory
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx                   ← Screen router
        ├── index.css                 ← Global design system
        ├── main.jsx
        ├── socket/
        │   └── client.js             ← Socket.io client (connectSocket)
        └── screens/
            ├── HomeScreen.jsx        ← Menu (Quick Match / Room)
            ├── LobbyScreen.jsx       ← Waiting for opponent
            ├── GameScreen.jsx        ← Battle arena
            └── ResultScreen.jsx      ← Winner + scores
```

---

## 🔌 WebSocket Events

| Direction | Event | Payload |
|-----------|-------|---------|
| C → S | `matchmaking:join` | — |
| C → S | `matchmaking:cancel` | — |
| C → S | `room:create` | — |
| C → S | `room:join` | `{ code }` |
| C → S | `game:answer` | `{ roomId, questionId, answer }` |
| S → C | `matchmaking:found` | `{ roomId }` |
| S → C | `room:created` | `{ code, roomId }` |
| S → C | `room:joined` | `{ code, roomId }` |
| S → C | `room:error` | `{ message }` |
| S → C | `game:start` | `{ players, duration }` |
| S → C | `game:question` | `{ id, question }` |
| S → C | `game:tick` | `{ timeLeft }` |
| S → C | `game:updateScore` | `{ scores, lastCorrect }` |
| S → C | `game:wrongAnswer` | `{ questionId, playerId }` |
| S → C | `game:end` | `{ scores, winner, winnerName }` |
| S → C | `game:opponentLeft` | `{ message }` |
