export function checkPolicyVictory(tracks, rules) {
  if (tracks.a >= rules.winPolicies.a) return { team: "a", reason: "policies" };
  if (tracks.b >= rules.winPolicies.b) return { team: "b", reason: "policies" };
  return null;
}