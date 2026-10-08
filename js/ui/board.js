import { t } from "../i18n/i18n.js";
import { themeGet } from "../theme/loader.js";
import { RULES } from "../config/game-config.js";
import { powerTrack } from "../core/powers.js";
import { partyOf } from "../core/roles.js";
import { eligibleChancellors, aliveUids } from "../core/engine.js";
import { watchRoom } from "../net/room.js";
import { watchPrivate, resetRoom } from "../net/game.js";
import { sendAction } from "../net/actions.js";
import { playVictory } from "../audio/audio.js";
import { playSfx } from "../audio/sfx.js";
import { confirmDialog } from "./modal.js";
import { show } from "./router.js";
import { setBackground } from "./background.js";
import { stageExecution, stageLeaderElected, stagePolicyWin } from "./stage.js";
import { showEndScreen, hideEndScreen } from "./endscreen.js";

const $ = (id) => document.getElementById(id);

const POWER_SFX_DELAY = 900;  // o som do poder toca depois do som da política
const END_PAUSE_MS = 1300;    // pausa entre o fundo varrido e a tela de resultado

let unsubs = [];
let timers = [];
let prevTracks = null;

const later = (fn, ms) => timers.push(setTimeout(fn, ms));

// desliga os ouvintes e os temporizadores da partida (usado ao voltar para a sala)
export function stopBoard() {
  unsubs.forEach((fn) => { try { fn(); } catch {} });
  unsubs = [];
  timers.forEach(clearTimeout);
  timers = [];
  prevTracks = null;
  hideEndScreen();
}

export function showBoard(user, code, info, hooks = {}) {
  stopBoard();
  show("board");
  renderSelf(info);

  const mine = { hand: null, peek: null, intel: [] };
  const ui = { end: null }; // end: null | "holding" (cerimônia rolando) | "done"
  let latest = null;
  let lastTurnKey = "";
  let chain = Promise.resolve(); // as cerimônias rodam uma de cada vez
  const seen = {};

  function draw() {
    if (!latest) return;
    renderSeats(user, info, latest.s, latest.players, mine.intel, ui);
    renderAction(user, code, latest.s, latest.players, mine, ui, openEnd);
  }

  // tela de resultado: vencedor, motivo, papel de todos e botões
  function openEnd() {
    if (!latest || ui.end !== "done" || !latest.s.winner) return;
    const { s, players } = latest;
    showEndScreen({
      title: t("end.winner", { team: themeGet(`teams.${s.winner.team}.name`) }),
      team: s.winner.team,
      reason: t(`end.reason_${s.winner.reason}`, { leader: themeGet("teams.leader.name") }),
      rows: s.order.map((uid) => {
        const role = s.finalRoles?.[uid];
        return {
          name: players[uid]?.name ?? "?",
          label: role ? themeGet(`teams.${role}.name`) : "?",
          team: role ? partyOf(role) : null,
          dead: !!s.dead[uid],
        };
      }),
      isHost: s.hostUid === user.uid,
      onBack: () => {
        const uids = [...new Set([...Object.keys(players), ...s.order])];
        return resetRoom(code, uids);
      },
      onView: () => hideEndScreen(),
      onLeave: () => hooks.onLeave?.(),
    });
  }

  // só você recebe sua mão, suas cartas espiadas e suas investigações
  unsubs.push(watchPrivate(code, user.uid, (p) => {
    mine.hand = p?.hand || null;
    mine.peek = p?.peek || null;
    mine.intel = Array.isArray(p?.intel) ? p.intel : Object.values(p?.intel || {});
    draw();
  }));

  // true quando o valor mudou desde a última vez (a 1ª leitura nunca conta)
  const changed = (key, value) => {
    const j = JSON.stringify(value ?? null);
    const did = seen[key] !== undefined && seen[key] !== j;
    seen[key] = j;
    return did;
  };

  function cues(s, powerChanged, execNow) {
    let cued = false;
    const winByPolicies = s.winner?.reason === "policies"; // esse som fica pro palco
    if (changed("vote", s.lastVote) && s.lastVote) {
      cued = true;
      playSfx(s.lastVote.passed ? "vote_pass" : "vote_fail");
      if (s.lastVote.chaos && !winByPolicies) playSfx(`policy_${s.lastVote.chaos}`, 700);
    }
    if (changed("enacted", s.lastEnacted) && s.lastEnacted) {
      cued = true;
      if (!winByPolicies) playSfx(s.lastEnacted.veto ? "veto" : `policy_${s.lastEnacted.policy}`, 400);
    }
    if (powerChanged && s.lastPower) {
      cued = true;
      if (s.lastPower.type !== "execute") playSfx(`power_${s.lastPower.type}`, POWER_SFX_DELAY);
    }

    const me = user.uid;
    const pres = s.order[s.presidentIdx];
    const myTurn =
      (s.phase === "nominate" && pres === me) ||
      (s.phase === "vote" && !s.voted[me] && !s.dead[me]) ||
      (s.phase === "leg_president" && pres === me) ||
      (s.phase === "leg_chancellor" && s.candidate === me) ||
      (s.phase === "leg_veto" && pres === me) ||
      (s.phase === "power" && pres === me);
    const key = myTurn ? `${s.phase}:${s.presidentIdx}:${s.tracks.a}:${s.tracks.b}:${s.electionTracker}` : "";
    if (key && key !== lastTurnKey) playSfx("turn", execNow ? 4600 : cued ? 1500 : 0);
    lastTurnKey = key;
    $("action").classList.toggle("your-turn", myTurn);
  }

  // cerimônias na frente da tela: execução, Ditador eleito e política decisiva
  function ceremony(s, players, execNow, endNow) {
    const w = s.winner;
    const nm = (uid) => players[uid]?.name ?? "?";
    chain = chain.then(async () => {
      try {
        if (execNow) {
          await stageExecution({
            president: nm(execNow.president),
            target: nm(execNow.target),
            reveal: !!endNow && w.reason === "leader_killed",
          });
        } else if (endNow && w.reason === "leader_elected") {
          await stageLeaderElected({ name: nm(s.candidate) });
        } else if (endNow && w.reason === "policies") {
          await stagePolicyWin({ team: w.team });
        }
      } catch (err) {
        console.error(err);
      }
      if (endNow) { // só agora os papéis são revelados, o fundo é tomado e a música toca
        ui.end = "done";
        playVictory(w.team);
        setBackground({ win: w.team });
        draw();
        later(openEnd, END_PAUSE_MS);
      }
    });
  }

  unsubs.push(watchRoom(code, (room) => {
    const pub = room.public;
    if (!pub || !pub.order) return;
    // o Firebase remove objetos/listas vazios, então normalizamos
    const s = {
      ...pub,
      dead: pub.dead || {},
      voted: pub.voted || {},
      lastGov: pub.lastGov || null,
      investigated: pub.investigated || [],
    };
    latest = { s, players: room.players };

    const powerChanged = changed("power", s.lastPower);
    const execNow = powerChanged && s.lastPower?.type === "execute" ? s.lastPower : null;
    const endNow = !!s.winner && ui.end === null;
    if (endNow) ui.end = "holding";

    cues(s, powerChanged, execNow);
    if (execNow || endNow) ceremony(s, room.players, execNow, endNow);
    renderTracks(s);
    renderTracker(s);
    draw();
    renderLastVote(s, room.players);
  }));
}

function renderSelf(info) {
  $("self-badge").dataset.team = info.party;
  $("self-role").textContent = themeGet(`teams.${info.role}.name`);
  $("self-party").textContent = t("role.party", { party: themeGet(`teams.${info.party}.name`) });
}

function makeSlot(num, filled, label, fresh = false) {
  const el = document.createElement("div");
  el.className = "slot" + (filled ? " filled" : "") + (fresh ? " stamp" : "");
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
    a.append(makeSlot(i + 1, i < s.tracks.a, isWin ? t("board.win") : "",
      !!prevTracks && i < s.tracks.a && i >= prevTracks.a));
  }

  const b = $("track-b");
  b.innerHTML = "";
  for (let i = 0; i < RULES.winPolicies.b; i++) {
    const isWin = i === RULES.winPolicies.b - 1;
    const powerId = powers[i];
    const label = isWin ? t("board.win") : powerId ? themeGet(`powers.${powerId}.name`) : "—";
    b.append(makeSlot(i + 1, i < s.tracks.b, label,
      !!prevTracks && i < s.tracks.b && i >= prevTracks.b));
  }

  $("legend-leader").textContent = t("board.legend_leader", {
    n: RULES.leaderElectionAfter, team: teamB, leader,
  });
  $("legend-veto").textContent = t("board.legend_veto", { n: RULES.vetoAfter, team: teamB });
  prevTracks = { a: s.tracks.a, b: s.tracks.b };
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

function renderSeats(user, info, s, players, intel, ui) {
  const { order, presidentIdx } = s;
  const me = order.indexOf(user.uid);
  const known = Object.fromEntries((info.known || []).map((k) => [k.uid, k.role]));
  const investigated = Object.fromEntries(intel.map((r) => [r.target, r.party]));
  const inGov = s.phase.startsWith("leg_") || s.phase === "power";
  const box = $("seats");
  if (!box) return;
  box.innerHTML = "";

  order
    .map((uid, i) => ({ uid, i, k: (i - me + order.length) % order.length }))
    .sort((x, y) => x.k - y.k) // você primeiro, depois no sentido horário
    .forEach(({ uid, i }) => {
      const seat = document.createElement("div");
      seat.className = "seat" + (uid === user.uid ? " me" : "");
      const playerName = players[uid]?.name ?? "?";
      const finalRole = ui.end === "done" ? s.finalRoles?.[uid] : null; // papéis só no fim

      if (s.dead[uid]) seat.classList.add("dead");

      const name = document.createElement("strong");
      name.textContent = playerName;
      seat.append(name);

      // o morto fica coberto por uma caveira, sem revelar o papel, até o fim da partida
      if (s.dead[uid] && !finalRole) {
        const cover = document.createElement("div");
        cover.className = "skull-cover";
        const skull = document.createElement("span");
        skull.className = "skull";
        skull.textContent = "☠";
        const label = document.createElement("span");
        label.className = "skull-name";
        label.textContent = playerName;
        cover.append(skull, label);
        seat.append(cover);
        box.append(seat);
        return;
      }

      if (uid === user.uid) addTag(seat, t("board.you"));
      if (s.dead[uid]) addTag(seat, t("board.dead"));

      if (finalRole) { // fim de jogo: papel revelado, na cor do partido
        seat.classList.add("revealed");
        seat.dataset.team = partyOf(finalRole);
        seat.dataset.role = finalRole;
        addTag(seat, themeGet(`teams.${finalRole}.name`));
      } else if (known[uid]) { // aliados dos Autoritários (e o Ditador), em vermelho
        seat.classList.add("revealed");
        seat.dataset.team = partyOf(known[uid]);
        seat.dataset.role = known[uid];
        addTag(seat, themeGet(`teams.${known[uid]}.name`));
      } else if (investigated[uid]) { // investigado por você: só o partido
        seat.classList.add("revealed");
        seat.dataset.team = investigated[uid];
        addTag(seat, themeGet(`teams.${investigated[uid]}.name`));
      } else if (uid === user.uid) { // o seu assento, na cor do seu partido
        seat.classList.add("revealed");
        seat.dataset.team = info.party;
        seat.dataset.role = info.role;
      }

      const isPres = i === presidentIdx && !s.dead[uid];
      const isCand = uid === s.candidate && s.phase === "vote";
      const isChan = uid === s.candidate && inGov;
      if (isPres) addTag(seat, t("board.president"), "president");
      if (isCand) addTag(seat, t("board.candidate"), "president");
      if (isChan) addTag(seat, t("board.chancellor"), "president");
      if (isPres || isCand || isChan) seat.classList.add("gov"); // borda amarela
      if (s.phase === "vote" && s.voted[uid]) addTag(seat, t("board.voted"));

      box.append(seat);
    });
}

function renderAction(user, code, s, players, mine, ui, openEnd) {
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
  // ask: { title, message, confirm, danger } abre a confirmação dentro do jogo
  const button = (label, onClick, cls = "", ask = null, sfx = null) => {
    const b = document.createElement("button");
    b.className = `btn ${cls}`.trim();
    b.textContent = label;
    if (sfx) b.dataset.sfx = sfx;
    b.addEventListener("click", async () => {
      if (ask && !(await confirmDialog(ask))) return;
      box.querySelectorAll("button").forEach((x) => (x.disabled = true));
      onClick().catch(console.error);
    });
    return b;
  };
  const send = (type, payload) => () => sendAction(code, user.uid, type, payload);
  const policyButtons = (type) =>
    mine.hand.map((card, index) =>
      button(t("leg.policy", { team: themeGet(`teams.${card}.name`) }),
        send(type, { index }), `policy policy-${card}`, null,
        type === "enact" ? "stamp" : "discard"));

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
          button(t("vote.yes"), send("vote", { vote: true }), "btn-yes", null, "vote_yes"),
          button(t("vote.no"), send("vote", { vote: false }), "btn-no", null, "vote_no"),
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
          row([button(t("veto.request"), send("veto_request"), "btn-secondary", null, "veto")]);
        }
      } else {
        text(t("leg.chancellor_waiting", { chancellor: name(s.candidate) }), "hint");
      }
      break;

    case "leg_veto":
      if (president === user.uid) {
        text(t("veto.ask", { chancellor: name(s.candidate) }));
        row([
          button(t("veto.agree"), send("veto_answer", { agree: true }), "btn-yes", null, "vote_yes"),
          button(t("veto.refuse"), send("veto_answer", { agree: false }), "btn-no", null, "vote_no"),
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
          deadly
            ? {
                title: t("power.confirm_title"),
                message: t("power.confirm_execute", { target: name(uid) }),
                confirm: t("power.confirm_yes"),
                danger: true,
              }
            : null)));
      break;
    }

    case "ended": {
      if (ui.end !== "done") { // a cerimônia de fim ainda está rolando
        text(t("end.ending"), "end-title");
        break;
      }
      text(t("end.winner", { team: themeGet(`teams.${s.winner.team}.name`) }), "end-title");
      text(t(`end.reason_${s.winner.reason}`, { leader: themeGet("teams.leader.name") }), "hint");
      // botão simples (não desabilita), pra reabrir a tela de resultado depois de "Ver a mesa"
      const reopen = document.createElement("button");
      reopen.className = "btn btn-secondary";
      reopen.textContent = t("end.open_result");
      reopen.addEventListener("click", openEnd);
      row([reopen]);
      break;
    }
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