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

// cria a linha dentro das opções na primeira vez que for preciso
function ensureRow() {
  if (row && row.isConnected) return true;
  const card = document.querySelector("#options .modal-card");
  const anchor = document.getElementById("opt-close");
  if (!card || !anchor) return false;

  row = document.createElement("div");
  row.className = "opt-install";

  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-secondary";
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    const ev = deferred;
    deferred = null;
    refresh();
    try { await ev.prompt(); await ev.userChoice; } catch {}
  });

  hint = document.createElement("p");
  hint.className = "hint";

  row.append(btn, hint);
  card.insertBefore(row, anchor);
  return true;
}

function refresh() {
  if (!ensureRow()) return;
  const installed = standalone();
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  btn.textContent = t("install.button");
  hint.textContent = t(isIos() ? "install.ios" : "install.menu");
  btn.hidden = installed || !deferred;
  hint.hidden = installed || !!deferred || !(isIos() || touch);
  row.hidden = btn.hidden && hint.hidden;
}

// registrado já na importação: o evento pode disparar antes do jogo terminar de carregar
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  console.log("[install] o navegador liberou a instalação");
  refresh();
});
window.addEventListener("appinstalled", () => { deferred = null; refresh(); });

// atualiza ao abrir as opções (os textos só existem depois que o idioma carrega)
document.addEventListener("click", (e) => {
  if (e.target.closest?.("#btn-options, #btn-open-options")) refresh();
}, true);

export function initInstall() { refresh(); }