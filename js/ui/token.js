import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { partyOf } from "../core/roles.js";
import { teamIconUrl } from "./cards.js";

// ícone preso em volta da bolinha: pos = top | tr | tl | bl | br
export function badge(face, pos, { icon, title, cls = "" }) {
  const b = document.createElement("span");
  b.className = `tk-b pos-${pos} ${cls}`.trim();
  b.textContent = icon;
  b.title = title;
  b.setAttribute("aria-label", title);
  face.append(b);
  return b;
}

// etiqueta do partido embaixo do nome (o Ditador ganha uma própria, bem chamativa)
function setPartyTag(tk, role) {
  const label = tk.querySelector(".tk-label");
  if (!label) return;
  label.querySelector(".tk-party")?.remove();
  const party = partyOf(role);
  const tag = document.createElement("span");
  tag.className = `tk-party team-${party}` + (role === "leader" ? " leader" : "");
  tag.textContent = role === "leader"
    ? `★ ${themeGet("teams.leader.name")}`
    : themeGet(`teams.${party}.name`);
  label.append(tag);
}

function markLeader(tk, face) {
  tk.classList.add("is-leader");
  if (!face.querySelector(".tk-b.leader")) {
    badge(face, "bl", { icon: "★", title: themeGet("teams.leader.name"), cls: "leader" });
  }
}

// faixa acima da bolinha: Presidente, Chanceler ou Candidato
function roleTag(tk, kind) {
  const el = document.createElement("span");
  el.className = `tk-role role-${kind}`;
  el.textContent = `${kind === "president" ? "👑" : "🔨"} ${t(`board.${kind}`)}`;
  tk.append(el);
}

// mostra o partido na bolinha: logo, cor, etiqueta e (se for o Ditador) destaque.
// role pode ser "a", "b" ou "leader"
export function applyRole(tk, role) {
  const face = tk.querySelector(".tk-face");
  const party = partyOf(role);
  tk.classList.add("revealed");
  tk.classList.remove("no-logo");
  tk.dataset.team = party;
  tk.dataset.role = role;
  face.querySelector(".tk-logo")?.remove();

  const url = teamIconUrl(party);
  if (url) {
    const img = new Image();
    img.className = "tk-logo";
    img.alt = "";
    img.draggable = false;
    img.onerror = () => { img.remove(); tk.classList.add("no-logo"); };
    img.src = url;
    face.append(img);
  } else {
    tk.classList.add("no-logo");
  }
  setPartyTag(tk, role);
  if (role === "leader") markLeader(tk, face);
}

export function coverToken(tk) {
  tk.classList.add("dead");
  const face = tk.querySelector(".tk-face");
  if (face.querySelector(".tk-skull")) return;
  const skull = document.createElement("span");
  skull.className = "tk-skull";
  skull.textContent = "☠";
  face.append(skull);
}

export function uncoverToken(tk) {
  tk.classList.remove("dead");
  tk.querySelector(".tk-skull")?.remove();
}

// o assento do jogador: usado na mesa e nas cerimônias, então mudou aqui, mudou nos dois
export function buildToken({
  name, you = false, role = null, dead = false, covered = false,
  president = false, candidate = false, chancellor = false, voted = false, order = 0, vote = null,
} = {}) {
  const tk = document.createElement("div");
  tk.className = "tk" + (you ? " me" : "");
  tk.title = name;

  const face = document.createElement("div");
  face.className = "tk-face";
  const initial = document.createElement("span");
  initial.className = "tk-initial";
  initial.textContent = (String(name).trim()[0] || "?").toUpperCase();
  face.append(initial);

  if (you) {
    const y = document.createElement("span");
    y.className = "tk-you";
    y.textContent = t("board.you");
    face.append(y);
  }

  // embaixo da bolinha: nome e (quando conhecido) o partido
  const label = document.createElement("div");
  label.className = "tk-label";
  const nameEl = document.createElement("span");
  nameEl.className = "tk-name";
  nameEl.textContent = name;
  label.append(nameEl);
  tk.append(face, label);

  if (dead) tk.classList.add("dead");
  if (covered) { coverToken(tk); return tk; } // o morto fica coberto até o fim da partida

  if (role) applyRole(tk, role);

  if (president) { roleTag(tk, "president"); tk.classList.add("is-pres"); }
  if (candidate) roleTag(tk, "candidate");
  if (chancellor) roleTag(tk, "chancellor");
  if (president || candidate || chancellor) tk.classList.add("gov"); // aro dourado

  if (voted) badge(face, "tl", { icon: "✔", title: t("board.voted"), cls: "ok" });
  if (vote !== null && !voted && !dead) {
    badge(face, "tl", { icon: vote ? "✔" : "✖", title: t(vote ? "vote.yes" : "vote.no"), cls: vote ? "vote-yes" : "vote-no" });
  }
  if (dead) badge(face, "tl", { icon: "☠", title: t("board.dead"), cls: "dead" });
  if (order) {
    badge(face, "br", {
      icon: String(order),
      title: t("board.order_n", { n: order }),
      cls: "ord" + (order === 1 ? " next" : ""),
    });
  }
  return tk;
}