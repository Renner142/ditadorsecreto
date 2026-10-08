import { t } from "../i18n/i18n.js";
import { RULES } from "../config/game-config.js";
import { createRoom, joinRoom, leaveRoom, watchRoom, releaseDisconnect, addPlayer, readPublic, readPlayer } from "../net/room.js";
import { startGame, readPrivate } from "../net/game.js";
import { startHost, stopHost } from "../net/host.js";
import { saveSession, loadSession, clearSession } from "../net/session.js";
import { playLobby, playAmbient, stopAudio } from "../audio/audio.js";
import { showRole, resetRole } from "./role.js";
import { showBoard, stopBoard } from "./board.js";
import { setBackground } from "./background.js";
import { confirmDialog } from "./modal.js";
import { show } from "./router.js";

const $ = (id) => document.getElementById(id);

let me = null;
let stopWatching = null;
let currentCode = null;
let isHost = false;
let latestRoom = null;
let gameShown = false;
let myNickname = "";
let healing = false;

function showError(err) {
  const known = typeof err?.message === "string" && err.message.startsWith("errors.");
  if (!known) console.error(err);
  $("home-error").textContent = t(known ? err.message : "common.error");
}

function getNickname() {
  const nick = $("nickname").value.trim();
  if (!nick) throw new Error("errors.nickname_required");
  return nick;
}

// botão "Sair da partida" dentro das opções (criado aqui, então não precisa mexer no HTML)
function setLeaveButton(visible) {
  let b = document.getElementById("opt-leave");
  if (!b && visible) {
    const card = document.querySelector("#options .modal-card");
    if (!card) return;
    b = document.createElement("button");
    b.id = "opt-leave";
    b.type = "button";
    b.className = "btn btn-no";
    b.textContent = t("options.leave_game");
    b.addEventListener("click", async () => {
      $("options").hidden = true; // a confirmação não pode ficar atrás das opções
      const ok = await confirmDialog({
        title: t("options.leave_game"),
        message: t(isHost ? "options.leave_confirm_host" : "options.leave_confirm"),
        confirm: t("options.leave_yes"),
        danger: true,
      });
      if (ok) leave(me);
    });
    card.insertBefore(b, document.getElementById("opt-close"));
  }
  if (b) b.hidden = !visible;
}

// começa a acompanhar a sala; inGame = já entra direto na partida (sem contagem do papel)
function startWatching(user, code, nickname, inGame = false) {
  currentCode = code;
  myNickname = nickname;
  gameShown = inGame;
  latestRoom = null;
  saveSession({ code, nickname });
  $("lobby-code").textContent = code;
  stopWatching = watchRoom(code, (room) => render(user, room));
}

function enterLobby(user, code, nickname) {
  show("lobby");
  playLobby();
  startWatching(user, code, nickname);
}

// voltou no meio de uma partida: vai direto pra mesa
function enterGame(user, code, nickname, info, hostUid) {
  isHost = hostUid === user.uid;
  startWatching(user, code, nickname, true);
  stopAudio();
  if (isHost) startHost(code);
  setBackground({ party: info.party });
  playAmbient(info.party);
  setLeaveButton(true);
  showBoard(user, code, info, { onLeave: () => leave(user), resumed: true });
}

// desliga tudo o que pertence a uma partida
function clearGame() {
  stopBoard();
  stopHost();
  resetRole();
  setLeaveButton(false);
  gameShown = false;
}

function exitLobby() {
  if (stopWatching) stopWatching();
  stopWatching = null;
  clearGame();
  clearSession();
  currentCode = null;
  isHost = false;
  latestRoom = null;
  setBackground();
  playLobby();
  show("home");
}

// a partida acabou e o anfitrião levou todo mundo de volta para a sala
function backToLobby() {
  clearGame();
  setBackground();
  playLobby();
  show("lobby");
}

async function leave(user) {
  const code = currentCode;
  const host = isHost;
  exitLobby();
  await leaveRoom(user, code, host);
}

function render(user, room) {
  latestRoom = room;

  if (!room.public || room.public.phase === "closed") {
    exitLobby();
    $("home-error").textContent = t("errors.room_closed");
    return;
  }

  isHost = room.public.hostUid === user.uid;

  // a partida começou: sai do lobby e mostra o papel
  if (room.public.phase !== "lobby") {
    if (!gameShown) {
      gameShown = true;
      stopAudio();
      releaseDisconnect(currentCode, user);
      if (isHost) startHost(currentCode);
      showRole(user, currentCode, room.players, (info) => {
        setLeaveButton(true);
        showBoard(user, currentCode, info, { onLeave: () => leave(user) });
      });
    }
    return;
  }

  if (gameShown) backToLobby();

  // se algo te tirou da lista (queda de conexão, volta ao lobby), você reaparece sozinho
  if (!room.players[user.uid] && !healing) {
    healing = true;
    addPlayer(currentCode, user, myNickname)
      .catch(console.error)
      .finally(() => { healing = false; });
  }

  const list = $("player-list");
  list.innerHTML = "";
  Object.entries(room.players)
    .sort(([, a], [, b]) => (a.joinedAt || 0) - (b.joinedAt || 0))
    .forEach(([uid, p]) => {
      const li = document.createElement("li");
      li.textContent = p.name + (uid === room.public.hostUid ? ` (${t("lobby.host")})` : "");
      list.appendChild(li);
    });

  const count = Object.keys(room.players).length;
  const startBtn = $("btn-start");
  startBtn.hidden = !isHost;
  startBtn.disabled = count < RULES.players.min;
  $("lobby-hint").textContent = count < RULES.players.min
    ? t("lobby.need_players", { min: RULES.players.min })
    : "";
}

function showHomeWith(messageKey, nickname) {
  setBackground();
  playLobby();
  if (nickname) $("nickname").value = nickname;
  $("home-error").textContent = messageKey ? t(messageKey) : "";
  show("home");
}

// chamada ao abrir o site: devolve true se tratou a sessão (voltou ou mostrou um aviso)
export async function resumeSession(user) {
  const saved = loadSession();
  if (!saved) return false;

  try {
    const pub = await readPublic(saved.code);
    if (!pub || pub.phase === "closed") {
      clearSession();
      showHomeWith("errors.room_closed", saved.nickname);
      return true;
    }

    if (pub.phase === "lobby") {
      await joinRoom(user, saved.code, saved.nickname); // você foi removido da lista ao sair: entra de novo
      enterLobby(user, saved.code, saved.nickname);
      return true;
    }

    // partida em andamento: só volta quem já estava nela
    const [player, info] = await Promise.all([
      readPlayer(saved.code, user.uid),
      readPrivate(saved.code, user.uid),
    ]);
    if (!player || !info) {
      clearSession();
      showHomeWith("errors.not_in_game", saved.nickname);
      return true;
    }

    if (pub.phase === "role_reveal") {
      startWatching(user, saved.code, saved.nickname); // o fluxo normal mostra o papel
    } else {
      enterGame(user, saved.code, saved.nickname, info, pub.hostUid);
    }
    return true;
  } catch (err) {
    console.error(err);
    const known = typeof err?.message === "string" && err.message.startsWith("errors.");
    if (known) clearSession(); // erro de internet não apaga: recarregar tenta de novo
    showHomeWith(known ? err.message : "errors.resume_failed", saved.nickname);
    return true;
  }
}

export function initLobby(user, themeId) {
  me = user;

  $("btn-create").addEventListener("click", async () => {
    $("home-error").textContent = "";
    try {
      const nick = getNickname();
      const code = await createRoom(user, nick, themeId);
      enterLobby(user, code, nick);
    } catch (err) { showError(err); }
  });

  $("btn-join").addEventListener("click", async () => {
    $("home-error").textContent = "";
    try {
      const nick = getNickname();
      const code = $("room-code").value.trim().toUpperCase();
      if (!code) throw new Error("errors.code_required");
      await joinRoom(user, code, nick);
      enterLobby(user, code, nick);
    } catch (err) { showError(err); }
  });

  $("btn-leave").addEventListener("click", () => leave(user));

  $("btn-start").addEventListener("click", async () => {
    $("lobby-hint").textContent = "";
    try {
      await startGame(currentCode, latestRoom.players);
    } catch (err) {
      console.error(err);
      $("lobby-hint").textContent = t("common.error");
    }
  });
}