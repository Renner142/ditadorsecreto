let strings = {};

export async function loadLocale(code) {
  const res = await fetch(`locales/${code}.json`);
  if (!res.ok) throw new Error(`Idioma "${code}" não encontrado`);
  strings = await res.json();
}

export function t(key, vars = {}) {
  let text = key.split(".").reduce((obj, k) => obj?.[k], strings) ?? key;
  for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
  return text;
}

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

export function tRaw(key) {
  return key.split(".").reduce((obj, k) => obj?.[k], strings) ?? null;
}