import { browser } from '$app/environment';

export function readBool(key, fallback) {
  if (!browser) return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

export function writeBool(key, value) {
  if (!browser) return;
  localStorage.setItem(key, value ? 'true' : 'false');
}

export function readString(key, fallback) {
  if (!browser) return fallback;
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw;
}

export function writeString(key, value) {
  if (!browser) return;
  localStorage.setItem(key, value);
}

export function readInt(key, fallback, allowed = null) {
  if (!browser) return fallback;
  const raw = parseInt(localStorage.getItem(key), 10);
  if (Number.isNaN(raw)) return fallback;
  if (allowed && !allowed.includes(raw)) return fallback;
  return raw;
}

export function writeInt(key, value) {
  if (!browser) return;
  localStorage.setItem(key, String(value));
}
