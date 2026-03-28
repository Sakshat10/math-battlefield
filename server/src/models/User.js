const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    xp: {
      type: Number,
      default: 0,
    },
    coins: {
      type: Number,
      default: 0,
    },
    wins: {
      type: Number,
      default: 0,
    },
    losses: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = { User };
