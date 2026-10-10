(function () {
  'use strict';

  const socket = io();
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const loginScreen = $('#login-screen');
  const app = $('#app');
  const stage = $('#stage');
  const leaderboard = $('#leaderboard');
  const timerText = $('#timer-text');
  const timerRing = $('#timer-ring');

  const RING_LEN = 106.8;

  let me = null;
  let state = null;
  let myName = sessionStorage.getItem('cyl_name') || '';
  let token = localStorage.getItem('cyl_token') || '';

  let letters = null;
  let numbers = null;
  let localRound = -1;
  let syncTimer = null;
  let lastLetterTap = null;

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function uid() {
    return 'r' + Math.random().toString(36).slice(2, 9);
  }

  let toastEl = null;
  let toastTimer = null;
  function toast(msg, isError) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      toastEl.className = 'hidden';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', !!isError);
    toastEl.classList.remove('hidden');
    if (isError) sfx('error');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  function sfx(name) {
    try {
      if (window.Sfx) window.Sfx.play(name);
    } catch (e) {
      /* sin audio */
    }
  }

  function confetti(count) {
    try {
      const box = $('#confetti');
      if (!box) return;
      const colors = ['#f2b705', '#ffd84d', '#3ddc84', '#17a2b8', '#ff5d5d', '#b06ae0'];
      for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.className = 'confetti-piece';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
        p.style.animationDuration = (1.6 + Math.random() * 1.4).toFixed(2) + 's';
        p.style.width = (5 + Math.random() * 7).toFixed(0) + 'px';
        p.style.height = (8 + Math.random() * 8).toFixed(0) + 'px';
        box.appendChild(p);
        setTimeout(() => p.remove(), 3600);
      }
    } catch (e) {
      /* sin confeti */
    }
  }

  function spawnFloatingLetters() {
    try {
      const box = $('#bg-float');
      if (!box || box.childElementCount) return;
      const chars = 'ABCDEFGLMNOPRSTUVXYZ0123456789+−×÷'.split('');
      for (let i = 0; i < 16; i++) {
        const s = document.createElement('span');
        s.className = 'float-letter';
        s.textContent = chars[Math.floor(Math.random() * chars.length)];
        s.style.left = (Math.random() * 96).toFixed(1) + 'vw';
        s.style.animationDelay = (Math.random() * 18).toFixed(1) + 's';
        s.style.animationDuration = (16 + Math.random() * 16).toFixed(1) + 's';
        s.style.fontSize = (18 + Math.random() * 34).toFixed(0) + 'px';
        box.appendChild(s);
      }
    } catch (e) {
      /* sin fondo */
    }
  }

  let lastShownValue = null;

  function stateSounds(prev) {
    if (!prev) return;
    const was = prev.state;
    const now = state.state;
    if (now === 'playing' && was !== 'playing') {
      sfx('round');
    } else if (now === 'results' && was !== 'results') {
      const rows = (state.results && state.results.rows) || [];
      const mine = rows.find((r) => r.id === me);
      if (mine && mine.points > 0) {
        sfx('score');
        const top = Math.max(0, ...rows.map((r) => r.points));
        confetti(mine.points >= top ? 80 : 40);
      } else {
        sfx('miss');
      }
    } else if (now === 'gameover' && was !== 'gameover') {
      const list = state.finalScores || [];
      const first = list[0];
      const iWon = first && (first.id === me || first.name === myName);
      sfx(iWon ? 'win' : 'lose');
      if (iWon) confetti(140);
    }
  }

  const muteBtn = $('#mute-btn');
  function syncMuteBtn() {
    if (!muteBtn) return;
    const muted = !!(window.Sfx && window.Sfx.muted);
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.title = muted ? 'Activar sonido' : 'Silenciar';
    muteBtn.classList.toggle('muted', muted);
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      try {
        if (window.Sfx) window.Sfx.toggleMute();
      } catch (e) {
        /* sin audio */
      }
      syncMuteBtn();
    });
    syncMuteBtn();
  }

  window.addEventListener(
    'pointerdown',
    () => {
      try {
        if (window.Sfx) window.Sfx.unlock();
      } catch (e) {
        /* sin audio */
      }
    },
    { once: true }
  );
  spawnFloatingLetters();

  function typeLabel(t) {
    return t === 'letters' ? 'LETRAS' : t === 'numbers' ? 'CIFRAS' : '';
  }

  function connectedPlayers(pl) {
    return (pl || []).filter((p) => p.connected);
  }

  /* ---------------- login ---------------- */

  function joinRoom(name) {
    const clean = (name || '').trim();
    if (!clean) {
      $('#login-error').textContent = 'Escribe tu nombre para entrar.';
      $('#login-error').classList.remove('hidden');
      return;
    }
    myName = clean.slice(0, 20);
    sessionStorage.setItem('cyl_name', myName);
    if (!token) {
      token =
        't' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem('cyl_token', token);
    }
    socket.emit('join', { token, name: myName }, (res) => {
      if (res && res.ok) {
        me = res.me;
        if (res.state) state = res.state;
        loginScreen.classList.add('hidden');
        $('#login-error').classList.add('hidden');
        app.classList.remove('hidden');
        render();
      }
    });
  }

  $('#btn-join').addEventListener('click', () => joinRoom($('#nickname').value));
  $('#nickname').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom($('#nickname').value);
  });

  socket.on('connect', () => {
    if (myName) joinRoom(myName);
  });

  socket.on('state', (s) => {
    const prev = state;
    state = s;
    if (me) {
      stateSounds(prev);
      render();
    }
  });

  /* ---------------- timer ---------------- */

  let lastCdRem = -1;
  let lastPlayRem = -1;

  function updateClock() {
    if (!state) return;
    const now = Date.now();
    let total = 0;
    let left = 0;
    let kind = 'idle';

    if (state.state === 'countdown') {
      total = state.countdownSeconds * 1000;
      left = state.countdownEnd - now;
      kind = 'countdown';
    } else if (state.state === 'playing') {
      total = state.roundSeconds * 1000;
      left = state.roundEnd - now;
      kind = 'playing';
    } else if (state.state === 'results') {
      total = state.resultsSeconds * 1000;
      left = state.resultsEnd - now;
      kind = 'results';
    }

    left = Math.max(0, left);
    const rem = Math.ceil(left / 1000);
    timerText.textContent = rem > 99 ? '99' : String(rem);

    const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
    timerRing.style.strokeDashoffset = String(RING_LEN * (1 - frac));

    const dangerous = kind === 'playing' && rem <= 10;
    timerRing.style.stroke = dangerous ? 'var(--bad)' : 'var(--gold)';
    const timerEl = $('#timer');
    if (timerEl) timerEl.classList.toggle('urgent', dangerous);

    if (kind === 'countdown') {
      if (rem !== lastCdRem) {
        if (rem >= 1 && rem <= 3) sfx('tick');
        lastCdRem = rem;
      }
    } else {
      lastCdRem = -1;
    }

    if (kind === 'playing') {
      if (rem !== lastPlayRem && rem >= 1 && rem <= 5) sfx('tick');
      lastPlayRem = rem;
    } else {
      lastPlayRem = -1;
    }

    const cd = $('#cd-num');
    if (cd) cd.textContent = String(Math.max(0, rem));
  }

  setInterval(updateClock, 200);

  /* ---------------- leaderboard ---------------- */

  function renderLeaderboard() {
    const players = (state.players || [])
      .filter((p) => p.connected)
      .slice()
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const rows = players
      .map(
        (p) =>
          `<div class="lb-player${p.id === me ? ' me' : ''}">
            ${p.isHost ? '<span class="lb-host">👑</span>' : ''}
            <span class="lb-name">${esc(p.name)}</span>
            ${p.id === me ? '<span class="lb-you">tú</span>' : ''}
            <span class="lb-score">${p.score}</span>
          </div>`
      )
      .join('');

    leaderboard.innerHTML =
      `<div class="lb-title">Jugadores · ${players.length}</div>` +
      (rows || '<div class="waiting-note">Aún no hay jugadores</div>');
  }

  /* ---------------- stage renderer ---------------- */

  function resetLocalState() {
    if (state.roundNumber !== localRound) {
      localRound = state.roundNumber;
      letters = null;
      numbers = null;
      lastShownValue = null;
    }
  }

  function render() {
    updateTopbar();
    renderLeaderboard();
    resetLocalState();
    const s = state.state;
    if (s === 'lobby') renderLobby();
    else if (s === 'gameover') renderGameOver();
    else if (s === 'countdown') renderCountdown();
    else if (s === 'playing') stage.innerHTML = '';
    else if (s === 'results') renderResults();
    if (s === 'playing') {
      if (state.roundType === 'letters') renderLettersRound();
      else renderNumbersRound();
    }
  }

  function updateTopbar() {
    $('#room-name').textContent = state.room || 'Sala';
    const total = state.totalRounds;
    if (state.state === 'lobby') {
      $('#round-badge').textContent = 'Sala de espera';
    } else if (state.state === 'gameover') {
      $('#round-badge').textContent = '¡Partida terminada!';
    } else if (state.state === 'countdown') {
      $('#round-badge').textContent =
        `Ronda ${state.roundNumber}/${total} · ${typeLabel(state.roundType)}`;
    } else if (state.state === 'playing') {
      $('#round-badge').textContent =
        `Ronda ${state.roundNumber}/${total} · ${typeLabel(state.roundType)}`;
    } else if (state.state === 'results') {
      $('#round-badge').textContent = `Ronda ${state.roundNumber}/${total} · Resultados`;
    }
  }

  /* ---------------- lobby ---------------- */

  function renderLobby() {
    const players = connectedPlayers(state.players);
    const isHost = me === state.hostId;
    stage.innerHTML = `
      <div class="panel">
        <h2 class="panel-title">🔊 Sala de espera</h2>
        <p class="waiting-note">Los que estéis conectados competiréis en
          <b>${state.totalRounds}</b> rondas alternas: una de LETRAS y otra de CIFRAS.
          Cada ronda dura <b>${state.roundSeconds} s</b>.</p>
        <div class="lobby-list">
          ${players
            .map(
              (p) =>
                `<div class="lobby-each">
                   ${p.isHost ? '👑 ' : '🕹️ '}
                   <span>${esc(p.name)}</span>
                   ${p.id === me ? '<span class="lb-you">tú</span>' : ''}
                 </div>`
            )
            .join('')}
        </div>
        ${
          isHost
            ? `<div class="action-row">
                 <button class="btn primary big" data-action="start">Comenzar la partida</button>
               </div>`
            : `<p class="waiting-note">Esperando a que <b>${esc(
                hostName()
              )}</b> comience la partida…</p>`
        }
        <div class="notice">
          <b>Reglas:</b> en LETRAS debes formar la palabra más larga posible (1 punto por letra).
          En CIFRAS, acércate o clava el número objetivo con sumas, restas, multiplicaciones y
          divisiones (10 pts exacto, 8 pts aproximación); con «(...) Cerrar grupo» guardas un
          paréntesis con su resultado y lo reutilizas. En empate puntúan todos los implicados.
        </div>
      </div>`;
  }

  function hostName() {
    const h = (state.players || []).find((p) => p.id === state.hostId);
    return h ? h.name : '…';
  }

  /* ---------------- game over ---------------- */

  function renderGameOver() {
    const list = (state.finalScores || []).slice();
    const isHost = me === state.hostId;
    const players = connectedPlayers(state.players);
    stage.innerHTML = `
      <div class="panel">
        <h2 class="panel-title">🏁 ¡Partida terminada!</h2>
        <table class="results-table">
          <tr><th></th><th>Jugador</th><th>Puntos</th></tr>
          ${list
            .map(
              (s, i) =>
                `<tr class="${i === 0 ? 'winner' : ''}">
                   <td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                   <td><b>${esc(s.name)}</b></td>
                   <td class="points">${s.score}</td>
                 </tr>`
            )
            .join('')}
        </table>
        ${
          players.length
            ? isHost
              ? `<div class="action-row">
                   <button class="btn primary" data-action="newgame">Nueva partida</button>
                 </div>`
              : '<p class="waiting-note">Esperando a que el anfitrión lance una nueva partida…</p>'
            : '<p class="waiting-note">Ya no queda nadie en la sala.</p>'
        }
      </div>`;
  }

  /* ---------------- countdown ---------------- */

  function renderCountdown() {
    stage.innerHTML = `
      <div class="countdown-stage">
        <div class="countdown-label">Ronda ${state.roundNumber} · ${typeLabel(
          state.roundType
        )}</div>
        <div class="countdown-sub">Empieza en</div>
        <div class="countdown-number" id="cd-num">${Math.max(
          0,
          Math.ceil((state.countdownEnd - Date.now()) / 1000)
        )}</div>
      </div>`;
  }

  /* ========================================================= */
  /*  LETRAS                                                   */
  /* ========================================================= */

  function trayCounts() {
    const t = {};
    for (const ch of state.roundLetters) t[ch] = (t[ch] || 0) + 1;
    return t;
  }

  function available(letter) {
    if (!letters) return 0;
    const total = letters.tray[letter] || 0;
    const row = activeRowObj();
    if (!row) return total;
    const used = row.letters.filter((c) => c === letter).length;
    return Math.max(0, total - used);
  }

  function activeRowObj() {
    if (!letters || !letters.activeRow) return null;
    return letters.rows.find((r) => r.id === letters.activeRow) || null;
  }

  function initLetters() {
    letters = { tray: trayCounts(), rows: [], selected: null, activeRow: null };
  }

  function setActiveRow(rowId) {
    if (!letters) return;
    letters.activeRow = rowId;
    if (letters.selected && available(letters.selected) <= 0) letters.selected = null;
    renderStageOnly();
  }

  function newWord() {
    if (!letters) return;
    let row = letters.rows[letters.rows.length - 1];
    if (!row || row.letters.length) {
      row = { id: uid(), letters: [], status: '' };
      letters.rows.push(row);
    }
    letters.activeRow = row.id;
    if (letters.selected && available(letters.selected) > 0) {
      placeLetter(letters.selected, row.id);
      return;
    }
    letters.selected = null;
    renderStageOnly();
    scheduleSync();
  }

  function renderLettersRound() {
    if (!letters) initLetters();

    const trayTiles = Object.keys(letters.tray)
      .sort()
      .map((ch) =>
        new Array(available(ch))
          .fill(0)
          .map(
            () =>
              `<div class="tile letter-tile${'AEIOU'.includes(ch) ? ' vowel' : ''}${
                letters.selected === ch && available(ch) > 0 ? ' selected' : ''
              }" data-kind="letter" data-value="${ch}">${ch}</div>`
          )
          .join('')
      )
      .join('');

    const rows = letters.rows
      .map(
        (r) =>
          `<div class="word-row ${rowStatusClass(r)}${
            r.letters.length ? '' : ' empty-row'
          }" data-drop="letters-row" data-row="${r.id}">
            ${r.letters
              .map((ch, i) => chipLetter(ch, r.id, i))
              .join('')}
            <span class="word-meta ${rowMetaClass(r)}">${rowMetaText(r)}</span>
          </div>`
      )
      .join('');

    const summary = lettersSummary();

    stage.innerHTML = `
      <div class="panel">
        <div class="letters-tray">
          <div class="tray-label">Letras libres para esta palabra · ＋ Nueva palabra las restaura todas</div>
          <div class="tiles-row">${
            trayTiles ||
            `<div class="tile empty" style="width:auto;padding:0 14px;font-size:15px;">¡Las 10 usadas! Pulsa ＋ Nueva palabra</div>`
          }</div>
        </div>

        <div class="words-area">
          ${
            rows ||
            `<div class="empty-state">Arrastra letras aquí para formar tus palabras.
              Cada palabra puede usar las 10 letras. La más larga puntuará.</div>`
          }
          <button class="new-word-btn${letters.selected ? '' : ''}"
                  data-drop="letters-new">＋ Nueva palabra</button>
        </div>

        <div class="action-row">
          <button class="btn ghost" data-action="clear-words">Vaciar todas</button>
        </div>

        <div class="summary-strip">
          <span>Palabras: <b>${letters.rows.length}</b></span>
          <span>Mejor: <b>${summary.best || '—'}</b> (${summary.points} pts)</span>
          <span>Mínimo: <b>${state.minWordLength}</b> letras</span>
        </div>
        <p class="hint-text">Cada letra que usas desaparece de la bandeja: te dice qué te queda
           para esta palabra. Doble toque en una letra la añade al final de tu última palabra.
           ＋ Nueva palabra vuelve a mostrar las 10. Toca ✕ para borrar una letra.</p>
      </div>`;
  }

  function chipLetter(ch, rowId, index) {
    return `<div class="built-letter" data-row="${rowId}" data-index="${index}">
              ${ch}
              <span class="remove" data-row="${rowId}" data-index="${index}">✕</span>
            </div>`;
  }

  function rowStatusClass(r) {
    if (!r.letters.length) return 'empty-row';
    if (r.status === 'ok') return 'valid';
    if (r.status === 'bad') return 'invalid';
    return '';
  }

  function rowMetaClass(r) {
    if (r.status === 'ok') return 'ok';
    if (r.status === 'bad') return 'bad';
    return '';
  }

  function rowMetaText(r) {
    if (!r.letters.length) return '';
    if (r.status === 'ok') {
      return `✔ válida · ${r.letters.length} letras`;
    }
    if (r.status === 'bad') return '✘ no está en el diccionario';
    if (r.status === 'short') return `mínimo ${state.minWordLength} letras`;
    return 'comprobando…';
  }

  function lettersSummary() {
    let best = '';
    let bestLen = 0;
    for (const r of letters.rows) {
      if (r.status === 'ok' && r.letters.length > bestLen) {
        bestLen = r.letters.length;
        best = r.letters.join('');
      }
    }
    return { best, points: bestLen };
  }

  function placeLetter(letter, rowKey) {
    if (!letters) return;
    const maxInSet = letters.tray[letter] || 0;
    if (maxInSet <= 0) return;

    let row = null;
    if (rowKey && rowKey !== '_new') {
      row = letters.rows.find((r) => r.id === rowKey);
      if (!row) return;
    } else {
      row = letters.rows[letters.rows.length - 1];
      if (!row || row.letters.length) {
        row = { id: uid(), letters: [], status: '' };
        letters.rows.push(row);
      }
    }

    const usedInRow = row.letters.filter((ch) => ch === letter).length;
    if (usedInRow >= maxInSet) {
      toast(
        `La letra ${letter} solo aparece ${maxInSet} vez${maxInSet > 1 ? 'es' : ''} en el juego`,
        true
      );
      return;
    }

    row.letters.push(letter);
    row.status = '';
    letters.activeRow = row.id;
    letters.selected = null;
    sfx('letter');
    renderStageOnly();
    scheduleSync();
  }

  function removeLetter(rowId, index) {
    if (!letters) return;
    const row = letters.rows.find((r) => r.id === rowId);
    if (!row || row.letters.length <= index) return;
    row.letters.splice(index, 1);
    row.status = row.letters.length ? '' : 'empty';
    if (!row.letters.length) {
      letters.rows = letters.rows.filter((r) => r.id !== rowId);
      if (letters.activeRow === rowId) letters.activeRow = null;
    }
    sfx('undo');
    renderStageOnly();
    scheduleSync();
  }

  function clearAllWords() {
    if (!letters) return;
    letters.rows = [];
    letters.selected = null;
    letters.activeRow = null;
    sfx('clear');
    renderStageOnly();
    scheduleSync();
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncWords, 180);
  }

  function syncWords() {
    if (!letters || !state || state.state !== 'playing' || state.roundType !== 'letters') return;
    const words = letters.rows.map((r) => r.letters.join('')).filter(Boolean);
    socket.emit('submit_words', words);

    let pending = 0;
    for (const r of letters.rows) {
      if (!r.letters.length) continue;
      const word = r.letters.join('');
      if (word.length === 1) {
        r.status = 'short';
        continue;
      }
      pending++;
      socket.emit('validate_word', word, (res) => {
        pending--;
        const row = letters.rows.find((x) => x.id === r.id);
        if (!row) return;
        const was = row.status;
        if (word.length < state.minWordLength) row.status = 'short';
        else row.status = res && res.valid ? 'ok' : 'bad';
        if (row.status === 'ok' && was !== 'ok') sfx('word');
        if (pending === 0) patchRowStatuses();
      });
    }
  }

  function patchRowStatuses() {
    if (!letters) return;
    for (const r of letters.rows) {
      const el = stage.querySelector(`.word-row[data-row="${r.id}"]`);
      if (!el) continue;
      el.className = 'word-row ' + rowStatusClass(r) + (r.letters.length ? '' : ' empty-row');
      const meta = el.querySelector('.word-meta');
      if (meta) {
        meta.className = 'word-meta ' + rowMetaClass(r);
        meta.textContent = rowMetaText(r);
      }
    }
    const sum = document.querySelector('.summary-strip');
    if (sum) {
      const s = lettersSummary();
      sum.innerHTML =
        `<span>Palabras: <b>${letters.rows.length}</b></span>` +
        `<span>Mejor: <b>${s.best || '—'}</b> (${s.points} pts)</span>` +
        `<span>Mínimo: <b>${state.minWordLength}</b> letras</span>`;
    }
  }

  /* ========================================================= */
  /*  CIFRAS                                                   */
  /* ========================================================= */

  function initNumbers() {
    numbers = {
      used: {},
      start: null,
      steps: [],
      pendingOp: null,
      value: 0,
      selected: null,
      groups: [],
    };
  }

  function isGroup(o) {
    return typeof o !== 'number' && !!o && typeof o.expr === 'object';
  }

  function operandLeaves(o, out) {
    if (typeof o === 'number') out.push(o);
    else if (isGroup(o)) exprLeaves(o.expr, out);
    else if (o && Array.isArray(o.steps)) exprLeaves(o, out);
    return out;
  }

  function exprLeaves(e, out) {
    if (!e || typeof e !== 'object') return out;
    operandLeaves(e.start, out);
    for (const s of e.steps || []) operandLeaves(s.n, out);
    return out;
  }

  function operandValue(o) {
    return typeof o === 'number' ? o : o.value;
  }

  function recomputeUsed() {
    if (!numbers) return;
    const counts = {};
    const add = (n) => {
      counts[n] = (counts[n] || 0) + 1;
    };
    const addRaw = (o) => {
      if (typeof o === 'number') add(o);
    };
    if (numbers.start != null) addRaw(numbers.start);
    for (const s of numbers.steps) addRaw(s.n);
    for (const g of numbers.groups) {
      const owned = g.owned || exprLeaves(g.expr, []);
      for (const n of owned) add(n);
    }
    numbers.used = counts;
  }

  function normOpDisp(op) {
    if (op === '-') return '−';
    if (op === '*') return '×';
    if (op === '/') return '÷';
    return op;
  }

  function fmtOperand(o) {
    if (typeof o === 'number') return String(o);
    if (isGroup(o)) return '(' + fmtExpr(o.expr) + ')';
    if (o && Array.isArray(o.steps)) return '(' + fmtExpr(o) + ')';
    return '?';
  }

  function fmtExpr(e) {
    if (!e || typeof e !== 'object') return '?';
    let s = fmtOperand(e.start);
    for (const st of e.steps || []) {
      s += ` ${normOpDisp(st.op)} ${fmtOperand(st.n)}`;
    }
    return s;
  }

  function operandLabel(o) {
    return fmtOperand(o);
  }

  function buildExpr() {
    return {
      start: isGroup(numbers.start) ? numbers.start.expr : numbers.start,
      steps: numbers.steps.map((s) => ({
        op: s.op,
        n: isGroup(s.n) ? s.n.expr : s.n,
      })),
    };
  }

  function numAvailable(v) {
    if (!numbers) return 0;
    const totalInRound = state.roundNumbers.filter((n) => n === v).length;
    return totalInRound - (numbers.used[v] || 0);
  }

  function renderNumbersRound() {
    if (!numbers) initNumbers();

    const totalTiles = state.roundNumbers.length;
    const usedTiles = Object.values(numbers.used).reduce((a, b) => a + b, 0);
    const remainingTiles = totalTiles - usedTiles;

    const tiles = state.roundNumbers
      .slice()
      .sort((a, b) => a - b)
      .map((v) =>
        new Array(Math.max(0, numAvailable(v) || 0))
          .fill(0)
          .map(
            () =>
              `<div class="tile number-tile${
                numbers.selected === v && numAvailable(v) > 0 ? ' selected' : ''
              }" data-kind="number" data-value="${v}">${v}</div>`
          )
          .join('')
      )
      .join('');

    const chain = buildChainHtml();
    const dist = numbers.start != null ? Math.abs(numbers.value - state.roundTarget) : null;

    const groupsRow =
      numbers.groups.length > 0
        ? `<div class="groups-row">
             <div class="tray-label">Tus paréntesis · toca uno para seguir operando con su resultado</div>
             <div class="tiles-row">
               ${numbers.groups
                 .map(
                   (g) => `<div class="tile group-tile${
                     chainUsesGroup(g.id) ? ' in-use' : ''
                   }" data-kind="group" data-value="${g.id}">
                     <span class="group-expr">${esc(fmtExpr(g.expr))}</span>
                     <span class="group-val">= ${g.value}</span>
                     <span class="remove" data-group="${g.id}">✕</span>
                   </div>`
                 )
                 .join('')}
             </div>
           </div>`
        : '';

    stage.innerHTML = `
      <div class="panel">
        <div class="target-box">
          <div class="target-label">🎯 Objetivo</div>
          <div class="target-value">${state.roundTarget}</div>
        </div>

        <div class="numbers-pool">
          <div class="tray-label">Elige los <b>${totalTiles}</b> números para operar · quedan <b>${remainingTiles}</b></div>
          <div class="tiles-row">${
            tiles ||
            `<div class="tile empty" style="width:auto;padding:0 14px;font-size:15px;">sin números</div>`
          }</div>
        </div>

        ${groupsRow}

        <div class="builder" data-drop="chain">
          ${chain}
        </div>

        <div class="result-box">
          <div class="result-value">${numbers.start == null ? '—' : numbers.value}</div>
          <div class="result-dist">${
            numbers.start == null
              ? numbers.groups.length
                ? 'Usa un paréntesis o un número para empezar'
                : 'Empieza eligiendo un número'
              : dist === 0
              ? '🎉 ¡Objetivo conseguido!'
              : `Distancia: ${dist} del objetivo`
          }</div>
        </div>

        <div class="operators">
          ${['+', '−', '×', '÷']
            .map(
              (op) =>
                `<button class="op-btn${numbers.pendingOp === op ? ' active' : ''}" data-op="${op}">${op}</button>`
            )
            .join('')}
        </div>

        <div class="action-row">
          <button class="btn ghost" data-action="undo">↩ Deshacer</button>
          <button class="btn ghost" data-action="close-group">(...) Cerrar grupo</button>
          <button class="btn ghost" data-action="clear-number">Vaciar</button>
        </div>
        <p class="hint-text">La resta no puede dar negativo y la división debe ser exacta.
           Cada número se usa una sola vez. Con «(...) Cerrar grupo» guardas la operación
           como un paréntesis con su resultado y puedes reutilizarlo en otra.</p>
      </div>`;

    const shown = numbers.start == null ? null : numbers.value;
    if (shown !== lastShownValue) {
      const el = stage.querySelector('.result-value');
      if (el && shown != null) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
      if (shown != null && shown === state.roundTarget && lastShownValue !== state.roundTarget) {
        sfx('exact');
        confetti(36);
      }
      lastShownValue = shown;
    }
  }

  function buildChainHtml() {
    if (numbers.start == null) {
      const hint = numbers.groups.length
        ? 'Toca un paréntesis de arriba para seguir con su resultado, o un número para empezar'
        : 'Arrastra o toca un número para empezar';
      return `<div class="chain"><div class="chain-empty">${hint}</div></div>`;
    }
    const cls = (o) => (isGroup(o) ? ' step-tile group-op' : ' step-tile');
    const label = (o) =>
      isGroup(o)
        ? `${operandLabel(o)}<span class="group-op-val">= ${o.value}</span>`
        : operandLabel(o);
    let inner = `<div class="${cls(numbers.start)}">${label(numbers.start)}</div>`;
    for (let i = 0; i < numbers.steps.length; i++) {
      const s = numbers.steps[i];
      inner += `<span class="op-chip">${s.op}</span>`;
      inner += i === numbers.steps.length - 1
        ? `<div class="${cls(s.n)}">${label(s.n)}<span class="remove" data-action="undo">✕</span></div>`
        : `<div class="${cls(s.n)}">${label(s.n)}</div>`;
    }
    if (numbers.pendingOp) {
      inner += `<span class="op-chip pending">${numbers.pendingOp}</span>`;
    }
    return `<div class="chain">${inner}</div>`;
  }

  function numbersTap(v) {
    if (!numbers) return;
    if (numAvailable(v) <= 0) return;
    if (numbers.start == null) {
      numbers.start = v;
      numbers.value = v;
    } else if (numbers.pendingOp) {
      const res = applyOp(numbers.value, numbers.pendingOp, v);
      if (res == null) {
        toast('Operación no permitida', true);
        return;
      }
      numbers.steps.push({ op: numbers.pendingOp, n: v });
      numbers.value = res;
      numbers.pendingOp = null;
    } else {
      toast('Primero elige una operación', true);
      return;
    }
    numbers.selected = null;
    recomputeUsed();
    renderStageOnly();
    sendNumbers();
    sfx('tap');
  }

  function numbersGroupTap(gid) {
    if (!numbers) return;
    const g = numbers.groups.find((x) => x.id === gid);
    if (!g) return;
    if (chainUsesGroup(gid)) {
      toast('Ese paréntesis ya está en la operación', true);
      return;
    }
    if (groupsOverlapInChain(gid)) {
      toast('Comparten números con la operación actual: no se pueden combinar', true);
      return;
    }
    if (numbers.start == null) {
      numbers.start = g;
      numbers.value = g.value;
    } else if (numbers.pendingOp) {
      const res = applyOp(numbers.value, numbers.pendingOp, g.value);
      if (res == null) {
        toast('Operación no permitida', true);
        return;
      }
      numbers.steps.push({ op: numbers.pendingOp, n: g });
      numbers.value = res;
      numbers.pendingOp = null;
    } else {
      toast('Primero elige una operación', true);
      return;
    }
    numbers.selected = null;
    recomputeUsed();
    renderStageOnly();
    sendNumbers();
    sfx('group');
  }

  function chainGroupIds() {
    const ids = [];
    const ops = [numbers.start, ...numbers.steps.map((s) => s.n)];
    for (const o of ops) if (isGroup(o)) ids.push(o.id);
    return ids;
  }

  function groupLineage(gid) {
    const g = numbers.groups.find((x) => x.id === gid);
    return new Set([gid, ...((g && g.refs) || [])]);
  }

  function groupsOverlapInChain(gid) {
    const mine = groupLineage(gid);
    for (const id of chainGroupIds()) {
      for (const t of groupLineage(id)) if (mine.has(t)) return true;
    }
    return false;
  }

  function chainRawLeaves() {
    const out = [];
    if (typeof numbers.start === 'number') out.push(numbers.start);
    for (const s of numbers.steps) if (typeof s.n === 'number') out.push(s.n);
    return out;
  }

  function closeGroup() {
    if (!numbers) return;
    if (numbers.start == null) {
      toast('Elige primero un número', true);
      return;
    }
    if (!numbers.steps.length) {
      toast('Haz al menos una operación para cerrar el grupo', true);
      return;
    }
    const refs = new Set();
    for (const id of chainGroupIds()) {
      refs.add(id);
      const g = numbers.groups.find((x) => x.id === id);
      for (const r of (g && g.refs) || []) refs.add(r);
    }
    const group = {
      id: uid(),
      expr: buildExpr(),
      value: numbers.value,
      owned: chainRawLeaves(),
      refs: [...refs],
    };
    numbers.groups.push(group);
    numbers.start = null;
    numbers.steps = [];
    numbers.pendingOp = null;
    numbers.value = 0;
    numbers.selected = null;
    recomputeUsed();
    renderStageOnly();
    sendNumbers();
    sfx('group');
    toast(`Paréntesis guardado (= ${group.value}): toca su ficha para seguir con él`);
  }

  function chainUsesGroup(gid) {
    if (!numbers) return false;
    const ops = [numbers.start, ...numbers.steps.map((s) => s.n)];
    return ops.some((o) => isGroup(o) && o.id === gid);
  }

  function deleteGroup(gid) {
    if (!numbers) return;
    if (chainUsesGroup(gid)) {
      toast('Ese paréntesis se está usando en la operación', true);
      return;
    }
    const usedByGroup = numbers.groups.some(
      (x) => x.id !== gid && (x.refs || []).includes(gid)
    );
    if (usedByGroup) {
      toast('No puedes borrarlo: otro paréntesis lo contiene', true);
      return;
    }
    numbers.groups = numbers.groups.filter((g) => g.id !== gid);
    recomputeUsed();
    renderStageOnly();
    sendNumbers();
    sfx('undo');
  }

  function applyOp(a, op, b) {
    if (op === '+') return a + b;
    if (op === '−') return a - b >= 0 ? a - b : null;
    if (op === '×') return a * b;
    if (op === '÷') {
      if (b === 0) return null;
      if (a % b !== 0) return null;
      return a / b;
    }
    return null;
  }

  function numbersUndo() {
    if (!numbers) return;
    if (numbers.pendingOp) {
      numbers.pendingOp = null;
      numbers.selected = null;
    } else if (numbers.steps.length) {
      numbers.steps.pop();
      recomputeValue();
    } else if (numbers.start != null) {
      numbers.start = null;
      numbers.value = 0;
    }
    numbers.selected = null;
    recomputeUsed();
    renderStageOnly();
    sendNumbers();
    sfx('undo');
  }

  function numbersClear() {
    if (!numbers) return;
    numbers.start = null;
    numbers.steps = [];
    numbers.pendingOp = null;
    numbers.value = 0;
    numbers.selected = null;
    recomputeUsed();
    renderStageOnly();
    sendNumbers();
    sfx('clear');
  }

  function recomputeValue() {
    if (numbers.start == null) {
      numbers.value = 0;
      return;
    }
    let v = operandValue(numbers.start);
    for (const s of numbers.steps) {
      const r = applyOp(v, s.op, operandValue(s.n));
      if (r == null) return;
      v = r;
    }
    numbers.value = v;
  }

  function sendNumbers() {
    if (!state || state.state !== 'playing' || state.roundType !== 'numbers') return;
    if (numbers.start != null) {
      socket.emit('submit_numbers', buildExpr());
    } else if (numbers.groups.length === 1) {
      const g = numbers.groups[0].expr;
      socket.emit('submit_numbers', { start: g.start, steps: g.steps });
    } else {
      socket.emit('submit_numbers', { start: 0, steps: [] });
    }
  }

  function renderStageOnly() {
    if (!state || !me) return;
    if (state.state === 'playing' && state.roundType === 'letters') renderLettersRound();
    else if (state.state === 'playing' && state.roundType === 'numbers') renderNumbersRound();
  }

  /* ========================================================= */
  /*  RESULTADOS                                               */
  /* ========================================================= */

  function renderResults() {
    if (!state.results) return;
    const r = state.results;
    let table = '';
    let notice = '';

    if (r.type === 'letters') {
      const rows = r.rows
        .slice()
        .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
      table = `
        <table class="results-table">
          <tr><th>Jugador</th><th>Palabra</th><th>Puntos</th></tr>
          ${rows
            .map(
              (e) =>
                `<tr class="${e.points > 0 ? 'winner' : ''}">
                   <td>${esc(e.name)}</td>
                   <td>${
                     e.answer
                       ? `<span class="answer-word">${esc(e.answer)}</span> <span class="word-meta">(${e.length} letras)</span>`
                       : '<span class="word-meta">sin palabra</span>'
                   }</td>
                   <td class="points">${e.points}</td>
                 </tr>`
            )
            .join('')}
        </table>`;
      notice =
        state.bestWords && state.bestWords.length
          ? `<div class="notice">Mejor palabra posible:
             <b>${esc(state.bestWords[0])}</b> (${state.bestWords[0].length} letras)${
               state.bestWords.length > 1
                 ? ' · también: ' + state.bestWords.slice(1, 5).map(esc).join(', ')
                 : ''
             }</div>`
          : '';
    } else {
      const rows = r.rows
        .slice()
        .sort((a, b) => (b.points - a.points) || (a.dist - b.dist) || a.name.localeCompare(b.name));
      table = `
        <table class="results-table">
          <tr><th>Jugador</th><th>Resultado</th><th>Distancia</th><th>Puntos</th></tr>
          ${rows
            .map(
              (e) =>
                `<tr class="${e.points > 0 ? 'winner' : ''}">
                   <td>${esc(e.name)}</td>
                   <td>${
                     e.ok
                       ? `<span class="answer-num">${e.value}</span>
                          <div class="word-meta">${exprHtml(e.expr)}</div>`
                       : '<span class="word-meta">sin resultado</span>'
                   }</td>
                   <td>${e.ok ? e.dist : '—'}</td>
                   <td class="points">${e.points}</td>
                 </tr>`
            )
            .join('')}
        </table>`;
      notice =
        state.solution && state.solution.value != null
          ? `<div class="notice">Mejor resultado posible:
             <b>${state.solution.value}</b> ${state.solution.exact ? '¡exacto!' : `(distancia ${state.solution.dist})`}
             <div>${esc(state.solution.expr)}</div></div>`
          : '';
    }

    const isLast = state.roundNumber >= state.totalRounds;
    const next = Math.max(0, Math.ceil((state.resultsEnd - Date.now()) / 1000));

    stage.innerHTML = `
      <div class="panel">
        <h2 class="panel-title">🎉 Resultados · ${typeLabel(r.type)}</h2>
        ${table}
        ${notice}
        <div class="next-round">
          ${
            isLast
              ? 'Fin de la partida · clasificación en la tabla lateral'
              : `Siguiente ronda en <b>${next}</b> s…`
          }
        </div>
      </div>`;
  }

  function exprHtml(expr) {
    if (!expr) return '';
    return esc(fmtExpr(expr));
  }

  /* ========================================================= */
  /*  Drag & drop                                              */
  /* ========================================================= */

  let drag = null;

  stage.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    if (ev.target.closest('.remove')) return;
    const tile = ev.target.closest('.tile[data-kind]');
    if (!tile) return;
    ev.preventDefault();
    drag = {
      kind: tile.dataset.kind,
      value: tile.dataset.value,
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      ghost: null,
    };
  });

  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) > 8) {
      drag.moved = true;
      drag.ghost = createGhost(drag.kind, drag.value);
    }
    if (drag.moved && drag.ghost) {
      drag.ghost.style.left = ev.clientX - 32 + 'px';
      drag.ghost.style.top = ev.clientY - 32 + 'px';
      highlightDrop(ev);
    }
  });

  window.addEventListener('pointerup', (ev) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) {
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      clearDropHighlight();
      if (d.ghost) d.ghost.remove();
      const zone = target && target.closest('[data-drop]');
      if (zone) dropOn(d.kind, d.value, zone);
    } else {
      clearDropHighlight();
      tapTile(d.kind, d.value);
    }
  });

  function createGhost(kind, value) {
    const el = document.createElement('div');
    el.className =
      'tile drag-ghost ' +
      (kind === 'letter'
        ? 'letter-tile'
        : kind === 'group'
        ? 'group-tile'
        : 'number-tile') +
      (kind === 'letter' && 'AEIOU'.includes(value) ? ' vowel' : '');
    if (kind === 'group') {
      const g = numbers && numbers.groups.find((x) => x.id === value);
      el.textContent = g ? `(${fmtExpr(g.expr)}) = ${g.value}` : 'grupo';
    } else {
      el.textContent = value;
    }
    el.style.position = 'fixed';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    return el;
  }

  function highlightDrop(ev) {
    clearDropHighlight();
    const t = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!t) return;
    const zone = t.closest('[data-drop]');
    if (zone) zone.classList.add('drop-hover');
  }

  function clearDropHighlight() {
    $$('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
  }

  function tapTile(kind, value) {
    if (kind === 'letter') {
      if (!letters) return;
      const now = Date.now();
      if (lastLetterTap && lastLetterTap.value === value && now - lastLetterTap.time < 320) {
        lastLetterTap = null;
        if (available(value) <= 0) {
          toast('Ya has usado la letra ' + value, true);
          return;
        }
        const target =
          letters.activeRow && letters.rows.some((r) => r.id === letters.activeRow)
            ? letters.activeRow
            : '_new';
        letters.selected = null;
        placeLetter(value, target);
        return;
      }
      lastLetterTap = { value, time: now };
      if (letters.selected === value && available(value) > 0) {
        letters.selected = null;
      } else if (available(value) > 0) {
        letters.selected = value;
        sfx('tap');
      } else {
        toast('Ya has usado la letra ' + value, true);
        return;
      }
      renderStageOnly();
    } else if (kind === 'group') {
      numbersGroupTap(value);
    } else {
      numbersTap(Number(value));
    }
  }

  function dropOn(kind, value, zone) {
    if (kind === 'letter') {
      const type = zone.dataset.drop;
      if (type === 'letters-row') placeLetter(value, zone.dataset.row);
      else if (type === 'letters-new') placeLetter(value, '_new');
    } else if (kind === 'group') {
      numbersGroupTap(value);
    } else {
      numbersTap(Number(value));
    }
  }

  /* ---------------- clicks (stage) ---------------- */

  stage.addEventListener('click', (ev) => {
    const remove = ev.target.closest('.built-letter .remove');
    if (remove) {
      removeLetter(remove.dataset.row, Number(remove.dataset.index));
      return;
    }

    const removeGroup = ev.target.closest('.group-tile .remove');
    if (removeGroup) {
      deleteGroup(removeGroup.dataset.group);
      return;
    }

    const removeNum = ev.target.closest('.step-tile .remove');
    if (removeNum) {
      numbersUndo();
      return;
    }

    const opBtn = ev.target.closest('.op-btn');
    if (opBtn) {
      numbersOp(opBtn.dataset.op);
      return;
    }

    const actionBtn = ev.target.closest('[data-action]');
    if (actionBtn) {
      const a = actionBtn.dataset.action;
      if (a === 'clear-words') clearAllWords();
      else if (a === 'undo') numbersUndo();
      else if (a === 'clear-number') numbersClear();
      else if (a === 'close-group') closeGroup();
      else if (a === 'start') socket.emit('start_game');
      else if (a === 'newgame') socket.emit('start_game');
      return;
    }

    const row = ev.target.closest('.word-row');
    if (row && letters) {
      if (letters.selected) placeLetter(letters.selected, row.dataset.row);
      else setActiveRow(row.dataset.row);
      return;
    }
    const nw = ev.target.closest('.new-word-btn');
    if (nw && letters) newWord();
  });

  function numbersOp(op) {
    if (!numbers || numbers.start == null) {
      toast('Elige primero un número', true);
      return;
    }
    numbers.pendingOp = numbers.pendingOp === op ? null : op;
    numbers.selected = null;
    renderStageOnly();
    sfx('op');
  }

  /* ---------------- start ---------------- */

  if (myName) {
    loginScreen.classList.add('hidden');
    app.classList.remove('hidden');
  }

  window.addEventListener('beforeunload', () => {
    clearTimeout(syncTimer);
  });
})();