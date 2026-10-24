import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  push,
  remove,
  onValue,
  onChildAdded,
  onDisconnect,
  serverTimestamp,
} from 'firebase/database';
import {
  FIREBASE_CONFIG,
  WAN_ROOT,
  WAN_STALE_MS,
  WAN_HEARTBEAT_MS,
} from './config/constats';

/**
 * Firebase sirf signaling + presence ke liye hai.
 * File / canvas / video sab WebRTC se direct jata hai.
 *
 * createWanService({
 *   myId,
 *   getIdentity: () => ({ name, role }),   // hamesha latest name/role
 *   onPeers: (list) => {},                 // [{ id, name, role, transport: 'wan' }]
 *   onSignal: (fromId, data) => {},        // raw signal (role check engine karega)
 *   onToast: (message, type, duration) => {},
 * })
 *
 * Returns { publishPresence, sendSignal, destroy } ya null (agar Firebase init fail ho).
 */
export function createWanService({ myId, getIdentity, onPeers, onSignal, onToast }) {
  let db;
  try {
    const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
    db = getDatabase(app);
  } catch (error) {
    console.error('Firebase init failed:', error);
    onToast(`Firebase init failed: ${error.message}`, 'error', 7000);
    return null;
  }

  const presenceRef = ref(db, `${WAN_ROOT}/presence/${myId}`);
  const mySignalsRef = ref(db, `${WAN_ROOT}/signals/${myId}`);

  let destroyed = false;
  let ready = false;
  let serverOffset = 0;
  let lastPeersKey = '';
  const unsubscribers = [];

  function publishPresence() {
    if (destroyed || !ready) return;
    const { name, role } = getIdentity();
    set(presenceRef, { name, role, ts: serverTimestamp() }).catch((error) =>
      console.error('WAN presence error:', error)
    );
  }

  function sendSignal(peerId, data) {
    if (destroyed) return;
    push(ref(db, `${WAN_ROOT}/signals/${peerId}`), {
      fromId: myId,
      data: JSON.stringify(data),
      ts: serverTimestamp(),
    }).catch((error) => {
      console.error('WAN signal error:', error);
      onToast('WAN signaling failed. Check internet / Firebase rules.', 'error');
    });
  }

  // Server time offset (stale presence check ke liye)
  unsubscribers.push(
    onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
      serverOffset = snap.val() || 0;
    })
  );

  // Connected hote hi presence publish + disconnect par auto-remove
  unsubscribers.push(
    onValue(ref(db, '.info/connected'), (snap) => {
      ready = snap.val() === true;
      if (!ready) return;
      onDisconnect(presenceRef).remove();
      onDisconnect(mySignalsRef).remove();
      publishPresence();
    })
  );

  // Doosre WAN devices
  unsubscribers.push(
    onValue(
      ref(db, `${WAN_ROOT}/presence`),
      (snap) => {
        const value = snap.val() || {};
        const now = Date.now() + serverOffset;
        const list = Object.entries(value)
          .filter(
            ([id, item]) =>
              id !== myId &&
              item &&
              typeof item.name === 'string' &&
              now - (item.ts || 0) < WAN_STALE_MS
          )
          .map(([id, item]) => ({
            id,
            name: item.name,
            role: item.role === 'host' ? 'host' : 'client',
            transport: 'wan',
          }));
        const key = JSON.stringify(list);
        if (key === lastPeersKey) return;
        lastPeersKey = key;
        onPeers(list);
      },
      (error) => {
        console.error('WAN presence listen error:', error);
        onToast('WAN: Firebase rules check karo (read permission).', 'error', 7000);
      }
    )
  );

  // Mujhe aane wale signals (purane saaf karke listen shuru)
  remove(mySignalsRef)
    .catch(() => {})
    .then(() => {
      if (destroyed) return;
      unsubscribers.push(
        onChildAdded(mySignalsRef, (snap) => {
          const value = snap.val();
          remove(snap.ref).catch(() => {});
          if (!value || !value.fromId || typeof value.data !== 'string') return;
          let data;
          try {
            data = JSON.parse(value.data);
          } catch (e) {
            return;
          }
          // Role checks engine (PuffleNetwork) karega, kyunke peers wahin hain
          onSignal(value.fromId, data);
        })
      );
    });

  // Heartbeat taake stale presence na rahe
  const heartbeat = setInterval(publishPresence, WAN_HEARTBEAT_MS);

  const onUnload = () => {
    try {
      remove(presenceRef);
      remove(mySignalsRef);
    } catch (e) {
      /* ignore */
    }
  };
  window.addEventListener('beforeunload', onUnload);

  function destroy() {
    destroyed = true;
    clearInterval(heartbeat);
    window.removeEventListener('beforeunload', onUnload);
    unsubscribers.forEach((off) => {
      try { off(); } catch (e) { /* ignore */ }
    });
    unsubscribers.length = 0;
    remove(presenceRef).catch(() => {});
    remove(mySignalsRef).catch(() => {});
  }

  return { publishPresence, sendSignal, destroy };
}