import { GfaPeerTransport } from './net/peer-transport.js';
import { normalizeRoomCode } from './net/protocol.js';

const launchButton = document.getElementById('title-coop-button');
const overlay = document.getElementById('coop-lobby-overlay');

let selectedRole = 'host';
let transport = null;
const statusElement = overlay.querySelector('#coop-status');
const connectButton = overlay.querySelector('#coop-connect');
const startButton = overlay.querySelector('#coop-start');
const roomInput = overlay.querySelector('#coop-room-code');
let poseTimer = null;

function gameBridge() {
  return window.GFACoopGameBridge || null;
}

function updateStartButton() {
  const canStart = selectedRole === 'host' && Boolean(transport?.connected);
  startButton.hidden = selectedRole !== 'host' || !transport?.connected;
  startButton.disabled = !canStart;
}

function startPoseExchange() {
  if (poseTimer) return;
  poseTimer = window.setInterval(() => {
    if (!transport?.connected) return;
    const pose = gameBridge()?.getLocalPose?.();
    if (pose) transport.sendState('player-pose', pose);
  }, 50);
}

function updateStatus({ code, message }) {
  statusElement.dataset.state = code;
  statusElement.textContent = message;
  if (code === 'error' || code === 'disconnected') connectButton.disabled = false;
  if (code === 'connected') {
    launchButton?.classList.add('connected');
    launchButton.textContent = 'LAN CO-OP CONNECTED';
    updateStartButton();
  }
}

function createTransport() {
  transport?.close();
  transport = new GfaPeerTransport({
    onStatus: updateStatus,
    onConnect(info) {
      gameBridge()?.setSession?.({ connected: true, role: info.role });
      startPoseExchange();
      transport.sendEvent('hello', { role: info.role, build: 'gfa-coop-0.1.0' });
    },
    onState(message) {
      if (message.type === 'player-pose') gameBridge()?.applyRemotePose?.(message.payload);
    },
    onEvent(message) {
      if (message.type === 'hello') transport.sendEvent('hello-ack', { receivedAt: Date.now() });
      if (message.type === 'hello-ack') updateStatus({ code: 'connected', message: 'P2P接続成功・双方向通信確認済み' });
      if (message.type === 'game-start' && selectedRole === 'guest') {
        updateStatus({ code: 'connected', message: 'HOSTの設定でゲームを開始します…' });
        overlay.hidden = true;
        gameBridge()?.startFromHost?.(message.payload);
      }
      if (message.type === 'player-fire') gameBridge()?.showRemoteFire?.(message.payload);
    },
    onDisconnect() {
      gameBridge()?.setSession?.({ connected: false, role: selectedRole });
      updateStartButton();
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
    updateStartButton();
  });
}

connectButton.addEventListener('click', async () => {
  roomInput.blur();
  roomInput.value = normalizeRoomCode(roomInput.value);
  connectButton.disabled = true;
  try {
    await createTransport().connect({ role: selectedRole, roomCode: roomInput.value });
  } catch (error) {
    updateStatus({ code: 'error', message: error.message });
  }
});

startButton.addEventListener('click', () => {
  if (selectedRole !== 'host' || !transport?.connected) return;
  const result = gameBridge()?.startAsHost?.();
  if (!result?.ok) {
    updateStatus({ code: 'error', message: result?.message || 'ゲームを開始できません。' });
    updateStartButton();
    return;
  }
  startButton.disabled = true;
  overlay.hidden = true;
});

window.addEventListener('gfa:game-starting', event => {
  if (selectedRole !== 'host' || !transport?.connected) return;
  transport.sendEvent('game-start', event.detail);
});

window.addEventListener('gfa:player-fire', event => {
  if (!transport?.connected) return;
  transport.sendEvent('player-fire', event.detail);
});

roomInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') roomInput.blur();
});
