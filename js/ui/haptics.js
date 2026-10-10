import { getSetting } from "../settings/settings.js";

export function buzz(pattern = [90, 60, 90]) {
  if (getSetting("vibrate") === false) return;
  try { navigator.vibrate?.(pattern); } catch {}
}