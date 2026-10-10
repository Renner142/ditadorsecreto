import { t, tRaw } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { partyOf } from "../core/roles.js";
import { renderEdition, savePages, sharePages, canShareFiles } from "./newspage.js";

let btn = null;
let dot = null;
let panel = null;
let cardEl = null;
let scrollEl = null;
let mastEl = null;
let ruleEl = null;
let mainEl = null;
let listEl = null;
let editionEl = null;
let btnSave = null;
let btnShare = null;
let cur = 0;
let btnPrev = null;
let btnNext = null;
let pageLbl = null;
let sig = "";
let entries = [];
let players = {};
let score = { a: 0, b: 0 };
let snapshot = null;
let seen = 0;
let first = true;
let isOpen = false;
let ended = false;
let stick = true; // true = o jornal acompanha as notícias novas (fica embaixo)
let pages = [];
let editionSig = "";
let editionToken = 0;
const shareOk = canShareFiles();

const pickFrom = (raw, seed) => {
  if (Array.isArray(raw)) return raw.length ? String(raw[Math.abs(seed) % raw.length]) : "";
  return typeof raw === "string" ? raw : "";
};

const adj = (team) => themeGet(`teams.${team}.adj`) ?? themeGet(`teams.${team}.name`) ?? "?";

function varsFor(e, colored = false) {
  const nm = (uid) => {
    let cls = "nm";
    if (colored) { // só a imagem final pede cor, e só existe papel revelado quando a partida acaba
      const role = snapshot?.finalRoles?.[uid];
      if (role) cls += ` team-${partyOf(role)}`;
    }
    return { text: players[uid]?.name ?? "?", cls };
  };
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

function texts(e, colored = false) {
  const seed = e.seed || 0;
  // a vitória por políticas tem frases diferentes pra cada time (com reserva na chave antiga)
  const pick = (kind, k) => {
    const specific = e.k === "end_policies" ? tRaw(`news.${kind}.${k}_${e.team || ""}`) : null;
    return specific ?? tRaw(`news.${kind}.${k}`);
  };
  const head = pickFrom(pick("head", e.k), seed) || e.k;
  const ckey = e.k === "policy" ? `policy_${e.team}` : e.k;
  const comment = pickFrom(pick("comment", ckey), Math.floor(seed / 7));
  return { head, comment, vars: varsFor(e, colored) };
}

function article(e, fresh) {
  const { head, comment, vars } = texts(e);
  const el = document.createElement("article");
  el.className = `paper-item kind-${e.k}` + (e.team ? ` team-${e.team}` : " alert") + (fresh ? " fresh" : "");
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

// manchete principal: a mensagem de vitória (ou "edição em andamento" durante a partida)
function renderMain() {
  mainEl.replaceChildren();
  const last = entries[entries.length - 1];
  const end = last && String(last.k).startsWith("end_") ? last : null;

  const h = document.createElement("h3");
  h.className = "paper-main-head" + (end ? ` team-${end.team}` : "");
  const p = document.createElement("p");
  p.className = "paper-main-text";

  if (end) {
    const { head, comment, vars } = texts(end);
    h.append(fill(head, vars));
    p.append(fill(comment, vars));
  } else {
    h.textContent = t("news.live_title");
    p.append(fill(tRaw("news.live_text") || "", {
      a: { text: themeGet("teams.a.name") ?? "A", cls: "nt team-a" },
      b: { text: themeGet("teams.b.name") ?? "B", cls: "nt team-b" },
      na: { text: String(score.a), cls: "nm" },
      nb: { text: String(score.b), cls: "nm" },
    }));
  }
  mainEl.append(h, p);
}

// acontecimentos em ordem: as mais novas ficam embaixo
function renderList(freshFrom = Infinity) {
  listEl.replaceChildren();
  const items = entries.filter((e) => !String(e.k).startsWith("end_")); // a manchete do fim fica no topo
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "paper-empty";
    p.textContent = t("news.empty");
    listEl.append(p);
    return;
  }
  items.forEach((e, i) => listEl.append(article(e, i >= freshFrom)));
}

// ---------- edição final (uma página, salvável como imagem) ----------
function roster() {
  const s = snapshot;
  if (!s || !s.order) return [];
  return s.order.map((uid) => {
    const role = s.finalRoles?.[uid] || null;
    const team = role ? partyOf(role) : null;
    return {
      name: players[uid]?.name ?? "?",
      role,
      team,
      label: role ? (role === "leader" ? themeGet("teams.leader.name") : themeGet(`teams.${team}.name`)) : "?",
      dead: !!s.dead?.[uid],
    };
  });
}

function buildEdition() {
  const endEntry = entries.find((e) => String(e.k).startsWith("end_"));
  return {
    end: endEntry ? { k: endEntry.k, team: endEntry.team, ...texts(endEntry, true) } : null,
    items: entries.filter((e) => !String(e.k).startsWith("end_")).map((e) => ({ k: e.k, team: e.team, ...texts(e, true) })),
    rows: roster(),
    score,
  };
}

function syncFoot() {
  if (!btnSave) return;
  const ready = ended && pages.length > 0;
  btnSave.hidden = !ready;
  btnShare.hidden = !(ready && shareOk);
  const multi = ready && pages.length > 1;
  btnPrev.hidden = btnNext.hidden = pageLbl.hidden = !multi;
  if (multi) {
    pageLbl.textContent = `${cur + 1}/${pages.length}`;
    btnPrev.disabled = cur === 0;
    btnNext.disabled = cur === pages.length - 1;
  }
}

function mountPages() {
  if (cur >= pages.length) cur = 0;
  editionEl.replaceChildren(...(pages[cur] ? [pages[cur]] : []));
  syncFoot();
}

async function renderEditionView() {
  const data = buildEdition();
  const key = JSON.stringify([data.items.length, data.end?.k, data.rows.map((r) => [r.name, r.role, r.dead])]);
  if (key === editionSig) { // já montada (ou sendo montada)
    if (pages.length) mountPages();
    return;
  }
  editionSig = key;
  pages = [];
  const token = ++editionToken;

  const wait = document.createElement("p");
  wait.className = "paper-loading";
  wait.textContent = t("news.loading_edition");
  editionEl.replaceChildren(wait);
  syncFoot();

  try {
    const canvases = await renderEdition(data);
    if (token !== editionToken) return;
    pages = canvases;
    cur = 0;
    mountPages();
  } catch (err) {
    console.error(err);
    if (token === editionToken) {
      wait.textContent = t("news.edition_error");
      editionSig = ""; // permite tentar de novo
    }
  }
}

function renderAll(freshFrom) {
  cardEl.classList.toggle("edition", ended);
  for (const el of [mastEl, ruleEl, mainEl, listEl]) el.hidden = ended;
  editionEl.hidden = !ended;
  if (ended) { renderEditionView(); return; }
  renderMain();
  renderList(freshFrom);
}

function atBottom() {
  return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 48;
}
function toBottom() {
  scrollEl.scrollTop = scrollEl.scrollHeight;
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
  renderAll(Infinity);
  seen = entries.length;
  updateDot();
  panel.hidden = false;
  // durante a partida abre embaixo (notícias novas); depois do fim, abre no topo (manchete)
  const place = () => {
    if (!isOpen) return;
    if (ended) { scrollEl.scrollTop = 0; stick = false; }
    else { toBottom(); stick = true; }
  };
  place();
  requestAnimationFrame(place);
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

  cardEl = document.createElement("div");
  cardEl.className = "modal-card paper-card";

  scrollEl = document.createElement("div");
  scrollEl.className = "paper-scroll";
  scrollEl.addEventListener("scroll", () => { stick = atBottom(); }, { passive: true });

  mastEl = document.createElement("header");
  mastEl.className = "paper-masthead";
  const name = document.createElement("h2");
  name.className = "paper-name";
  name.textContent = t("news.paper");
  const tag = document.createElement("p");
  tag.className = "paper-tag";
  tag.textContent = t("news.tagline");
  mastEl.append(name, tag);

  ruleEl = document.createElement("div");
  ruleEl.className = "paper-rule";

  mainEl = document.createElement("section");
  mainEl.className = "paper-main";

  listEl = document.createElement("div");
  listEl.className = "paper-grid";

  editionEl = document.createElement("section");
  editionEl.className = "paper-edition";
  editionEl.hidden = true;

  scrollEl.append(mastEl, ruleEl, mainEl, listEl, editionEl);

  const foot = document.createElement("footer");
  foot.className = "paper-foot";

  btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "btn";
  btnSave.hidden = true;
  btnSave.textContent = t("news.save");
  btnSave.addEventListener("click", async () => {
    btnSave.disabled = true;
    try { await savePages(pages); } catch (err) { console.error(err); }
    btnSave.disabled = false;
  });

  btnShare = document.createElement("button");
  btnShare.type = "button";
  btnShare.className = "btn";
  btnShare.hidden = true;
  btnShare.textContent = t("news.share");
  btnShare.addEventListener("click", async () => {
    btnShare.disabled = true;
    try { await sharePages(pages); } catch (err) { console.error(err); }
    btnShare.disabled = false;
  });

  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn btn-secondary";
  close.textContent = t("news.close");
  close.addEventListener("click", closePanel);
    const pager = (label, title, delta) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-secondary";
    b.textContent = label;
    b.title = title;
    b.hidden = true;
    b.addEventListener("click", () => { cur = Math.max(0, Math.min(pages.length - 1, cur + delta)); mountPages(); });
    return b;
  };
  btnPrev = pager("‹", t("news.page_prev"), -1);
  btnNext = pager("›", t("news.page_next"), 1);
  pageLbl = document.createElement("span");
  pageLbl.className = "paper-page-lbl";
  pageLbl.hidden = true;
  foot.append(btnPrev, pageLbl, btnNext, btnSave, btnShare, close);

  cardEl.append(scrollEl, foot);
  panel.append(cardEl);
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
    cur = 0;
    first = true;
    ended = false;
    stick = true;
    score = { a: 0, b: 0 };
    snapshot = null;
    pages = [];
    editionSig = "";
    editionToken++;
    updateDot();
    syncFoot();
  }
}

// chamado a cada atualização da partida; só refaz a lista quando algo mudou
export function updateNews(s, playersMap, isEnded) {
  ensure();
  players = playersMap || {};
  score = { a: s.tracks?.a || 0, b: s.tracks?.b || 0 };
  snapshot = { order: s.order, finalRoles: s.finalRoles, dead: s.dead || {} };
  ended = !!(isEnded && s.winner);

  const base = Array.isArray(s.news) ? s.news : [];
  const all = base.slice();

  // a manchete do fim só sai depois da cerimônia, pra não entregar o resultado
  if (ended) {
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
  const prevLen = entries.length;
  sig = next;
  entries = all;
  if (first) { seen = entries.length; first = false; } // quem volta no meio da partida não recebe 30 "novas"

  if (isOpen) {
    const keep = stick;
    const top = scrollEl.scrollTop;
    renderAll(prevLen);
    seen = entries.length;
    if (!ended) { if (keep) toBottom(); else scrollEl.scrollTop = top; } // quem subiu pra reler não é puxado de volta
  }
  if (ended) renderEditionView(); // já deixa a edição pronta, mesmo com o jornal fechado
  updateDot();
  syncFoot();
}