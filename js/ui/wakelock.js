import { getSetting, onSettingsChange } from "../settings/settings.js";

let sentinel = null;
let wanted = false;
let pending = false;

const active = () => wanted && getSetting("awake") !== false;

async function acquire() {
  if (pending || !active() || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  if (sentinel && !sentinel.released) return;
  pending = true;
  try {
    const s = await navigator.wakeLock.request("screen");
    if (!active()) { s.release().catch(() => {}); return; } // desligou enquanto pedia
    sentinel = s;
    s.addEventListener("release", () => { if (sentinel === s) sentinel = null; });
  } catch {
    // o navegador recusou (sem suporte ou bateria fraca): o jogo segue normal
  } finally {
    pending = false;
  }
}

function drop() {
  const s = sentinel;
  sentinel = null;
  if (s && !s.released) s.release().catch(() => {});
}

// true = não deixa a tela apagar (enquanto você está numa sala)
export function keepAwake(on) {
  wanted = !!on;
  if (active()) acquire(); else drop();
}

// o navegador solta o bloqueio ao trocar de app: pede de novo ao voltar
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") acquire();
});
document.addEventListener("pointerdown", () => acquire(), { passive: true });
onSettingsChange(() => { if (active()) acquire(); else drop(); });