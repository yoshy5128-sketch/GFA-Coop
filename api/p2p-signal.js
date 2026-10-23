import crypto from 'node:crypto';
import http from 'node:http';
import Redis from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';

const MAX_SIGNAL_BYTES = 24_000;
const REDIS_CHANNEL = 'gfa:coop:signal:v1';
const ROLE_TTL_SECONDS = 30;
const INSTANCE_ID = crypto.randomUUID();
const localRooms = new Map();
const server = http.createServer();
const signaling = new WebSocketServer({ server });

const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl, {
  maxRetriesPerRequest: 2,
  retryStrategy: times => Math.min(times * 200, 2_000)
}) : null;
const subscriber = redis?.duplicate() || null;
let subscriberReady = null;
let subscriberEventsBound = false;

redis?.on('error', error => console.error('[gfa-signal] Redis publisher error', error));
subscriber?.on('error', error => console.error('[gfa-signal] Redis subscriber error', error));

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function roleKey(roomCode, role) {
  return `gfa:coop:room:${roomCode}:${role}`;
}

function localPeers(roomCode, role) {
  return [...signaling.clients].filter(socket => (
    socket.session?.roomCode === roomCode
    && (!role || socket.session.role === role)
    && socket.readyState === WebSocket.OPEN
  ));
}

function deliverLocal(roomCode, role, message) {
  for (const socket of localPeers(roomCode, role)) send(socket, message);
}

async function publish(packet) {
  if (!redis) return false;
  await redis.publish(REDIS_CHANNEL, JSON.stringify({ ...packet, origin: INSTANCE_ID }));
  return true;
}

async function handleBusPacket(packet) {
  if (!packet?.roomCode) return;
  if (packet.kind === 'deliver') {
    deliverLocal(packet.roomCode, packet.targetRole, packet.message);
    return;
  }
  if (packet.kind === 'joined') {
    const waitingRole = packet.role === 'host' ? 'guest' : 'host';
    const waitingPeers = localPeers(packet.roomCode, waitingRole);
    if (!waitingPeers.length) return;
    for (const socket of waitingPeers) send(socket, { type: 'ready' });
    await publish({
      kind: 'deliver',
      roomCode: packet.roomCode,
      targetRole: packet.role,
      message: { type: 'ready' }
    });
    return;
  }
  if (packet.kind === 'left') {
    const otherRole = packet.role === 'host' ? 'guest' : 'host';
    deliverLocal(packet.roomCode, otherRole, { type: 'peer-left' });
  }
}

function ensureSubscriber() {
  if (!subscriber) return Promise.resolve(false);
  if (subscriberReady) return subscriberReady;
  if (!subscriberEventsBound) {
    subscriberEventsBound = true;
    subscriber.on('message', (channel, raw) => {
      if (channel !== REDIS_CHANNEL) return;
      let packet;
      try { packet = JSON.parse(raw); } catch { return; }
      void handleBusPacket(packet).catch(error => console.error('[gfa-signal] bus packet failed', error));
    });
  }
  subscriberReady = subscriber.subscribe(REDIS_CHANNEL)
    .then(() => true)
    .catch(error => {
      subscriberReady = null;
      console.error('[gfa-signal] Redis subscribe failed', error);
      return false;
    });
  return subscriberReady;
}

async function claimRole(socket, roomCode, role) {
  const connectionId = crypto.randomUUID();
  const claimed = await redis.set(roleKey(roomCode, role), connectionId, 'EX', ROLE_TTL_SECONDS, 'NX');
  if (claimed !== 'OK') return null;
  socket.connectionId = connectionId;
  return connectionId;
}

async function refreshRole(socket) {
  const { roomCode, role } = socket.session || {};
  if (!redis || !roomCode || !role || !socket.connectionId) return;
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end",
    1,
    roleKey(roomCode, role),
    socket.connectionId,
    ROLE_TTL_SECONDS
  );
}

async function releaseRole(roomCode, role, connectionId) {
  if (!redis || !connectionId) return;
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    1,
    roleKey(roomCode, role),
    connectionId
  );
}

async function joinShared(socket, roomCode, role) {
  if (!await ensureSubscriber()) {
    send(socket, { type: 'error', code: 'SIGNAL_STORE_UNAVAILABLE', message: '接続用共有サーバーを利用できません。しばらくしてから再試行してください。' });
    return;
  }
  if (!await claimRole(socket, roomCode, role)) {
    send(socket, { type: 'error', code: 'ROLE_OCCUPIED', message: 'この役割は既に入室済みです。' });
    return;
  }
  socket.session = { roomCode, role };
  send(socket, { type: 'joined', roomCode, role });
  try {
    await publish({ kind: 'joined', roomCode, role });
  } catch (error) {
    socket.session = null;
    await releaseRole(roomCode, role, socket.connectionId);
    throw error;
  }
}

function joinLocal(socket, roomCode, role) {
  const room = localRooms.get(roomCode) || {};
  if (room[role]) {
    send(socket, { type: 'error', code: 'ROLE_OCCUPIED', message: 'この役割は既に入室済みです。' });
    return;
  }
  room[role] = socket;
  localRooms.set(roomCode, room);
  socket.session = { roomCode, role };
  send(socket, { type: 'joined', roomCode, role });
  if (room.host && room.guest) {
    send(room.host, { type: 'ready' });
    send(room.guest, { type: 'ready' });
  }
}

async function removePeer(socket) {
  const session = socket.session;
  if (!session) return;
  socket.session = null;
  const { roomCode, role } = session;
  if (redis) {
    await releaseRole(roomCode, role, socket.connectionId);
    await publish({ kind: 'left', roomCode, role });
    return;
  }
  const room = localRooms.get(roomCode);
  if (!room || room[role] !== socket) return;
  delete room[role];
  send(room[role === 'host' ? 'guest' : 'host'], { type: 'peer-left' });
  if (!room.host && !room.guest) localRooms.delete(roomCode);
}

signaling.on('connection', socket => {
  socket.isAlive = true;
  socket.session = null;
  socket.connectionId = null;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', raw => {
    if (raw.length > MAX_SIGNAL_BYTES) return;
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }

    if (message.type === 'join') {
      if (socket.session || socket.joining) return;
      const roomCode = normalizeRoomCode(message.roomCode);
      const role = message.role === 'host' || message.role === 'guest' ? message.role : null;
      if (message.version !== 1 || roomCode.length < 4 || !role) {
        send(socket, { type: 'error', code: 'INVALID_JOIN', message: '部屋番号、役割、または通信バージョンが不正です。' });
        return;
      }
      if (!redis && process.env.VERCEL) {
        send(socket, { type: 'error', code: 'SIGNAL_STORE_REQUIRED', message: 'CO-OP接続用Redisが未設定です。管理者によるVercel設定が必要です。' });
        return;
      }
      if (redis) {
        socket.joining = true;
        void joinShared(socket, roomCode, role)
          .catch(error => {
            console.error('[gfa-signal] join failed', error);
            send(socket, { type: 'error', code: 'SIGNAL_STORE_UNAVAILABLE', message: '接続用共有サーバーでエラーが発生しました。' });
          })
          .finally(() => { socket.joining = false; });
      } else {
        joinLocal(socket, roomCode, role);
      }
      return;
    }

    const { roomCode, role } = socket.session || {};
    if (!roomCode || !['offer', 'answer', 'ice'].includes(message.type)) return;
    const targetRole = role === 'host' ? 'guest' : 'host';
    if (redis) {
      void publish({ kind: 'deliver', roomCode, targetRole, message })
        .catch(error => console.error('[gfa-signal] relay failed', error));
    } else {
      send(localRooms.get(roomCode)?.[targetRole], message);
    }
  });
  socket.on('close', () => { void removePeer(socket).catch(error => console.error('[gfa-signal] close cleanup failed', error)); });
  socket.on('error', () => { void removePeer(socket).catch(error => console.error('[gfa-signal] error cleanup failed', error)); });
});

const heartbeat = setInterval(() => {
  for (const socket of signaling.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
    if (redis) void refreshRole(socket).catch(error => console.error('[gfa-signal] lease refresh failed', error));
  }
}, 10_000);
heartbeat.unref();

export default server;
