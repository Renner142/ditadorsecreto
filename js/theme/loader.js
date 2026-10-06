let current = null;

export async function loadTheme(id) {
  const base = `themes/${id}/`;
  const res = await fetch(base + "theme.json");
  if (!res.ok) throw new Error(`Tema "${id}" não encontrado`);
  const theme = await res.json();
  theme._base = base;

  const rootStyle = document.documentElement.style;
  for (const [name, value] of Object.entries(theme.colors || {})) {
    rootStyle.setProperty(`--${name}`, value);
  }
  if (theme.title) document.title = theme.title;

  current = theme;
  return theme;
}

export function themeGet(path) {
  return path.split(".").reduce((obj, key) => obj?.[key], current);
}

export function themeAsset(path) {
  return current._base + path;
}

export function applyTheme(root = document) {
  root.querySelectorAll("[data-theme-text]").forEach((el) => {
    el.textContent = themeGet(el.dataset.themeText) ?? "";
  });
}