import { shuffle, buildDeck } from "./deck.js";
import { checkPolicyVictory } from "./victory.js";

export function initialState(uids, roles, rules) {
  return {
    phase: "role_reveal",
    order: shuffle(uids),
    presidentIdx: 0,
    dead: {},
    tracks: { a: 0, b: 0 },
    electionTracker: 0,
    candidate: null,
    lastGov: null,
    lastVote: null,
    lastEnacted: null,
    confirmedNotLeader: [],
    winner: null,
    votes: {},
    hand: null,
    roles,
    deck: buildDeck(rules),
    discard: [],
  };
}

export const aliveUids = (s) => s.order.filter((u) => !s.dead[u]);

function nextPresidentIdx(s) {
  let i = s.presidentIdx;
  do { i = (i + 1) % s.order.length; } while (s.dead[s.order[i]]);
  return i;
}

export function eligibleChancellors(s, rules) {
  const alive = aliveUids(s);
  const president = s.order[s.presidentIdx];
  return alive.filter((uid) => {
    if (uid === president) return false;
    if (s.lastGov) {
      if (uid === s.lastGov.chancellor) return false;
      if (alive.length > rules.lastPresidentEligibleAt && uid === s.lastGov.president) return false;
    }
    return true;
  });
}

function refillDeck(s) {
  if (s.deck.length < 3) {
    s.deck = shuffle([...s.deck, ...s.discard]);
    s.discard = [];
  }
}

function endTurn(s) {
  s.presidentIdx = nextPresidentIdx(s);
  s.candidate = null;
  s.phase = "nominate";
}

function chaos(s, rules) {
  const policy = s.deck.shift(); // poder da política é ignorado
  s.tracks[policy] += 1;
  s.lastVote.chaos = policy;
  s.electionTracker = 0;
  s.lastGov = null; // limites de mandato esquecidos
  refillDeck(s);
  const win = checkPolicyVictory(s.tracks, rules);
  if (win) { s.winner = win; s.phase = "ended"; }
}

function startLegislation(s) {
  s.hand = { uid: s.order[s.presidentIdx], cards: s.deck.splice(0, 3) };
  s.phase = "leg_president";
}

function resolveVote(s, rules) {
  const alive = aliveUids(s);
  const yes = alive.filter((u) => s.votes[u]).length;
  const passed = yes > alive.length / 2; // empate = rejeitado
  const president = s.order[s.presidentIdx];

  s.lastEnacted = null;
  s.lastVote = { president, chancellor: s.candidate, votes: { ...s.votes }, passed, chaos: null };
  s.votes = {};

  if (passed) {
    s.lastGov = { president, chancellor: s.candidate };
    if (s.tracks.b >= rules.leaderElectionAfter) {
      if (s.roles[s.candidate] === "leader") {
        s.winner = { team: "b", reason: "leader_elected" };
        s.phase = "ended";
        return;
      }
      if (!s.confirmedNotLeader.includes(s.candidate)) s.confirmedNotLeader.push(s.candidate);
    }
    startLegislation(s);
    return;
  }

  s.electionTracker += 1;
  if (s.electionTracker >= rules.failedElectionsLimit) chaos(s, rules);
  if (!s.winner) endTurn(s);
}

function apply(s, a, rules) {
  if (s.winner) return false;
  const president = s.order[s.presidentIdx];

  switch (a.type) {
    case "begin":
      if (s.phase !== "role_reveal") return false;
      s.phase = "nominate";
      return true;

    case "nominate":
      if (s.phase !== "nominate" || a.uid !== president) return false;
      if (!eligibleChancellors(s, rules).includes(a.target)) return false;
      s.candidate = a.target;
      s.votes = {};
      s.lastVote = null;
      s.phase = "vote";
      return true;

    case "vote":
      if (s.phase !== "vote") return false;
      if (!s.order.includes(a.uid) || s.dead[a.uid]) return false;
      if (typeof a.vote !== "boolean" || a.uid in s.votes) return false;
      s.votes[a.uid] = a.vote;
      if (Object.keys(s.votes).length === aliveUids(s).length) resolveVote(s, rules);
      return true;

    case "discard": { // presidente descarta 1 das 3
      if (s.phase !== "leg_president" || a.uid !== president || !s.hand) return false;
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= s.hand.cards.length) return false;
      const [out] = s.hand.cards.splice(a.index, 1);
      s.discard.push(out);
      s.hand = { uid: s.candidate, cards: s.hand.cards };
      s.phase = "leg_chancellor";
      return true;
    }

    case "enact": { // chanceler promulga 1 das 2
      if (s.phase !== "leg_chancellor" || a.uid !== s.candidate || !s.hand) return false;
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= s.hand.cards.length) return false;
      const [policy] = s.hand.cards.splice(a.index, 1);
      s.discard.push(...s.hand.cards);
      s.hand = null;
      s.tracks[policy] += 1;
      s.lastEnacted = { policy, president, chancellor: s.candidate };
      s.electionTracker = 0;
      refillDeck(s);
      const win = checkPolicyVictory(s.tracks, rules);
      if (win) { s.winner = win; s.phase = "ended"; }
      else endTurn(s); // poderes presidenciais entram no próximo bloco
      return true;
    }
  }
  return false;
}

// devolve o MESMO objeto se a ação for inválida (o chamador compara)
export function reduce(state, action, rules) {
  const next = structuredClone(state);
  return apply(next, action, rules) ? next : state;
}