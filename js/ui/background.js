const SOFT = "12vw"; // largura da borda esfumaçada entre as cores
const PRESETS = {
  neutral: { blue: "32%", red: "32%" }, // lobby: metade azul, metade vermelha, preto no meio
  a: { blue: "56%", red: "14%" },       // você é Democrata: mais azul
  b: { blue: "14%", red: "56%" },       // você é Autoritário: mais vermelho
};
let el = null;

export function initBackground() {
  if (el) return;
  el = document.createElement("div");
  el.id = "bg";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<div class="bg-a"></div><div class="bg-b"></div>';
  document.body.prepend(el);
  setBackground();
}

// setBackground()                  -> equilibrado (lobby)
// setBackground({ party: "a" })    -> inclinado pro seu partido
// setBackground({ win: "b" })      -> o vencedor toma a tela inteira
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
  el.style.setProperty("--blue", blue);
  el.style.setProperty("--red", red);
}