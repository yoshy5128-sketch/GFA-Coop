import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';

function waitForMessage(socket, expectedType, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), timeoutMs);
    const onMessage = raw => {
      const message = JSON.parse(raw.toString());
      if (message.type !== expectedType) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

test('signaling server pairs a host and guest and relays an offer', async t => {
  const port = 32000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  const [startup] = await Promise.race([
    once(child.stdout, 'data'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Server startup timed out')), 3000))
  ]);
  assert.match(startup.toString(), /GFA-Coop available/);

  const host = new WebSocket(`ws://127.0.0.1:${port}/p2p-signal`);
  const guest = new WebSocket(`ws://127.0.0.1:${port}/p2p-signal`);
  t.after(() => { host.close(); guest.close(); });
  await Promise.all([once(host, 'open'), once(guest, 'open')]);

  const hostJoined = waitForMessage(host, 'joined');
  host.send(JSON.stringify({ type: 'join', version: 1, role: 'host', roomCode: 'TEST01' }));
  await hostJoined;

  const hostReady = waitForMessage(host, 'ready');
  const guestReady = waitForMessage(guest, 'ready');
  const guestJoined = waitForMessage(guest, 'joined');
  guest.send(JSON.stringify({ type: 'join', version: 1, role: 'guest', roomCode: 'TEST01' }));
  await Promise.all([hostReady, guestReady, guestJoined]);

  const offerPromise = waitForMessage(guest, 'offer');
  host.send(JSON.stringify({ type: 'offer', sdp: { type: 'offer', sdp: 'test-sdp' } }));
  const offer = await offerPromise;
  assert.equal(offer.sdp.sdp, 'test-sdp');
});
