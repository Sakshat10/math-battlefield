const { User } = require('../models/User');

function hasPersistence() {
  return Boolean(process.env.MONGODB_URI);
}

async function ensureUser({ clerkId, username }) {
  if (!hasPersistence()) return null;
  if (!clerkId) return null;

  const safeName = username && String(username).trim() ? String(username).trim() : `Player_${clerkId.slice(0, 6)}`;

  return User.findOneAndUpdate(
    { clerkId },
    {
      $setOnInsert: {
        clerkId,
        username: safeName,
      },
      $set: {
        username: safeName,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );
}

async function recordMatchResult({ winnerClerkId, loserClerkId, winnerCoins = 0, loserCoins = 0 }) {
  if (!hasPersistence()) return;
  if (winnerClerkId) {
    await User.updateOne(
      { clerkId: winnerClerkId },
      {
        $inc: {
          wins: 1,
          xp: 40,
          coins: winnerCoins,
        },
      }
    );
  }

  if (loserClerkId) {
    await User.updateOne(
      { clerkId: loserClerkId },
      {
        $inc: {
          losses: 1,
          xp: 15,
          coins: loserCoins,
        },
      }
    );
  }
}

async function recordDraw({ playerClerkIds = [], coinsByClerkId = {} }) {
  if (!hasPersistence()) return;
  if (!playerClerkIds.length) return;

  await Promise.all(
    playerClerkIds.map((clerkId) =>
      User.updateOne(
        { clerkId },
        {
          $inc: {
            xp: 20,
            coins: coinsByClerkId[clerkId] || 0,
          },
        }
      )
    )
  );
}

async function getLeaderboard(limit = 20) {
  if (!hasPersistence()) return [];
  return User.find({}, { clerkId: 1, username: 1, xp: 1, wins: 1, losses: 1, coins: 1 })
    .sort({ xp: -1, wins: -1 })
    .limit(limit)
    .lean();
}

module.exports = {
  ensureUser,
  recordMatchResult,
  recordDraw,
  getLeaderboard,
};
