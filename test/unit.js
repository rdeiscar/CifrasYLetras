'use strict';

const assert = require('assert');
const path = require('path');
const dictionary = require(path.join(process.cwd(), 'server', 'dictionary'));
const { execExpression, numbersSolver, Game } = require(path.join(process.cwd(), 'server', 'game'));
const config = require(path.join(process.cwd(), 'server', 'config'));

(async () => {
  await dictionary.load();
  console.log('size:', dictionary.size());
  assert.ok(dictionary.isValid('CASA'));
  assert.ok(dictionary.isValid('MURCIELAGO'));
  assert.ok(dictionary.isValid('fácil'));
  assert.ok(!dictionary.isValid('ZZZZQ'));
  assert.ok(dictionary.isBuildable('CASA', ['C', 'A', 'S', 'A', 'X']));
  assert.ok(!dictionary.isBuildable('CASA', ['C', 'A', 'S']));

  let r = execExpression([25, 4, 3, 1, 2, 5, 10, 50], {
    start: 25,
    steps: [{ op: '+', n: 4 }],
  });
  assert.deepStrictEqual(r, { ok: true, value: 29 });

  r = execExpression([25, 4, 3], { start: 25, steps: [{ op: '−', n: 4 }] });
  assert.ok(r.ok && r.value === 21);

  r = execExpression([25, 4, 3], { start: 25, steps: [{ op: '÷', n: 3 }] });
  assert.ok(!r.ok);

  r = execExpression([25, 4], { start: 4, steps: [{ op: '−', n: 8 }] });
  assert.ok(!r.ok);

  r = execExpression([25, 4, 3], {
    start: 25,
    steps: [
      { op: '−', n: 4 },
      { op: '×', n: 3 },
    ],
  });
  assert.ok(r.ok && r.value === 63);

  r = execExpression([25, 4], { start: 25, steps: [{ op: '×', n: 25 }] });
  assert.ok(!r.ok);

  r = execExpression([25, 4], { start: 25, steps: [{ op: 'junk', n: 1 }] });
  assert.ok(!r.ok);

  r = execExpression([25, 4], { start: 0, steps: [] });
  assert.ok(!r.ok);

  r = execExpression([25, 4, 3], { start: 25, steps: [{ op: '+', n: 4 }] });
  assert.ok(r.ok);

  r = execExpression([4, 3, 6, 3], {
    start: { start: 4, steps: [{ op: '-', n: 3 }] },
    steps: [{ op: '+', n: { start: 6, steps: [{ op: '÷', n: 3 }] } }],
  });
  assert.ok(r.ok && r.value === 3, `paréntesis (4-3)+(6÷3): ${JSON.stringify(r)}`);

  r = execExpression([4, 3, 6], {
    start: { start: 4, steps: [{ op: '-', n: 3 }] },
    steps: [{ op: '+', n: { start: 6, steps: [{ op: '÷', n: 3 }] } }],
  });
  assert.ok(!r.ok, 'la repetición del 3 debe rechazarse (solo hay un 3)');

  r = execExpression([4, 3, 6, 3], {
    start: { start: 4, steps: [{ op: '-', n: 3 }] },
    steps: [{ op: '÷', n: 5 }],
  });
  assert.ok(!r.ok, 'número ajeno al sorteo debe rechazarse');

  let deep = 4;
  for (let i = 0; i < 10; i++) deep = { start: deep, steps: [{ op: '+', n: 1 }] };
  r = execExpression([4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { start: deep, steps: [] });
  assert.ok(!r.ok, 'expresión demasiado anidada debe rechazarse');

  for (let i = 0; i < 300; i++) {
    const d = Game.prototype.drawNumbersSet.call({ cfg: config });
    assert.strictEqual(d.numbers.length, config.NUM_NUMBERS, 'las cifras deben ser ' + config.NUM_NUMBERS);
    assert.strictEqual(new Set(d.numbers).size, config.NUM_NUMBERS, 'las cifras deben ser distintas: ' + d.numbers.join(','));
    assert.ok(d.target >= 100 && d.target <= 999, 'objetivo fuera de rango');
    assert.ok(d.numbers.every((n) => (n >= 1 && n <= 10) || [25, 50, 75, 100].includes(n)));
  }

  const counts = {};
  const LETTER_DRAWS = 4000;
  for (let i = 0; i < LETTER_DRAWS; i++) {
    const L = Game.prototype.drawLetters.call({ cfg: config });
    assert.strictEqual(L.length, config.NUM_LETTERS, 'las letras deben ser ' + config.NUM_LETTERS);
    assert.strictEqual(
      L.filter((c) => 'AEIOU'.includes(c)).length,
      config.VOWELS_PER_ROUND,
      'exactamente ' + config.VOWELS_PER_ROUND + ' vocales'
    );
    assert.strictEqual(new Set(L).size, L.length, 'letras sin repetir: ' + L.join(''));
    for (const c of L) counts[c] = (counts[c] || 0) + 1;
  }
  const wxc = (counts.W || 0) + (counts.X || 0);
  const sc = counts.S || 0;
  console.log('frecuencias: S=' + sc + ' N=' + (counts.N || 0) + ' W=' + (counts.W || 0) + ' X=' + (counts.X || 0) + ' Z=' + (counts.Z || 0));
  assert.ok((counts.W || 0) > 0 && (counts.X || 0) > 0, 'W y X deben salir alguna vez');
  assert.ok(wxc * 5 < sc, 'W+X (' + wxc + ') debe ser mucho menor que S (' + sc + ')');
  assert.ok((counts.Z || 0) * 5 < sc, 'Z también debe ser rara');

  const sol = numbersSolver([25, 50, 2, 1, 5, 4, 10, 3], 428);
  assert.ok(sol && sol.value != null);
  assert.strictEqual(sol.dist, Math.abs(sol.value - 428));
  assert.strictEqual(sol.exact, sol.value === 428);
  console.log('solver output:', sol.value, '|', sol.expr, '| dist', sol.dist);

  console.log('UNIT OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});