const KEY = "settings.v3";
const DEFAULTS = { musicVolume: 0.3, musicMuted: false, sfxVolume: 2, sfxMuted: false };
const MAX = 2; // 200%
const listeners = new Set();
let current = { ...DEFAULTS };

const clamp = (n) => Math.min(MAX, Math.max(0, Number(n) || 0));

try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved && typeof saved === "object") current = { ...DEFAULTS, ...saved };
} catch {}

export function getSetting(key) { return current[key]; }

export function setSettings(partial) {
  const next = { ...current, ...partial };
  next.musicVolume = clamp(next.musicVolume);
  next.sfxVolume = clamp(next.sfxVolume);
  next.musicMuted = !!next.musicMuted;
  next.sfxMuted = !!next.sfxMuted;
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  listeners.forEach((fn) => fn(current));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}