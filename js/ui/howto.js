import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { RULES } from "../config/game-config.js";

const SECTIONS = ["goal", "roles", "round", "limits", "powers", "veto", "tips"];
let root = null;

function vars() {
  return {
    a: themeGet("teams.a.name"),
    b: themeGet("teams.b.name"),
    leader: themeGet("teams.leader.name"),
    winA: RULES.winPolicies.a,
    winB: RULES.winPolicies.b,
    n: RULES.leaderElectionAfter,
    veto: RULES.vetoAfter,
    fails: RULES.failedElectionsLimit,
    pInv: themeGet("powers.investigate.name"),
    pSpec: themeGet("powers.special_election.name"),
    pPeek: themeGet("powers.peek.name"),
    pExec: themeGet("powers.execute.name"),
  };
}

function onKey(e) {
  if (e.key === "Escape") close();
}

function close() {
  if (!root) return;
  root.hidden = true;
  document.removeEventListener("keydown", onKey, true);
}

function open() {
  if (!root) {
    root = document.createElement("div");
    root.id = "howto";
    root.className = "modal";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.addEventListener("click", (e) => { if (e.target === root) close(); });
    document.body.append(root);
  }

  const v = vars();
  const card = document.createElement("div");
  card.className = "modal-card howto-card";
  const h = document.createElement("h3");
  h.textContent = t("howto.title");
  card.append(h);

  for (const key of SECTIONS) {
    const sec = document.createElement("section");
    const sh = document.createElement("h4");
    sh.textContent = t(`howto.${key}_title`, v);
    const p = document.createElement("p");
    p.textContent = t(`howto.${key}_text`, v);
    sec.append(sh, p);
    card.append(sec);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.textContent = t("howto.close");
  btn.addEventListener("click", close);
  card.append(btn);

  root.replaceChildren(card);
  root.hidden = false;
  document.addEventListener("keydown", onKey, true);
  btn.focus();
}

export function initHowTo() {
  const b = document.createElement("button");
  b.id = "btn-help";
  b.type = "button";
  b.className = "mute-btn help-btn";
  b.textContent = "?";
  b.title = t("howto.open");
  b.addEventListener("click", open);
  document.body.append(b);
}