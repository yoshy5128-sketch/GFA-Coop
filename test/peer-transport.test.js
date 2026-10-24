import test from 'node:test';
import assert from 'node:assert/strict';
import { GfaPeerTransport } from '../coop/net/peer-transport.js';

test('both host and guest can send transient player state', () => {
  for (const role of ['host', 'guest']) {
    let raw = '';
    const transport = new GfaPeerTransport();
    transport.role = role;
    transport.channels.state = {
      readyState: 'open',
      bufferedAmount: 0,
      send(value) { raw = value; }
    };

    assert.equal(transport.sendState('player-pose', { position: [1, 2, 3] }), true);
    const message = JSON.parse(raw);
    assert.equal(message.kind, 'state');
    assert.equal(message.type, 'player-pose');
    assert.deepEqual(message.payload.position, [1, 2, 3]);
  }
});

test('guest cannot send state when the unreliable channel is congested', () => {
  const transport = new GfaPeerTransport();
  transport.role = 'guest';
  transport.channels.state = {
    readyState: 'open',
    bufferedAmount: 128_000,
    send() { throw new Error('must not send'); }
  };

  assert.equal(transport.sendState('player-pose', {}), false);
});
