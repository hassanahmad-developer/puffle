import { useSyncExternalStore } from 'react';

let cursors = {}; // peerId -> { x, y, name, visible }
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());
const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export function updateRemoteCursor(peerId, x, y, name) {
  cursors = { ...cursors, [peerId]: { x, y, name, visible: true } };
  notify();
}

export function hideRemoteCursor(peerId) {
  if (!cursors[peerId]) return;
  cursors = { ...cursors, [peerId]: { ...cursors[peerId], visible: false } };
  notify();
}

export function removeRemoteCursor(peerId) {
  if (!cursors[peerId]) return;
  const next = { ...cursors };
  delete next[peerId];
  cursors = next;
  notify();
}

export function useRemoteCursors() {
  return useSyncExternalStore(subscribe, () => cursors);
}