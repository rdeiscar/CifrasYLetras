'use strict';

const fs = require('fs');
const readline = require('readline');
const config = require('./config');

const A_CODE = 'A'.charCodeAt(0);
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(s) {
  if (!s || typeof s !== 'string') return '';
  return stripAccents(s)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function makeCounts(str) {
  const counts = new Array(26).fill(0);
  for (const ch of str) {
    if (ch >= 'A' && ch <= 'Z') counts[ch.charCodeAt(0) - A_CODE]++;
  }
  return counts;
}

const wordsByLength = new Map();
const allCounts = new Map();
let wordsSet = new Set();
let total = 0;

async function load() {
  const file = config.DICTIONARY_FILE;
  if (!file || !fs.existsSync(file)) {
    console.error(`Diccionario no encontrado en ${file}`);
    console.error('Ejecuta  npm run fetch-dictionary  para generarlo.');
    process.exit(1);
  }

  wordsSet = new Set();
  wordsByLength.clear();
  allCounts.clear();
  total = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const w = line.trim();
    if (w.length < 2 || w.length > config.MAX_WORD_LENGTH) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    if (wordsSet.has(w)) continue;
    wordsSet.add(w);
    total++;
    if (!wordsByLength.has(w.length)) wordsByLength.set(w.length, []);
    wordsByLength.get(w.length).push(w);
    allCounts.set(w, makeCounts(w));
  }

  console.log(`Diccionario cargado: ${total} palabras (${file})`);
}

function isValid(word) {
  return wordsSet.has(normalize(word));
}

function isSubset(need, have) {
  for (let i = 0; i < 26; i++) if (need[i] > have[i]) return false;
  return true;
}

function findWordsForLetters(letters) {
  const have = makeCounts(letters.join(''));
  const results = [];
  const maxLen = Math.min(letters.length, config.MAX_WORD_LENGTH);
  for (let len = maxLen; len >= config.MIN_WORD_LENGTH; len--) {
    const bucket = wordsByLength.get(len);
    if (!bucket) continue;
    for (const w of bucket) {
      if (isSubset(allCounts.get(w), have)) results.push(w);
    }
  }
  return results;
}

function longestWordsForLetters(letters, limit = 20) {
  const all = findWordsForLetters(letters);
  if (!all.length) return [];
  all.sort((a, b) => b.length - a.length || a.localeCompare(b));
  const bestLen = all[0].length;
  return all.filter((w) => w.length === bestLen).slice(0, limit);
}

function isBuildable(word, letters) {
  const need = allCounts.get(word);
  if (!need) return false;
  return isSubset(need, makeCounts(letters.join('')));
}

module.exports = {
  load,
  isValid,
  normalize,
  findWordsForLetters,
  longestWordsForLetters,
  isBuildable,
  size: () => wordsSet.size,
  isVowel: (ch) => VOWELS.has(ch),
};