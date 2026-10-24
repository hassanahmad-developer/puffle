// ---------- Password protection ----------
export const AUTH_TIMEOUT_MS = 60000; // itni der mein password na aaye to channel band
export const AUTH_MAX_FAILURES = 5; // itni galat koshishon ke baad block
export const AUTH_BLOCK_MS = 60000;
export const AUTH_MIN_LENGTH = 4;

// ---------- Firebase (sirf signaling + presence) ----------
// Tip: production mein ye values .env (VITE_*) mein rakho aur Firebase rules lock karo.
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const WAN_ROOT = 'puffle';
export const WAN_STALE_MS = 60000; // itni der heartbeat na aaye to device offline
export const WAN_HEARTBEAT_MS = 20000;

// Strict NAT ho to yahan TURN server add karo:
// { urls: 'turn:your-server:3478', username: '...', credential: '...' }
export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// ---------- File transfer ----------
export const FILE_CHUNK_SIZE = 16 * 1024;
export const MAX_BUFFERED_AMOUNT = 1024 * 1024;

// ---------- Canvas ----------
export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3.0;
export const ZOOM_STEP_BUTTON = 0.15;
export const ZOOM_STEP_WHEEL = 0.08;

export const CURSOR_COLORS = [
  '#ec4899', '#3b82f6', '#10b981', '#f59e0b',
  '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16',
];