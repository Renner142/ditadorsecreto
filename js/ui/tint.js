let el = null;

// clareia a tela na cor do partido (a = azul, b = vermelho)
export function flashTint(team) {
  if (!el || !el.isConnected) {
    el = document.createElement("div");
    el.id = "tint";
    el.className = "tint";
    el.setAttribute("aria-hidden", "true");
    document.body.append(el);
  }
  el.style.setProperty("--glow", team === "a" ? "var(--color-team-a)" : "var(--color-team-b)");
  el.classList.remove("on");
  void el.offsetWidth; // reinicia a animação
  el.classList.add("on");
}