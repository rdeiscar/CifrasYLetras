'use strict';

const path = require('path');
const env = process.env;
const ROOT = path.resolve(__dirname, '..');

module.exports = {
  ROOT,
  PORT: Number(env.PORT || 3000),
  HOST: env.HOST || '0.0.0.0',
  ROOM_NAME: env.ROOM_NAME || 'Sala principal',

  PUBLIC_DIR: path.join(ROOT, 'public'),
  DICTIONARY_FILE:
    env.DICTIONARY_FILE || path.join(ROOT, 'data', 'palabras.txt'),

  MIN_WORD_LENGTH: Number(env.MIN_WORD_LENGTH || 3),
  MAX_WORD_LENGTH: Number(env.MAX_WORD_LENGTH || 10),
  NUM_LETTERS: Number(env.NUM_LETTERS || 10),
  VOWELS_PER_ROUND: Number(env.VOWELS_PER_ROUND || 4),
  NUM_NUMBERS: Number(env.NUM_NUMBERS || 6),
  MAX_WORDS_PER_PLAYER: Number(env.MAX_WORDS_PER_PLAYER || 30),

  ROUND_TIME_SECONDS: Number(env.ROUND_TIME_SECONDS || 60),
  COUNTDOWN_SECONDS: Number(env.COUNTDOWN_SECONDS || 5),
  RESULTS_SECONDS: Number(env.RESULTS_SECONDS || 12),

  NUM_ROUNDS: Number(env.NUM_ROUNDS || 8),
  POINTS_EXACT: Number(env.POINTS_EXACT || 10),
  POINTS_CLOSE: Number(env.POINTS_CLOSE || 8),
};