import { useSyncExternalStore } from 'react';

let toasts = [];
let nextId = 1;
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());
const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

// showToast(...) -> { update(text), remove() }  (folder ZIP progress ke liye update chahiye)
export function showToast(message, type = 'info', duration = 4200) {
  const id = nextId++;
  toasts = [...toasts, { id, message, type, leaving: false }];
  notify();

  const remove = () => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  };
  if (duration > 0) {
    setTimeout(() => {
      toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
      notify();
      setTimeout(remove, 220);
    }, duration);
  }
  return {
    update(text) {
      toasts = toasts.map((t) => (t.id === id ? { ...t, message: text } : t));
      notify();
    },
    remove,
  };
}

export function useToasts() {
  return useSyncExternalStore(subscribe, () => toasts);
}