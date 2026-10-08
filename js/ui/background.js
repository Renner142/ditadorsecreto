import { themeGet, themeAsset } from "../theme/loader.js";

const SOFT = "12vw"; // largura da borda esfumaçada entre as cores
const PRESETS = {
  neutral: { blue: "32%", red: "32%" }, // lobby: metade azul, metade vermelha, preto no meio
  a: { blue: "56%", red: "14%" },       // você é Democrata: mais azul
  b: { blue: "14%", red: "56%" },       // você é Autoritário: mais vermelho
};
let el = null;

// logo do partido, preso à faixa de cor dele (se a imagem não existir, simplesmente não aparece)
function makeLogo(team) {
  const path = themeGet(`teams.${team}.icon`);
  if (!path) return null;
  const img = new Image();
  img.className = `bg-logo bg-logo-${team}`;
  img.alt = "";
  img.draggable = false;
  img.onerror = () => img.remove();
  img.src = themeAsset(path);
  return img;
}

export function initBackground() {
  if (el) return;
  el = document.createElement("div");
  el.id = "bg";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<div class="bg-a"></div><div class="bg-b"></div>';
  for (const team of ["a", "b"]) {
    const logo = makeLogo(team);
    if (logo) el.append(logo);
  }
  document.body.prepend(el);
  setBackground();
}

// setBackground()                  -> equilibrado (lobby)
// setBackground({ party: "a" })    -> inclinado pro seu partido
// setBackground({ win: "b" })      -> o vencedor toma a tela inteira, com o logo
export function setBackground({ party = null, win = null } = {}) {
  if (!el) initBackground();
  let blue, red;
  if (win) {
    // o perdedor encolhe até sumir (-SOFT cancela a borda), o vencedor passa de 100%
    blue = win === "a" ? "100%" : `-${SOFT}`;
    red = win === "b" ? "100%" : `-${SOFT}`;
  } else {
    ({ blue, red } = PRESETS[party] || PRESETS.neutral);
  }
  el.classList.toggle("won", !!win);
  el.dataset.win = win || "";
  el.style.setProperty("--blue", blue);
  el.style.setProperty("--red", red);
}