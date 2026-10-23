import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvelope, isValidRoomCode, normalizeRoomCode, parseEnvelope } from '../coop/net/protocol.js';

test('room codes are normalized and restricted to six characters', () => {
  assert.equal(normalizeRoomCode(' gf-a_001 '), 'GFA001');
  assert.equal(isValidRoomCode('abc'), false);
  assert.equal(isValidRoomCode('abcd'), true);
});

test('valid protocol envelopes round-trip', () => {
  const encoded = JSON.stringify(createEnvelope('event', 'fire', 7, { weapon: 'pistol' }, 1234));
  assert.deepEqual(parseEnvelope(encoded, 'event'), {
    v: 1,
    kind: 'event',
    type: 'fire',
    seq: 7,
    sentAt: 1234,
    payload: { weapon: 'pistol' }
  });
});

test('invalid versions, kinds and sequences are rejected', () => {
  assert.equal(parseEnvelope('{"v":2,"kind":"event","type":"x","seq":0,"sentAt":1}', 'event'), null);
  assert.equal(parseEnvelope('{"v":1,"kind":"state","type":"x","seq":0,"sentAt":1}', 'event'), null);
  assert.equal(parseEnvelope('{"v":1,"kind":"event","type":"x","seq":-1,"sentAt":1}', 'event'), null);
});
