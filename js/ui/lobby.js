import { t } from "../i18n/i18n.js";
import { RULES } from "../config/game-config.js";
import { createRoom, joinRoom, leaveRoom, watchRoom, releaseDisconnect, addPlayer } from "../net/room.js";
import { startGame } from "../net/game.js";
import { startHost, stopHost } from "../net/host.js";
import { playLobby, stopAudio } from "../audio/audio.js";
import { showRole, resetRole } from "./role.js";
import { showBoard, stopBoard } from "./board.js";
import { setBackground } from "./background.js";
import { show } from "./router.js";

const $ = (id) => document.getElementById(id);

let stopWatching = null;
let currentCode = null;
let isHost = false;
let latestRoom = null;
let gameShown = false;
let myNickname = "";

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

function enterLobby(user, code, nickname) {
  currentCode = code;
  myNickname = nickname;
  gameShown = false;
  $("lobby-code").textContent = code;
  show("lobby");
  playLobby();
  stopWatching = watchRoom(code, (room) => render(user, room));
}

// desliga tudo o que pertence a uma partida
function clearGame() {
  stopBoard();
  stopHost();
  resetRole();
  gameShown = false;
}

function exitLobby() {
  if (stopWatching) stopWatching();
  stopWatching = null;
  clearGame();
  currentCode = null;
  isHost = false;
  setBackground();
  playLobby();
  show("home");
}

// a partida acabou e o anfitrião levou todo mundo de volta para a sala
function backToLobby(user) {
  clearGame();
  setBackground();
  playLobby();
  show("lobby");
  addPlayer(currentCode, user, myNickname).catch(console.error); // entra de novo na lista
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
      showRole(user, currentCode, room.players, (info) =>
        showBoard(user, currentCode, info, { onLeave: () => leave(user) }));
    }
    return;
  }

  if (gameShown) backToLobby(user);

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

export function initLobby(user, themeId) {
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