import { themeGet, themeAsset } from "../theme/loader.js";
import { getSetting, setSettings, onSettingsChange } from "../settings/settings.js";
import { t } from "../i18n/i18n.js";

let el = null;
let currentPath = null;
let wantPlaying = false;
let unlockBound = false;

function applyVolume() {
  if (!el) return;
  el.volume = getSetting("musicVolume");
  el.muted = getSetting("musicMuted");
}

// um único player reaproveitado: se o navegador liberar o som uma vez, libera pra todas as faixas
function player() {
  if (!el) { el = new Audio(); el.preload = "auto"; }
  applyVolume();
  return el;
}

function bindUnlock() {
  if (unlockBound) return;
  unlockBound = true;
  const events = ["click", "touchend", "keydown"];
  const unlock = () => {
    if (!wantPlaying) return;
    player().play().then(() => {
      events.forEach((e) => document.removeEventListener(e, unlock, true));
      unlockBound = false;
    }).catch(() => {}); // continua escutando até um gesto válido
  };
  events.forEach((e) => document.addEventListener(e, unlock, true));
}

function tryPlay() {
  if (!wantPlaying) return;
  player().play().catch((err) => {
    if (err.name === "NotAllowedError") bindUnlock();
  });
}

function play(path, loop) {
  if (!path) return stopAudio();
  const a = player();
  if (currentPath === path && !a.paused) return;
  currentPath = path;
  a.onerror = () => console.error("[audio] arquivo não carregou (404 ou formato):", a.src);
  a.src = themeAsset(path);
  a.loop = loop;
  a.currentTime = 0;
  wantPlaying = true;
  tryPlay();
}

export function stopAudio() {
  wantPlaying = false;
  currentPath = null;
  if (el) el.pause();
}

export function playLobby() { play(themeGet("audio.lobby"), true); }

export function playAmbient(party) {
  const cfg = themeGet("audio.ambient") || {};
  play(cfg.mode === "per_team" ? cfg[party] : cfg.neutral, true);
}

export function playVictory(team) { play(themeGet(`audio.victory.${team}`), false); }

export function initAudio() {
  onSettingsChange(applyVolume);

  // botão provisório: liga/desliga música E efeitos juntos.
  // Quando o menu existir, é só remover este botão: o menu usa setSettings direto.
  const btn = document.getElementById("btn-mute");
  if (!btn) return;
  const allMuted = () => getSetting("musicMuted") && getSetting("sfxMuted");
  const paint = () => { btn.textContent = allMuted() ? "🔇" : "🔊"; };
  btn.title = t("audio.toggle");
  btn.addEventListener("click", () => {
    const mute = !allMuted();
    setSettings({ musicMuted: mute, sfxMuted: mute });
  });
  onSettingsChange(paint);
  paint();
}