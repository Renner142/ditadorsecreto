import { themeGet, themeAsset } from "../theme/loader.js";

function url(path) {
  return path ? themeAsset(path) : null;
}

export function teamIconUrl(team) { return url(themeGet(`teams.${team}.icon`)); }
export function cardIconUrl(team) { return url(themeGet(`teams.${team}.card`)); }

// a carta de política (só a "cara" da carta)
export function policyFace(team) {
  const face = document.createElement("div");
  face.className = "pcard";
  face.dataset.team = team;

  const src = cardIconUrl(team);
  if (src) {
    const img = new Image();
    img.className = "pcard-img";
    img.alt = "";
    img.draggable = false;
    img.src = src;
    img.onerror = () => img.remove(); // sem imagem, sobra só o nome do partido
    face.append(img);
  }

  const label = document.createElement("span");
  label.className = "pcard-label";
  label.textContent = themeGet(`teams.${team}.name`) ?? "";
  face.append(label);
  return face;
}

// a carta clicável (usada na legislação)
export function policyCardButton(team, onClick, sfx = null) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "policy-card-btn";
  if (sfx) b.dataset.sfx = sfx;
  b.setAttribute("aria-label", themeGet(`teams.${team}.name`) ?? team);
  b.append(policyFace(team));
  b.addEventListener("click", onClick);
  return b;
}