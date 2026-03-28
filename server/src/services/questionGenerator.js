/**
 * Question Generator Service
 * Generates simple math questions with correct answers
 */

const easyOperations = ['+', '-'];
const mediumOperations = ['+', '-', '*'];
const hardOperations = ['*', '/', '+', '-'];

const POWERUP_ROLL_MIN = 25;
const POWERUP_ROLL_MAX = 35;

// Weighted power-up distribution when a question becomes special.
const POWERUP_TYPES = [
  { type: 'freeze', weight: 27 },
  { type: 'double', weight: 27 },
  { type: 'skip', weight: 17 },
  { type: 'slow', weight: 17 },
  { type: 'bonus', weight: 8 },
  { type: 'lottery', weight: 4 },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(ops) {
  return ops[randomInt(0, ops.length - 1)];
}

function weightedPick(entries) {
  const total = entries.reduce((sum, item) => sum + item.weight, 0);
  let roll = randomInt(1, total);

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }

  return entries[0].type;
}

function randomQuestionType() {
  const powerupChance = randomInt(POWERUP_ROLL_MIN, POWERUP_ROLL_MAX);
  const roll = randomInt(1, 100);
  if (roll > powerupChance) return 'normal';
  return weightedPick(POWERUP_TYPES);
}

function randomPowerupType() {
  return weightedPick(POWERUP_TYPES);
}

function generateQuestion(difficulty = 'easy', options = {}) {
  const { forcePowerup = false } = options;
  const op =
    difficulty === 'hard'
      ? pickRandom(hardOperations)
      : difficulty === 'medium'
        ? pickRandom(mediumOperations)
        : pickRandom(easyOperations);

  let a, b, answer, questionText;

  switch (op) {
    case '+':
      if (difficulty === 'easy') {
        a = randomInt(1, 25);
        b = randomInt(1, 25);
      } else if (difficulty === 'medium') {
        a = randomInt(10, 120);
        b = randomInt(10, 120);
      } else {
        a = randomInt(120, 350);
        b = randomInt(80, 260);
      }
      answer = a + b;
      questionText = `${a} + ${b}`;
      break;
    case '-':
      if (difficulty === 'easy') {
        a = randomInt(12, 50);
      } else if (difficulty === 'medium') {
        a = randomInt(60, 180);
      } else {
        a = randomInt(180, 420);
      }
      b = randomInt(1, a); // ensure non-negative result
      answer = a - b;
      questionText = `${a} - ${b}`;
      break;
    case '*':
      if (difficulty === 'easy') {
        a = randomInt(2, 10);
        b = randomInt(2, 10);
      } else if (difficulty === 'medium') {
        a = randomInt(4, 18);
        b = randomInt(3, 16);
      } else {
        a = randomInt(8, 24);
        b = randomInt(6, 22);
      }
      answer = a * b;
      questionText = `${a} × ${b}`;
      break;
    case '/': {
      // Build exact division so answers remain integers.
      const divisor = difficulty === 'hard' ? randomInt(4, 16) : randomInt(2, 10);
      const result = difficulty === 'hard' ? randomInt(5, 24) : randomInt(2, 12);
      a = divisor * result;
      b = divisor;
      answer = result;
      questionText = `${a} ÷ ${b}`;
      break;
    }
    default:
      a = randomInt(1, 50);
      b = randomInt(1, 50);
      answer = a + b;
      questionText = `${a} + ${b}`;
  }

  return {
    id: `q_${Date.now()}_${randomInt(1000, 9999)}`,
    question: questionText,
    answer,
    difficulty,
    type: forcePowerup ? randomPowerupType() : randomQuestionType(),
  };
}

module.exports = { generateQuestion };
