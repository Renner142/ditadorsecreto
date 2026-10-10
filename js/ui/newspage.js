import { t } from "../i18n/i18n.js";
import { themeGet, themeAsset } from "../theme/loader.js";
import { RULES } from "../config/game-config.js";

const W = 1200;
const H = 1600;
const M = 56;
const FOOT = 44;
const GAP = 44;
const INSET = 14; // recuo do texto, pra faixa lateral do partido
const SHOW_END_COMMENT = false; // true = mostra o comentário sob a manchete
const SERIF = 'Georgia, "Times New Roman", serif';
const DISPLAY = '"Cinzel", Georgia, "Times New Roman", serif';
const INK = "#4a4132";
const INK2 = "#5d5444";
const MAJOR = new Set(["policy", "chaos", "execute", "investigate", "special", "veto"]);

// ---------- cores ----------
function darken(color, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec((color || "").trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const ch = (v) => Math.round(v * (1 - k));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function teamColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  const rawA = get("--color-team-a", "#2c7bb6");
  const rawB = get("--color-team-b", "#b3202a");
  return { rawA, rawB, a: darken(rawA, 0.25), b: darken(rawB, 0.25), aDeep: darken(rawA, 0.5), bDeep: darken(rawB, 0.5) };
}

const colorFor = (cls = "", TEAM) =>
  cls.includes("team-a") ? TEAM.a : cls.includes("team-b") ? TEAM.b : cls.includes("leader") ? "#6e0d14" : null;

// ---------- texto com partes coloridas ----------
function segs(template, vars, TEAM) {
  const out = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(template || ""))) {
    if (m.index > last) out.push({ text: template.slice(last, m.index) });
    const v = vars?.[m[1]];
    if (v) out.push({ text: v.text, bold: true, color: colorFor(v.cls, TEAM) });
    last = m.index + m[0].length;
  }
  if (template && last < template.length) out.push({ text: template.slice(last) });
  return out;
}

const fontOf = (st, bold) =>
  `${st.italic ? "italic " : ""}${bold ? 800 : st.weight || 400} ${Math.round(st.size)}px ${st.family}`;

function toTokens(parts, upper) {
  const out = [];
  let space = false;
  for (const seg of parts) {
    const text = upper ? seg.text.toUpperCase() : seg.text;
    for (const p of text.split(/(\s+)/)) {
      if (!p) continue;
      if (/^\s+$/.test(p)) { space = true; continue; }
      out.push({ text: p, bold: seg.bold, color: seg.color, sp: space && out.length > 0 });
      space = false;
    }
  }
  return out;
}

function layoutText(ctx, parts, maxW, st) {
  const toks = toTokens(parts, st.upper);
  const clusters = []; // palavra + pontuação colada nela não se separam
  for (const tk of toks) {
    if (!tk.sp && clusters.length) clusters[clusters.length - 1].push(tk);
    else clusters.push([tk]);
  }
  ctx.font = fontOf(st, false);
  const spW = ctx.measureText(" ").width;
  const lines = [];
  let cur = { cl: [], w: 0 };
  for (const cl of clusters) {
    const cw = cl.reduce((acc, tk) => {
      ctx.font = fontOf(st, tk.bold);
      return acc + ctx.measureText(tk.text).width;
    }, 0);
    if (cur.cl.length && cur.w + spW + cw > maxW) { lines.push(cur); cur = { cl: [], w: 0 }; }
    cur.w += (cur.cl.length ? spW : 0) + cw;
    cur.cl.push(cl);
  }
  if (cur.cl.length) lines.push(cur);
  return { lines, spW, h: lines.length * st.size * st.lh };
}

function drawLines(ctx, L, x, y, maxW, st, align, color) {
  const lineH = st.size * st.lh;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let yy = y;
  for (const line of L.lines) {
    let xx = align === "center" ? x + (maxW - line.w) / 2 : align === "right" ? x + maxW - line.w : x;
    line.cl.forEach((cl, i) => {
      if (i > 0) xx += L.spW;
      for (const tk of cl) {
        ctx.font = fontOf(st, tk.bold);
        ctx.fillStyle = tk.color || color;
        ctx.fillText(tk.text, xx, yy + (lineH - st.size) / 2);
        xx += ctx.measureText(tk.text).width;
      }
    });
    yy += lineH;
  }
  return yy - y;
}

// ---------- desenho ----------
let noiseTile = null;
function noise() {
  if (noiseTile) return noiseTile;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const nc = c.getContext("2d");
  const img = nc.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    img.data[i * 4] = 90;
    img.data[i * 4 + 1] = 65;
    img.data[i * 4 + 2] = 35;
    img.data[i * 4 + 3] = Math.random() * 38;
  }
  nc.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

function paintPaper(ctx) {
  ctx.fillStyle = "#e6d9bb";
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.15, H * 0.08, 0, W * 0.15, H * 0.08, W * 0.7);
  g.addColorStop(0, "rgba(255,255,255,.42)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.88, H * 0.92, 0, W * 0.88, H * 0.92, W * 0.85);
  g.addColorStop(0, "rgba(110,75,30,.28)");
  g.addColorStop(1, "rgba(110,75,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ctx.createPattern(noise(), "repeat");
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
  g.addColorStop(0, "rgba(90,60,25,0)");
  g.addColorStop(1, "rgba(90,60,25,.36)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawContain(ctx, img, x, y, w, h) {
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function loadImg(path) {
  return new Promise((resolve) => {
    if (!path) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = themeAsset(path);
  });
}

function drawMasthead(ctx, y0, big) {
  const name = t("news.paper").toUpperCase();
  const tag = t("news.tagline");
  const content = W - 2 * M;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = INK2;
  ctx.font = `700 100px ${DISPLAY}`;
  const per = ctx.measureText(name).width / 100;
  let y = y0;

  if (big) {
    const side = Math.min(120, Math.floor((content * 0.62) / per));
    const st = { size: 26, family: SERIF, italic: true, lh: 1.3 };
    if (side >= 72) { // nome de um lado, lema do outro (como no exemplo)
      ctx.font = `700 ${side}px ${DISPLAY}`;
      const nameW = ctx.measureText(name).width;
      ctx.fillText(name, M, y);
      const tw = content - nameW - 32;
      const L = layoutText(ctx, [{ text: tag }], tw, st);
      drawLines(ctx, L, M + nameW + 32, y + Math.max(0, (side - L.h) / 2), tw, st, "right", INK2);
      y += Math.max(side * 1.05, L.h) + 14;
    } else { // nome comprido: nome centralizado e lema embaixo
      const size = Math.min(110, Math.floor(content / per));
      ctx.font = `700 ${size}px ${DISPLAY}`;
      ctx.fillText(name, M + (content - ctx.measureText(name).width) / 2, y);
      y += size * 1.02;
      const L = layoutText(ctx, [{ text: tag }], content, st);
      y += drawLines(ctx, L, M, y, content, st, "center", INK2) + 8;
    }
  } else {
    const size = Math.min(92, Math.floor(content / per));
    ctx.font = `700 ${size}px ${DISPLAY}`;
    ctx.fillText(name, M + (content - ctx.measureText(name).width) / 2, y);
    y += size * 1.05 + 12;
  }

  const bar = big ? 12 : 10;
  ctx.fillStyle = "rgba(110,101,82,.85)";
  ctx.fillRect(M, y, content, bar);
  return y + bar + 14;
}

function drawMain(ctx, y0, end, imgs, TEAM) {
  const content = W - 2 * M;
  const color = end.team === "a" ? TEAM.a : TEAM.b;
  // a manchete é só texto, todo na cor do partido vencedor
  const parts = segs(end.head, end.vars, TEAM).map((s) => ({ ...s, color: null }));
  let size = 42;
  let st;
  let L;
  do {
    st = { size, family: DISPLAY, weight: 700, lh: 1.2 };
    L = layoutText(ctx, parts, content, st);
    size -= 2;
  } while (L.lines.length > 2 && size >= 26);
  const h = drawLines(ctx, L, M, y0, content, st, "center", color);
  return y0 + h + 14;
}

function drawRoster(ctx, y0, rows, imgs, TEAM) {
  const content = W - 2 * M;
  const PH = 40, GX = 10, GY = 10, PAD = 12, LOGO = 26;
  ctx.font = `700 21px ${SERIF}`;
  const pills = rows.map((r) => {
    const text = r.role === "leader"
      ? `${r.name} · ★ ${r.label}${r.dead ? " ☠" : ""}`
      : `${r.name}${r.dead ? " ☠" : ""}`;
    return { ...r, text, w: Math.min(content, ctx.measureText(text).width + PAD * 2 + LOGO + 8) };
  });
  const lines = [];
  let cur = { items: [], w: 0 };
  for (const p of pills) {
    const add = (cur.items.length ? GX : 0) + p.w;
    if (cur.items.length && cur.w + add > content) { lines.push(cur); cur = { items: [], w: 0 }; }
    cur.w += (cur.items.length ? GX : 0) + p.w;
    cur.items.push(p);
  }
  if (cur.items.length) lines.push(cur);

  let y = y0;
  for (const ln of lines) {
    let x = M + (content - ln.w) / 2;
    for (const p of ln.items) {
      const raw = p.team === "a" ? TEAM.rawA : p.team === "b" ? TEAM.rawB : "#888";
      rr(ctx, x, y, p.w, PH, PH / 2);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = raw;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = raw;
      ctx.stroke();
      const im = p.team ? imgs[p.team] : null;
      if (im) drawContain(ctx, im, x + PAD, y + (PH - LOGO) / 2, LOGO, LOGO);
      ctx.font = `700 21px ${SERIF}`;
      ctx.fillStyle = p.role === "leader" ? "#6e0d14" : INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, x + PAD + LOGO + 8, y + PH / 2 + 1);
      x += p.w + GX;
    }
    y += PH + GY;
  }
  ctx.textBaseline = "top";
  return y;
}

function drawSummary(ctx, y0, data, imgs, TEAM) {
  const content = W - 2 * M;
  ctx.fillStyle = "rgba(93,84,70,.5)";
  ctx.fillRect(M, y0, content, 3);
  let y = y0 + 14;

  const LOGO = 76;
  for (const side of ["a", "b"]) {
    const left = side === "a";
    const im = imgs[side];
    if (im) drawContain(ctx, im, left ? M : W - M - LOGO, y, LOGO, LOGO);
    const tx = left ? M + (im ? LOGO + 14 : 0) : W - M - (im ? LOGO + 14 : 0);
    ctx.textAlign = left ? "left" : "right";
    ctx.textBaseline = "top";
    ctx.font = `700 24px ${DISPLAY}`;
    ctx.fillStyle = INK2;
    ctx.fillText((themeGet(`teams.${side}.name`) || "").toUpperCase(), tx, y + 4);
    ctx.font = `700 48px ${DISPLAY}`;
    ctx.fillStyle = TEAM[side];
    ctx.fillText(`${data.score[side]}/${RULES.winPolicies[side]}`, tx, y + 30);
  }
  ctx.textAlign = "center";
  ctx.font = `700 40px ${DISPLAY}`;
  ctx.fillStyle = INK2;
  ctx.fillText("×", W / 2, y + 22);
  ctx.textAlign = "left";
  y += LOGO + 14;

  y = drawRoster(ctx, y, data.rows, imgs, TEAM);
  ctx.fillStyle = "rgba(93,84,70,.5)";
  ctx.fillRect(M, y, content, 3);
  return y + 16;
}

function buildItems(data) {
  const items = [];
  let rejected = 0;
  for (const e of data.items) {
    if (e.k === "rejected") { rejected++; continue; } // vira uma linha de resumo
    items.push({ ...e, minor: !MAJOR.has(e.k) });
  }
  if (rejected) {
    items.push({
      k: "summary",
      head: t(rejected === 1 ? "news.summary_one" : "news.summary_many", { n: rejected }),
      comment: "",
      vars: {},
      minor: true,
    });
  }
  return items;
}

function measureItem(ctx, it, colW, sc, TEAM, compact) {
  const w = colW - INSET;
  const headSt = { size: (it.minor ? 21 : 26) * sc, family: DISPLAY, weight: 700, upper: true, lh: 1.15 };
  const cmtSt = { size: 22 * sc, family: SERIF, italic: true, lh: 1.3 };
  const hL = layoutText(ctx, segs(it.head, it.vars, TEAM), w, headSt);
  const showCmt = it.comment && !it.minor && !compact;
  const cL = showCmt ? layoutText(ctx, segs(it.comment, it.vars, TEAM), w, cmtSt) : null;
  return {
    hL, cL, headSt, cmtSt, sc, team: it.team || null,
    h: hL.h + (cL ? 8 * sc + cL.h : 0) + (compact ? 14 : 22) * sc,
  };
}

function flow(ctx, items, start, area, sc, TEAM, compact) {
  const colW = (area.w - GAP) / 2;
  const placed = [];
  const used = [0, 0];
  let col = 0;
  let y = 0;
  let i = start;
  for (; i < items.length; i++) {
    const m = measureItem(ctx, items[i], colW, sc, TEAM, compact);
    if (y > 0 && y + m.h > area.h) {
      if (col === 0) { col = 1; y = 0; } else break;
    }
    placed.push({ m, col, y });
    y += m.h;
    used[col] = y;
  }
  return { placed, next: i, used: Math.max(used[0], used[1]), colW, hasRight: used[1] > 0 };
}

function drawFlow(ctx, r, area, TEAM) {
  for (const p of r.placed) {
    const x = area.x + p.col * (r.colW + GAP);
    const top = area.y + p.y;
    const tx = x + INSET;
    const tw = r.colW - INSET;
    const body = p.m.hL.h + (p.m.cL ? 8 * p.m.sc + p.m.cL.h : 0);
    if (p.m.team) { // faixa lateral na cor do partido
      ctx.fillStyle = TEAM[p.m.team];
      ctx.fillRect(x, top + 2, 6, body - 2);
    }
    let y = top + drawLines(ctx, p.m.hL, tx, top, tw, p.m.headSt, "center", INK2);
    if (p.m.cL) {
      y += 8 * p.m.sc;
      drawLines(ctx, p.m.cL, tx, y, tw, p.m.cmtSt, "center", p.m.team ? TEAM[`${p.m.team}Deep`] : INK);
    }
  }
  if (r.hasRight) { // filete no meio, como no jornal de exemplo
    ctx.fillStyle = "rgba(93,84,70,.45)";
    ctx.fillRect(area.x + r.colW + GAP / 2 - 1, area.y, 2, r.used);
  }
}

function drawFooter(ctx, n, total) {
  const y = H - M - 16;
  ctx.fillStyle = "rgba(93,84,70,.4)";
  ctx.fillRect(M, y - 12, W - 2 * M, 2);
  ctx.fillStyle = "rgba(74,65,50,.75)";
  ctx.font = `italic 20px ${SERIF}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(t("news.footer", { title: themeGet("title") || "" }), M, y);
  if (total > 1) {
    ctx.textAlign = "right";
    ctx.fillText(`${n}/${total}`, W - M, y);
    ctx.textAlign = "left";
  }
}

// ---------- API ----------
export async function renderEdition(data) {
  try {
    await Promise.all([document.fonts.load(`700 40px Cinzel`), document.fonts.load(`italic 20px Georgia`)]);
  } catch {}
  const imgs = {
    a: await loadImg(themeGet("teams.a.icon")),
    b: await loadImg(themeGet("teams.b.icon")),
  };
  const TEAM = teamColors();
  const items = buildItems(data);
  const pages = [];
  let start = 0;

  for (let p = 0; p < 4; p++) {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "paper-page";
    const ctx = canvas.getContext("2d");
    paintPaper(ctx);

    let y = M;
    if (p === 0) {
      y = drawMasthead(ctx, y, true);
      if (data.end) y = drawMain(ctx, y, data.end, imgs, TEAM);
      y = drawSummary(ctx, y, data, imgs, TEAM);
    } else {
      y = drawMasthead(ctx, y, false);
    }

    const area = { x: M, y, w: W - 2 * M, h: H - M - FOOT - y };
        let r = null;
    outer: for (const compact of [false, true]) { // primeiro diminui o texto, depois tira os comentários
      for (const sc of [1, 0.9, 0.8, 0.72]) {
        r = flow(ctx, items, start, area, sc, TEAM, compact);
        if (r.next >= items.length) break outer;
      }
    }
    drawFlow(ctx, r, area, TEAM);
    pages.push({ canvas, ctx });
    start = r.next;
    if (start >= items.length) break;
  }

  pages.forEach((pg, i) => drawFooter(pg.ctx, i + 1, pages.length));
  return pages.map((pg) => pg.canvas);
}

const blobOf = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
const fileName = (i, n) => `ditador-secreto-edicao-final${n > 1 ? `-${i + 1}` : ""}.png`;

export function canShareFiles() {
  try {
    return !!(navigator.canShare && navigator.canShare({ files: [new File([""], "a.png", { type: "image/png" })] }));
  } catch {
    return false;
  }
}

export async function savePages(canvases) {
  for (let i = 0; i < canvases.length; i++) {
    const blob = await blobOf(canvases[i]);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(i, canvases.length);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    await new Promise((r) => setTimeout(r, 300));
  }
}

export async function sharePages(canvases) {
  const files = [];
  for (let i = 0; i < canvases.length; i++) {
    const blob = await blobOf(canvases[i]);
    if (blob) files.push(new File([blob], fileName(i, canvases.length), { type: "image/png" }));
  }
  if (!files.length) return;
  try {
    await navigator.share({ files, title: t("news.paper") });
  } catch (err) {
    if (err?.name !== "AbortError") console.error(err);
  }
}