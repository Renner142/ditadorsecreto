const KEY = "session.v1";
const MAX_AGE = 24 * 60 * 60 * 1000; // esquece sessões com mais de 24h

export function saveSession(data) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...data, at: Date.now() })); } catch {}
}

export function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.code && s.nickname && Date.now() - (s.at || 0) < MAX_AGE) return s;
  } catch {}
  return null;
}

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch {}
}