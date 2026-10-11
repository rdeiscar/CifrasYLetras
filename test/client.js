'use strict';

/* Test de cliente con jsdom: reproduce el flujo real de la ronda de CIFRAS
   (teclas, paréntesis, grupos) contra la lógica real de app.js y valida cada
   envío con el validador del servidor. */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { execExpression } = require(path.join(process.cwd(), 'server', 'game'));

let checks = 0;
let failures = 0;
function check(name, ok, extra) {
  checks += 1;
  if (ok) console.log('  PASS ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + (extra != null ? '  [' + extra + ']' : ''));
  }
}

const pub = (p) => path.join(process.cwd(), 'public', p);

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(String((e && e.message) || e)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs
  .readFileSync(pub('index.html'), 'utf8')
  .replace(/<script\b[^>]*>\s*<\/script>/gi, '');

const dom = new JSDOM(html, {
  url: 'http://localhost:3000/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;
const document = window.document;

const handlers = {};
const sent = [];
const socket = {
  emit(ev, ...args) {
    sent.push({ ev, args: args.slice() });
    const cb = args[args.length - 1];
    if (ev === 'join' && typeof cb === 'function') {
      cb({
        ok: true,
        me: 'p1',
        state: {
          state: 'lobby',
          room: 'Sala',
          players: [{ id: 'p1', name: 'Ana', score: 0, connected: true, isHost: true }],
          totalRounds: 8,
          roundSeconds: 60,
          hostId: 'p1',
        },
      });
    } else if (typeof cb === 'function') {
      cb({ ok: true });
    }
  },
  on(ev, fn) {
    (handlers[ev] = handlers[ev] || []).push(fn);
  },
};
const fire = (ev, ...args) => (handlers[ev] || []).slice().forEach((fn) => fn(...args));

window.io = () => socket;
window.sessionStorage.setItem('cyl_name', 'Ana');
window.eval(fs.readFileSync(pub('js/sfx.js'), 'utf8'));
window.eval(fs.readFileSync(pub('js/app.js'), 'utf8'));
fire('connect');

const ROUND_NUMBERS = [4, 3, 6, 8, 10, 25];

fire('state', {
  state: 'playing',
  room: 'Sala',
  roundType: 'numbers',
  roundNumber: 2,
  totalRounds: 8,
  roundNumbers: ROUND_NUMBERS,
  roundTarget: 300,
  maxAttempts: 10,
  roundSeconds: 60,
  roundEnd: Date.now() + 60000,
  countdownSeconds: 5,
  countdownEnd: 0,
  resultsSeconds: 12,
  resultsEnd: 0,
  players: [{ id: 'p1', name: 'Ana', score: 0, connected: true, isHost: true }],
  hostId: 'p1',
  minWordLength: 3,
  roundLetters: [],
  bestWords: null,
  solution: null,
  finalScores: null,
});

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const numTile = (v) => $(`.number-tile[data-value="${v}"]`);
const groupTiles = () => $$('.groups-row .group-tile');
const poolTiles = () => $$('.numbers-pool .number-tile');
const chainText = () => {
  const c = $('.chain');
  return c ? c.textContent.replace(/\s+/g, ' ').trim() : '';
};
const chainCompact = () => chainText().replace(/\s/g, '');
const resultValue = () => {
  const r = $('.result-value');
  return r ? r.textContent.trim() : null;
};
const trayLabel = () => {
  const t = $('.numbers-pool .tray-label');
  return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
};
const op = (o) => $(`.op-btn[data-op="${o}"]`);
const action = (a) => $(`[data-action="${a}"]`);
const lastSub = () => {
  for (let i = sent.length - 1; i >= 0; i--) {
    if (sent[i].ev === 'submit_numbers') return sent[i].args[0];
  }
  return null;
};
const lastSubList = () => {
  const s = lastSub();
  if (Array.isArray(s)) return s;
  return s ? [s] : [];
};
const submitValue = () => {
  const list = lastSubList();
  const expr = list.length ? list[list.length - 1] : { start: 0, steps: [] };
  return execExpression(ROUND_NUMBERS, expr);
};

function tap(el) {
  const o = { bubbles: true, cancelable: true, clientX: 5, clientY: 5, button: 0 };
  el.dispatchEvent(new window.MouseEvent('pointerdown', o));
  el.dispatchEvent(new window.MouseEvent('pointerup', o));
}
function click(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

/* ---------------- escenario ---------------- */

check('la ronda pinta 6 fichas de números', poolTiles().length === 6, poolTiles().length);

tap(numTile(4));
click(op('−'));
tap(numTile(3));
check('cadena "4−3"', chainCompact().includes('4−3'), chainText());
check('resultado parcial = 1', resultValue() === '1', resultValue());
check('pool en 4 (4 y 3 usados)', poolTiles().length === 4, poolTiles().length);

click(action('close-group'));
check('grupo guardado con su fórmula', groupTiles().length === 1 && groupTiles()[0].textContent.includes('4 − 3'), groupTiles().length);
check('grupo muestra "= 1"', groupTiles()[0].textContent.includes('= 1'));
check('cadena vacía tras cerrar', chainText().includes('paréntesis'), chainText());
check('pool sigue en 4', poolTiles().length === 4, poolTiles().length);

tap(groupTiles()[0]);
check('USAR grupo: entra en la cadena', chainText().includes('(4 − 3)') && chainText().includes('= 1'), chainText());
check('USAR grupo: resultado = 1', resultValue() === '1', resultValue());
check('USAR grupo: pool en 4 (sin doble cómputo)', poolTiles().length === 4, poolTiles().length);
check('contador "quedan 4"', trayLabel().includes('quedan 4'), trayLabel());
let r = submitValue();
check('servidor acepta el paréntesis suelto (=1)', r.ok && r.value === 1, JSON.stringify(r));

click(op('+'));
tap(numTile(6));
check('sigue operando: 1 + 6 = 7', resultValue() === '7', resultValue());
check('pool en 3 tras usar el 6', poolTiles().length === 3, poolTiles().length);
r = submitValue();
check('servidor acepta (4 − 3) + 6 = 7', r.ok && r.value === 7, JSON.stringify(r));

click(action('close-group'));
check('segundo grupo creado', groupTiles().length === 2, groupTiles().length);
check('segundo grupo "= 7"', groupTiles()[1].textContent.includes('= 7'));
check('pool en 3 con dos grupos', poolTiles().length === 3, poolTiles().length);

tap(groupTiles()[0]);
check(
  'un paréntesis ya usado no se puede reutilizar',
  chainText().includes('paréntesis') && resultValue() === '—',
  chainText() + ' | ' + resultValue()
);
tap(groupTiles()[1]);
check('el paréntesis nuevo sí se puede usar', resultValue() === '7', resultValue());
check('pool en 3 usando el paréntesis nuevo', poolTiles().length === 3, poolTiles().length);

click(action('clear-number'));
check('vaciar deja los grupos y libera la cadena', groupTiles().length === 2 && chainText().includes('paréntesis'), chainText());
check('vaciar mantiene el pool en 3', poolTiles().length === 3, poolTiles().length);

click(groupTiles()[0].querySelector('.remove'));
check('no deja borrar un paréntesis contenido en otro', groupTiles().length === 2, groupTiles().length);

click(groupTiles()[1].querySelector('.remove'));
check('sí deja borrar el paréntesis que no lo contiene', groupTiles().length === 1, groupTiles().length);
check('al borrarlo vuelven sus números: pool en 4', poolTiles().length === 4, poolTiles().length);

tap(numTile(6));
click(op('+'));
tap(numTile(8));
check('nuevo grupo independiente 6 + 8', resultValue() === '14', resultValue());
click(action('close-group'));
check('dos grupos disjuntos', groupTiles().length === 2, groupTiles().length);
check('pool en 2', poolTiles().length === 2, poolTiles().length);

tap(groupTiles()[0]);
click(op('×'));
tap(groupTiles()[1]);
check('combinación de grupos disjuntos = 14', resultValue() === '14', resultValue());
check('pool en 2 con ambos en la cadena', poolTiles().length === 2, poolTiles().length);
r = submitValue();
check('servidor acepta (4 − 3) × (6 + 8) = 14', r.ok && r.value === 14, JSON.stringify(r));

tap(groupTiles()[0]);
check('no deja repetir el mismo paréntesis en la cadena', chainText().split('(4 − 3)').length === 2, chainText());

/* ---------------- varios intentos ---------------- */

click(action('clear-number'));
tap(numTile(25));
click(op('+'));
tap(numTile(10));
click(action('save-attempt'));
check('guardar resultado crea un intento', $$('.attempt-tile').length === 1, $$('.attempt-tile').length);
check('al guardar se recuperan todos los números', poolTiles().length === 6, poolTiles().length);
check('el resultado actual se vacía y muestra el mejor guardado', resultValue() === '35', resultValue());

tap(numTile(25));
click(op('×'));
tap(numTile(10));
click(action('save-attempt'));
check('se pueden guardar varios intentos', $$('.attempt-tile').length === 2, $$('.attempt-tile').length);
check('el mejor intento se resalta', $$('.attempt-tile.best').length === 1, $$('.attempt-tile.best').length);
check(
  'se envían todos los intentos al servidor',
  lastSubList().length === 2 && submitValue().ok,
  JSON.stringify(lastSubList())
);

click($$('.attempt-tile')[1].querySelector('.remove'));
check('se puede borrar un intento', $$('.attempt-tile').length === 1, $$('.attempt-tile').length);

/* ---------------- escenario LETRAS: la bandeja se vacía y se restaura ---------------- */

const LETTERS = ['C', 'A', 'S', 'A', 'R', 'T', 'O', 'L', 'M', 'I'];

fire('state', {
  state: 'playing',
  room: 'Sala',
  roundType: 'letters',
  roundNumber: 3,
  totalRounds: 8,
  roundNumbers: [],
  roundTarget: 0,
  roundLetters: LETTERS,
  roundSeconds: 60,
  roundEnd: Date.now() + 60000,
  countdownSeconds: 5,
  countdownEnd: 0,
  resultsSeconds: 12,
  resultsEnd: 0,
  players: [{ id: 'p1', name: 'Ana', score: 0, connected: true, isHost: true }],
  hostId: 'p1',
  minWordLength: 3,
  bestWords: null,
  solution: null,
  finalScores: null,
});

const trayTiles = () => $$('.letters-tray .letter-tile');
const letterTile = (ch) => $(`.letters-tray .letter-tile[data-value="${ch}"]`);
const rowsEls = () => $$('.word-row');
const builtLetters = () => $$('.built-letter');

check('bandeja de letras con 10 fichas', trayTiles().length === 10, trayTiles().length);
check('etiqueta explica la bandeja', $('.letters-tray .tray-label').textContent.includes('Nueva palabra'));

tap(letterTile('C'));
click($('.new-word-btn'));
check('palabra creada con la C', builtLetters().length === 1 && builtLetters()[0].textContent.includes('C'), builtLetters().length);
check('la C desaparece de la bandeja', trayTiles().length === 9 && !letterTile('C'), trayTiles().length);

tap(letterTile('A'));
click(rowsEls()[0]);
check('la A entra en la palabra', builtLetters().length === 2, builtLetters().length);
check('bandeja en 8 tras usar C y A', trayTiles().length === 8, trayTiles().length);
check('queda una A (había dos)', trayTiles().filter((t) => t.dataset.value === 'A').length === 1);

click($('.new-word-btn'));
check('Nueva palabra crea una segunda fila', rowsEls().length === 2, rowsEls().length);
check('Nueva palabra restaura las 10 letras', trayTiles().length === 10, trayTiles().length);
check('la primera palabra conserva sus letras', builtLetters().length === 2, builtLetters().length);

tap(letterTile('S'));
click(rowsEls()[0]);
check('añadir a la primera palabra deja la bandeja en 7', trayTiles().length === 7, trayTiles().length);

click(rowsEls()[1]);
check('tocar la otra palabra restaura la bandeja a 10', trayTiles().length === 10, trayTiles().length);
check('las dos filas siguen intactas', rowsEls().length === 2 && builtLetters().length === 3, builtLetters().length);

tap(letterTile('O'));
tap(letterTile('O'));
check(
  'doble toque añade la letra a la última palabra',
  rowsEls().length === 2 && rowsEls()[1].querySelectorAll('.built-letter').length === 1,
  rowsEls().map((r) => r.querySelectorAll('.built-letter').length).join('/')
);
check('la O pasa a estar en uso en esa palabra', trayTiles().length === 9 && !letterTile('O'), trayTiles().length);
check('la primera palabra no ha cambiado', rowsEls()[0].querySelectorAll('.built-letter').length === 3, rowsEls()[0].querySelectorAll('.built-letter').length);

check('ninguna excepción no capturada en el cliente', errors.length === 0, errors.join(' | '));

window.close();

console.log(failures === 0 ? '\nCLIENT OK' : `\nCLIENT: ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
