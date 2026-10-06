import { themeGet, themeAsset } from "../theme/loader.js";
import { t } from "../i18n/i18n.js";

let el = null;
let currentPath = null;
let wantPlaying = false;
let muted = false;
try { muted = localStorage.getItem("muted") === "1"; } catch {}

// um único player reaproveitado: se o navegador liberar o som uma vez, libera pra todas as faixas
function player() {
  if (!el) { el = new Audio(); el.preload = "auto"; el.volume = 0.6; }
  el.muted = muted;
  return el;
}

function tryPlay() {
  if (!wantPlaying) return;
  player().play().catch(() => {
    // o navegador bloqueou o som automático: tenta de novo no próximo toque
    const retry = () => tryPlay();
    document.addEventListener("pointerdown", retry, { once: true });
    document.addEventListener("keydown", retry, { once: true });
  });
}

function play(path, loop) {
  if (!path) return stopAudio();
  const a = player();
  if (currentPath === path && !a.paused) return;
  currentPath = path;
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
  const btn = document.getElementById("btn-mute");
  if (!btn) return;
  const paint = () => { btn.textContent = muted ? "🔇" : "🔊"; };
  btn.title = t("audio.toggle");
  paint();
  btn.addEventListener("click", () => {
    muted = !muted;
    try { localStorage.setItem("muted", muted ? "1" : "0"); } catch {}
    if (el) el.muted = muted;
    paint();
  });
}