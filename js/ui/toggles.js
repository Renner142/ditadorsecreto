import { t } from "../i18n/i18n.js";
import { getSetting, setSettings, onSettingsChange } from "../settings/settings.js";

const ROWS = [["vibrate", "options.vibrate"], ["awake", "options.awake"]];

export function initToggles() {
  const card = document.querySelector("#options .modal-card");
  const anchor = document.getElementById("opt-close");
  if (!card || !anchor) return;

  const boxes = {};
  for (const [key, label] of ROWS) {
    const row = document.createElement("label");
    row.className = "opt-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.addEventListener("change", () => setSettings({ [key]: input.checked }));
    const text = document.createElement("span");
    text.textContent = t(label);
    row.append(input, text);
    card.insertBefore(row, anchor);
    boxes[key] = input;
  }

  const sync = () => { for (const [key] of ROWS) boxes[key].checked = getSetting(key) !== false; };
  onSettingsChange(sync);
  sync();
}