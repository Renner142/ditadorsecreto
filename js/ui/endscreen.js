import { t } from "../i18n/i18n.js";

let root = null;

function ensure() {
  if (root && document.body.contains(root)) return root;
  root = document.createElement("div");
  root.id = "endscreen";
  root.className = "modal";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  document.body.append(root);
  return root;
}

export function hideEndScreen() {
  if (root) root.hidden = true;
}

// rows: [{ name, label, team, dead }]
export function showEndScreen({ title, team, reason, rows, isHost, onBack, onView, onLeave }) {
  const el = ensure();

  const card = document.createElement("div");
  card.className = "modal-card end-card";

  const h = document.createElement("h2");
  h.className = "end-title-big";
  h.dataset.team = team;
  h.textContent = title;

  const why = document.createElement("p");
  why.className = "hint";
  why.textContent = reason;

  const ul = document.createElement("ul");
  ul.className = "end-roles";
  rows.forEach((r) => {
    const li = document.createElement("li");
    li.className = "end-role";
    if (r.team) li.dataset.team = r.team;
    li.textContent = `${r.name}: ${r.label}${r.dead ? " ☠" : ""}`;
    ul.append(li);
  });

  const actions = document.createElement("div");
  actions.className = "action-row";

  if (isHost) {
    const back = document.createElement("button");
    back.className = "btn";
    back.textContent = t("end.back_to_room");
    back.addEventListener("click", async () => {
      back.disabled = true;
      try { await onBack(); } catch (err) { console.error(err); back.disabled = false; }
    });
    actions.append(back);
  }

  const view = document.createElement("button");
  view.className = "btn btn-secondary";
  view.textContent = t("end.view_table");
  view.addEventListener("click", onView);

  const leave = document.createElement("button");
  leave.className = "btn btn-secondary";
  leave.textContent = t("end.leave");
  leave.addEventListener("click", onLeave);

  actions.append(view, leave);
  card.append(h, why, ul);

  if (!isHost) {
    const wait = document.createElement("p");
    wait.className = "hint";
    wait.textContent = t("end.waiting_host");
    card.append(wait);
  }

  card.append(actions);
  el.replaceChildren(card);
  el.hidden = false;
}