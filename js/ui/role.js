import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { RULES } from "../config/game-config.js";
import { watchPrivate } from "../net/game.js";
import { playAmbient } from "../audio/audio.js";
import { playSfx } from "../audio/sfx.js";
import { setBackground } from "./background.js";
import { show } from "./router.js";

const $ = (id) => document.getElementById(id);
let started = false;
let stop = null;
let timer = null;
let peekBound = false;

// chamado ao voltar para a sala, pra a próxima partida começar do zero
export function resetRole() {
  started = false;
  if (stop) stop();
  stop = null;
  clearTimeout(timer);
}

export function showRole(user, code, players, onDone) {
  if (started) return;
  started = true;
  show("role");

  const content = $("role-content");
  const peek = $("btn-peek");

  if (RULES.holdToReveal) {
    peek.hidden = false;
    content.hidden = true;
    if (!peekBound) {
      peekBound = true;
      const open = () => (content.hidden = false);
      const close = () => (content.hidden = true);
      peek.addEventListener("pointerdown", open);
      ["pointerup", "pointerleave", "pointercancel"].forEach((e) => peek.addEventListener(e, close));
      peek.addEventListener("contextmenu", (e) => e.preventDefault());
    }
  } else {
    peek.hidden = true;
    content.hidden = false;
  }

  let counting = false;
  stop = watchPrivate(code, user.uid, (info) => {
    if (!info) return;
    render(info, players);
    setBackground({ party: info.party });
    if (counting) return;
    counting = true; // a contagem só começa quando o papel já chegou
    playAmbient(info.party);
    playSfx("reveal");
    countdown(RULES.roleRevealSeconds, () => {
      if (stop) stop();
      stop = null;
      onDone(info);
    });
  });
}

function countdown(seconds, done) {
  let left = seconds;
  const label = $("role-countdown");
  const tick = () => {
    label.textContent = t("role.countdown", { s: left });
    if (left <= 0) return done();
    left--;
    timer = setTimeout(tick, 1000);
  };
  tick();
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