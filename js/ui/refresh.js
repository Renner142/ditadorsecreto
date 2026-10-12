import { t } from "../i18n/i18n.js";

let btn = null;

// cria o botão dentro das opções na primeira vez que elas são abertas
function ensure() {
  const card = document.querySelector("#options .modal-card");
  const anchor = document.getElementById("opt-close");
  if (!card || !anchor || document.getElementById("opt-refresh")) return;

  const row = document.createElement("div");
  row.className = "opt-install";
  btn = document.createElement("button");
  btn.id = "opt-refresh";
  btn.type = "button";
  btn.className = "btn btn-secondary";
  btn.textContent = t("refresh.button");
  btn.addEventListener("click", hardReload);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = t("refresh.hint");
  row.append(btn, hint);
  card.insertBefore(row, anchor);
}

async function hardReload() {
  btn.disabled = true;
  btn.textContent = t("refresh.working");

  // todos os arquivos do jogo que o navegador já carregou (menos músicas, que são pesadas)
  const urls = new Set([location.href.split("#")[0]]);
  for (const e of performance.getEntriesByType("resource")) {
    try {
      const u = new URL(e.name);
      if (u.origin === location.origin && /\.(js|css|json|webmanifest|svg|png|jpe?g|webp)$/i.test(u.pathname)) {
        urls.add(u.href);
      }
    } catch {}
  }

  // baixa de novo ignorando o cache (isso atualiza o cache); no máximo 6 s de espera
  const all = Promise.allSettled([...urls].map((u) => fetch(u, { cache: "reload" })));
  await Promise.race([all, new Promise((r) => setTimeout(r, 6000))]);
  location.reload();
}

document.addEventListener("click", (e) => {
  if (e.target.closest?.("#btn-options, #btn-open-options")) ensure();
}, true);