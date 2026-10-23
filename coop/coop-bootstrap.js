import { GfaPeerTransport } from './net/peer-transport.js';
import { normalizeRoomCode } from './net/protocol.js';

const launchButton = document.getElementById('title-coop-button');
const overlay = document.createElement('div');
overlay.id = 'coop-lobby-overlay';
overlay.hidden = true;
overlay.innerHTML = `
  <section id="coop-lobby" role="dialog" aria-modal="true" aria-labelledby="coop-lobby-title">
    <button id="coop-lobby-close" type="button" aria-label="閉じる">×</button>
    <h2 id="coop-lobby-title">GFA LAN CO-OP</h2>
    <p class="coop-lobby-help">同じWi-Fiまたはテザリングに接続し、2台で同じルームコードを入力してください。</p>
    <div class="coop-role-buttons">
      <button type="button" data-coop-role="host" class="active">HOST / PLAYER 1</button>
      <button type="button" data-coop-role="guest">GUEST / PLAYER 2</button>
    </div>
    <label class="coop-room-field">ROOM CODE
      <input id="coop-room-code" maxlength="6" value="GFA001" autocomplete="off" inputmode="text">
    </label>
    <button id="coop-connect" type="button">P2P接続を開始</button>
    <div id="coop-status" role="status">未接続</div>
    <p class="coop-lobby-note">初回接続にはシグナリングサーバーへの通信が必要です。ゲーム状態は接続後に端末間で直接交換します。</p>
  </section>`;
document.body.appendChild(overlay);

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

launchButton?.addEventListener('click', () => {
  overlay.hidden = false;
  overlay.querySelector('#coop-room-code').focus();
});
overlay.querySelector('#coop-lobby-close').addEventListener('click', () => { overlay.hidden = true; });
overlay.addEventListener('click', event => { if (event.target === overlay) overlay.hidden = true; });

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
