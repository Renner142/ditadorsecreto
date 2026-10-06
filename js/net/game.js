import { ref, update, onValue } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./auth.js";
import { RULES } from "../config/game-config.js";
import { assignRoles, buildKnowledge } from "../core/roles.js";
import { initialState } from "../core/engine.js";
import { splitState } from "../core/state.js";

export function stateToUpdates(code, state) {
  const { pub, host } = splitState(state);
  const updates = {};
  for (const [k, v] of Object.entries(pub)) updates[`rooms/${code}/public/${k}`] = v;
  for (const [k, v] of Object.entries(host)) updates[`rooms/${code}/host/${k}`] = v;
  return updates;
}

export async function startGame(code, players) {
  const uids = Object.keys(players);
  if (uids.length < RULES.players.min || uids.length > RULES.players.max) {
    throw new Error("errors.bad_player_count");
  }
  const roles = assignRoles(uids, RULES);
  const state = initialState(uids, roles, RULES);

  const updates = stateToUpdates(code, state);
  for (const uid of uids) {
    updates[`rooms/${code}/private/${uid}`] = buildKnowledge(uid, roles, RULES);
  }
  await update(ref(db), updates);
}

export function watchPrivate(code, uid, callback) {
  return onValue(ref(db, `rooms/${code}/private/${uid}`), (s) => callback(s.val()));
}