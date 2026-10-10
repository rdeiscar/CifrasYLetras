'use strict';

const VOWELS = ['A', 'E', 'I', 'O', 'U'];
const CONSONANTS = [
  'B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N',
  'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z',
];

/* Pesos aproximados de frecuencia en español: W y X salen muy de vez en cuando. */
const VOWEL_WEIGHTS = { A: 11.5, E: 8.7, I: 4.2, O: 8.6, U: 2.9 };
const CONSONANT_WEIGHTS = {
  B: 2.2, C: 3.5, D: 4.4, F: 0.9, G: 1.7, H: 1.1, J: 0.5, K: 0.2,
  L: 5.0, M: 3.0, N: 7.0, P: 2.5, Q: 0.8, R: 6.4, S: 7.9, T: 4.6,
  V: 1.0, W: 0.1, X: 0.2, Y: 0.9, Z: 0.5,
};

const BIG_NUMBERS = [25, 50, 75, 100];
const OPS = ['+', '-', '×', '÷'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedSample(items, weightOf, k) {
  const pool = items.map((it) => ({ it, w: Math.max(0.0001, weightOf(it)) }));
  const out = [];
  for (let n = 0; n < k && pool.length; n++) {
    let total = 0;
    for (const p of pool) total += p.w;
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return out;
}

function randint(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function normOp(op) {
  if (op === '*') return '×';
  if (op === '/') return '÷';
  if (op === '−') return '-';
  return op;
}

function applyOp(a, op, b) {
  switch (op) {
    case '+':
      return a + b;
    case '-': {
      const v = a - b;
      return v >= 0 ? v : null;
    }
    case '*':
    case '×':
      return a * b;
    case '/':
    case '÷': {
      if (b === 0 || a % b !== 0) return null;
      return a / b;
    }
    default:
      return null;
  }
}

const MAX_EXPR_DEPTH = 6;

function walkOperand(node, depth, onNumber) {
  if (depth > MAX_EXPR_DEPTH) return false;
  if (typeof node === 'number') {
    if (!Number.isInteger(node) || node <= 0) return false;
    onNumber(node);
    return true;
  }
  return walkExpression(node, depth + 1, onNumber);
}

function walkExpression(expr, depth, onNumber) {
  if (depth > MAX_EXPR_DEPTH) return false;
  if (!expr || typeof expr !== 'object' || !Array.isArray(expr.steps)) return false;
  if (!walkOperand(expr.start, depth, onNumber)) return false;
  for (const s of expr.steps) {
    if (!s || !OPS.includes(normOp(s.op))) return false;
    if (!walkOperand(s.n, depth, onNumber)) return false;
  }
  return true;
}

function evalOperand(node, depth) {
  if (typeof node === 'number') return node;
  return evalExpression(node, depth + 1);
}

function evalExpression(expr, depth) {
  if (depth > MAX_EXPR_DEPTH) return null;
  let value = evalOperand(expr.start, depth);
  if (value == null) return null;
  for (const s of expr.steps) {
    const rhs = evalOperand(s.n, depth);
    if (rhs == null) return null;
    const v = applyOp(value, normOp(s.op), rhs);
    if (v === null || !Number.isInteger(v) || v < 0) return null;
    value = v;
  }
  return value;
}

function normalizeExpr(expr) {
  if (!expr || typeof expr !== 'object' || !Array.isArray(expr.steps)) return expr;
  return {
    start:
      typeof expr.start === 'number' ? expr.start : normalizeExpr(expr.start),
    steps: expr.steps.map((s) => ({
      op: normOp(s.op),
      n: typeof s.n === 'number' ? s.n : normalizeExpr(s.n),
    })),
  };
}

function execExpression(roundNumbers, expr) {
  const leaves = [];
  if (!walkExpression(expr, 0, (n) => leaves.push(n))) {
    return { ok: false, reason: 'expresión inválida' };
  }
  if (leaves.length > roundNumbers.length) {
    return { ok: false, reason: 'expresión inválida' };
  }

  const pool = [...roundNumbers];
  for (const n of leaves) {
    const i = pool.indexOf(n);
    if (i < 0) return { ok: false, reason: 'número no disponible' };
    pool.splice(i, 1);
  }

  const value = evalExpression(expr, 0);
  if (value == null || !Number.isInteger(value) || value < 0) {
    return { ok: false, reason: 'operación inválida' };
  }
  return { ok: true, value };
}

function numbersSolver(numbers, target, maxVisits = 350000) {
  const n = numbers.length;
  let visits = 0;
  let best = { value: null, dist: Infinity, expr: '' };
  const memo = new Set();

  function dfs(mask, value, expr, used) {
    visits++;
    const d = Math.abs(value - target);
    if (d < best.dist) best = { value, dist: d, expr };
    if (d === 0) return true;
    if (visits > maxVisits) return false;
    const key = `${(mask * 7919).toString(36)}-${value}`;
    if (memo.has(key)) return false;
    memo.add(key);
    if (used === n) return false;

    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue;
      const t = numbers[i];
      const nmask = mask | (1 << i);
      const cand = [];
      cand.push([value + t, `(${expr} + ${t})`]);
      if (value >= t) cand.push([value - t, `(${expr} - ${t})`]);
      cand.push([value * t, `(${expr} × ${t})`]);
      if (value % t === 0) cand.push([value / t, `(${expr} ÷ ${t})`]);
      if (t >= value) cand.push([t - value, `(${t} - ${expr})`]);
      if (value !== 0 && t % value === 0) cand.push([t / value, `(${t} ÷ ${expr})`]);

      for (const c of cand) {
        if (c[0] >= 0 && Number.isInteger(c[0])) {
          if (dfs(nmask, c[0], c[1], used + 1)) return true;
        }
      }
    }
    return false;
  }

  for (let i = 0; i < n; i++) {
    if (dfs(1 << i, numbers[i], String(numbers[i]), 1)) break;
  }

  if (best.value === null) return null;
  return {
    value: best.value,
    expr: best.expr,
    dist: best.dist,
    exact: best.dist === 0,
  };
}

class Game {
  constructor(cfg, dict, io) {
    this.cfg = cfg;
    this.dict = dict;
    this.io = io;
    this.room = 'main';

    this.players = new Map();
    this.socketMap = new Map();
    this.hostId = null;
    this.state = 'lobby';

    this.roundIndex = 0;
    this.roundType = null;
    this.roundLetters = [];
    this.roundNumbers = [];
    this.roundTarget = 0;

    this.submissions = new Map();
    this.results = null;
    this.finalScores = null;
    this.solution = null;
    this.bestWords = null;

    this.countdownEnd = 0;
    this.roundEnd = 0;
    this.resultsEnd = 0;
    this._ticker = null;
  }

  join(token, name, socketId) {
    const clean = String(name || '').trim().slice(0, 20) || 'Jugador';
    this.socketMap.set(socketId, token);
    let p = this.players.get(token);
    if (!p) {
      p = { id: token, name: clean, score: 0, connected: true };
      this.players.set(token, p);
    } else {
      p.name = clean;
      p.connected = true;
    }
    if (!this.hostId) this.hostId = token;
    this.broadcast();
    return p;
  }

  leave(socketId) {
    const token = this.socketMap.get(socketId);
    this.socketMap.delete(socketId);
    if (!token) return;
    const p = this.players.get(token);
    if (!p) return;
    if (this.state === 'lobby' || this.state === 'gameover') {
      this.players.delete(token);
      this.submissions.delete(token);
    } else if (p.connected) {
      p.connected = false;
    }
    if (this.hostId === token) {
      this.hostId = null;
      for (const [k, v] of this.players) {
        if (v.connected) {
          this.hostId = k;
          break;
        }
      }
    }
    this.broadcast();
  }

  snapshot() {
    return {
      room: this.cfg.ROOM_NAME,
      state: this.state,
      totalRounds: this.cfg.NUM_ROUNDS,
      roundNumber: this.roundIndex,
      roundType: this.roundType,
      hostId: this.hostId,
      countdownEnd: this.countdownEnd,
      roundEnd: this.roundEnd,
      resultsEnd: this.resultsEnd,
      roundLetters: this.roundLetters,
      roundNumbers: this.roundNumbers,
      roundTarget: this.roundTarget,
      minWordLength: this.cfg.MIN_WORD_LENGTH,
      roundSeconds: this.cfg.ROUND_TIME_SECONDS,
      countdownSeconds: this.cfg.COUNTDOWN_SECONDS,
      resultsSeconds: this.cfg.RESULTS_SECONDS,
      pointsExact: this.cfg.POINTS_EXACT,
      pointsClose: this.cfg.POINTS_CLOSE,
      results: this.results,
      solution: this.solution,
      bestWords: this.bestWords,
      finalScores: this.finalScores,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
        isHost: p.id === this.hostId,
      })),
    };
  }

  broadcast() {
    this.io.to(this.room).emit('state', this.snapshot());
  }

  startGame(byId) {
    if (byId !== this.hostId) return;
    if (this.state !== 'lobby' && this.state !== 'gameover') return;
    this.prune();
    for (const p of this.players.values()) p.score = 0;
    this.roundIndex = 0;
    this.results = null;
    this.finalScores = null;
    this.nextRound();
  }

  prune() {
    for (const [k, v] of this.players) {
      if (!v.connected) {
        this.players.delete(k);
        this.submissions.delete(k);
      }
    }
    if (this.hostId && !this.players.has(this.hostId)) {
      this.hostId = this.players.keys().next().value || null;
    }
  }

  nextRound() {
    this.roundIndex++;
    if (this.roundIndex > this.cfg.NUM_ROUNDS) {
      this.endGame();
      return;
    }
    this.roundType = this.roundIndex % 2 === 1 ? 'letters' : 'numbers';
    this.submissions.clear();
    this.results = null;
    this.solution = null;
    this.bestWords = null;

    if (this.roundType === 'letters') {
      this.roundLetters = this.drawLetters();
      setTimeout(() => {
        if (this.state === 'countdown' || this.state === 'playing') {
          this.bestWords = this.dict.longestWordsForLetters(this.roundLetters);
        }
      }, 200);
    } else {
      const d = this.drawNumbersSet();
      this.roundNumbers = d.numbers;
      this.roundTarget = d.target;
      setTimeout(() => {
        if (this.state === 'countdown' || this.state === 'playing') {
          this.solution = numbersSolver(this.roundNumbers, this.roundTarget);
        }
      }, 200);
    }

    this.state = 'countdown';
    this.countdownEnd = Date.now() + this.cfg.COUNTDOWN_SECONDS * 1000;
    this.broadcast();
    setTimeout(() => this.beginRound(), this.cfg.COUNTDOWN_SECONDS * 1000);
  }

  beginRound() {
    if (this.state !== 'countdown') return;
    this.state = 'playing';
    this.roundEnd = Date.now() + this.cfg.ROUND_TIME_SECONDS * 1000;
    this.broadcast();
    if (this._ticker) clearInterval(this._ticker);
    this._ticker = setInterval(() => {
      const rem = Math.max(0, Math.ceil((this.roundEnd - Date.now()) / 1000));
      if (rem === 0) clearInterval(this._ticker);
      this.io.to(this.room).emit('remaining', rem);
    }, 1000);
    setTimeout(() => this.endRound(), this.cfg.ROUND_TIME_SECONDS * 1000);
  }

  endRound() {
    if (this.state !== 'playing') return;
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
    this.state = 'results';
    this.resultsEnd = Date.now() + this.cfg.RESULTS_SECONDS * 1000;
    this.computeResults();
    this.broadcast();
    setTimeout(() => this.nextRound(), this.cfg.RESULTS_SECONDS * 1000);
  }

  endGame() {
    this.state = 'gameover';
    this.results = null;
    this.solution = null;
    this.bestWords = null;
    this.roundLetters = [];
    this.roundNumbers = [];
    this.roundTarget = 0;
    this.finalScores = [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ id: p.id, name: p.name, score: p.score }));
    this.broadcast();
  }

  computeResults() {
    if (this.roundType === 'letters') this.computeLettersResults();
    else this.computeNumbersResults();
  }

  computeLettersResults() {
    const entries = [];
    for (const [id, p] of this.players) {
      const sub = this.submissions.get(id) || { words: [] };
      const list = Array.isArray(sub.words) ? sub.words : [];
      let best = null;
      for (const w of list) {
        const n = this.dict.normalize(w);
        if (!n || n.length < this.cfg.MIN_WORD_LENGTH) continue;
        if (
          this.dict.isValid(n) &&
          this.dict.isBuildable(n, this.roundLetters) &&
          (!best || n.length > best.length)
        ) {
          best = n;
        }
      }
      entries.push({
        id,
        name: p.name,
        answer: best,
        length: best ? best.length : 0,
      });
    }
    const maxLen = Math.max(0, ...entries.map((e) => e.length));
    for (const e of entries) {
      const pts =
        e.length >= this.cfg.MIN_WORD_LENGTH && e.length === maxLen
          ? e.length
          : 0;
      e.points = pts;
      const p = this.players.get(e.id);
      if (p) p.score += pts;
    }
    this.results = { type: 'letters', rows: entries, maxLen };
  }

  computeNumbersResults() {
    const entries = [];
    for (const [id, p] of this.players) {
      const sub = this.submissions.get(id);
      let ok = false;
      let value = null;
      let expr = null;
      let dist = Infinity;
      if (sub && sub.ok) {
        ok = true;
        value = sub.value;
        expr = sub.expr;
        dist = Math.abs(value - this.roundTarget);
      }
      entries.push({ id, name: p.name, value, expr, dist, ok });
    }
    const exact = entries.filter((e) => e.ok && e.value === this.roundTarget);
    let winners = [];
    let pts = 0;
    if (exact.length) {
      winners = exact;
      pts = this.cfg.POINTS_EXACT;
    } else {
      const withVal = entries.filter((e) => e.ok);
      if (withVal.length) {
        const min = Math.min(...withVal.map((e) => e.dist));
        winners = withVal.filter((e) => e.dist === min);
        pts = this.cfg.POINTS_CLOSE;
      }
    }
    for (const e of entries) {
      e.points = winners.includes(e) ? pts : 0;
      const p = this.players.get(e.id);
      if (p) p.score += e.points;
    }
    this.results = { type: 'numbers', rows: entries, target: this.roundTarget };
  }

  submitWords(id, words, ack) {
    if (this.state !== 'playing' || this.roundType !== 'letters') {
      if (ack) ack({ ok: false });
      return;
    }
    const list = Array.isArray(words)
      ? words
          .slice(0, this.cfg.MAX_WORDS_PER_PLAYER)
          .map((w) => String(w || '').trim().slice(0, this.cfg.MAX_WORD_LENGTH))
          .filter(Boolean)
      : [];
    const prev = this.submissions.get(id) || {};
    this.submissions.set(id, { ...prev, words: list });
    if (ack) ack({ ok: true, count: list.length });
  }

  submitNumbers(id, expr, ack) {
    if (this.state !== 'playing' || this.roundType !== 'numbers') {
      if (ack) ack({ ok: false });
      return;
    }
    const r = execExpression(this.roundNumbers, expr);
    if (r.ok) {
      this.submissions.set(id, {
        ok: true,
        value: r.value,
        expr: normalizeExpr(expr),
      });
    } else {
      this.submissions.delete(id);
    }
    if (ack) ack({ ok: r.ok, value: r.value });
  }

  validateWord(word, ack) {
    const n = this.dict.normalize(word);
    const valid = n.length >= 1 && this.dict.isValid(n);
    if (ack) ack({ valid, length: n.length });
  }

  drawLetters() {
    const vowels = weightedSample(
      VOWELS,
      (ch) => VOWEL_WEIGHTS[ch] || 1,
      this.cfg.VOWELS_PER_ROUND
    );
    const consonants = weightedSample(
      CONSONANTS,
      (ch) => CONSONANT_WEIGHTS[ch] || 1,
      this.cfg.NUM_LETTERS - this.cfg.VOWELS_PER_ROUND
    );
    return shuffle([...vowels, ...consonants]);
  }

  drawNumbersSet() {
    const total = this.cfg.NUM_NUMBERS;
    const howManyBig = randint(1, Math.min(3, total - 1));
    const bigs = shuffle([...BIG_NUMBERS]).slice(0, howManyBig);
    const smalls = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(
      0,
      total - howManyBig
    );
    return {
      numbers: shuffle([...bigs, ...smalls]),
      target: randint(100, 999),
    };
  }
}

module.exports = {
  Game,
  numbersSolver,
  execExpression,
  shuffle,
  randint,
  VOWELS,
  CONSONANTS,
  BIG_NUMBERS,
};