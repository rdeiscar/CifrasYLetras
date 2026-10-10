(function () {
  'use strict';

  let ctx = null;
  let muted = false;
  try {
    muted = localStorage.getItem('cyl_mute') === '1';
  } catch (e) {
    /* sin almacenamiento */
  }

  function ensureCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      try {
        ctx.resume().catch(() => {});
      } catch (e) {
        /* noop */
      }
    }
    return ctx;
  }

  function m(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function tone(freq, at, dur, type, gain, glideTo) {
    const c = ctx;
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, glideTo), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.14, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }

  const PATTERNS = {
    tap: [[m(76), 0, 0.06, 'sine', 0.09]],
    op: [[m(71), 0, 0.06, 'sine', 0.09]],
    letter: [[m(72), 0, 0.09, 'triangle', 0.16, m(86)]],
    undo: [[m(64), 0, 0.07, 'sine', 0.11]],
    clear: [
      [m(60), 0, 0.08, 'sine', 0.11],
      [m(52), 0.08, 0.12, 'sine', 0.11],
    ],
    group: [
      [m(72), 0, 0.08, 'triangle', 0.13],
      [m(76), 0.07, 0.08, 'triangle', 0.13],
      [m(79), 0.14, 0.12, 'triangle', 0.13],
    ],
    word: [
      [m(67), 0, 0.08, 'triangle', 0.13],
      [m(74), 0.08, 0.13, 'triangle', 0.13],
    ],
    tick: [[m(88), 0, 0.05, 'sine', 0.1]],
    error: [
      [m(40), 0, 0.13, 'sawtooth', 0.09],
      [m(37), 0.15, 0.17, 'sawtooth', 0.09],
    ],
    round: [
      [m(60), 0, 0.08, 'triangle', 0.14],
      [m(64), 0.09, 0.08, 'triangle', 0.14],
      [m(67), 0.18, 0.08, 'triangle', 0.14],
      [m(72), 0.27, 0.18, 'triangle', 0.16],
    ],
    score: [
      [m(72), 0, 0.07, 'triangle', 0.14],
      [m(76), 0.08, 0.07, 'triangle', 0.14],
      [m(79), 0.16, 0.07, 'triangle', 0.14],
      [m(84), 0.24, 0.2, 'triangle', 0.16],
    ],
    miss: [
      [m(59), 0, 0.12, 'sine', 0.11],
      [m(55), 0.13, 0.17, 'sine', 0.11],
    ],
    exact: [
      [m(84), 0, 0.06, 'triangle', 0.13],
      [m(88), 0.07, 0.06, 'triangle', 0.13],
      [m(91), 0.14, 0.2, 'triangle', 0.15],
    ],
    win: [
      [m(72), 0, 0.1, 'triangle', 0.15],
      [m(74), 0.11, 0.1, 'triangle', 0.15],
      [m(76), 0.22, 0.1, 'triangle', 0.15],
      [m(79), 0.33, 0.12, 'triangle', 0.16],
      [m(84), 0.46, 0.34, 'triangle', 0.18],
    ],
    lose: [
      [m(62), 0, 0.15, 'sine', 0.12],
      [m(58), 0.16, 0.15, 'sine', 0.12],
      [m(53), 0.32, 0.3, 'sine', 0.12],
    ],
  };

  window.Sfx = {
    get muted() {
      return muted;
    },
    unlock() {
      ensureCtx();
    },
    play(name) {
      if (muted) return;
      const c = ensureCtx();
      if (!c) return;
      const p = PATTERNS[name];
      if (!p) return;
      try {
        for (const note of p) tone(note[0], note[1], note[2], note[3], note[4], note[5]);
      } catch (e) {
        /* sin audio */
      }
    },
    toggleMute() {
      muted = !muted;
      try {
        localStorage.setItem('cyl_mute', muted ? '1' : '0');
      } catch (e) {
        /* sin almacenamiento */
      }
      if (!muted) window.Sfx.play('tap');
      return muted;
    },
  };
})();
