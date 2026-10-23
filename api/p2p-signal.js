import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const MAX_SIGNAL_BYTES = 24_000;
const rooms = new Map();
const server = http.createServer();
const signaling = new WebSocketServer({ server });

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function removePeer(socket) {
  const { roomCode, role } = socket.session || {};
  if (!roomCode || !role) return;
  const room = rooms.get(roomCode);
  if (!room || room[role] !== socket) return;
  delete room[role];
  send(room[role === 'host' ? 'guest' : 'host'], { type: 'peer-left' });
  if (!room.host && !room.guest) rooms.delete(roomCode);
}

signaling.on('connection', socket => {
  socket.isAlive = true;
  socket.session = null;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', raw => {
    if (raw.length > MAX_SIGNAL_BYTES) return;
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === 'join') {
      if (socket.session) return;
      const roomCode = normalizeRoomCode(message.roomCode);
      const role = message.role === 'host' || message.role === 'guest' ? message.role : null;
      if (message.version !== 1 || roomCode.length < 4 || !role) {
        send(socket, { type: 'error', code: 'INVALID_JOIN', message: '部屋番号、役割、または通信バージョンが不正です。' });
        return;
      }
      const room = rooms.get(roomCode) || {};
      if (room[role]) {
        send(socket, { type: 'error', code: 'ROLE_OCCUPIED', message: 'この役割は既に入室済みです。' });
        return;
      }
      room[role] = socket;
      rooms.set(roomCode, room);
      socket.session = { roomCode, role };
      send(socket, { type: 'joined', roomCode, role });
      if (room.host && room.guest) {
        send(room.host, { type: 'ready' });
        send(room.guest, { type: 'ready' });
      }
      return;
    }

    const { roomCode, role } = socket.session || {};
    if (!roomCode || !['offer', 'answer', 'ice'].includes(message.type)) return;
    const other = rooms.get(roomCode)?.[role === 'host' ? 'guest' : 'host'];
    if (other) send(other, message);
  });
  socket.on('close', () => removePeer(socket));
  socket.on('error', () => removePeer(socket));
});

const heartbeat = setInterval(() => {
  for (const socket of signaling.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);
heartbeat.unref();

export default server;
