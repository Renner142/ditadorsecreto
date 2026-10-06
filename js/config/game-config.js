export const RULES = {
  players: { min: 5, max: 10 },
  // a = time majoritário, b = time minoritário, leader = líder do time b
  roleTable: {
    5:  { a: 3, b: 1, leader: 1 },
    6:  { a: 4, b: 1, leader: 1 },
    7:  { a: 4, b: 2, leader: 1 },
    8:  { a: 5, b: 2, leader: 1 },
    9:  { a: 5, b: 3, leader: 1 },
    10: { a: 6, b: 3, leader: 1 },
  },
  deck: { a: 6, b: 11 },
  winPolicies: { a: 5, b: 6 },
  leaderElectionAfter: 3, // líder eleito chanceler após 3 políticas de b = b vence
  // poder liberado por cada política de b (1ª a 5ª), por faixa de jogadores
  powers: {
    "5-6":  [null, null, "peek", "execute", "execute"],
    "7-8":  [null, "investigate", "special_election", "execute", "execute"],
    "9-10": ["investigate", "investigate", "special_election", "execute", "execute"],
  },
  vetoAfter: 5,
  failedElectionsLimit: 3,
};