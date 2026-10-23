import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import server from '../api/p2p-signal.js';

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

test('Vercel signaling function keeps single-instance local development working', async t => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.equal(typeof address, 'object');

  const host = new WebSocket(`ws://127.0.0.1:${address.port}/p2p-signal`);
  const guest = new WebSocket(`ws://127.0.0.1:${address.port}/p2p-signal`);
  t.after(async () => {
    host.close();
    guest.close();
    await new Promise(resolve => server.close(resolve));
  });
  await Promise.all([once(host, 'open'), once(guest, 'open')]);

  const hostJoined = waitForMessage(host, 'joined');
  host.send(JSON.stringify({ type: 'join', version: 1, role: 'host', roomCode: 'LOCAL1' }));
  await hostJoined;

  const hostReady = waitForMessage(host, 'ready');
  const guestReady = waitForMessage(guest, 'ready');
  const guestJoined = waitForMessage(guest, 'joined');
  guest.send(JSON.stringify({ type: 'join', version: 1, role: 'guest', roomCode: 'LOCAL1' }));
  await Promise.all([hostReady, guestReady, guestJoined]);

  const offerPromise = waitForMessage(guest, 'offer');
  host.send(JSON.stringify({ type: 'offer', sdp: { type: 'offer', sdp: 'function-test-sdp' } }));
  const offer = await offerPromise;
  assert.equal(offer.sdp.sdp, 'function-test-sdp');
});
