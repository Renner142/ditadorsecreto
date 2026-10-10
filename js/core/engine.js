import { shuffle, buildDeck } from "./deck.js";
import { checkPolicyVictory } from "./victory.js";
import { partyOf } from "./roles.js";
import { powerTrack } from "./powers.js";

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
    lastPower: null,
    confirmedNotLeader: [],
    investigated: [],
    specialReturn: null,
    vetoDenied: false,
    power: null,
    winner: null,
    votes: {},
    hand: null,
    peek: null,
    intel: {},
    news: [],
    shuffles: 0,
    roles,
    deck: buildDeck(rules),
    discard: [],
  };
}

export const aliveUids = (s) => s.order.filter((u) => !s.dead[u]);

// notícia do jornal: o "seed" decide qual manchete e qual comentário aparecem (igual para todos)
function addNews(s, entry) {
  s.news.push({ ...entry, seed: Math.floor(Math.random() * 1000000) });
}

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
    s.shuffles = (s.shuffles || 0) + 1;
  }
}

function endTurn(s) {
  // depois de uma eleição especial, a ordem volta de onde estava
  if (s.specialReturn != null) {
    s.presidentIdx = s.specialReturn;
    s.specialReturn = null;
  }
  s.presidentIdx = nextPresidentIdx(s);
  s.candidate = null;
  s.phase = "nominate";
}

function chaos(s, rules) {
  const policy = s.deck.shift(); // poder da política é ignorado
  s.tracks[policy] += 1;
  addNews(s, { k: "chaos", team: policy });
  s.lastVote.chaos = policy;
  s.electionTracker = 0;
  s.lastGov = null; // limites de mandato esquecidos
  refillDeck(s);
  const win = checkPolicyVictory(s.tracks, rules);
  if (win) { s.winner = win; s.phase = "ended"; }
}

function startLegislation(s) {
  s.hand = { uid: s.order[s.presidentIdx], cards: s.deck.splice(0, 3) };
  s.vetoDenied = false;
  s.phase = "leg_president";
}

function startPower(s, type) {
  s.power = type;
  s.phase = "power";
  if (type === "peek") {
    const president = s.order[s.presidentIdx];
    s.peek = { uid: president, cards: s.deck.slice(0, 3) };
    s.lastPower = { type: "peek", president };
    addNews(s, { k: "peek", president });
  }
}

function finishPower(s) {
  s.power = null;
  s.peek = null;
  endTurn(s);
}

function resolveVote(s, rules) {
  const alive = aliveUids(s);
  const yes = alive.filter((u) => s.votes[u]).length;
  const passed = yes > alive.length / 2; // empate = rejeitado
  const president = s.order[s.presidentIdx];

  s.lastEnacted = null;
  s.lastPower = null;
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
  addNews(s, { k: "rejected", president, chancellor: s.candidate, n: s.electionTracker });
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
      addNews(s, { k: "policy", team: policy, president, chancellor: s.candidate });
      s.lastEnacted = { policy, president, chancellor: s.candidate };
      s.electionTracker = 0;
      refillDeck(s);
      const win = checkPolicyVictory(s.tracks, rules);
      if (win) { s.winner = win; s.phase = "ended"; return true; }
      const power = policy === "b" ? powerTrack(rules, s.order.length)[s.tracks.b - 1] : null;
      if (power) startPower(s, power);
      else endTurn(s);
      return true;
    }

    case "veto_request":
      if (s.phase !== "leg_chancellor" || a.uid !== s.candidate || !s.hand) return false;
      if (s.tracks.b < rules.vetoAfter || s.vetoDenied) return false;
      s.phase = "leg_veto";
      return true;

    case "veto_answer": {
      if (s.phase !== "leg_veto" || a.uid !== president || typeof a.agree !== "boolean") return false;
      if (!a.agree) {
        addNews(s, { k: "veto_refused", president, chancellor: s.candidate });
        s.vetoDenied = true;
        s.phase = "leg_chancellor";
        return true;
      }
      s.discard.push(...s.hand.cards);
      s.hand = null;
      s.lastEnacted = { veto: true, president, chancellor: s.candidate };
      addNews(s, { k: "veto", president, chancellor: s.candidate });
      s.electionTracker += 1;
      refillDeck(s);
      if (s.electionTracker >= rules.failedElectionsLimit) chaos(s, rules);
      if (!s.winner) endTurn(s);
      return true;
    }

    case "investigate": {
      if (s.phase !== "power" || s.power !== "investigate" || a.uid !== president) return false;
      if (!aliveUids(s).includes(a.target) || a.target === president) return false;
      if (s.investigated.includes(a.target)) return false;
      s.investigated.push(a.target);
      (s.intel[president] ||= []).push({ target: a.target, party: partyOf(s.roles[a.target]) });
      s.lastPower = { type: "investigate", president, target: a.target };
      addNews(s, { k: "investigate", president, target: a.target });
      finishPower(s);
      return true;
    }

    case "special_election": {
      if (s.phase !== "power" || s.power !== "special_election" || a.uid !== president) return false;
      if (!aliveUids(s).includes(a.target) || a.target === president) return false;
      s.lastPower = { type: "special_election", president, target: a.target };
      addNews(s, { k: "special", president, target: a.target });
      if (s.specialReturn == null) s.specialReturn = s.presidentIdx;
      s.presidentIdx = s.order.indexOf(a.target);
      s.power = null;
      s.candidate = null;
      s.phase = "nominate";
      return true;
    }

    case "execute": {
      if (s.phase !== "power" || s.power !== "execute" || a.uid !== president) return false;
      if (!aliveUids(s).includes(a.target) || a.target === president) return false;
      s.dead[a.target] = true;
      s.lastPower = { type: "execute", president, target: a.target };
      addNews(s, { k: "execute", president, target: a.target });
      if (s.roles[a.target] === "leader") {
        s.winner = { team: "a", reason: "leader_killed" };
        s.phase = "ended";
        s.power = null;
        return true;
      }
      finishPower(s);
      return true;
    }

    case "ack": // presidente terminou de ver as cartas espiadas
      if (s.phase !== "power" || s.power !== "peek" || a.uid !== president) return false;
      finishPower(s);
      return true;
  }
  return false;
}

// devolve o MESMO objeto se a ação for inválida (o chamador compara)
export function reduce(state, action, rules) {
  const next = structuredClone(state);
  return apply(next, action, rules) ? next : state;
}