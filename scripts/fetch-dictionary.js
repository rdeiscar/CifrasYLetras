'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'palabras.txt');

const SOURCES = [
  'https://raw.githubusercontent.com/words/an-array-of-spanish-words/master/index.json',
];

function normalize(word) {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

async function download(source) {
  const res = await fetch(source);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  for (const url of SOURCES) {
    try {
      console.log(`Descargando ${url} ...`);
      const raw = await download(url);
      const set = new Set();
      for (const w of raw) {
        if (!w) continue;
        const c = normalize(w);
        if (c.length >= 2 && c.length <= 15) set.add(c);
      }
      const list = [...set].sort();
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, list.join('\n') + '\n', 'utf8');
      console.log(`Diccionario generado: ${list.length} palabras -> ${OUT}`);
      return;
    } catch (err) {
      console.error(`Fallo con ${url}: ${err.message}`);
    }
  }
  console.error('No se pudo descargar el diccionario.');
  process.exit(1);
}

main();