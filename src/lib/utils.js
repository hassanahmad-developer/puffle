import { CURSOR_COLORS } from '../config/constats';

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Browser mein hostname nahi milta, is liye device id/name khud banate hain.
export function createDeviceId() {
  return Math.random().toString(36).substring(2, 10);
}

export function getDeviceName() {
  const KEY = 'puffle-device-name';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
    const name = 'Puffle-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    localStorage.setItem(KEY, name);
    return name;
  } catch (e) {
    return 'Puffle-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  }
}

// Constant-time string compare (password check ke liye)
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

export function formatKB(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}