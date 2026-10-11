'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3109;
const URL = `http://127.0.0.1:${PORT}`;
const dict = new Set(
  fs.readFileSync(path.join(process.cwd(), 'data', 'palabras.txt'), 'utf8').split(/\r?\n/)
);

let failures = 0;
function check(name, cond) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}

function countLetters(letters) {
  const c = {};
  for (const ch of letters) c[ch] = (c[ch] || 0) + 1;
  return c;
}

function bestBuildable(letters, minLen) {
  const have = countLetters(letters);
  let best = null;
  let bestLen = minLen - 1;
  for (const w of dict) {
    if (!w || w.length < minLen || w.length > letters.length) continue;
    const need = countLetters(w);
    let ok = true;
    for (const k in need) if (need[k] > (have[k] || 0)) { ok = false; break; }
    if (ok && w.length > bestLen) { best = w; bestLen = w.length; }
  }
  return best;
}

async function connect(name, token) {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], reconnection: false, timeout: 8000 });
    s.on('connect', () =>
      s.emit('join', { token, name }, (res) => resolve({ s, res }))
    );
    s.on('connect_error', reject);
  });
}

function waitState(s, matcher, ms = 40000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      s.off('state', on);
      reject(new Error('timeout waiting state'));
    }, ms);
    function on(st) {
      if (matcher(st)) {
        clearTimeout(t);
        s.off('state', on);
        resolve(st);
      }
    }
    s.on('state', on);
  });
}

function ack(s, ev, payload, timeout = 5000) {
  return new Promise((resolve, reject) => {
    s.timeout(timeout).emit(ev, payload, (err, res) =>
      err ? reject(err) : resolve(res)
    );
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      COUNTDOWN_SECONDS: '2',
      ROUND_TIME_SECONDS: '4',
      RESULTS_SECONDS: '2',
      NUM_ROUNDS: '4',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d}`));

  // esperar a que escuche
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${URL}/api/health`);
      if (res.ok) { ready = true; break; }
    } catch { /* noop */ }
    await sleep(250);
  }
  if (!ready) throw new Error('el servidor no arrancó');

  const health = await (await fetch(`${URL}/api/health`)).json();
  check('health reporta diccionario cargado', health.ok === true && health.words > 100000);

  const A = await connect('Ana', 't-aaa');
  const B = await connect('Beto', 't-bbb');
  check('login A', A.res.ok === true && A.res.me === 't-aaa');
  check('login B', B.res.ok === true && B.res.me === 't-bbb');
  check('A es anfitrión (primer en entrar)', A.res.state.hostId === 't-aaa');

  const expected = { 't-aaa': 0, 't-bbb': 0 };

  // ---- ronda 1: LETRAS, empate ----
  A.s.emit('start_game');
  let st = await waitState(A.s, (s) => s.state === 'playing' && s.roundType === 'letters' && s.roundNumber === 1);
  check('ronda 1 letras jugándose', st.roundType === 'letters');

  let r = await ack(A.s, 'validate_word', 'CASA');
  check('validate_word CASA = true', r && r.valid === true);
  r = await ack(A.s, 'validate_word', 'ZZZQQ');
  check('validate_word ZZZQQ = false', r && r.valid === false);

  const w1 = bestBuildable(st.roundLetters, st.minWordLength);
  console.log('  mejor palabra ronda 1:', w1 || '(ninguna)');
  await ack(A.s, 'submit_words', w1 ? [w1] : []);
  await ack(B.s, 'submit_words', w1 ? [w1] : []);
  check('roundLetters trae 10 letras y 4 vocales',
    st.roundLetters.length === 10 && st.roundLetters.filter((c) => 'AEIOU'.includes(c)).length === 4);

  st = await waitState(A.s, (s) => s.state === 'results' && s.roundNumber === 1);
  check('resultados ronda 1 (letras) detectan empate',
    st.results.rows.length === 2 &&
    st.results.rows.every((e) => e.points === (w1 ? w1.length : 0)));
  if (w1) {
    expected['t-aaa'] += w1.length;
    expected['t-bbb'] += w1.length;
  }
  check('bestWords visibles en resultados', Array.isArray(st.bestWords));

  A.s.emit('next_round');

  // ---- ronda 2: CIFRAS, solo A juega ----
  st = await waitState(A.s, (s) => s.state === 'playing' && s.roundType === 'numbers' && s.roundNumber === 2);
  const n1 = st.roundNumbers[0];
  const n2 = st.roundNumbers[1];
  console.log(`  ronda 2 objetivo=${st.roundTarget} números=${st.roundNumbers.join(',')}`);
  check('ronda 2: 6 números distintos',
    st.roundNumbers.length === 6 && new Set(st.roundNumbers).size === 6);
  r = await ack(A.s, 'submit_numbers', { start: 9999, steps: [] });
  check('número ajeno rechazado', r.ok === false);
  r = await ack(A.s, 'submit_numbers', { start: n1, steps: [{ op: '+', n: n2 }] });
  check('expresión válida aceptada', r.ok === true && r.value === n1 + n2);

  st = await waitState(A.s, (s) => s.state === 'results' && s.roundNumber === 2);
  const aRow = st.results.rows.find((e) => e.name === 'Ana');
  const bRow = st.results.rows.find((e) => e.name === 'Beto');
  check('ronda 2: Ana puntúa (8 o 10) y Beto no',
    (aRow.points === 8 || aRow.points === 10) && bRow.points === 0);
  aRow.points === 10 ? (expected['t-aaa'] += 10) : (expected['t-aaa'] += 8);
  check('solución de cifras visibles en resultados', st.solution && st.solution.value != null);

  A.s.emit('next_round');

  // ---- ronda 3: LETRAS, solo B juega ----
  st = await waitState(A.s, (s) => s.state === 'playing' && s.roundType === 'letters' && s.roundNumber === 3);
  const w3 = bestBuildable(st.roundLetters, st.minWordLength);
  await ack(B.s, 'submit_words', w3 ? [w3] : []);
  st = await waitState(A.s, (s) => s.state === 'results' && s.roundNumber === 3);
  const a3 = st.results.rows.find((e) => e.name === 'Ana');
  const b3 = st.results.rows.find((e) => e.name === 'Beto');
  check('ronda 3: solo Beto puntúa', a3.points === 0 && b3.points === (w3 ? w3.length : 0));
  if (w3) expected['t-bbb'] += w3.length;

  A.s.emit('next_round');

  // ---- ronda 4: CIFRAS, los dos ----
  st = await waitState(A.s, (s) => s.state === 'playing' && s.roundType === 'numbers' && s.roundNumber === 4);
  const x1 = st.roundNumbers[2];
  const x2 = st.roundNumbers[3];
  const x3 = st.roundNumbers[4];
  r = await ack(A.s, 'submit_numbers', {
    start: { start: x1, steps: [{ op: '+', n: x2 }] },
    steps: [{ op: '+', n: x3 }],
  });
  check('expresión con paréntesis aceptada', r.ok === true && r.value === x1 + x2 + x3);
  await ack(B.s, 'submit_numbers', { start: x1, steps: [{ op: '+', n: x2 }] });
  st = await waitState(A.s, (s) => s.state === 'results' && s.roundNumber === 4);
  for (const e of st.results.rows) {
    const pts = e.points;
    if (pts > 0) {
      if (e.value === st.roundTarget) { expected[e.id === 't-aaa' ? 't-aaa' : 't-bbb'] += 10; }
      else expected[e.id === 't-aaa' ? 't-aaa' : 't-bbb'] += 8;
    }
  }
  check('ronda 4: al menos un ganador en cifras', st.results.rows.some((e) => e.points > 0));

  A.s.emit('next_round');

  // ---- fin de partida ----
  st = await waitState(A.s, (s) => s.state === 'gameover', 50000);
  if (!st.finalScores) console.log('  gameover keys:', Object.keys(st).join(','));
  check('llega a game over', Array.isArray(st.finalScores) && st.finalScores.length === 2);
  const fin = {};
  for (const f of st.finalScores) fin[f.name] = f.score;
  check('puntuación final correcta (Ana)',
    fin.Ana === expected['t-aaa'] && fin.Ana === expected['t-aaa']);
  check('puntuación final correcta (Beto)', fin.Beto === expected['t-bbb']);
  console.log('  puntuaciones esperadas:', expected, 'obtenidas:', JSON.stringify(fin));

  // ---- nueva partida del anfitrión ----
  A.s.emit('start_game');
  st = await waitState(A.s, (s) => s.state === 'countdown' && s.roundNumber === 1);
  check('nueva partida arranca de nuevo', st.roundNumber === 1 && st.totalRounds === 4);

  console.log(failures === 0 ? '\nE2E OK' : `\nE2E: ${failures} fallos`);

  A.s.close();
  B.s.close();
  server.kill();
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('E2E ERROR:', e.message);
  process.exit(1);
});