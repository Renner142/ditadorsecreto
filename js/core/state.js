const orNull = (v) =>
  v === undefined || (v !== null && typeof v === "object" && Object.keys(v).length === 0) ? null : v;

const clean = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, orNull(v)]));

export function splitState(s) {
  const voted = Object.fromEntries(Object.keys(s.votes).map((u) => [u, true]));
  return {
    pub: clean({
      phase: s.phase, order: s.order, presidentIdx: s.presidentIdx, dead: s.dead,
      tracks: s.tracks, electionTracker: s.electionTracker, candidate: s.candidate,
      lastGov: s.lastGov, lastVote: s.lastVote, lastEnacted: s.lastEnacted,
      lastPower: s.lastPower, power: s.power, investigated: s.investigated,
      specialReturn: s.specialReturn, vetoDenied: s.vetoDenied,
      confirmedNotLeader: s.confirmedNotLeader, winner: s.winner, voted,
      finalRoles: s.winner ? s.roles : null, // só aparece quando o jogo acaba
    }),
    host: clean({
      roles: s.roles, deck: s.deck, discard: s.discard, votes: s.votes,
      hand: s.hand, peek: s.peek, intel: s.intel,
    }),
  };
}

// reconstrói o estado completo (usado pelo anfitrião ao começar)
export function joinState(pub, host) {
  return {
    phase: pub.phase,
    order: pub.order,
    presidentIdx: pub.presidentIdx ?? 0,
    dead: pub.dead || {},
    tracks: { a: pub.tracks?.a || 0, b: pub.tracks?.b || 0 },
    electionTracker: pub.electionTracker || 0,
    candidate: pub.candidate ?? null,
    lastGov: pub.lastGov ?? null,
    lastVote: pub.lastVote ?? null,
    lastEnacted: pub.lastEnacted ?? null,
    lastPower: pub.lastPower ?? null,
    power: pub.power ?? null,
    investigated: pub.investigated || [],
    specialReturn: pub.specialReturn ?? null,
    vetoDenied: !!pub.vetoDenied,
    confirmedNotLeader: pub.confirmedNotLeader || [],
    winner: pub.winner ?? null,
    roles: host.roles,
    deck: host.deck || [],
    discard: host.discard || [],
    votes: host.votes || {},
    hand: host.hand ?? null,
    peek: host.peek ?? null,
    intel: host.intel || {},
  };
}