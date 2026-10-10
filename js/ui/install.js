import { t } from "../i18n/i18n.js";

let deferred = null;
let row = null;
let btn = null;
let hint = null;

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// registrado já na importação: o evento pode disparar antes do jogo terminar de carregar
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  refresh();
});
window.addEventListener("appinstalled", () => { deferred = null; refresh(); });

function refresh() {
  if (!row) return;
  const installed = standalone();
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  btn.hidden = installed || !deferred;
  hint.hidden = installed || !!deferred || !(isIos() || touch);
  hint.textContent = t(isIos() ? "install.ios" : "install.menu");
  row.hidden = btn.hidden && hint.hidden;
}

export function initInstall() {
  const card = document.querySelector("#options .modal-card");
  const anchor = document.getElementById("opt-close");
  if (!card || !anchor || row) return;

  row = document.createElement("div");
  row.className = "opt-install";

  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-secondary";
  btn.textContent = t("install.button");
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    const ev = deferred;
    deferred = null;
    refresh();
    try { await ev.prompt(); await ev.userChoice; } catch {}
  });

  hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = t("install.ios");

  row.append(btn, hint);
  card.insertBefore(row, anchor);
  refresh();
}