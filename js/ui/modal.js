import { t } from "../i18n/i18n.js";

const $ = (id) => document.getElementById(id);
let resolver = null;
let bound = false;

function close(result) {
  $("modal").hidden = true;
  document.removeEventListener("keydown", onKey, true);
  const r = resolver;
  resolver = null;
  if (r) r(result);
}

function onKey(e) {
  if (e.key === "Escape") close(false);
}

function bind() {
  if (bound) return;
  bound = true;
  $("modal-ok").addEventListener("click", () => close(true));
  $("modal-cancel").addEventListener("click", () => close(false));
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") close(false); });
}

// devolve uma Promise: true = confirmou, false = cancelou
export function confirmDialog({ title, message, confirm, cancel, danger = false }) {
  bind();
  if (resolver) close(false);
  $("modal-title").textContent = title ?? "";
  $("modal-message").textContent = message ?? "";
  $("modal-ok").textContent = confirm ?? t("common.confirm");
  $("modal-cancel").textContent = cancel ?? t("common.cancel");
  $("modal-ok").className = "btn " + (danger ? "btn-no" : "btn-yes");
  $("modal").hidden = false;
  document.addEventListener("keydown", onKey, true);
  $("modal-cancel").focus(); // foco no "cancelar" evita executar sem querer
  return new Promise((resolve) => { resolver = resolve; });
}