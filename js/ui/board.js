import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { RULES } from "../config/game-config.js";
import { powerTrack } from "../core/powers.js";
import { partyOf } from "../core/roles.js";
import { watchRoom } from "../net/room.js";
import { show } from "./router.js";

const $ = (id) => document.getElementById(id);

export function showBoard(user, code, info) {
  show("board");
  renderSelf(info);
  watchRoom(code, (room) => {
    if (!room.public || !room.public.order) return;
    renderTracks(room.public);
    renderTracker(room.public);
    renderSeats(user, info, room);
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

function renderTracks(pub) {
  const players = pub.order.length;
  const powers = powerTrack(RULES, players);
  const teamA = themeGet("teams.a.name");
  const teamB = themeGet("teams.b.name");
  const leader = themeGet("teams.leader.name");

  $("track-a-title").textContent = t("board.track", { team: teamA });
  $("track-b-title").textContent = t("board.track", { team: teamB });

  const a = $("track-a");
  a.innerHTML = "";
  for (let i = 0; i < RULES.winPolicies.a; i++) {
    const isWin = i === RULES.winPolicies.a - 1;
    a.append(makeSlot(i + 1, i < pub.tracks.a, isWin ? t("board.win") : ""));
  }

  const b = $("track-b");
  b.innerHTML = "";
  for (let i = 0; i < RULES.winPolicies.b; i++) {
    const isWin = i === RULES.winPolicies.b - 1;
    const powerId = powers[i];
    const label = isWin ? t("board.win") : powerId ? themeGet(`powers.${powerId}.name`) : "—";
    b.append(makeSlot(i + 1, i < pub.tracks.b, label));
  }

  $("legend-leader").textContent = t("board.legend_leader", {
    n: RULES.leaderElectionAfter, team: teamB, leader,
  });
  $("legend-veto").textContent = t("board.legend_veto", { n: RULES.vetoAfter, team: teamB });
}

function renderTracker(pub) {
  const box = $("tracker-dots");
  box.innerHTML = "";
  for (let i = 0; i < RULES.failedElectionsLimit; i++) {
    const d = document.createElement("span");
    d.className = "dot" + (i < (pub.electionTracker || 0) ? " on" : "");
    box.append(d);
  }
}

function addTag(seat, text, cls = "") {
  const el = document.createElement("span");
  el.className = "seat-tag " + cls;
  el.textContent = text;
  seat.append(el);
}

function renderSeats(user, info, room) {
  const { order, presidentIdx } = room.public;
  const me = order.indexOf(user.uid);
  const known = Object.fromEntries((info.known || []).map((k) => [k.uid, k.role]));
  const box = $("seats");
  box.innerHTML = "";

  order
    .map((uid, i) => ({ uid, i, k: (i - me + order.length) % order.length }))
    .sort((x, y) => x.k - y.k) // você primeiro, depois no sentido horário
    .forEach(({ uid, i, k }) => {
      const seat = document.createElement("div");
      seat.className = "seat" + (uid === user.uid ? " me" : "");
      seat.style.setProperty("--a", `${90 + (k * 360) / order.length}deg`);

      const name = document.createElement("strong");
      name.textContent = room.players[uid]?.name ?? "?";
      seat.append(name);

      if (uid === user.uid) addTag(seat, t("board.you"));
      if (known[uid]) {
        seat.dataset.team = partyOf(known[uid]);
        seat.dataset.role = known[uid];
        addTag(seat, themeGet(`teams.${known[uid]}.name`));
      }
      if (i === presidentIdx) addTag(seat, t("board.president"), "president");

      box.append(seat);
    });
}