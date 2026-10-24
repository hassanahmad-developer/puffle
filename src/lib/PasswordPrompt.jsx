import { useSyncExternalStore } from 'react';

// Electron mein prompt() nahi chalta tha, is liye custom modal. Promise<string|null> return karta hai.
let current = null;
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());
const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export function askPassword(opts) {
  return new Promise((resolve) => {
    if (current) current.resolveRaw(null);
    current = { opts, resolveRaw: resolve };
    notify();
  });
}

export function closePasswordPrompt(value) {
  const c = current;
  current = null;
  notify();
  if (c) c.resolveRaw(value);
}

export function usePasswordPrompt() {
  return useSyncExternalStore(subscribe, () => current);
}