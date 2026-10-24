import { GfaPeerTransport } from './net/peer-transport.js';
import { normalizeRoomCode } from './net/protocol.js';

const COOP_BUILD_ID = '20261024-v23';
const GAME_START_CHUNK_SIZE = 12000;
const GAME_START_MAX_CHUNKS = 256;
const GAME_START_MAX_LENGTH = 2.5 * 1024 * 1024;

const launchButton = document.getElementById('title-coop-button');
const overlay = document.getElementById('coop-lobby-overlay');

let selectedRole = 'host';
let transport = null;
const statusElement = overlay.querySelector('#coop-status');
const connectButton = overlay.querySelector('#coop-connect');
const startButton = overlay.querySelector('#coop-start');
const resetButton = overlay.querySelector('#coop-reset');
const roomInput = overlay.querySelector('#coop-room-code');
let poseTimer = null;
let poseTick = 0;
let pendingGameStart = null;

function gameBridge() {
  return window.GFACoopGameBridge || null;
}

function updateStartButton() {
  const activeRole = transport?.connected ? transport.role : selectedRole;
  const canStart = activeRole === 'host' && Boolean(transport?.connected);
  startButton.hidden = activeRole !== 'host' || !transport?.connected;
  startButton.disabled = !canStart;
}

function lockConnectionForm(locked) {
  roomInput.disabled = locked;
  for (const button of overlay.querySelectorAll('[data-coop-role]')) button.disabled = locked;
}

function startPoseExchange() {
  if (poseTimer) return;
  poseTimer = window.setInterval(() => {
    if (!transport?.connected) return;
    const pose = gameBridge()?.getLocalPose?.();
    if (pose) transport.sendState('player-pose', pose);
    poseTick += 1;
    if (transport.role === 'host' && poseTick % 2 === 0) {
      const world = gameBridge()?.getHostWorldState?.();
      if (world) transport.sendState('world-state', world);
    }
  }, 50);
}

function stopPoseExchange() {
  if (poseTimer) window.clearInterval(poseTimer);
  poseTimer = null;
  poseTick = 0;
}

function beginGuestGame(payload) {
  updateStatus({ code: 'connected', message: 'HOSTの設定とマップでゲームを開始します…' });
  overlay.hidden = true;
  const started = gameBridge()?.startFromHost?.(payload);
  if (started === false) {
    overlay.hidden = false;
    updateStatus({ code: 'error', message: 'HOSTの共有マップを読み込めませんでした。再接続してください。' });
  }
}

function sendGameStart(payload) {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= GAME_START_CHUNK_SIZE) {
    return transport.sendEvent('game-start', payload);
  }
  if (serialized.length > GAME_START_MAX_LENGTH) {
    updateStatus({ code: 'error', message: '共有マップが大きすぎるため送信できません。' });
    return false;
  }
  const transferId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const total = Math.ceil(serialized.length / GAME_START_CHUNK_SIZE);
  transport.sendEvent('game-start-begin', { transferId, total, length: serialized.length });
  for (let index = 0; index < total; index += 1) {
    transport.sendEvent('game-start-chunk', {
      transferId,
      index,
      data: serialized.slice(index * GAME_START_CHUNK_SIZE, (index + 1) * GAME_START_CHUNK_SIZE)
    });
  }
  return transport.sendEvent('game-start-end', { transferId });
}

function receiveGameStartChunk(message) {
  const payload = message.payload || {};
  if (message.type === 'game-start-begin') {
    const total = Number(payload.total);
    const length = Number(payload.length);
    if (!payload.transferId || !Number.isInteger(total) || total < 1 || total > GAME_START_MAX_CHUNKS
        || !Number.isFinite(length) || length < 1 || length > GAME_START_MAX_LENGTH) {
      pendingGameStart = null;
      return;
    }
    pendingGameStart = { transferId: payload.transferId, total, length, chunks: new Array(total) };
    updateStatus({ code: 'connected', message: `HOSTマップを受信中… 0/${total}` });
    return;
  }
  if (!pendingGameStart || payload.transferId !== pendingGameStart.transferId) return;
  if (message.type === 'game-start-chunk') {
    const index = Number(payload.index);
    if (!Number.isInteger(index) || index < 0 || index >= pendingGameStart.total || typeof payload.data !== 'string') return;
    pendingGameStart.chunks[index] = payload.data;
    const received = pendingGameStart.chunks.filter(chunk => typeof chunk === 'string').length;
    updateStatus({ code: 'connected', message: `HOSTマップを受信中… ${received}/${pendingGameStart.total}` });
    return;
  }
  if (message.type === 'game-start-end') {
    const transfer = pendingGameStart;
    pendingGameStart = null;
    if (transfer.chunks.some(chunk => typeof chunk !== 'string')) return;
    const serialized = transfer.chunks.join('');
    if (serialized.length !== transfer.length) return;
    try {
      beginGuestGame(JSON.parse(serialized));
    } catch (error) {
      updateStatus({ code: 'error', message: '共有マップデータが破損しています。再接続してください。' });
    }
  }
}

function resetConnection() {
  stopPoseExchange();
  transport?.close();
  transport = null;
  pendingGameStart = null;
  gameBridge()?.setSession?.({ connected: false, role: selectedRole });
  connectButton.disabled = false;
  lockConnectionForm(false);
  updateStartButton();
  launchButton?.classList.remove('connected');
  if (launchButton) launchButton.textContent = 'LAN CO-OP';
  statusElement.dataset.state = 'idle';
  statusElement.textContent = '接続状態をリセットしました。役割とルームコードを確認して再接続してください。';
  if (window.matchMedia('(pointer: fine)').matches) roomInput.focus({ preventScroll: true });
}

function updateStatus({ code, message }) {
  statusElement.dataset.state = code;
  statusElement.textContent = message;
  if (code === 'error' || code === 'disconnected') {
    connectButton.disabled = false;
    lockConnectionForm(false);
  }
  if (code === 'connected') {
    lockConnectionForm(true);
    launchButton?.classList.add('connected');
    launchButton.textContent = 'LAN CO-OP CONNECTED';
    updateStartButton();
  }
}

function createTransport() {
  stopPoseExchange();
  transport?.close();
  transport = new GfaPeerTransport({
    onStatus: updateStatus,
    onConnect(info) {
      gameBridge()?.setSession?.({ connected: true, role: info.role });
      startPoseExchange();
      transport.sendEvent('hello', {
        role: info.role,
        build: COOP_BUILD_ID,
        character: gameBridge()?.getLocalCharacterCustomization?.()
      });
    },
    onState(message) {
      if (message.type === 'player-pose') gameBridge()?.applyRemotePose?.(message.payload);
      if (message.type === 'world-state') gameBridge()?.applyHostWorldState?.(message.payload);
    },
    onEvent(message) {
      if (message.type === 'hello') {
        gameBridge()?.applyRemoteCharacterCustomization?.(message.payload?.character);
        transport.sendEvent('hello-ack', {
          receivedAt: Date.now(),
          character: gameBridge()?.getLocalCharacterCustomization?.()
        });
      }
      if (message.type === 'hello-ack') updateStatus({
        code: 'connected',
        message: `P2P接続成功・双方向通信確認済み / Build ${COOP_BUILD_ID}`
      });
      if (message.type === 'hello-ack') {
        gameBridge()?.applyRemoteCharacterCustomization?.(message.payload?.character);
      }
      if (message.type === 'game-start' && transport.role === 'guest') beginGuestGame(message.payload);
      if ((message.type === 'game-start-begin' || message.type === 'game-start-chunk'
          || message.type === 'game-start-end') && transport.role === 'guest') receiveGameStartChunk(message);
      if (message.type === 'player-fire') {
        if (transport.role === 'host') gameBridge()?.handleGuestFire?.(message.payload);
        else gameBridge()?.showRemoteFire?.(message.payload);
      }
      if (message.type === 'player-damage' && transport.role === 'guest') {
        gameBridge()?.applyLocalDamage?.(message.payload);
      }
      if (message.type === 'ai-fire' && transport.role === 'guest') {
        gameBridge()?.showHostAIFire?.(message.payload);
      }
      if (message.type === 'remote-player-kill' && transport.role === 'guest') {
        gameBridge()?.playRemotePlayerKill?.(message.payload);
      }
      if (message.type === 'match-result' && transport.role === 'guest') {
        gameBridge()?.applyMatchResult?.(message.payload);
      }
      if (message.type === 'floor-advance' && transport.role === 'guest') {
        gameBridge()?.applyFloorAdvance?.(message.payload);
      }
    },
    onDisconnect() {
      stopPoseExchange();
      gameBridge()?.setSession?.({ connected: false, role: selectedRole });
      lockConnectionForm(false);
      updateStartButton();
    }
  });
  window.GFACoop = Object.freeze({
    get transport() { return transport; },
    get role() { return transport?.role || selectedRole; },
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

resetButton.addEventListener('click', resetConnection);

startButton.addEventListener('click', () => {
  if (transport?.role !== 'host' || !transport.connected) return;
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
  if (transport?.role !== 'host' || !transport.connected) return;
  sendGameStart(event.detail);
});

window.addEventListener('gfa:player-fire', event => {
  if (!transport?.connected) return;
  transport.sendEvent('player-fire', event.detail);
});

window.addEventListener('gfa:remote-player-damage', event => {
  if (transport?.role !== 'host' || !transport.connected) return;
  transport.sendEvent('player-damage', event.detail);
});

window.addEventListener('gfa:ai-fire', event => {
  if (transport?.role !== 'host' || !transport.connected) return;
  transport.sendEvent('ai-fire', event.detail);
});

window.addEventListener('gfa:remote-player-kill', event => {
  if (transport?.role !== 'host' || !transport.connected) return;
  transport.sendEvent('remote-player-kill', event.detail);
});

window.addEventListener('gfa:coop-match-result', event => {
  if (transport?.role !== 'host' || !transport.connected) return;
  transport.sendEvent('match-result', event.detail);
});

window.addEventListener('gfa:coop-floor-advance', event => {
  if (transport?.role !== 'host' || !transport.connected) return;
  transport.sendEvent('floor-advance', event.detail);
});

roomInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') roomInput.blur();
});
