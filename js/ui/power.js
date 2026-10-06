// devolve a lista de poderes das casas da trilha B para esse nº de jogadores
export function powerTrack(rules, playerCount) {
  for (const [range, list] of Object.entries(rules.powers)) {
    const [min, max] = range.split("-").map(Number);
    if (playerCount >= min && playerCount <= max) return list;
  }
  return Object.values(rules.powers)[0] ?? []; // fallback (ex: testes com 3 jogadores)
}