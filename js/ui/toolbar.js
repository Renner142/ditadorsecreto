let bar = null;

export function getToolbar() {
  if (bar && document.body.contains(bar)) return bar;
  bar = document.createElement("div");
  bar.id = "toolbar";
  bar.className = "toolbar";
  document.body.append(bar);
  const sync = () => document.documentElement.style.setProperty("--toolbar-w", `${bar.offsetWidth}px`);
  if ("ResizeObserver" in window) new ResizeObserver(sync).observe(bar);
  else document.documentElement.style.setProperty("--toolbar-w", "140px");
  return bar;
}

// leva o botão ⚙ (que está no HTML) pra dentro da barra
export function initToolbar() {
  const tb = getToolbar();
  const gear = document.getElementById("btn-options");
  if (gear && gear.parentElement !== tb) tb.append(gear);
}