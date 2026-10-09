import { t, tRaw } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";

let btn = null;
let dot = null;
let panel = null;
let listEl = null;
let sig = "";
let entries = [];
let players = {};
let seen = 0;
let first = true;
let isOpen = false;

const pickFrom = (raw, seed) => {
  if (Array.isArray(raw)) return raw.length ? String(raw[Math.abs(seed) % raw.length]) : "";
  return typeof raw === "string" ? raw : "";
};

const adj = (team) => themeGet(`teams.${team}.adj`) ?? themeGet(`teams.${team}.name`) ?? "?";

function varsFor(e) {
  const nm = (uid) => ({ text: players[uid]?.name ?? "?", cls: "nm" });
  const v = { leader: { text: themeGet("teams.leader.name") ?? "?", cls: "nt leader" } };
  if (e.president) v.president = nm(e.president);
  if (e.chancellor) v.chancellor = nm(e.chancellor);
  if (e.target) v.target = nm(e.target);
  if (e.team) {
    v.team = { text: adj(e.team), cls: `nt team-${e.team}` };
    v.party = { text: themeGet(`teams.${e.team}.name`) ?? "?", cls: `nt team-${e.team}` };
  }
  if (e.n != null) v.n = { text: String(e.n), cls: "" };
  return v;
}

// troca {chaves} por nomes e partidos destacados, sem innerHTML
function fill(template, vars) {
  const frag = document.createDocumentFragment();
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(template))) {
    if (m.index > last) frag.append(template.slice(last, m.index));
    const v = vars[m[1]];
    if (v) {
      const span = document.createElement("span");
      if (v.cls) span.className = v.cls;
      span.textContent = v.text;
      frag.append(span);
    }
    last = m.index + m[0].length;
  }
  if (last < template.length) frag.append(template.slice(last));
  return frag;
}

function article(e) {
  const vars = varsFor(e);
  const seed = e.seed || 0;
  const head = pickFrom(tRaw(`news.head.${e.k}`), seed) || e.k;
  const ckey = e.k === "policy" ? `policy_${e.team}` : e.k;
  const comment = pickFrom(tRaw(`news.comment.${ckey}`), Math.floor(seed / 7));

  const el = document.createElement("article");
  el.className = `paper-item kind-${e.k}` + (e.team ? ` team-${e.team}` : "");
  const h = document.createElement("h4");
  h.append(fill(head, vars));
  el.append(h);
  if (comment) {
    const p = document.createElement("p");
    p.className = "paper-comment";
    p.append(fill(comment, vars));
    el.append(p);
  }
  return el;
}

function renderList() {
  listEl.replaceChildren();
  if (!entries.length) {
    const p = document.createElement("p");
    p.className = "paper-empty";
    p.textContent = t("news.empty");
    listEl.append(p);
    return;
  }
  for (let i = entries.length - 1; i >= 0; i--) listEl.append(article(entries[i])); // mais nova primeiro
}

function updateDot() {
  const unread = Math.max(0, entries.length - seen);
  dot.hidden = unread === 0;
  dot.textContent = unread > 9 ? "9+" : String(unread);
}

function onKey(e) {
  if (e.key === "Escape") closePanel();
}

function openPanel() {
  isOpen = true;
  renderList();
  seen = entries.length;
  updateDot();
  panel.hidden = false;
  document.addEventListener("keydown", onKey, true);
}

function closePanel() {
  if (!panel) return;
  isOpen = false;
  panel.hidden = true;
  document.removeEventListener("keydown", onKey, true);
}

function ensure() {
  if (panel) return;

  btn = document.createElement("button");
  btn.id = "btn-news";
  btn.type = "button";
  btn.className = "mute-btn news-btn";
  btn.hidden = true;
  btn.textContent = "📰";
  btn.title = t("news.open");
  btn.setAttribute("aria-label", t("news.open"));
  dot = document.createElement("span");
  dot.className = "news-dot";
  dot.hidden = true;
  btn.append(dot);
  btn.addEventListener("click", openPanel);

  panel = document.createElement("div");
  panel.id = "news";
  panel.className = "modal";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.addEventListener("click", (e) => { if (e.target === panel) closePanel(); });

  const card = document.createElement("div");
  card.className = "modal-card paper-card";

  const head = document.createElement("header");
  head.className = "paper-head";
  const name = document.createElement("h2");
  name.className = "paper-name";
  name.textContent = t("news.paper");
  const tag = document.createElement("p");
  tag.className = "paper-tag";
  tag.textContent = t("news.tagline");
  head.append(name, tag);

  listEl = document.createElement("div");
  listEl.className = "paper-list";

  const foot = document.createElement("footer");
  foot.className = "paper-foot";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn-secondary";
  close.textContent = t("news.close");
  close.addEventListener("click", closePanel);
  foot.append(close);

  card.append(head, listEl, foot);
  panel.append(card);
  document.body.append(btn, panel);
}

// liga/desliga o botão do jornal (só existe durante a partida)
export function showNews(on) {
  ensure();
  btn.hidden = !on;
  if (!on) {
    closePanel();
    sig = "";
    entries = [];
    seen = 0;
    first = true;
    updateDot();
  }
}

// chamado a cada atualização da partida; só refaz a lista quando algo mudou
export function updateNews(s, playersMap, ended) {
  ensure();
  players = playersMap || {};
  const base = Array.isArray(s.news) ? s.news : [];
  const all = base.slice();

  // a manchete do fim só sai depois da cerimônia, pra não entregar o resultado
  if (ended && s.winner) {
    const w = s.winner;
    all.push({
      k: `end_${w.reason}`,
      team: w.team,
      target: w.reason === "leader_elected" ? s.candidate : w.reason === "leader_killed" ? s.lastPower?.target : null,
      seed: base.length * 977 + 13,
    });
  }

  const next = `${all.length}|${Object.values(players).map((p) => p.name).join(",")}`;
  if (next === sig) return;
  sig = next;
  entries = all;
  if (first) { seen = entries.length; first = false; } // quem volta no meio da partida não recebe 30 "novas"
  if (isOpen) { renderList(); seen = entries.length; }
  updateDot();
}