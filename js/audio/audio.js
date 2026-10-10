import { themeGet, themeAsset } from "../theme/loader.js";
import { getSetting, onSettingsChange } from "../settings/settings.js";
import { getCtx, suspendCtx } from "./ctx.js";

let el = null;
let musicGain = null;
let currentPath = null;
let wantPlaying = false;
let unlockBound = false;
let resumeOnShow = false;
let pendingShow = false;

function applyVolume() {
  if (!el) return;
  const vol = getSetting("musicVolume");
  const muted = getSetting("musicMuted");
  if (musicGain) {
    musicGain.gain.value = muted ? 0 : vol; // pode passar de 1 (até 200%)
  } else {
    el.volume = Math.min(1, vol); // reserva, sem amplificador
    el.muted = muted;
  }
}

// um único player reaproveitado: se o navegador liberar o som uma vez, libera pra todas as faixas
function player() {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    const c = getCtx();
    if (c) {
      try {
        const src = c.createMediaElementSource(el);
        musicGain = c.createGain();
        src.connect(musicGain);
        musicGain.connect(c.destination);
      } catch (err) {
        console.warn("[audio] sem amplificador:", err);
        musicGain = null;
      }
    }
  }
  applyVolume();
  return el;
}

function bindUnlock() {
  if (unlockBound) return;
  unlockBound = true;
  const events = ["click", "touchend", "keydown"];
  const unlock = async () => {
    const c = getCtx();
    try { await c?.resume(); } catch {}
    if (!wantPlaying) return;
    try { await player().play(); } catch { return; } // continua escutando até um gesto válido
    if (!c || c.state === "running") {
      events.forEach((e) => document.removeEventListener(e, unlock, true));
      unlockBound = false;
    }
  };
  events.forEach((e) => document.addEventListener(e, unlock, true));
}

function tryPlay() {
  if (!wantPlaying) return;
  if (document.hidden) { pendingShow = true; return; } // não toca em segundo plano
  player().play().then(() => {
    const c = getCtx();
    if (c && c.state !== "running") bindUnlock();
  }).catch((err) => {
    if (err.name === "NotAllowedError") bindUnlock();
    else console.warn("[audio] não tocou:", err.name, "-", currentPath);
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

  // ao sair do jogo (trocar de app, bloquear a tela, trocar de aba) o som para; ao voltar, retoma
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      resumeOnShow = !!el && !el.paused && !el.ended;
      if (el) el.pause();
      suspendCtx();
    } else {
      const again = wantPlaying && (resumeOnShow || pendingShow);
      resumeOnShow = false;
      pendingShow = false;
      getCtx(); // reativa o áudio
      if (again) tryPlay();
    }
  });
}