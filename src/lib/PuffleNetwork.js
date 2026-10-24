import {
  ICE_SERVERS,
  AUTH_TIMEOUT_MS,
  AUTH_MAX_FAILURES,
  AUTH_BLOCK_MS,
  MAX_BUFFERED_AMOUNT,
} from '../config/constats';
import { safeEqual, createDeviceId, getDeviceName } from './utils';
import { createWanService } from '../wan';

/**
 * PuffleNetwork = original script ka poora networking hissa (React se alag).
 *
 * React ke liye:
 *   engine.subscribe / engine.getSnapshot  -> useSyncExternalStore
 *   engine.on(event, fn)                   -> app level events (return: off())
 *
 * Events:
 *   'toast'            (message, type, duration)
 *   'authorized'       (peerId)                  -> app sendSync(peerId) kare
 *   'message'          (sourceId, msg, peerId)   -> cursor/card/file-meta/sync/clear ...
 *   'binary'           (peerId, arrayBuffer)     -> file chunks
 *   'peer-closed'      (peerId)                  -> cursors / transfers cleanup
 *   'remote-stream'    ({ key, ownerId, ownerName, stream, x, y })
 *   'remote-stream-ended' ({ key, streamId })
 *   'call-owner'       ({ streamId, owner })     -> existing video card update
 *   'call-end'         ({ sourceId, ownerId, streamId })
 *   'local-call-ended' ()
 */
export class PuffleNetwork {
  constructor() {
    this.myId = null;
    this.myName = 'Device';
    this.myRole = 'client';
    this.activeHostId = null;
    this.connectingPeerId = null;

    this.peers = [];
    this.lanPeers = [];
    this.wanPeers = [];
    this.hostClients = [];

    this.peerConnections = {};
    this.dataChannels = {};
    this.pendingCandidates = {};
    this.pendingNegotiations = new Set();
    this.makingOffers = new Set();
    this.hostRelayQueues = {};
    this.signalQueues = {};

    this.forwardedStreams = new Set();
    this.hostIncomingStreams = new Map();
    this.remoteCallOwners = {};
    this.localStream = null;

    // ----- password protection -----
    this.hostPassword = null;
    this.authorizedPeers = new Set();
    this.authPending = new Set();
    this.authTimers = {};
    this.authFailures = {};
    this.blockedUntil = {};
    this.clientPasswords = {};
    this.authRejectedPeers = new Set();
    this.pendingTrackEvents = {};

    this.wan = null;
    this.started = false;
    this.destroyed = false;

    // UI set karega: streamId -> { x, y } (video card ki position)
    this.getStreamPosition = () => null;

    this.listeners = {};
    this.subscribers = new Set();

    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
    this._snapshot = this._buildSnapshot();
  }

  // ==================== tiny event emitter ====================
  on(event, fn) {
    (this.listeners[event] ||= new Set()).add(fn);
    return () => this.listeners[event]?.delete(fn);
  }

  emit(event, ...args) {
    this.listeners[event]?.forEach((fn) => {
      try {
        fn(...args);
      } catch (error) {
        console.error(`Listener error (${event}):`, error);
      }
    });
  }

  toast(message, type = 'info', duration) {
    this.emit('toast', message, type, duration);
  }

  // ==================== React store API ====================
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getSnapshot() {
    return this._snapshot;
  }

  notify() {
    this._snapshot = this._buildSnapshot();
    this.subscribers.forEach((cb) => cb());
  }

  _buildSnapshot() {
    const connectedPeerIds = Object.keys(this.dataChannels).filter((id) => this.isPeerConnected(id));
    const onlineClients =
      this.myRole === 'host'
        ? connectedPeerIds.map((id) => ({ id, name: this.peerNameOf(id, 'Puffle device') }))
        : this.hostClients;
    return {
      myId: this.myId,
      myName: this.myName,
      myRole: this.myRole,
      peers: this.peers,
      activeHostId: this.activeHostId,
      connectingPeerId: this.connectingPeerId,
      hostClients: this.hostClients,
      connectedPeerIds,
      onlineClients,
      hasConnection: connectedPeerIds.length > 0,
      isHostConnected:
        this.myRole === 'host' || Boolean(this.activeHostId && this.isPeerConnected(this.activeHostId)),
      lanAvailable: typeof window !== 'undefined' && Boolean(window.puffleLAN),
    };
  }

  // ==================== lifecycle ====================
  async start() {
    if (this.started) return;
    this.started = true;
    const lan = typeof window !== 'undefined' ? window.puffleLAN : null;

    if (lan) {
      // Electron ke andar chal raha ho to LAN bhi on
      try {
        this.myName = await lan.getMyName();
        this.myRole = await lan.getMyRole();
        this.myId = await lan.getMyId();
        lan.onPeersUpdate((list) => {
          this.lanPeers = list;
          this.rebuildPeers();
        });
        lan.onSignal(({ fromId, data }) => this.enqueueSignal(fromId, data));
        this.lanPeers = await lan.getPeers();
      } catch (error) {
        console.error('Could not initialize Puffle LAN:', error);
        this.toast(`Could not initialize LAN networking: ${error.message}`, 'error', 7000);
      }
    }
    if (!this.myId) {
      this.myName = getDeviceName();
      this.myId = createDeviceId();
    }
    if (this.destroyed) return;

    this.rebuildPeers();
    this.wan = createWanService({
      myId: this.myId,
      getIdentity: () => ({ name: this.myName, role: this.myRole }),
      onPeers: (list) => {
        this.wanPeers = list;
        this.rebuildPeers();
      },
      onSignal: (fromId, data) => this.onWanSignal(fromId, data),
      onToast: (message, type, duration) => this.toast(message, type, duration),
    });
    this.notify();
  }

  destroy() {
    this.destroyed = true;
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    Object.values(this.dataChannels).forEach((ch) => {
      try { ch.close(); } catch (e) { /* ignore */ }
    });
    Object.values(this.peerConnections).forEach((pc) => {
      try { pc.close(); } catch (e) { /* ignore */ }
    });
    if (this.wan) this.wan.destroy();
    Object.values(this.authTimers).forEach(clearTimeout);
    this.subscribers.clear();
    this.listeners = {};
  }

  // ==================== helpers ====================
  peerNameOf(peerId, fallback = 'Device') {
    return (this.peers.find((p) => p.id === peerId) || {}).name || fallback;
  }

  isPeerConnected(peerId) {
    const channel = this.dataChannels[peerId];
    return Boolean(channel && channel.readyState === 'open' && this.authorizedPeers.has(peerId));
  }

  // sirf authorized + open channels
  openPeerIds() {
    return Object.keys(this.dataChannels).filter((id) => this.isPeerConnected(id));
  }

  rebuildPeers() {
    // LAN ko priority: device dono jagah mile to LAN wala use hoga
    const merged = new Map();
    this.wanPeers.forEach((p) => merged.set(p.id, p));
    this.lanPeers.forEach((p) => merged.set(p.id, { ...p, transport: 'lan' }));
    this.peers = Array.from(merged.values());
    this.notify();
    if (this.myRole === 'host') this.broadcastHostRoster();
  }

  // ==================== sending ====================
  broadcast(msg) {
    const str = JSON.stringify(msg);
    this.openPeerIds().forEach((id) => {
      const ch = this.dataChannels[id];
      if (ch && ch.readyState === 'open') {
        try { ch.send(str); } catch (e) { console.error('broadcast error', e); }
      }
    });
  }

  sendTo(peerId, msg) {
    const ch = this.dataChannels[peerId];
    if (!ch || ch.readyState !== 'open') return false;
    ch.send(JSON.stringify(msg));
    return true;
  }

  getChannel(peerId) {
    return this.dataChannels[peerId];
  }

  relayToClient(senderId, data, message = null) {
    if (this.myRole !== 'host') return;
    Object.entries(this.dataChannels).forEach(([peerId, channel]) => {
      if (peerId === senderId || channel.readyState !== 'open' || !this.authorizedPeers.has(peerId)) return;
      const outgoing = message ? JSON.stringify({ ...message, fromId: senderId }) : data;
      const previous = this.hostRelayQueues[peerId] || Promise.resolve();
      this.hostRelayQueues[peerId] = previous
        .then(async () => {
          while (channel.readyState === 'open' && channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          if (channel.readyState === 'open') channel.send(outgoing);
        })
        .catch((error) => {
          console.error('Host relay error:', error);
          this.toast(`Could not relay data to ${this.peerNameOf(peerId)}.`, 'error');
        });
    });
  }

  broadcastHostRoster() {
    if (this.myRole !== 'host') return;
    const clients = this.openPeerIds().map((id) => ({ id, name: this.peerNameOf(id, 'Puffle device') }));
    const message = JSON.stringify({ type: 'host-roster', clients });
    this.openPeerIds().forEach((id) => {
      const channel = this.dataChannels[id];
      if (channel && channel.readyState === 'open') channel.send(message);
    });
  }

  // ==================== signaling ====================
  sendSignalTo(peerId, data) {
    const peer = this.peers.find((item) => item.id === peerId);
    if (peer && peer.transport === 'wan') {
      this.wan?.sendSignal(peerId, data);
    } else if (window.puffleLAN) {
      window.puffleLAN.sendSignal(peerId, data);
    } else {
      this.wan?.sendSignal(peerId, data);
    }
  }

  // WAN signals main process se nahi guzarte, is liye role checks yahan
  onWanSignal(fromId, data) {
    const sender = this.peers.find((peer) => peer.id === fromId);
    if (!sender) return;
    if (this.myRole === 'client' && sender.role !== 'host') return;
    if (this.myRole === 'host' && sender.role !== 'client') return;
    this.enqueueSignal(fromId, data);
  }

  enqueueSignal(fromId, data) {
    // Bahut galat passwords wale device ke signals kuch der ignore karo
    if (this.myRole === 'host' && (this.blockedUntil[fromId] || 0) > Date.now()) return;
    const previous = this.signalQueues[fromId] || Promise.resolve();
    this.signalQueues[fromId] = previous
      .then(() => this.handleSignal(fromId, data))
      .catch((error) => {
        console.error('Signal handling failed:', error);
        this.toast(`Connection signaling failed: ${error.message}`, 'error');
      });
  }

  // ==================== roles / password ====================
  async setRole(nextRole, password = null) {
    if (Object.keys(this.peerConnections).length) {
      this.toast('Disconnect from the current host/clients before changing network mode.', 'error');
      return false;
    }
    try {
      this.myRole = window.puffleLAN ? await window.puffleLAN.setMyRole(nextRole) : nextRole;
      this.hostPassword = this.myRole === 'host' ? password : null;
      this.activeHostId = null;
      this.hostClients = [];
      this.wan?.publishPresence(); // WAN par bhi naya role dikhao
      this.notify();
      this.toast(
        this.myRole === 'host'
          ? 'Puffle Host is ready. Clients need your password to connect.'
          : 'Client mode is ready. Connect to one Puffle Host.',
        'success'
      );
      return true;
    } catch (error) {
      console.error('Could not change network mode:', error);
      this.toast(`Could not change network mode: ${error.message}`, 'error');
      return false;
    }
  }

  changePassword(newPassword) {
    if (this.myRole !== 'host') return;
    this.hostPassword = newPassword;
    this.toast('Host password updated.', 'success');
  }

  clearAuthState(peerId) {
    this.authorizedPeers.delete(peerId);
    clearTimeout(this.authTimers[peerId]);
    delete this.authTimers[peerId];
    this.authPending.delete(peerId);
    delete this.pendingTrackEvents[peerId];
    delete this.clientPasswords[peerId];
  }

  // ----- host side -----
  startAuthChallenge(peerId, channel) {
    this.authPending.add(peerId);
    channel.send(JSON.stringify({ type: 'auth-challenge' }));
    clearTimeout(this.authTimers[peerId]);
    this.authTimers[peerId] = setTimeout(() => {
      if (!this.authorizedPeers.has(peerId) && channel.readyState === 'open') {
        this.toast(`${this.peerNameOf(peerId)} did not enter the password in time. Connection closed.`, 'error');
        channel.close();
      }
    }, AUTH_TIMEOUT_MS);
  }

  authorizePeer(peerId, channel) {
    clearTimeout(this.authTimers[peerId]);
    delete this.authTimers[peerId];
    this.authFailures[peerId] = 0;
    this.authorizedPeers.add(peerId);
    channel.send(JSON.stringify({ type: 'auth-ok' }));
    this.notify();
    this.emit('authorized', peerId);
    this.broadcastHostRoster();
    this.forwardActiveStreamsToClient(peerId);
    // Auth se pehle aaye hue video tracks ab process karo
    const queued = this.pendingTrackEvents[peerId] || [];
    delete this.pendingTrackEvents[peerId];
    queued.forEach((trackEvent) => this.handleRemoteTrack(peerId, trackEvent));
    this.toast(`${this.peerNameOf(peerId)} connected to this Puffle Host.`, 'success');
  }

  verifyClientPassword(peerId, password) {
    if (this.authorizedPeers.has(peerId)) return;
    const channel = this.dataChannels[peerId];
    // har challenge sirf ek baar use hota hai
    const hadChallenge = this.authPending.delete(peerId);
    if (!channel || channel.readyState !== 'open' || !hadChallenge || !this.hostPassword) return;

    if (safeEqual(this.hostPassword, password)) {
      this.authorizePeer(peerId, channel);
      return;
    }

    this.authFailures[peerId] = (this.authFailures[peerId] || 0) + 1;
    if (this.authFailures[peerId] >= AUTH_MAX_FAILURES) {
      this.blockedUntil[peerId] = Date.now() + AUTH_BLOCK_MS;
      this.authFailures[peerId] = 0;
      this.toast(`${this.peerNameOf(peerId)} was blocked for 60 seconds after too many wrong passwords.`, 'error', 6000);
    } else {
      this.toast(`${this.peerNameOf(peerId)} entered a wrong password.`, 'error');
    }
    channel.send(JSON.stringify({ type: 'auth-fail' }));
    setTimeout(() => {
      if (channel.readyState === 'open') channel.close();
    }, 250);
  }

  // ----- client side -----
  respondToChallenge(hostId) {
    const password = this.clientPasswords[hostId];
    const channel = this.dataChannels[hostId];
    if (!password || !channel || channel.readyState !== 'open') return;
    channel.send(JSON.stringify({ type: 'auth-response', password }));
  }

  onClientAuthorized(hostId) {
    this.authorizedPeers.add(hostId);
    delete this.clientPasswords[hostId];
    if (this.connectingPeerId === hostId) this.connectingPeerId = null;
    this.notify();
    this.emit('authorized', hostId);
    this.toast('Connected to Puffle Host. Your workspace is shared through the host.', 'success');
  }

  onClientRejected(hostId) {
    this.authRejectedPeers.add(hostId);
    delete this.clientPasswords[hostId];
    this.toast('Wrong password. The host rejected the connection.', 'error', 6000);
    const channel = this.dataChannels[hostId];
    if (channel && channel.readyState !== 'closed') channel.close();
  }

  // true = message auth ka tha aur handle ho gaya
  handleAuthMessage(peerId, msg) {
    switch (msg.type) {
      case 'auth-challenge':
        if (this.myRole === 'client' && peerId === this.activeHostId) {
          try {
            this.respondToChallenge(peerId);
          } catch (error) {
            console.error('Password send failed:', error);
            this.toast(`Could not send the password: ${error.message}`, 'error');
          }
        }
        return true;
      case 'auth-ok':
        if (this.myRole === 'client' && peerId === this.activeHostId) this.onClientAuthorized(peerId);
        return true;
      case 'auth-fail':
        if (this.myRole === 'client' && peerId === this.activeHostId) this.onClientRejected(peerId);
        return true;
      case 'auth-response':
        if (this.myRole === 'host' && typeof msg.password === 'string') {
          try {
            this.verifyClientPassword(peerId, msg.password);
          } catch (error) {
            console.error('Password verification failed:', error);
          }
        }
        return true;
      default:
        return false;
    }
  }

  // ==================== connect / disconnect ====================
  // UI password poochne se pehle ye call kare. null = ok, warna error message.
  validateConnect(peerId) {
    const peer = this.peers.find((item) => item.id === peerId);
    if (this.myRole !== 'client' || !peer || peer.role !== 'host') {
      return 'Clients can connect only to a Puffle Host.';
    }
    if (this.activeHostId && this.activeHostId !== peerId) {
      return 'This client is already connected to another host.';
    }
    if (this.peerConnections[peerId] || this.connectingPeerId) return 'busy';
    return null;
  }

  async connectToPeer(peerId, password) {
    // Popup khula tha us dauran state badal sakti hai
    if (
      this.peerConnections[peerId] ||
      this.connectingPeerId ||
      (this.activeHostId && this.activeHostId !== peerId)
    ) {
      return;
    }
    this.clientPasswords[peerId] = password;
    this.activeHostId = peerId;
    this.connectingPeerId = peerId;
    this.notify();
    try {
      const pc = this.createPeerConnection(peerId);
      this.setupDataChannel(peerId, pc.createDataChannel('puffle-files', { ordered: true }));
      this.addLocalTracks(pc);
      await this.sendPeerOffer(peerId, pc);
    } catch (error) {
      console.error('Could not connect to Puffle Host:', error);
      delete this.clientPasswords[peerId];
      this.connectingPeerId = null;
      this.activeHostId = null;
      this.notify();
    }
  }

  disconnectFromHost(peerId) {
    if (peerId !== this.activeHostId) return;
    if (this.localStream) this.stopCall();
    const channel = this.dataChannels[peerId];
    const connection = this.peerConnections[peerId];
    if (channel && channel.readyState !== 'closed') channel.close();
    if (connection && connection.signalingState !== 'closed') connection.close();
    this.toast('Disconnected from Puffle Host.', 'info');
  }

  // ==================== peer connection ====================
  createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections[peerId] = pc;

    pc.onconnectionstatechange = () => {
      console.log('Connection state with ' + peerId + ':', pc.connectionState);
      if (pc.connectionState === 'connected') this.notify();
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.connectingPeerId === peerId) this.connectingPeerId = null;
        if (pc.connectionState === 'failed') {
          this.toast(`Connection to ${this.peerNameOf(peerId)} failed.`, 'error');
          const ch = this.dataChannels[peerId];
          if (ch && ch.readyState !== 'closed') ch.close();
        }
        this.pendingNegotiations.delete(peerId);
        this.makingOffers.delete(peerId);
        delete this.pendingCandidates[peerId];
        delete this.peerConnections[peerId];
        delete this.dataChannels[peerId];
        this.clearAuthState(peerId);
        if (this.activeHostId === peerId) {
          this.activeHostId = null;
          this.hostClients = [];
        }
        this.notify();
      }
    };

    pc.oniceconnectionstatechange = () => console.log('ICE state:', pc.iceConnectionState);
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.sendSignalTo(peerId, {
        type: 'candidate',
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        },
      });
    };
    pc.ondatachannel = (event) => this.setupDataChannel(peerId, event.channel);
    pc.ontrack = (event) => this.handleRemoteTrack(peerId, event);
    return pc;
  }

  addLocalTracks(pc) {
    if (!this.localStream) return false;
    let added = false;
    this.localStream.getTracks().forEach((track) => {
      if (!pc.getSenders().some((sender) => sender.track === track)) {
        pc.addTrack(track, this.localStream);
        added = true;
      }
    });
    return added;
  }

  async sendPeerOffer(peerId, pc) {
    if (pc.signalingState !== 'stable' || this.makingOffers.has(peerId)) {
      this.pendingNegotiations.add(peerId);
      return;
    }
    this.makingOffers.add(peerId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignalTo(peerId, {
        type: 'offer',
        sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
      });
    } catch (error) {
      console.error('Error creating peer offer:', error);
      if (this.connectingPeerId === peerId) {
        this.connectingPeerId = null;
        this.activeHostId = null;
        this.notify();
      }
    } finally {
      this.makingOffers.delete(peerId);
    }
  }

  async flushCandidates(peerId, pc) {
    const list = this.pendingCandidates[peerId] || [];
    delete this.pendingCandidates[peerId];
    for (const c of list) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.error('flush candidate error:', e);
      }
    }
  }

  async handleSignal(fromId, data) {
    if (this.myRole === 'client' && fromId !== this.activeHostId) {
      console.warn('Ignoring a signal from a device that is not the selected host:', fromId);
      return;
    }
    console.log('%c← Received signal from ' + fromId + ' | type: ' + data?.type, 'color: #8b5cf6');

    let pc = this.peerConnections[fromId];

    // ---------- OFFER ----------
    if (data.type === 'offer') {
      if (!data.sdp || !data.sdp.type || !data.sdp.sdp) {
        console.error('Invalid offer received');
        return;
      }

      while (pc && this.makingOffers.has(fromId) && pc.signalingState === 'stable') {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const collision = Boolean(pc && pc.signalingState !== 'stable');
      if (collision && this.myRole !== 'host') {
        console.warn('Ignoring a colliding offer; the host is responsible for renegotiation.');
        return;
      }
      if (collision) {
        if (pc.signalingState !== 'have-local-offer') return;
        console.log('Offer collision; host rolling back its offer.');
        this.pendingNegotiations.add(fromId);
        await pc.setLocalDescription({ type: 'rollback' });
        this.makingOffers.delete(fromId);
      }

      if (!pc) pc = this.createPeerConnection(fromId);

      try {
        const tracksAdded = this.addLocalTracks(pc);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await this.flushCandidates(fromId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.sendSignalTo(fromId, {
          type: 'answer',
          sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
        });
        if (tracksAdded) this.pendingNegotiations.add(fromId);
        if (this.pendingNegotiations.has(fromId)) {
          this.pendingNegotiations.delete(fromId);
          await this.sendPeerOffer(fromId, pc);
        }
      } catch (err) {
        console.error('Error handling offer:', err);
        this.toast(`Could not accept connection from ${this.peerNameOf(fromId)}: ${err.message}`, 'error');
      }
    }

    // ---------- ANSWER ----------
    if (data.type === 'answer') {
      if (!pc) {
        console.warn('Received answer but no PeerConnection exists');
        return;
      }
      if (!data.sdp || !data.sdp.type || !data.sdp.sdp) {
        console.error('Invalid answer');
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await this.flushCandidates(fromId, pc);
        if (this.pendingNegotiations.has(fromId)) {
          this.pendingNegotiations.delete(fromId);
          await this.sendPeerOffer(fromId, pc);
        }
      } catch (err) {
        console.error('Error setting answer:', err);
        this.toast(`Could not complete connection with ${this.peerNameOf(fromId)}: ${err.message}`, 'error');
      }
    }

    // ---------- CANDIDATE ----------
    if (data.type === 'candidate') {
      if (!data.candidate) return;
      // pc abhi bana hi nahi ya remote description set nahi hui -> queue karo
      if (!pc || !pc.remoteDescription) {
        (this.pendingCandidates[fromId] ||= []).push(data.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('addIceCandidate error:', err);
      }
    }
  }

  // ==================== data channel ====================
  setupDataChannel(peerId, channel) {
    this.dataChannels[peerId] = channel;
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log('DataChannel open with ' + peerId);
      // Host: password challenge bhejo. Client: auth-ok par connected hoga.
      if (this.myRole === 'host') this.startAuthChallenge(peerId, channel);
      this.notify();
    };

    channel.onclose = () => {
      if (this.connectingPeerId === peerId) this.connectingPeerId = null;
      console.log('DataChannel closed with', peerId);
      const connection = this.peerConnections[peerId];
      delete this.dataChannels[peerId];
      delete this.peerConnections[peerId];
      if (connection && connection.signalingState !== 'closed') connection.close();
      this.pendingNegotiations.delete(peerId);
      this.makingOffers.delete(peerId);
      delete this.pendingCandidates[peerId];
      this.clearAuthState(peerId);
      this.emit('peer-closed', peerId); // cursors + transfers cleanup
      if (this.activeHostId === peerId) {
        this.activeHostId = null;
        this.hostClients = [];
        if (this.authRejectedPeers.has(peerId)) this.authRejectedPeers.delete(peerId);
        else this.toast('Connection to Puffle Host was lost.', 'error');
      }
      if (this.myRole === 'host') this.broadcastHostRoster();
      this.notify();
    };

    channel.onerror = (err) => {
      console.error('DataChannel error:', err);
      this.toast(`Connection error with ${this.peerNameOf(peerId)}.`, 'error');
    };

    channel.onmessage = (event) => this.handleIncomingData(peerId, event.data);
  }

  handleIncomingData(peerId, data) {
    const authorized = this.authorizedPeers.has(peerId);
    if (typeof data === 'string') {
      let msg;
      try { msg = JSON.parse(data); } catch (e) { return; }
      if (!msg || typeof msg.type !== 'string') return;

      // Password wale messages hamesha pehle handle hote hain, kabhi relay nahi hote
      if (msg.type.startsWith('auth-')) {
        this.handleAuthMessage(peerId, msg);
        return;
      }
      // Password verify hone tak kuch bhi accept nahi
      if (!authorized) return;

      try {
        if (this.myRole === 'host' && msg.type !== 'host-roster') this.relayToClient(peerId, data, msg);
        this.handleMessage(peerId, msg);
      } catch (e) {
        console.error('message handling error:', e);
        this.toast(`Could not process a message from ${this.peerNameOf(peerId)}.`, 'error');
      }
    } else {
      if (!authorized) return;
      this.emit('binary', peerId, data);
      if (this.myRole === 'host') this.relayToClient(peerId, data);
    }
  }

  // Engine sirf network-level messages khud handle karta hai, baqi app ko emit
  handleMessage(peerId, msg) {
    const sourceId =
      this.myRole === 'client' && peerId === this.activeHostId && msg.fromId ? msg.fromId : peerId;

    switch (msg.type) {
      case 'host-roster':
        if (this.myRole === 'client' && peerId === this.activeHostId) {
          this.hostClients = Array.isArray(msg.clients) ? msg.clients : [];
          this.notify();
        }
        break;

      case 'host-call':
        if (this.myRole === 'client' && peerId === this.activeHostId) {
          this.setRemoteCallOwner(msg.streamId, msg.ownerId, msg.ownerName, msg.x, msg.y);
        }
        break;

      case 'call-start': {
        const ownerId = msg.ownerId || sourceId;
        const ownerName = msg.ownerName || this.peerNameOf(ownerId);
        this.setRemoteCallOwner(msg.streamId, ownerId, ownerName, msg.x, msg.y);
        break;
      }

      case 'call-end':
        this.emit('call-end', { sourceId, ownerId: msg.ownerId, streamId: msg.streamId });
        if (msg.streamId) delete this.remoteCallOwners[msg.streamId];
        break;

      default:
        this.emit('message', sourceId, msg, peerId);
    }
  }

  // ==================== video call plumbing ====================
  setRemoteCallOwner(streamId, ownerId, ownerName, x, y) {
    const previous = this.remoteCallOwners[streamId] || {};
    const owner = {
      id: ownerId || previous.id,
      name: ownerName || previous.name,
      x: Number.isFinite(x) ? x : previous.x,
      y: Number.isFinite(y) ? y : previous.y,
    };
    this.remoteCallOwners[streamId] = owner;
    this.emit('call-owner', { streamId, owner });
  }

  forwardActiveStreamsToClient(clientId) {
    if (this.myRole !== 'host') return;
    const clientChannel = this.dataChannels[clientId];
    const clientConnection = this.peerConnections[clientId];
    if (!clientChannel || clientChannel.readyState !== 'open' || !clientConnection) return;

    let tracksAdded = false;
    const activeStreams = [];
    if (this.localStream) {
      activeStreams.push({ stream: this.localStream, ownerId: 'host', ownerName: this.myName });
    }
    this.hostIncomingStreams.forEach((streams, ownerId) => {
      const owner = this.peers.find((peer) => peer.id === ownerId);
      streams.forEach((stream) =>
        activeStreams.push({ stream, ownerId, ownerName: owner ? owner.name : 'Puffle device' })
      );
    });

    activeStreams.forEach(({ stream, ownerId, ownerName }) => {
      const message = { type: 'host-call', ownerId, ownerName, streamId: stream.id };
      const pos = this.getStreamPosition(stream.id);
      if (pos) {
        message.x = pos.x;
        message.y = pos.y;
      }
      clientChannel.send(JSON.stringify(message));
      stream.getTracks().forEach((track) => {
        if (
          track.readyState === 'live' &&
          !clientConnection.getSenders().some((sender) => sender.track === track)
        ) {
          clientConnection.addTrack(track, stream);
          tracksAdded = true;
        }
      });
    });

    if (tracksAdded) {
      if (clientConnection.signalingState === 'stable') this.sendPeerOffer(clientId, clientConnection);
      else this.pendingNegotiations.add(clientId);
    }
  }

  handleRemoteTrack(peerId, event) {
    // Host: password pass hone se pehle koi video/audio accept nahi (queue mein rakho)
    if (this.myRole === 'host' && !this.authorizedPeers.has(peerId)) {
      (this.pendingTrackEvents[peerId] ||= []).push(event);
      return;
    }

    const stream = event.streams[0] || new MediaStream([event.track]);

    if (this.myRole === 'host') {
      let streams = this.hostIncomingStreams.get(peerId);
      if (!streams) {
        streams = new Map();
        this.hostIncomingStreams.set(peerId, streams);
      }
      streams.set(stream.id, stream);
      const streamKey = peerId + ':' + stream.id;
      if (!this.forwardedStreams.has(streamKey)) {
        this.forwardedStreams.add(streamKey);
        const owner = this.peers.find((peer) => peer.id === peerId);
        const pos = this.getStreamPosition(stream.id);
        this.relayToClient(peerId, null, {
          type: 'host-call',
          ownerId: peerId,
          ownerName: owner ? owner.name : 'Puffle device',
          streamId: stream.id,
          x: pos ? pos.x : undefined,
          y: pos ? pos.y : undefined,
        });
      }

      this.openPeerIds().forEach((clientId) => {
        if (clientId === peerId) return;
        const destination = this.peerConnections[clientId];
        if (!destination || destination.connectionState === 'closed') return;
        if (!destination.getSenders().some((sender) => sender.track === event.track)) {
          destination.addTrack(event.track, stream);
          if (destination.signalingState === 'stable') this.sendPeerOffer(clientId, destination);
          else this.pendingNegotiations.add(clientId);
        }
      });
      event.track.addEventListener(
        'ended',
        () => {
          if ([...stream.getTracks()].every((track) => track.readyState === 'ended')) {
            streams.delete(stream.id);
            this.forwardedStreams.delete(streamKey);
            if (!streams.size) this.hostIncomingStreams.delete(peerId);
          }
        },
        { once: true }
      );
    }

    const viaHost = this.myRole === 'client' && peerId === this.activeHostId;
    const ownerId = viaHost ? (this.remoteCallOwners[stream.id] || {}).id || peerId : peerId;
    const ownerName = viaHost
      ? (this.remoteCallOwners[stream.id] || {}).name || 'Video call via Puffle Host'
      : this.peerNameOf(ownerId, 'Puffle device');
    const layout = this.remoteCallOwners[stream.id] || {};
    const key = ownerId + ':' + stream.id;

    // UI card banata hai (key se duplicate check) aur 'ended' par hata deta hai
    this.emit('remote-stream', { key, ownerId, ownerName, stream, x: layout.x, y: layout.y });
    event.track.addEventListener(
      'ended',
      () => {
        if (![...stream.getTracks()].every((track) => track.readyState === 'ended')) return;
        delete this.remoteCallOwners[stream.id];
        this.emit('remote-stream-ended', { key, streamId: stream.id });
      },
      { once: true }
    );
  }

  // ==================== local call (camera/mic) ====================
  // Returns: kitne devices ko share hua (0 = sirf local preview)
  async startCall(stream, x, y) {
    this.localStream = stream;
    const recipientIds =
      this.myRole === 'host'
        ? this.openPeerIds()
        : this.activeHostId && this.isPeerConnected(this.activeHostId)
          ? [this.activeHostId]
          : [];
    if (!recipientIds.length) {
      this.toast('Camera preview is local only: connect to a Puffle Host first to share your call.', 'error');
      return 0;
    }
    this.broadcast({
      type: 'call-start',
      streamId: stream.id,
      ownerId: this.myRole === 'host' ? 'host' : undefined,
      ownerName: this.myName,
      x,
      y,
    });
    for (const peerId of recipientIds) {
      const pc = this.peerConnections[peerId];
      if (!pc || !this.addLocalTracks(pc)) continue;
      if (pc.signalingState === 'stable') await this.sendPeerOffer(peerId, pc);
      else this.pendingNegotiations.add(peerId);
    }
    this.toast(
      `Video call is being shared with ${recipientIds.length} connected ${recipientIds.length === 1 ? 'device' : 'devices'}.`,
      'success'
    );
    return recipientIds.length;
  }

  stopCall() {
    if (this.localStream) {
      const stopped = this.localStream;
      this.broadcast({
        type: 'call-end',
        streamId: stopped.id,
        ownerId: this.myRole === 'host' ? 'host' : undefined,
      });
      Object.entries(this.peerConnections).forEach(([peerId, pc]) => {
        pc.getSenders().forEach((sender) => {
          if (stopped.getTracks().includes(sender.track)) pc.removeTrack(sender);
        });
        if (pc.signalingState === 'stable') this.sendPeerOffer(peerId, pc);
        else this.pendingNegotiations.add(peerId);
      });
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.emit('local-call-ended');
  }
}