import { GfaPeerTransport } from './net/peer-transport.js';
import { normalizeRoomCode } from './net/protocol.js';

const launchButton = document.getElementById('title-coop-button');
const overlay = document.getElementById('coop-lobby-overlay');

let selectedRole = 'host';
let transport = null;
const statusElement = overlay.querySelector('#coop-status');
const connectButton = overlay.querySelector('#coop-connect');

function updateStatus({ code, message }) {
  statusElement.dataset.state = code;
  statusElement.textContent = message;
  if (code === 'error' || code === 'disconnected') connectButton.disabled = false;
  if (code === 'connected') {
    launchButton?.classList.add('connected');
    launchButton.textContent = 'LAN CO-OP CONNECTED';
  }
}

function createTransport() {
  transport?.close();
  transport = new GfaPeerTransport({
    onStatus: updateStatus,
    onConnect(info) {
      transport.sendEvent('hello', { role: info.role, build: 'gfa-coop-0.1.0' });
    },
    onEvent(message) {
      if (message.type === 'hello') transport.sendEvent('hello-ack', { receivedAt: Date.now() });
      if (message.type === 'hello-ack') updateStatus({ code: 'connected', message: 'P2P接続成功・双方向通信確認済み' });
    }
  });
  window.GFACoop = Object.freeze({
    get transport() { return transport; },
    get role() { return selectedRole; },
    get connected() { return Boolean(transport?.connected); }
  });
  return transport;
}

for (const button of overlay.querySelectorAll('[data-coop-role]')) {
  button.addEventListener('click', () => {
    selectedRole = button.dataset.coopRole;
    for (const item of overlay.querySelectorAll('[data-coop-role]')) item.classList.toggle('active', item === button);
  });
}

connectButton.addEventListener('click', async () => {
  const input = overlay.querySelector('#coop-room-code');
  input.value = normalizeRoomCode(input.value);
  connectButton.disabled = true;
  try {
    await createTransport().connect({ role: selectedRole, roomCode: input.value });
  } catch (error) {
    updateStatus({ code: 'error', message: error.message });
  }
});
