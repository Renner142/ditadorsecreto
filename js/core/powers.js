export function powerTrack(rules, playerCount) {
  for (const [range, list] of Object.entries(rules.powers)) {
    const [min, max] = range.split("-").map(Number);
    if (playerCount >= min && playerCount <= max) return list;
  }
  return Object.values(rules.powers)[0] ?? [];
}