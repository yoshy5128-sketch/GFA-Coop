export const GFA_COOP_PROTOCOL_VERSION = 1;
export const GFA_COOP_ROLES = Object.freeze(['host', 'guest']);
export const GFA_COOP_CHANNELS = Object.freeze({ state: 'gfa-state', event: 'gfa-event' });

export function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function isValidRoomCode(value) {
  return normalizeRoomCode(value).length >= 4;
}

export function createEnvelope(kind, type, sequence, payload, sentAt = Date.now()) {
  if (kind !== 'state' && kind !== 'event') throw new TypeError('Unknown CO-OP message kind');
  if (typeof type !== 'string' || !type) throw new TypeError('CO-OP message type is required');
  return { v: GFA_COOP_PROTOCOL_VERSION, kind, type, seq: sequence, sentAt, payload };
}

export function parseEnvelope(raw, expectedKind) {
  let message;
  try { message = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!message || message.v !== GFA_COOP_PROTOCOL_VERSION) return null;
  if (message.kind !== expectedKind || typeof message.type !== 'string') return null;
  if (!Number.isSafeInteger(message.seq) || message.seq < 0) return null;
  if (!Number.isFinite(message.sentAt)) return null;
  return message;
}
