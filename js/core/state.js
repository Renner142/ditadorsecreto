const orNull = (v) =>
  v === undefined || (v !== null && typeof v === "object" && Object.keys(v).length === 0) ? null : v;

const clean = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, orNull(v)]));

export function splitState(s) {
  const voted = Object.fromEntries(Object.keys(s.votes).map((u) => [u, true]));
  return {
    pub: clean({
      phase: s.phase, order: s.order, presidentIdx: s.presidentIdx, dead: s.dead,
      tracks: s.tracks, electionTracker: s.electionTracker, candidate: s.candidate,
      lastGov: s.lastGov, lastVote: s.lastVote, confirmedNotLeader: s.confirmedNotLeader,
      winner: s.winner, voted,
    }),
    host: clean({ roles: s.roles, deck: s.deck, discard: s.discard, votes: s.votes }),
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
    confirmedNotLeader: pub.confirmedNotLeader || [],
    winner: pub.winner ?? null,
    roles: host.roles,
    deck: host.deck || [],
    discard: host.discard || [],
    votes: host.votes || {},
  };
}