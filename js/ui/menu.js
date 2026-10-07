import { t } from "../i18n/i18n.js";
import { getSetting, setSettings, onSettingsChange } from "../settings/settings.js";
import { playSfx } from "../audio/sfx.js";
import { show } from "./router.js";

const $ = (id) => document.getElementById(id);
const KINDS = ["music", "sfx"];

function openOptions() {
  $("options").hidden = false;
  document.addEventListener("keydown", onKey, true);
  $("opt-close").focus();
}

function closeOptions() {
  $("options").hidden = true;
  document.removeEventListener("keydown", onKey, true);
}

function onKey(e) {
  if (e.key === "Escape") closeOptions();
}

function sync() {
  for (const kind of KINDS) {
    const vol = Math.round(getSetting(`${kind}Volume`) * 100);
    const muted = getSetting(`${kind}Muted`);
    $(`opt-${kind}`).value = vol;
    $(`opt-${kind}-val`).textContent = `${vol}%`;
    $(`opt-${kind}-mute`).textContent = muted ? "🔇" : "🔊";
    $(`opt-${kind}-mute`).title = t("options.mute");
  }
}

export function initMenu() {
  // navegação: título <-> formulário de sala
  $("btn-play").addEventListener("click", () => show("home"));
  $("btn-back").addEventListener("click", () => show("title"));

  // as opções abrem da tela inicial e do botão fixo (que vale dentro da partida também)
  $("btn-open-options").addEventListener("click", openOptions);
  $("btn-options").title = t("options.open");
  $("btn-options").addEventListener("click", openOptions);
  $("opt-close").addEventListener("click", closeOptions);
  $("options").addEventListener("click", (e) => { if (e.target.id === "options") closeOptions(); });

  for (const kind of KINDS) {
    $(`opt-${kind}`).addEventListener("input", (e) => {
      // mexer na barra tira do mudo
      setSettings({ [`${kind}Volume`]: Number(e.target.value) / 100, [`${kind}Muted`]: false });
    });
    $(`opt-${kind}`).addEventListener("change", () => {
      if (kind === "sfx") playSfx("turn"); // prévia do volume ao soltar a barra
    });
    $(`opt-${kind}-mute`).addEventListener("click", () => {
      setSettings({ [`${kind}Muted`]: !getSetting(`${kind}Muted`) });
    });
  }

  onSettingsChange(sync);
  sync();
}