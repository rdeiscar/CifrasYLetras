'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./config');
const dictionary = require('./dictionary');
const { Game } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const game = new Game(config, dictionary, io);

app.disable('x-powered-by');

app.use(express.static(config.PUBLIC_DIR));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, words: dictionary.size(), state: game.state });
});

io.on('connection', (socket) => {
  socket.join(game.room);
  socket.emit('state', game.snapshot());

  socket.on('join', (data, ack) => {
    const token =
      (data && typeof data.token === 'string' && data.token) ||
      `anon-${socket.id}-${Date.now()}`;
    const name = data && data.name;
    const p = game.join(token, name, socket.id);
    if (ack) ack({ ok: true, me: token, state: game.snapshot() });
  });

  socket.on('start_game', () => {
    const token = game.socketMap.get(socket.id);
    if (token) game.startGame(token);
  });

  socket.on('validate_word', (word, ack) => game.validateWord(word, ack));

  socket.on('submit_words', (words, ack) => {
    const token = game.socketMap.get(socket.id);
    if (token) game.submitWords(token, words, ack);
    else if (ack) ack({ ok: false });
  });

  socket.on('submit_numbers', (expr, ack) => {
    const token = game.socketMap.get(socket.id);
    if (token) game.submitNumbers(token, expr, ack);
    else if (ack) ack({ ok: false });
  });

  socket.on('disconnect', () => game.leave(socket.id));
});

async function main() {
  await dictionary.load();
  server.listen(config.PORT, config.HOST, () => {
    console.log(
      `Cifras y Letras escuchando en http://${config.HOST}:${config.PORT}`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});