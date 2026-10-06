import { ref, get, update, remove, onChildAdded } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./auth.js";
import { RULES } from "../config/game-config.js";
import { reduce } from "../core/engine.js";
import { joinState } from "../core/state.js";
import { stateToUpdates, handUpdates } from "./game.js";

// só estas ações podem vir dos jogadores
const PLAYER_ACTIONS = new Set([
  "nominate", "vote", "discard", "enact",
  "investigate", "special_election", "execute", "ack",
  "veto_request", "veto_answer",
]);
let started = false;

export async function startHost(code) {
  if (started) return;
  started = true;

  const [pub, host] = await Promise.all([
    get(ref(db, `rooms/${code}/public`)),
    get(ref(db, `rooms/${code}/host`)),
  ]);
  let state = joinState(pub.val(), host.val());
  let queue = Promise.resolve(); // processa uma ação por vez, na ordem

  const dispatch = (action) => {
    queue = queue
      .then(async () => {
        const next = reduce(state, action, RULES);
        if (next === state) {
          console.warn("[host] ação recusada:", action, "fase:", state.phase);
          return;
        }
        state = next;
        await update(ref(db), { ...stateToUpdates(code, state), ...handUpdates(code, state) });
      })
      .catch((err) => console.error("[host] erro:", err));
  };

  onChildAdded(ref(db, `rooms/${code}/inbox`), (snap) => {
    const action = snap.val();
    console.log("[host] recebi:", action);
    remove(snap.ref);
    if (action && PLAYER_ACTIONS.has(action.type)) dispatch(action);
  });

  if (state.phase === "role_reveal") {
    setTimeout(() => dispatch({ type: "begin" }), (RULES.roleRevealSeconds + 3) * 1000);
  }
}