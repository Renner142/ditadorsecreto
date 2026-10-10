import { t } from "../i18n/i18n.js";
import { playSfx } from "../audio/sfx.js";

let root = null;
let nDeck = null;
let nDisc = null;
let toast = null;
let toastTimer = 0;
let lastShuffles = null;
let shown = { deck: null, disc: null };

function chip(kind) {
  const c = document.createElement("span");
  c.className = `dk-chip dk-${kind}`;
  c.title = t(`deck.${kind}`);
  const ico = document.createElement("span");
  ico.className = "dk-ico";
  const n = document.createElement("span");
  n.className = "dk-n";
  c.append(ico, n);
  return { c, n };
}

function build() {
  if (root) return;
  root = document.createElement("div");
  root.id = "deckbox";
  root.className = "deckbox";
  root.hidden = true;
  root.title = t("deck.hint");
  const a = chip("deck");
  const b = chip("discard");
  nDeck = a.n;
  nDisc = b.n;
  root.append(a.c, b.c);

  toast = document.createElement("div");
  toast.className = "deck-toast";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  toast.textContent = t("deck.shuffled");
  document.body.append(root, toast);
}

function setN(el, value, key) {
  el.textContent = String(value);
  if (shown[key] !== null && shown[key] !== value) {
    el.classList.remove("bump");
    void el.offsetWidth; // reinicia a animação
    el.classList.add("bump");
  }
  shown[key] = value;
}

// espera a cerimônia na frente da tela acabar, pra o aviso não ficar escondido atrás dela
function whenFree(fn, started = Date.now()) {
  const stage = document.getElementById("stage");
  if (!stage || stage.hidden || Date.now() - started > 12000) return fn();
  setTimeout(() => whenFree(fn, started), 400);
}

function announce() {
  whenFree(() => {
    if (!root || root.hidden) return;
    root.classList.add("shuffling");
    setTimeout(() => root?.classList.remove("shuffling"), 1800);
    playSfx("shuffle");
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
  });
}

export function updateDeck(s) {
  build();
  if (typeof s.deckCount !== "number") { root.hidden = true; return; } // sala criada antes desta atualização
  root.hidden = false;
  setN(nDeck, s.deckCount, "deck");
  setN(nDisc, s.discardCount || 0, "disc");
  const sh = s.shuffles || 0;
  if (lastShuffles !== null && sh > lastShuffles) announce(); // a 1ª leitura nunca avisa
  lastShuffles = sh;
}

export function hideDeck() {
  if (!root) return;
  root.hidden = true;
  toast.hidden = true;
  clearTimeout(toastTimer);
  lastShuffles = null;
  shown = { deck: null, disc: null };
}