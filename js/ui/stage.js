import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { RULES } from "../config/game-config.js";
import { partyOf } from "../core/roles.js";
import { playSfx } from "../audio/sfx.js";
import { policyFace } from "./cards.js";

const timing = () => ({ introMs: 1400, afterShotMs: 700, suspenseMs: 1400, revealMs: 2400, ...(RULES.stageTimings || {}) });

let root = null;
let run = null; // { skipped, wake, startedAt }

function ensureRoot() {
  if (root && document.body.contains(root)) return root;
  root = document.createElement("div");
  root.id = "stage";
  root.className = "stage";
  root.hidden = true;
  root.dataset.skip = t("stage.skip");
  root.addEventListener("click", () => {
    if (!run || Date.now() - run.startedAt < 1000) return; // ignora clique acidental
    run.skipped = true;
    run.wake?.();
  });
  document.body.append(root);
  return root;
}

function sleep(ms) {
  const r = run;
  if (!r || r.skipped) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); r.wake = null; resolve(); }
    r.wake = done;
  });
}

// se o jogador pulou, não toca mais nenhum som da cerimônia
function sfx(name, delay = 0) {
  if (run && !run.skipped) playSfx(name, delay);
}

async function session(build) {
  const el = ensureRoot();
  run = { skipped: false, wake: null, startedAt: Date.now() };
  el.classList.remove("flash");
  el.hidden = false;
  try { await build(); } finally { el.hidden = true; el.replaceChildren(); run = null; }
}

function scene(titleText, content) {
  const inner = document.createElement("div");
  inner.className = "stage-inner";
  const title = document.createElement("h2");
  title.className = "stage-title";
  title.textContent = titleText;
  inner.append(title, content);
  root.replaceChildren(inner);
  return title;
}

function addTag(cardEl, text) {
  const tag = document.createElement("span");
  tag.className = "stage-tag";
  tag.textContent = text;
  cardEl.append(tag);
}

function card(name, { tag = "", cls = "" } = {}) {
  const c = document.createElement("div");
  c.className = `stage-card ${cls}`.trim();
  const n = document.createElement("strong");
  n.textContent = name;
  c.append(n);
  if (tag) addTag(c, tag);
  return c;
}

// vira o cartão para "O Ditador" (vermelho)
async function flipToLeader(title, c, name) {
  const leader = themeGet("teams.leader.name");
  c.dataset.team = partyOf("leader");
  c.classList.add("flip");
  addTag(c, leader);
  title.textContent = t("end.revealing", { target: name, leader });
  sfx("reveal");
  await sleep(timing().revealMs);
}

// Presidente e condenado lado a lado -> tiro -> caveira -> suspense (-> revela o Ditador)
export function stageExecution({ president, target, reveal = false }) {
  return session(async () => {
    const tm = timing();
    const pres = card(president, { tag: t("board.president"), cls: "president from-left" });
    const vict = card(target, { cls: "from-right" });
    const vs = document.createElement("span");
    vs.className = "stage-vs";
    vs.textContent = "⌖";
    const row = document.createElement("div");
    row.className = "stage-row";
    row.append(pres, vs, vict);
    const title = scene(t("stage.execution", { president, target }), row);

    await sleep(tm.introMs);
    root.classList.add("flash");
    vict.classList.add("shot");
    sfx("power_execute");
    await sleep(tm.afterShotMs);
    vict.classList.add("dead");
    await sleep(500);
    sfx("suspense");
    await sleep(tm.suspenseMs);

    if (reveal) {
      vict.classList.remove("dead", "shot");
      await flipToLeader(title, vict, target);
    }
  });
}

// o Ditador sobe pra frente de tudo e é revelado
export function stageLeaderElected({ name }) {
  return session(async () => {
    const c = card(name, { cls: "big" });
    const title = scene(t("stage.elected", { name }), c);
    sfx("suspense");
    await sleep(timing().suspenseMs);
    await flipToLeader(title, c, name);
  });
}


// a política decisiva aparece virada e é revelada depois do suspense
// a política aparece virada e é revelada depois do suspense (vence ou não)
export function stagePolicyWin({ team, wins = true }) {
  return session(async () => {
    const teamName = themeGet(`teams.${team}.name`);
    const c = card("?", { cls: "policy-card" });
    const title = scene(t("stage.last_policy"), c);
    sfx("suspense");
    await sleep(timing().suspenseMs);
    c.replaceChildren(policyFace(team)); // a mesma carta do jogo, com o ícone
    c.classList.add("revealed", "flip");
    title.textContent = wins
      ? t("stage.policy_wins", { team: teamName })
      : t("stage.policy_enacted", { team: teamName });
    sfx("stamp");
    sfx(`policy_${team}`, 250);
    await sleep(wins ? timing().revealMs : Math.round(timing().revealMs * 0.7));
  });
}