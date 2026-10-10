import { themeGet, themeAsset } from "../theme/loader.js";
import { getSetting, onSettingsChange } from "../settings/settings.js";
import { getCtx } from "./ctx.js";

const buffers = {}; // nome -> AudioBuffer (undefined/false = usa o som sintetizado)
let sfxGain = null;

// sons sintetizados (reserva): [frequência, início(s), duração(s), tipo, volume]
// "noise" = ruído (a frequência vira o corte do filtro)
const SYNTH = {
  click: [[620, 0, 0.05, "square", 0.06]],
  reveal: [[330, 0, 0.12, "triangle", 0.2], [440, 0.1, 0.12, "triangle", 0.2], [660, 0.2, 0.3, "triangle", 0.2]],
  turn: [[880, 0, 0.1, "sine", 0.22], [1175, 0.12, 0.2, "sine", 0.22]],
  vote_yes: [[520, 0, 0.07, "triangle", 0.22], [780, 0.07, 0.13, "triangle", 0.22]],
  vote_no: [[300, 0, 0.09, "sawtooth", 0.12], [200, 0.09, 0.16, "sawtooth", 0.12]],
  vote_pass: [[523, 0, 0.12, "triangle", 0.22], [659, 0.12, 0.12, "triangle", 0.22], [784, 0.24, 0.28, "triangle", 0.22]],
  vote_fail: [[330, 0, 0.18, "sawtooth", 0.13], [247, 0.18, 0.18, "sawtooth", 0.13], [185, 0.36, 0.3, "sawtooth", 0.13]],
  discard: [[900, 0, 0.12, "noise", 0.2]],
  stamp: [[110, 0, 0.14, "sine", 0.5], [1800, 0, 0.05, "noise", 0.15]],
  policy_a: [[523, 0, 0.15, "triangle", 0.22], [784, 0.1, 0.15, "triangle", 0.22], [1047, 0.2, 0.35, "triangle", 0.22]],
  policy_b: [[110, 0, 0.35, "sawtooth", 0.18], [104, 0.05, 0.4, "sawtooth", 0.14], [1200, 0, 0.1, "noise", 0.1]],
  veto: [[392, 0, 0.12, "square", 0.1], [294, 0.12, 0.12, "square", 0.1], [196, 0.24, 0.3, "square", 0.1]],
  power_investigate: [[1000, 0, 0.08, "sine", 0.2], [1300, 0.1, 0.08, "sine", 0.2], [1000, 0.2, 0.08, "sine", 0.2], [1500, 0.3, 0.2, "sine", 0.2]],
  power_peek: [[600, 0, 0.4, "noise", 0.12], [880, 0.05, 0.25, "sine", 0.12]],
  power_special_election: [[440, 0, 0.1, "square", 0.1], [554, 0.1, 0.1, "square", 0.1], [659, 0.2, 0.1, "square", 0.1], [880, 0.3, 0.3, "square", 0.1]],
    power_execute: [
    [7000, 0, 0.04, "noise", 0.5],     // estalo seco
    [2200, 0, 0.16, "noise", 0.45],    // corpo do disparo
    [140, 0, 0.22, "sine", 0.6],       // pancada grave
    [900, 0.03, 0.55, "noise", 0.16],  // eco
    [400, 0.12, 0.7, "noise", 0.08],   // cauda
  ],
    suspense: [[65, 0, 0.2, "sine", 0.7], [58, 0.22, 0.22, "sine", 0.55], [65, 0.7, 0.2, "sine", 0.8], [58, 0.92, 0.22, "sine", 0.65], [311, 0, 1.3, "sawtooth", 0.05], [440, 0, 1.3, "sawtooth", 0.05]],
    shuffle: [[3000, 0, 0.05, "noise", 0.25], [2600, 0.07, 0.05, "noise", 0.25], [3200, 0.14, 0.05, "noise", 0.25], [2400, 0.21, 0.05, "noise", 0.25], [2800, 0.28, 0.09, "noise", 0.2]],
};

function applyGain() {
  if (sfxGain) sfxGain.gain.value = getSetting("sfxMuted") ? 0 : getSetting("sfxVolume");
}

// saída única de todos os efeitos: é aqui que o volume (0 a 200%) é aplicado
function output() {
  const c = getCtx();
  if (!c) return null;
  if (!sfxGain) {
    sfxGain = c.createGain();
    sfxGain.connect(c.destination);
    applyGain();
  }
  return sfxGain;
}

function synth(name, dest) {
  const notes = SYNTH[name];
  const c = getCtx();
  if (!notes || !c) return;
  const now = c.currentTime;
  for (const [freq, at, dur, type, vol] of notes) {
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, now + at);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + dur);
    let src;
    if (type === "noise") {
      const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      src = c.createBufferSource();
      src.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = freq;
      src.connect(filter);
      filter.connect(gain);
    } else {
      src = c.createOscillator();
      src.type = type;
      src.frequency.value = freq;
      src.connect(gain);
    }
    gain.connect(dest);
    src.start(now + at);
    src.stop(now + at + dur + 0.05);
  }
}

export function playSfx(name, delayMs = 0) {
  if (delayMs) return void setTimeout(() => playSfx(name), delayMs);
  if (document.hidden) return;
  if (getSetting("sfxMuted") || getSetting("sfxVolume") <= 0) return;
  const dest = output();
  if (!dest) return;
  const buf = buffers[name];
  if (buf) {
    const src = getCtx().createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start();
  } else {
    synth(name, dest);
  }
}

export function initSfx() {
  onSettingsChange(applyGain);

  // carrega os arquivos que o tema declarar; se falhar, usa o som sintetizado
  const c = getCtx();
  for (const [name, path] of Object.entries(themeGet("sfx") || {})) {
    if (!c) break;
    fetch(themeAsset(path))
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((data) => c.decodeAudioData(data))
      .then((buf) => { buffers[name] = buf; })
      .catch(() => { buffers[name] = false; });
  }

  // todo botão faz "click", ou o som que declarar em data-sfx
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    playSfx(b.dataset.sfx || "click");
  }, true);
}