import { useSyncExternalStore } from 'react';

let items = [];
const timers = {};
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());
const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

function patch(key, p) {
  items = items.map((i) => (i.key === key ? { ...i, ...p } : i));
  notify();
}

export function xferStart(dir, peerId, peerName, fileName, size, index = 0, total = 1) {
  const key = dir + ':' + peerId;
  clearTimeout(timers[key]);
  const base = {
    key,
    dir,
    peerName,
    fileName,
    size: size || 0,
    index: index || 0,
    total: total || 1,
    pct: 0,
    done: false,
    leaving: false,
    title: dir === 'send' ? `Sending to ${peerName}...` : `Receiving from ${peerName}...`,
  };
  if (items.some((i) => i.key === key)) patch(key, base);
  else {
    items = [...items, base];
    notify();
  }
}

export function xferProgress(dir, peerId, done) {
  const key = dir + ':' + peerId;
  const t = items.find((i) => i.key === key);
  if (!t) return;
  const pct = t.size > 0 ? Math.min(100, Math.round((done / t.size) * 100)) : 100;
  patch(key, { pct });
}

export function xferRemove(key) {
  clearTimeout(timers[key]);
  delete timers[key];
  if (!items.some((i) => i.key === key)) return;
  items = items.filter((i) => i.key !== key);
  notify();
}

export function xferFinish(dir, peerId, ok = true) {
  const key = dir + ':' + peerId;
  const t = items.find((i) => i.key === key);
  if (!t) return;
  if (!ok) {
    xferRemove(key);
    return;
  }
  xferProgress(dir, peerId, t.size);
  if (t.index + 1 < t.total) return; // agli file aane wali hai

  patch(key, { done: true, title: 'Completed ✓' });
  timers[key] = setTimeout(() => {
    patch(key, { leaving: true });
    setTimeout(() => xferRemove(key), 300);
  }, 1400);
}

export function useTransfers() {
  return useSyncExternalStore(subscribe, () => items);
}