const mongoose = require('mongoose');

const MatchPlayerSchema = new mongoose.Schema(
  {
    userKey: {
      type: String,
      required: true,
      index: true,
    },
    clerkId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    result: {
      type: String,
      enum: ['win', 'loss', 'draw'],
      required: true,
    },
    xpAwarded: {
      type: Number,
      default: 0,
    },
    coinsAwarded: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const MatchSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    mode: {
      type: String,
      default: 'ranked',
    },
    winnerUserKey: {
      type: String,
      default: null,
      index: true,
    },
    winnerName: {
      type: String,
      default: null,
    },
    isDraw: {
      type: Boolean,
      default: false,
    },
    players: {
      type: [MatchPlayerSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2,
        message: 'A match must have at least two players.',
      },
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: Date.now,
    },
    durationSec: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Match = mongoose.models.Match || mongoose.model('Match', MatchSchema);

module.exports = { Match };
