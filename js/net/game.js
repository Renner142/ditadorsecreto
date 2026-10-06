import { ref, update, onValue } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./auth.js";
import { RULES } from "../config/game-config.js";
import { assignRoles, buildKnowledge } from "../core/roles.js";
import { buildDeck, shuffle } from "../core/deck.js";

export async function startGame(code, players) {
  const uids = Object.keys(players);
  if (uids.length < RULES.players.min || uids.length > RULES.players.max) {
    throw new Error("errors.bad_player_count");
  }
  const roles = assignRoles(uids, RULES);
  const base = `rooms/${code}`;

  // tudo num único update, então ninguém vê a partida pela metade
  const updates = {
    [`${base}/host`]: { roles, deck: buildDeck(RULES) },
    [`${base}/public/order`]: shuffle(uids),
    [`${base}/public/presidentIdx`]: 0,
    [`${base}/public/tracks`]: { a: 0, b: 0 },
    [`${base}/public/electionTracker`]: 0,
    [`${base}/public/phase`]: "role_reveal",
  };
  for (const uid of uids) {
    updates[`${base}/private/${uid}`] = buildKnowledge(uid, roles, RULES);
  }
  await update(ref(db), updates);
}

export function watchPrivate(code, uid, callback) {
  return onValue(ref(db, `rooms/${code}/private/${uid}`), (s) => callback(s.val()));
}