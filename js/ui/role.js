import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { watchPrivate } from "../net/game.js";
import { show } from "./router.js";
import { RULES } from "../config/game-config.js";

const $ = (id) => document.getElementById(id);
let started = false;

export function showRole(user, code, players) {
  if (started) return;
  started = true;
  show("role");

  const content = $("role-content");
  const peek = $("btn-peek");

  if (RULES.holdToReveal) {
    const open = () => (content.hidden = false);
    const close = () => (content.hidden = true);
    peek.addEventListener("pointerdown", open);
    ["pointerup", "pointerleave", "pointercancel"].forEach((e) => peek.addEventListener(e, close));
    peek.addEventListener("contextmenu", (e) => e.preventDefault());
  } else {
    peek.hidden = true;
    content.hidden = false;
  }

  watchPrivate(code, user.uid, (info) => info && render(info, players));
}

function render(info, players) {
  const name = $("role-name");
  name.textContent = themeGet(`teams.${info.role}.name`);
  name.dataset.team = info.party;
  $("role-party").textContent = t("role.party", { party: themeGet(`teams.${info.party}.name`) });

  const known = info.known || [];
  const list = $("role-known");
  list.innerHTML = "";
  known.forEach((k) => {
    const li = document.createElement("li");
    li.textContent = `${players[k.uid]?.name ?? "?"} — ${themeGet(`teams.${k.role}.name`)}`;
    list.appendChild(li);
  });

  let hint = "role.hint_a";
  if (info.role === "b") hint = "role.hint_b";
  if (info.role === "leader") hint = known.length ? "role.hint_leader_known" : "role.hint_leader_blind";
  $("role-hint").textContent = t(hint);
}