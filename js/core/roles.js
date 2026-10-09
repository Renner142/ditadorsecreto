import { shuffle } from "./deck.js";

export const partyOf = (role) => (role === "a" ? "a" : "b");

export function assignRoles(uids, rules) {
  const table = rules.roleTable[uids.length];
  if (!table) throw new Error("errors.bad_player_count");
  const pool = shuffle([
    ...Array(table.a).fill("a"),
    ...Array(table.b).fill("b"),
    ...Array(table.leader).fill("leader"),
  ]);
  return Object.fromEntries(uids.map((uid, i) => [uid, pool[i]]));
}

// aceita true/false ou uma tabela por faixa de jogadores ("5-6": true)
export function leaderKnowsAllies(rules, count) {
  const v = rules.leaderKnowsAllies;
  if (typeof v === "boolean") return v;
  for (const [range, value] of Object.entries(v || {})) {
    const [min, max] = range.split("-").map(Number);
    if (count >= min && count <= max) return !!value;
  }
  return false;
}

// o que ESTE jogador tem direito de saber
export function buildKnowledge(uid, roles, rules) {
  const role = roles[uid];
  const count = Object.keys(roles).length;
  const others = Object.keys(roles).filter((u) => u !== uid);
  const pick = (filter) =>
    others.filter((u) => filter(roles[u])).map((u) => ({ uid: u, role: roles[u] }));

  let known = [];
  if (role === "b") known = pick((r) => partyOf(r) === "b"); // aliados + Ditador
  else if (role === "leader" && leaderKnowsAllies(rules, count)) known = pick((r) => r === "b");

  return { role, party: partyOf(role), known };
}