import {
  GFA_COOP_CHANNELS,
  GFA_COOP_PROTOCOL_VERSION,
  GFA_COOP_ROLES,
  createEnvelope,
  isValidRoomCode,
  normalizeRoomCode,
  parseEnvelope
} from './protocol.js';

const OPEN = 1;
const DISCONNECT_GRACE_MS = 6000;
const STATE_BUFFER_LIMIT = 128_000;

export class GfaPeerTransport {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.signal = null;
    this.peer = null;
    this.channels = { state: null, event: null };
    this.pendingIce = [];
    this.role = null;
    this.roomCode = '';
    this.sequence = { state: 0, event: 0 };
    this.lastReceivedStateSequence = -1;
    this.disconnectTimer = null;
    this.closedByUser = false;
    this.connected = false;
  }

  async connect({ role, roomCode }) {
    if (!GFA_COOP_ROLES.includes(role)) throw new TypeError('Role must be host or guest');
    if (!isValidRoomCode(roomCode)) throw new TypeError('Room code must contain 4 to 6 letters or numbers');
    this.close();
    this.closedByUser = false;
    this.role = role;
    this.roomCode = normalizeRoomCode(roomCode);
    this._status('signaling', '接続用サーバーへ接続中…');
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    this.signal = new WebSocket(`${scheme}://${location.host}/p2p-signal`);
    this.signal.onopen = () => {
      this._sendSignal({ type: 'join', version: GFA_COOP_PROTOCOL_VERSION, role, roomCode: this.roomCode });
      this._status('waiting', role === 'host' ? 'ゲストの入室を待っています…' : 'ホストの入室を待っています…');
    };
    this.signal.onerror = () => this._status('error', '接続用サーバーへ接続できません。');
    this.signal.onclose = () => {
      if (this.closedByUser) return;
      if (this._channelsOpen()) {
        this._status('connected', 'P2P接続中（接続用サーバー終了後も継続）');
        return;
      }
      if (!this.connected) this._status('error', '接続用サーバーが切断されました。');
    };
    this.signal.onmessage = event => this._handleSignal(event.data);
  }

  sendState(type, payload) {
    const channel = this.channels.state;
    if (this.role !== 'host' || channel?.readyState !== 'open' || channel.bufferedAmount >= STATE_BUFFER_LIMIT) return false;
    channel.send(JSON.stringify(createEnvelope('state', type, this.sequence.state++, payload)));
    return true;
  }

  sendEvent(type, payload) {
    const channel = this.channels.event;
    if (channel?.readyState !== 'open') return false;
    channel.send(JSON.stringify(createEnvelope('event', type, this.sequence.event++, payload)));
    return true;
  }

  close() {
    this.closedByUser = true;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    for (const channel of Object.values(this.channels)) {
      try { channel?.close(); } catch {}
    }
    try { this.peer?.close(); } catch {}
    try { this.signal?.close(); } catch {}
    this.channels = { state: null, event: null };
    this.peer = null;
    this.signal = null;
    this.pendingIce.length = 0;
    this.connected = false;
  }

  _ensurePeer() {
    if (this.peer) return;
    this.peer = new RTCPeerConnection({ iceServers: [] });
    this.peer.onicecandidate = event => {
      if (event.candidate) this._sendSignal({ type: 'ice', candidate: event.candidate });
    };
    this.peer.onconnectionstatechange = () => this._handleConnectionState();
    if (this.role === 'host') {
      this._wireChannel('state', this.peer.createDataChannel(GFA_COOP_CHANNELS.state, { ordered: false, maxRetransmits: 0 }));
      this._wireChannel('event', this.peer.createDataChannel(GFA_COOP_CHANNELS.event, { ordered: true }));
    } else {
      this.peer.ondatachannel = event => {
        const kind = event.channel.label === GFA_COOP_CHANNELS.state ? 'state'
          : event.channel.label === GFA_COOP_CHANNELS.event ? 'event' : null;
        if (kind) this._wireChannel(kind, event.channel);
        else event.channel.close();
      };
    }
  }

  _wireChannel(kind, channel) {
    this.channels[kind] = channel;
    channel.onopen = () => this._checkConnected();
    channel.onclose = () => {
      this.connected = false;
      this._status('disconnected', 'P2Pゲーム通信が切断されました。再入室してください。');
      this.handlers.onDisconnect?.('data-channel-closed');
    };
    channel.onerror = () => this._status('error', `P2P ${kind} 通信でエラーが発生しました。`);
    channel.onmessage = event => this._handleData(kind, event.data);
  }

  async _handleSignal(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    try {
      if (message.type === 'error') {
        this._status('error', message.message || '接続エラー');
      } else if (message.type === 'ready' && this.role === 'host') {
        this._ensurePeer();
        await this.peer.setLocalDescription(await this.peer.createOffer());
        this._sendSignal({ type: 'offer', sdp: this.peer.localDescription });
      } else if (message.type === 'offer' && this.role === 'guest') {
        this._ensurePeer();
        await this.peer.setRemoteDescription(message.sdp);
        await this.peer.setLocalDescription(await this.peer.createAnswer());
        this._sendSignal({ type: 'answer', sdp: this.peer.localDescription });
      } else if (message.type === 'answer' && this.role === 'host' && this.peer) {
        await this.peer.setRemoteDescription(message.sdp);
      } else if (message.type === 'ice' && this.peer) {
        if (this.peer.remoteDescription) await this.peer.addIceCandidate(message.candidate);
        else this.pendingIce.push(message.candidate);
      } else if (message.type === 'peer-left') {
        if (!this._channelsOpen()) {
          this.connected = false;
          this._status('disconnected', '相手が接続用ルームから退出しました。');
        }
      }
      if (this.peer?.remoteDescription && this.pendingIce.length) {
        for (const candidate of this.pendingIce.splice(0)) await this.peer.addIceCandidate(candidate);
      }
    } catch (error) {
      this._status('error', `P2P接続エラー: ${error.message}`);
    }
  }

  _handleData(kind, raw) {
    const message = parseEnvelope(raw, kind);
    if (!message) return;
    if (kind === 'state') {
      if (message.seq <= this.lastReceivedStateSequence) return;
      this.lastReceivedStateSequence = message.seq;
      this.handlers.onState?.(message);
    } else {
      this.handlers.onEvent?.(message);
    }
  }

  _handleConnectionState() {
    const state = this.peer?.connectionState;
    if (state === 'connected') {
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      this._checkConnected();
    } else if (state === 'disconnected') {
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      this._status('unstable', '通信が不安定です。再接続を確認中…');
      this.disconnectTimer = setTimeout(() => {
        this.disconnectTimer = null;
        if (this.peer?.connectionState === 'disconnected') {
          this._status('unstable', 'P2P通信が不安定です。Wi-Fiを確認してください。');
        }
      }, DISCONNECT_GRACE_MS);
    } else if (state === 'failed' || state === 'closed') {
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
      this.connected = false;
      this._status('disconnected', `P2P接続が切断されました（${state}）。`);
      this.handlers.onDisconnect?.(state);
    }
  }

  _checkConnected() {
    if (!this._channelsOpen()) return;
    const firstConnection = !this.connected;
    this.connected = true;
    this._status('connected', 'P2P接続成功');
    if (firstConnection) this.handlers.onConnect?.({ role: this.role, roomCode: this.roomCode });
  }

  _channelsOpen() {
    return this.channels.state?.readyState === 'open' && this.channels.event?.readyState === 'open';
  }

  _sendSignal(message) {
    if (this.signal?.readyState === OPEN) this.signal.send(JSON.stringify(message));
  }

  _status(code, message) {
    this.handlers.onStatus?.({ code, message });
  }
}
