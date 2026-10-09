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
import { policyFace, policyCardButton, teamIconUrl } from "./cards.js";
import { buildToken } from "./token.js";

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
  const hb = document.getElementById("host-banner");
  if (hb) hb.hidden = true;
  hideEndScreen();
}

export function showBoard(user, code, info, hooks = {}) {
  stopBoard();
  show("board");
  renderSelf(info);
    // no celular o painel de ação fica fixo embaixo: reserva o espaço pra ele não cobrir a mesa
  const actionEl = $("action");
  if (actionEl && "ResizeObserver" in window) {
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--action-h", `${actionEl.offsetHeight}px`));
    ro.observe(actionEl);
    unsubs.push(() => {
      ro.disconnect();
      document.documentElement.style.setProperty("--action-h", "0px");
    });
  }

  const mine = { hand: null, peek: null, intel: [] };
  const ui = { end: null }; // end: null | "holding" (cerimônia rolando) | "done"
  let latest = null;
  let lastTurnKey = "";
  let firstRead = true;
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

  function cues(s, ev) {
    let cued = false;
    if (ev.voteChanged && s.lastVote) {
      cued = true;
      playSfx(s.lastVote.passed ? "vote_pass" : "vote_fail");
      if (s.lastVote.chaos && !ev.holdPolicySfx) playSfx(`policy_${s.lastVote.chaos}`, 700);
    }
    if (ev.enactedChanged && s.lastEnacted) {
      cued = true;
      if (!ev.holdPolicySfx) playSfx(s.lastEnacted.veto ? "veto" : `policy_${s.lastEnacted.policy}`, 400);
    }
    if (ev.powerChanged && s.lastPower) {
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
    const tm = RULES.stageTimings || {};
    const suspense = ev.tensionLevel >= 2 ? (tm.suspenseBigMs ?? 3400) : (tm.suspenseMs ?? 1400);
    const stageMs = suspense + (tm.revealMs ?? 2400) + 400;
    if (key && key !== lastTurnKey) {
      playSfx("turn", ev.execNow ? 4600 : ev.holdPolicySfx ? stageMs : cued ? 1500 : 0);
    }
    lastTurnKey = key;
    $("action").classList.toggle("your-turn", myTurn);
  }

  // cerimônias na frente da tela: execução, Ditador eleito, política decisiva e política em suspense
  function ceremony(s, players, execNow, endNow, tensionPolicy, tensionLevel) {
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
          await stagePolicyWin({ team: w.team, wins: true, level: tensionLevel || 1 });
        } else if (tensionPolicy) {
          await stagePolicyWin({ team: tensionPolicy, wins: false, level: tensionLevel || 1 });
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

    const voteChanged = changed("vote", s.lastVote);
    const enactedChanged = changed("enacted", s.lastEnacted);
    const powerChanged = changed("power", s.lastPower);
    const execNow = powerChanged && s.lastPower?.type === "execute" ? s.lastPower : null;

    // política que acabou de entrar na trilha (promulgada ou pelo povo)
    let policyNow = null;
    if (enactedChanged && s.lastEnacted && !s.lastEnacted.veto) policyNow = s.lastEnacted.policy;
    else if (voteChanged && s.lastVote?.chaos) policyNow = s.lastVote.chaos;

    // nível de suspense, medido ANTES da política entrar:
    // 0 = ninguém perto, 1 = falta uma pra algum time, 2 = falta uma pra os dois
    const left = RULES.suspenseWhenRemaining ?? 1;
    const before = {
      a: s.tracks.a - (policyNow === "a" ? 1 : 0),
      b: s.tracks.b - (policyNow === "b" ? 1 : 0),
    };
    const nearA = before.a >= RULES.winPolicies.a - left;
    const nearB = before.b >= RULES.winPolicies.b - left;
    const tensionLevel = nearA && nearB ? 2 : nearA || nearB ? 1 : 0;
    const tensionPolicy = policyNow && !s.winner && tensionLevel > 0 ? policyNow : null;
    const holdPolicySfx = !!policyNow && (s.winner?.reason === "policies" || !!tensionPolicy);

    // voltou pra uma partida que já tinha acabado: sem cerimônia, direto pro resultado
    if (firstRead && hooks.resumed && s.winner && ui.end === null) {
      ui.end = "done";
      playVictory(s.winner.team);
      setBackground({ win: s.winner.team });
      later(openEnd, 500);
    }
    firstRead = false;

    const endNow = !!s.winner && ui.end === null;
    if (endNow) ui.end = "holding";

    cues(s, { voteChanged, enactedChanged, powerChanged, execNow, holdPolicySfx, tensionLevel });
    if (execNow || endNow || tensionPolicy) {
      ceremony(s, room.players, execNow, endNow, tensionPolicy, tensionLevel);
    }
    renderTracks(s);
    renderTracker(s);
    renderHostBanner(s, user.uid);
    draw();
    renderLastVote(s, room.players);
  }));
}

function renderSelf(info) {
  $("self-badge").dataset.team = info.party;
  $("self-role").textContent = themeGet(`teams.${info.role}.name`);
  $("self-party").textContent = t("role.party", { party: themeGet(`teams.${info.party}.name`) });
}

function makeSlot(num, filled, label, fresh = false, team = null) {
  const el = document.createElement("div");
  el.className = "slot" + (filled ? " filled" : "") + (fresh ? " stamp" : "");
  const n = document.createElement("span");
  n.className = "slot-num";
  n.textContent = num;
  const l = document.createElement("span");
  l.className = "slot-label";
  l.textContent = label;
  el.append(n, l);
  if (filled && team) { // política promulgada: vira carta no roadmap
    el.classList.add("has-card");
    el.append(policyFace(team));
  }
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
      !!prevTracks && i < s.tracks.a && i >= prevTracks.a, "a"));
  }

  const b = $("track-b");
  b.innerHTML = "";
  for (let i = 0; i < RULES.winPolicies.b; i++) {
    const isWin = i === RULES.winPolicies.b - 1;
    const powerId = powers[i];
    const label = isWin ? t("board.win") : powerId ? themeGet(`powers.${powerId}.name`) : "—";
    b.append(makeSlot(i + 1, i < s.tracks.b, label,
      !!prevTracks && i < s.tracks.b && i >= prevTracks.b, "b"));
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



// posição de cada jogador na fila de presidência (1 = o próximo)
function turnOrder(s) {
  const n = s.order.length;
  const start = s.specialReturn != null ? s.specialReturn : s.presidentIdx;
  const out = {};
  let k = 0;
  for (let step = 1; step <= n; step++) {
    const idx = (start + step) % n;
    const uid = s.order[idx];
    if (s.dead[uid]) continue;
    if (s.specialReturn == null && idx === s.presidentIdx) continue; // o presidente atual
    out[uid] = ++k;
  }
  return out;
}

// mostra o partido do jogador: logo dentro da bolinha (e uma estrela se for o Ditador)
function renderSeats(user, info, s, players, intel, ui) {
  const { order, presidentIdx } = s;
  const n = order.length;
  const me = order.indexOf(user.uid);
  const known = Object.fromEntries((info.known || []).map((k) => [k.uid, k.role]));
  const investigated = Object.fromEntries(intel.map((r) => [r.target, r.party]));
  const inGov = s.phase.startsWith("leg_") || s.phase === "power";
  const nextOrder = s.winner ? {} : turnOrder(s);
  const box = $("seats");
  if (!box) return;
  box.innerHTML = "";
  box.classList.add("ring");
  box.style.setProperty("--tok",
    n <= 6 ? "clamp(50px, 13vw, 70px)" : n <= 8 ? "clamp(44px, 11.5vw, 62px)" : "clamp(38px, 9.6vw, 56px)");

  const lv = s.phase !== "vote" ? s.lastVote : null; // votos revelados da última votação

  order.forEach((uid, i) => {
    const dead = !!s.dead[uid];
    const finalRole = ui.end === "done" ? s.finalRoles?.[uid] : null; // papéis só no fim
    const tk = buildToken({
      name: players[uid]?.name ?? "?",
      you: uid === user.uid,
      role: finalRole || known[uid] || investigated[uid] || (uid === user.uid ? info.role : null),
      dead,
      covered: dead && !finalRole,
      president: i === presidentIdx && !dead,
      candidate: uid === s.candidate && s.phase === "vote",
      chancellor: uid === s.candidate && inGov,
      voted: s.phase === "vote" && !!s.voted[uid],
      vote: lv?.votes && uid in lv.votes ? !!lv.votes[uid] : null,
      order: nextOrder[uid] || 0,
    });
    const k = (i - me + n) % n; // você fica embaixo; os outros seguem no sentido horário
    tk.style.setProperty("--a", `${90 + (k * 360) / n}deg`);
    box.append(tk);
  });

  // centro da mesa: sentido da ordem e o próximo presidente
  if (!s.winner) {
    const nextUid = Object.keys(nextOrder).find((u) => nextOrder[u] === 1);
    const center = document.createElement("div");
    center.className = "ring-center";
    const arrow = document.createElement("span");
    arrow.className = "rc-arrow";
    arrow.textContent = "↻";
    const title = document.createElement("span");
    title.className = "rc-title";
    title.textContent = t("board.order_title");
    center.append(arrow, title);
    if (nextUid) {
      const nx = document.createElement("span");
      nx.className = "rc-next";
      nx.textContent = t("board.next_president", { name: players[nextUid]?.name ?? "?" });
      center.append(nx);
    }
    box.append(center);
  }
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
        policyCardButton(card, () => {
          box.querySelectorAll("button").forEach((x) => (x.disabled = true));
          sendAction(code, user.uid, type, { index }).catch(console.error);
        }, type === "enact" ? "stamp" : "discard"));

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
        (mine.peek || []).forEach((card) => chips.append(policyFace(card)));
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
  const values = Object.values(lv.votes || {});
  const yes = values.filter(Boolean).length;

  const title = document.createElement("p");
  title.className = "label";
  title.textContent = t(lv.passed ? "vote.passed" : "vote.failed", {
    president: name(lv.president), chancellor: name(lv.chancellor),
  });
  box.append(title);

  const tally = document.createElement("p");
  tally.className = "hint";
  tally.textContent = t("vote.tally", { yes, no: values.length - yes });
  box.append(tally);

  if (lv.chaos) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = t("vote.chaos", { team: themeGet(`teams.${lv.chaos}.name`) });
    box.append(p);
  }
}

// aviso para os outros jogadores quando o anfitrião está fora
function renderHostBanner(s, myUid) {
  let el = document.getElementById("host-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "host-banner";
    el.className = "host-banner";
    el.textContent = t("board.host_offline");
    document.body.append(el);
  }
  el.hidden = !(s.hostOnline === false && !s.winner && s.hostUid !== myUid);
}