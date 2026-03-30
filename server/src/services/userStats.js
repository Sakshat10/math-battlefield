const { User } = require('../models/User');
const { Match } = require('../models/Match');
const { isMongoConnected } = require('../db/mongo');

const XP_REWARD = {
  WIN: 40,
  LOSS: 15,
  DRAW: 20,
};

function normalizeName(name, fallback = 'Anonymous') {
  const v = String(name || '').trim();
  return v || fallback;
}

function slugifyName(name) {
  return normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'anonymous';
}

function getUserIdentity({ clerkId, username }) {
  if (clerkId) {
    return {
      userKey: `clerk:${clerkId}`,
      clerkId,
      username: normalizeName(username, `Player_${clerkId.slice(0, 6)}`),
    };
  }

  return {
    userKey: `guest:${slugifyName(username)}`,
    clerkId: null,
    username: normalizeName(username),
  };
}

function hasPersistence() {
  return Boolean(process.env.MONGODB_URI) && isMongoConnected();
}

async function ensureUser({ clerkId, username }) {
  if (!hasPersistence()) return null;
  const identity = getUserIdentity({ clerkId, username });

  const existingByLegacyClerkId = identity.clerkId
    ? await User.findOne({ clerkId: identity.clerkId })
    : null;

  if (existingByLegacyClerkId && !existingByLegacyClerkId.userKey) {
    existingByLegacyClerkId.userKey = identity.userKey;
    existingByLegacyClerkId.username = identity.username;
    existingByLegacyClerkId.lastSeenAt = new Date();
    await existingByLegacyClerkId.save();
    return existingByLegacyClerkId;
  }

  return User.findOneAndUpdate(
    { userKey: identity.userKey },
    {
      $setOnInsert: {
        userKey: identity.userKey,
        clerkId: identity.clerkId,
        username: identity.username,
      },
      $set: {
        username: identity.username,
        lastSeenAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}

async function recordMatchResult({ winnerPlayer, loserPlayer, winnerCoins = 0, loserCoins = 0, roomId, durationSec = 60 }) {
  if (!hasPersistence()) return;

  const winner = getUserIdentity(winnerPlayer || {});
  const loser = getUserIdentity(loserPlayer || {});

  await Promise.all([
    ensureUser({ clerkId: winner.clerkId, username: winner.username }),
    ensureUser({ clerkId: loser.clerkId, username: loser.username }),
  ]);

  await Promise.all([
    User.updateOne(
      { userKey: winner.userKey },
      {
        $inc: {
          wins: 1,
          totalMatches: 1,
          xp: XP_REWARD.WIN,
          coins: winnerCoins,
          currentWinStreak: 1,
        },
        $max: {
          highestWinStreak: 1,
        },
        $set: {
          lastSeenAt: new Date(),
        },
      }
    ),
    User.updateOne(
      { userKey: loser.userKey },
      {
        $inc: {
          losses: 1,
          totalMatches: 1,
          xp: XP_REWARD.LOSS,
          coins: loserCoins,
        },
        $set: {
          currentWinStreak: 0,
          lastSeenAt: new Date(),
        },
      }
    ),
  ]);

  const winnerDoc = await User.findOne({ userKey: winner.userKey }, { currentWinStreak: 1, highestWinStreak: 1 }).lean();
  if (winnerDoc && winnerDoc.currentWinStreak > (winnerDoc.highestWinStreak || 0)) {
    await User.updateOne(
      { userKey: winner.userKey },
      {
        $set: { highestWinStreak: winnerDoc.currentWinStreak },
      }
    );
  }

  await Match.create({
    roomId: roomId || `room_${Date.now()}`,
    mode: 'ranked',
    winnerUserKey: winner.userKey,
    winnerName: winner.username,
    isDraw: false,
    players: [
      {
        userKey: winner.userKey,
        clerkId: winner.clerkId,
        username: winner.username,
        score: winnerPlayer?.score || 0,
        result: 'win',
        xpAwarded: XP_REWARD.WIN,
        coinsAwarded: winnerCoins,
      },
      {
        userKey: loser.userKey,
        clerkId: loser.clerkId,
        username: loser.username,
        score: loserPlayer?.score || 0,
        result: 'loss',
        xpAwarded: XP_REWARD.LOSS,
        coinsAwarded: loserCoins,
      },
    ],
    durationSec,
    endedAt: new Date(),
  });
}

async function recordDraw({ players = [], coinsByUserKey = {}, roomId, durationSec = 60 }) {
  if (!hasPersistence()) return;
  if (!players.length) return;

  const identities = players.map((p) => getUserIdentity(p));
  await Promise.all(
    identities.map((identity) => ensureUser({ clerkId: identity.clerkId, username: identity.username }))
  );

  await Promise.all(
    identities.map((identity) =>
      User.updateOne(
        { userKey: identity.userKey },
        {
          $inc: {
            draws: 1,
            totalMatches: 1,
            xp: XP_REWARD.DRAW,
            coins: coinsByUserKey[identity.userKey] || 0,
          },
          $set: {
            lastSeenAt: new Date(),
          },
        }
      )
    )
  );

  await Match.create({
    roomId: roomId || `room_${Date.now()}`,
    mode: 'ranked',
    winnerUserKey: null,
    winnerName: null,
    isDraw: true,
    players: identities.map((identity, i) => ({
      userKey: identity.userKey,
      clerkId: identity.clerkId,
      username: identity.username,
      score: players[i]?.score || 0,
      result: 'draw',
      xpAwarded: XP_REWARD.DRAW,
      coinsAwarded: coinsByUserKey[identity.userKey] || 0,
    })),
    durationSec,
    endedAt: new Date(),
  });
}

async function getLeaderboard(limit = 20) {
  if (!hasPersistence()) return [];
  return User.find({}, {
    userKey: 1,
    clerkId: 1,
    username: 1,
    xp: 1,
    wins: 1,
    losses: 1,
    draws: 1,
    coins: 1,
    totalMatches: 1,
    highestWinStreak: 1,
  })
    .sort({ xp: -1, wins: -1 })
    .limit(limit)
    .lean();
}

async function getUserProfile({ clerkId, username }) {
  if (!hasPersistence()) return null;
  const identity = getUserIdentity({ clerkId, username });
  const user = await User.findOne({ userKey: identity.userKey }).lean();
  if (!user) return null;

  const totalMatches = user.totalMatches || (user.wins || 0) + (user.losses || 0) + (user.draws || 0);
  const winRate = totalMatches > 0 ? Math.round(((user.wins || 0) / totalMatches) * 100) : 0;

  return {
    userKey: user.userKey,
    clerkId: user.clerkId || null,
    username: user.username,
    xp: user.xp || 0,
    coins: user.coins || 0,
    wins: user.wins || 0,
    losses: user.losses || 0,
    draws: user.draws || 0,
    totalMatches,
    winRate,
    currentWinStreak: user.currentWinStreak || 0,
    highestWinStreak: user.highestWinStreak || 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSeenAt: user.lastSeenAt,
  };
}

async function getRecentMatchesForUser({ clerkId, username, limit = 10 }) {
  if (!hasPersistence()) return [];
  const identity = getUserIdentity({ clerkId, username });

  const matches = await Match.find({
    players: { $elemMatch: { userKey: identity.userKey } },
  })
    .sort({ endedAt: -1 })
    .limit(limit)
    .lean();

  return matches.map((match) => {
    const me = match.players.find((p) => p.userKey === identity.userKey);
    const opponent = match.players.find((p) => p.userKey !== identity.userKey) || null;

    return {
      id: String(match._id),
      roomId: match.roomId,
      endedAt: match.endedAt,
      durationSec: match.durationSec,
      isDraw: match.isDraw,
      result: me?.result || 'draw',
      myScore: me?.score || 0,
      opponentName: opponent?.username || 'Unknown',
      opponentScore: opponent?.score || 0,
      xpAwarded: me?.xpAwarded || 0,
      coinsAwarded: me?.coinsAwarded || 0,
    };
  });
}

module.exports = {
  ensureUser,
  recordMatchResult,
  recordDraw,
  getLeaderboard,
  getUserProfile,
  getRecentMatchesForUser,
};
