import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { RULES } from "../config/game-config.js";
import { powerTrack } from "../core/powers.js";
import { partyOf } from "../core/roles.js";
import { eligibleChancellors, aliveUids } from "../core/engine.js";
import { watchRoom } from "../net/room.js";
import { watchPrivate } from "../net/game.js";
import { sendAction } from "../net/actions.js";
import { show } from "./router.js";
import { playVictory } from "../audio/audio.js";

const $ = (id) => document.getElementById(id);

export function showBoard(user, code, info) {
  show("board");
  renderSelf(info);

  const mine = { hand: null, peek: null, intel: [] };
  let latest = null;
  let victoryPlayed = false;

  const draw = () => {
    if (!latest) return;
    renderSeats(user, info, latest.s, latest.players, mine.intel);
    renderAction(user, code, latest.s, latest.players, mine);
    renderIntel(latest.players, mine.intel);
  };

  // só você recebe sua mão, suas cartas espiadas e suas investigações
  watchPrivate(code, user.uid, (p) => {
    console.log("[privado]", p); // pode apagar depois de testar
    mine.hand = p?.hand || null;
    mine.peek = p?.peek || null;
    mine.intel = Array.isArray(p?.intel) ? p.intel : Object.values(p?.intel || {});
    draw();
  });

  watchRoom(code, (room) => {
    const pub = room.public;
    if (!pub || !pub.order) return;
    const s = {
      ...pub,
      dead: pub.dead || {},
      voted: pub.voted || {},
      lastGov: pub.lastGov || null,
      confirmedNotLeader: pub.confirmedNotLeader || [],
      investigated: pub.investigated || [],
    };
    latest = { s, players: room.players };

    if (s.winner && !victoryPlayed) { // toca uma vez só
      victoryPlayed = true;
      playVictory(s.winner.team);
    }

    renderTracks(s);
    renderTracker(s);
    draw();
    renderLastVote(s, room.players);
  });
}

function renderSelf(info) {
  $("self-badge").dataset.team = info.party;
  $("self-role").textContent = themeGet(`teams.${info.role}.name`);
  $("self-party").textContent = t("role.party", { party: themeGet(`teams.${info.party}.name`) });
}

function makeSlot(num, filled, label) {
  const el = document.createElement("div");
  el.className = "slot" + (filled ? " filled" : "");
  const n = document.createElement("span");
  n.className = "slot-num";
  n.textContent = num;
  const l = document.createElement("span");
  l.className = "slot-label";
  l.textContent = label;
  el.append(n, l);
  return el;
}

function renderTracks(s) {
  const powers = powerTrack(RULES, s.order.length);
  const teamA = themeGet("teams.a.name");
  const teamB = themeGet("teams.b.name");
  const leader = themeGet("teams.leader.name");

  $("track-a-title").textContent = t("board.track", { team: teamA });
  $("track-b-title").textContent = t("board.track", { team: teamB });

  const a = $("track-a");
  a.innerHTML = "";
  for (let i = 0; i < RULES.winPolicies.a; i++) {
    const isWin = i === RULES.winPolicies.a - 1;
    a.append(makeSlot(i + 1, i < s.tracks.a, isWin ? t("board.win") : ""));
  }

  const b = $("track-b");
  b.innerHTML = "";
  for (let i = 0; i < RULES.winPolicies.b; i++) {
    const isWin = i === RULES.winPolicies.b - 1;
    const powerId = powers[i];
    const label = isWin ? t("board.win") : powerId ? themeGet(`powers.${powerId}.name`) : "—";
    b.append(makeSlot(i + 1, i < s.tracks.b, label));
  }

  $("legend-leader").textContent = t("board.legend_leader", {
    n: RULES.leaderElectionAfter, team: teamB, leader,
  });
  $("legend-veto").textContent = t("board.legend_veto", { n: RULES.vetoAfter, team: teamB });
}

function renderTracker(s) {
  const box = $("tracker-dots");
  box.innerHTML = "";
  for (let i = 0; i < RULES.failedElectionsLimit; i++) {
    const d = document.createElement("span");
    d.className = "dot" + (i < (s.electionTracker || 0) ? " on" : "");
    box.append(d);
  }
}

function addTag(seat, text, cls = "") {
  const el = document.createElement("span");
  el.className = "seat-tag " + cls;
  el.textContent = text;
  seat.append(el);
}

function renderSeats(user, info, s, players, intel) {
  const { order, presidentIdx } = s;
  const me = order.indexOf(user.uid);
  const known = Object.fromEntries((info.known || []).map((k) => [k.uid, k.role]));
  const seen = Object.fromEntries(intel.map((r) => [r.target, r.party]));
  const inGov = s.phase.startsWith("leg_") || s.phase === "power";
  const box = $("seats");
  box.innerHTML = "";

  order
    .map((uid, i) => ({ uid, i, k: (i - me + order.length) % order.length }))
    .sort((x, y) => x.k - y.k)
    .forEach(({ uid, i, k }) => {
      const seat = document.createElement("div");
      seat.className = "seat" + (uid === user.uid ? " me" : "") + (s.dead[uid] ? " dead" : "");
      seat.style.setProperty("--a", `${90 + (k * 360) / order.length}deg`);

      const name = document.createElement("strong");
      name.textContent = players[uid]?.name ?? "?";
      seat.append(name);

      if (uid === user.uid) addTag(seat, t("board.you"));
      if (s.dead[uid]) addTag(seat, t("board.dead"));

      const finalRole = s.finalRoles?.[uid];
      if (finalRole) { // fim de jogo: todo mundo revelado, na cor do partido
        seat.classList.add("revealed");
        seat.dataset.team = partyOf(finalRole);
        seat.dataset.role = finalRole;
        addTag(seat, themeGet(`teams.${finalRole}.name`));
      } else if (known[uid]) { // aliados dos Autoritários
        seat.dataset.team = partyOf(known[uid]);
        seat.dataset.role = known[uid];
        addTag(seat, themeGet(`teams.${known[uid]}.name`));
      } else if (seen[uid]) { // investigado por você
        seat.dataset.team = seen[uid];
        addTag(seat, t("board.investigated_as", { party: themeGet(`teams.${seen[uid]}.name`) }));
      }

      if (i === presidentIdx && !s.dead[uid]) addTag(seat, t("board.president"), "president");
      if (uid === s.candidate && s.phase === "vote") addTag(seat, t("board.candidate"), "president");
      if (uid === s.candidate && inGov) addTag(seat, t("board.chancellor"), "president");
      if (s.phase === "vote" && s.voted[uid]) addTag(seat, t("board.voted"));
      if (s.confirmedNotLeader.includes(uid)) addTag(seat, t("board.not_leader", { leader: themeGet("teams.leader.name") }));

      box.append(seat);
    });
}

function renderIntel(players, intel) {
  const box = $("intel");
  box.innerHTML = "";
  if (!intel.length) return;
  const title = document.createElement("p");
  title.className = "label";
  title.textContent = t("intel.title");
  const ul = document.createElement("ul");
  ul.className = "vote-list";
  intel.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = `${players[r.target]?.name ?? "?"}: ${themeGet(`teams.${r.party}.name`)}`;
    ul.append(li);
  });
  box.append(title, ul);
}

function renderAction(user, code, s, players, mine) {
  const box = $("action");
  box.innerHTML = "";
  const name = (uid) => players[uid]?.name ?? "?";
  const president = s.order[s.presidentIdx];

  const text = (msg, cls = "") => {
    const p = document.createElement("p");
    p.className = cls;
    p.textContent = msg;
    box.append(p);
  };
  const row = (buttons) => {
    const d = document.createElement("div");
    d.className = "action-row";
    d.append(...buttons);
    box.append(d);
  };
  const button = (label, onClick, cls = "", ask = null) => {
    const b = document.createElement("button");
    b.className = `btn ${cls}`.trim();
    b.textContent = label;
    b.addEventListener("click", () => {
      if (ask && !window.confirm(ask)) return;
      box.querySelectorAll("button").forEach((x) => (x.disabled = true));
      onClick().catch(console.error);
    });
    return b;
  };
  const send = (type, payload) => () => sendAction(code, user.uid, type, payload);
  const policyButtons = (type) =>
    mine.hand.map((card, index) =>
      button(t("leg.policy", { team: themeGet(`teams.${card}.name`) }),
        send(type, { index }), `policy policy-${card}`));

  // o que acabou de acontecer
  if (s.lastEnacted) {
    const e = s.lastEnacted;
    text(e.veto
      ? t("veto.done", { president: name(e.president), chancellor: name(e.chancellor) })
      : t("leg.enacted", {
          team: themeGet(`teams.${e.policy}.name`),
          president: name(e.president),
          chancellor: name(e.chancellor),
        }), "hint");
  }
  if (s.lastPower) {
    text(t(`power.did_${s.lastPower.type}`, {
      president: name(s.lastPower.president),
      target: name(s.lastPower.target),
    }), "hint");
  }
  if (s.dead[user.uid]) text(t("board.you_dead"), "hint");

  switch (s.phase) {
    case "role_reveal":
      text(t("nominate.starting"), "hint");
      break;

    case "nominate":
      if (president === user.uid) {
        text(t("nominate.pick"));
        row(eligibleChancellors(s, RULES).map((uid) =>
          button(name(uid), send("nominate", { target: uid }))));
      } else {
        text(t("nominate.waiting", { president: name(president) }), "hint");
      }
      break;

    case "vote":
      text(t("vote.ask", { president: name(president), chancellor: name(s.candidate) }));
      if (s.voted[user.uid]) {
        text(t("vote.waiting"), "hint");
      } else if (!s.dead[user.uid]) {
        row([
          button(t("vote.yes"), send("vote", { vote: true }), "btn-yes"),
          button(t("vote.no"), send("vote", { vote: false }), "btn-no"),
        ]);
      }
      break;

    case "leg_president":
      if (president === user.uid && mine.hand) {
        text(t("leg.president_pick"));
        row(policyButtons("discard"));
      } else {
        text(t("leg.president_waiting", { president: name(president) }), "hint");
      }
      break;

    case "leg_chancellor":
      if (s.candidate === user.uid && mine.hand) {
        text(t("leg.chancellor_pick"));
        row(policyButtons("enact"));
        if (s.tracks.b >= RULES.vetoAfter && !s.vetoDenied) {
          row([button(t("veto.request"), send("veto_request"), "btn-secondary")]);
        }
      } else {
        text(t("leg.chancellor_waiting", { chancellor: name(s.candidate) }), "hint");
      }
      break;

    case "leg_veto":
      if (president === user.uid) {
        text(t("veto.ask", { chancellor: name(s.candidate) }));
        row([
          button(t("veto.agree"), send("veto_answer", { agree: true }), "btn-yes"),
          button(t("veto.refuse"), send("veto_answer", { agree: false }), "btn-no"),
        ]);
      } else {
        text(t("veto.waiting"), "hint");
      }
      break;

    case "power": {
      const powerName = themeGet(`powers.${s.power}.name`);
      if (president !== user.uid) {
        text(t("power.waiting", { president: name(president), power: powerName }), "hint");
        break;
      }
      if (s.power === "peek") {
        text(t("power.peek_title"));
        const chips = document.createElement("div");
        chips.className = "chips";
        (mine.peek || []).forEach((card) => {
          const c = document.createElement("div");
          c.className = `chip chip-${card}`;
          c.textContent = themeGet(`teams.${card}.name`);
          chips.append(c);
        });
        box.append(chips);
        row([button(t("power.ack"), send("ack"))]);
        break;
      }
      let targets = aliveUids(s).filter((u) => u !== user.uid);
      if (s.power === "investigate") targets = targets.filter((u) => !s.investigated.includes(u));
      const deadly = s.power === "execute";
      text(t(`power.pick_${s.power}`));
      row(targets.map((uid) =>
        button(name(uid), send(s.power, { target: uid }), deadly ? "btn-no" : "",
          deadly ? t("power.confirm_execute", { target: name(uid) }) : null)));
      break;
    }

    case "ended":
      text(t("end.winner", { team: themeGet(`teams.${s.winner.team}.name`) }), "end-title");
      text(t(`end.reason_${s.winner.reason}`, { leader: themeGet("teams.leader.name") }), "hint");
      if (s.finalRoles) {
        const ul = document.createElement("ul");
        ul.className = "vote-list";
        s.order.forEach((uid) => {
          const li = document.createElement("li");
          li.textContent = `${name(uid)}: ${themeGet(`teams.${s.finalRoles[uid]}.name`)}`;
          ul.append(li);
        });
        box.append(ul);
      }
      break;
  }
}

function renderLastVote(s, players) {
  const box = $("last-vote");
  box.innerHTML = "";
  const lv = s.lastVote;
  if (!lv) return;
  const name = (uid) => players[uid]?.name ?? "?";

  const title = document.createElement("p");
  title.className = "label";
  title.textContent = t(lv.passed ? "vote.passed" : "vote.failed", {
    president: name(lv.president), chancellor: name(lv.chancellor),
  });
  box.append(title);

  const ul = document.createElement("ul");
  ul.className = "vote-list";
  s.order.filter((uid) => uid in lv.votes).forEach((uid) => {
    const yes = lv.votes[uid];
    const li = document.createElement("li");
    li.className = yes ? "vote-yes" : "vote-no";
    li.textContent = `${name(uid)}: ${t(yes ? "vote.yes" : "vote.no")}`;
    ul.append(li);
  });
  box.append(ul);

  if (lv.chaos) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = t("vote.chaos", { team: themeGet(`teams.${lv.chaos}.name`) });
    box.append(p);
  }
}