import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_SIGNAL_BYTES = 24_000;
const rooms = new Map();

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.mp3', 'audio/mpeg'],
  ['.webmanifest', 'application/manifest+json']
]);

function resolvePublicPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  if (pathname === '/health') return null;
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!relative || relative.split('/').some(part => part.startsWith('.'))) return false;
  const resolved = path.resolve(ROOT, relative);
  return resolved === ROOT || resolved.startsWith(`${ROOT}${path.sep}`) ? resolved : false;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'gfa-coop-signal' }));
    return;
  }
  const filePath = resolvePublicPath(req.url);
  if (!filePath) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  import('node:fs').then(({ createReadStream, stat }) => {
    stat(filePath, (error, info) => {
      if (error || !info.isFile()) {
        res.writeHead(404).end('Not Found');
        return;
      }
      res.writeHead(200, {
        'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
        'content-length': info.size,
        'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600'
      });
      if (req.method === 'HEAD') res.end();
      else createReadStream(filePath).pipe(res);
    });
  });
});

const signaling = new WebSocketServer({ noServer: true });

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

server.on('upgrade', (req, socket, head) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
  if (pathname !== '/p2p-signal') {
    socket.destroy();
    return;
  }
  signaling.handleUpgrade(req, socket, head, ws => signaling.emit('connection', ws, req));
});

server.listen(PORT, () => console.log(`GFA-Coop available on http://localhost:${PORT}`));
