import { themeGet, themeAsset } from "./loader.js";

const keep = []; // guarda as imagens na memória pra o navegador não descartar

function collectPaths() {
  const paths = new Set();
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && /\.(png|jpe?g|webp|gif|svg)$/i.test(v)) paths.add(v);
      else walk(v);
    }
  };
  walk(themeGet("teams"));
  walk(themeGet("images")); // opcional: outras imagens do tema
  return [...paths];
}

export function preloadTheme(timeoutMs = 8000) {
  const jobs = collectPaths().map((path) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve(); // se uma falhar, segue sem ela
    img.src = themeAsset(path);
    keep.push(img);
  }));
  return Promise.race([
    Promise.all(jobs),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}