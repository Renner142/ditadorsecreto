import { t } from "../i18n/i18n.js";
import { RULES } from "../config/game-config.js";
import { createRoom, joinRoom, leaveRoom, watchRoom, releaseDisconnect } from "../net/room.js";
import { startGame } from "../net/game.js";
import { showRole } from "./role.js";
import { show } from "./router.js";
import { showBoard } from "./board.js";
import { startHost } from "../net/host.js";
import { playLobby, stopAudio } from "../audio/audio.js";

const $ = (id) => document.getElementById(id);

let stopWatching = null;
let currentCode = null;
let isHost = false;
let latestRoom = null;
let gameShown = false;

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

function enterLobby(user, code) {
  currentCode = code;
  gameShown = false;
  $("lobby-code").textContent = code;
  show("lobby");
  stopWatching = watchRoom(code, (room) => render(user, room));
}

function exitLobby() {
  if (stopWatching) stopWatching();
  stopWatching = null;
  currentCode = null;
  isHost = false;
  show("home");
}

function render(user, room) {
  latestRoom = room;

  if (!room.public || room.public.phase === "closed") {
    exitLobby();
    $("home-error").textContent = t("errors.room_closed");
    return;
  }

  // a partida começou: sai do lobby e mostra o papel
  if (room.public.phase !== "lobby") {
    if (!gameShown) {
      gameShown = true;
      releaseDisconnect(currentCode, user);
      if (room.public.hostUid === user.uid) startHost(currentCode);
      showRole(user, currentCode, room.players, (info) => showBoard(user, currentCode, info));
    }
    return;
  }

  isHost = room.public.hostUid === user.uid;

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
      const code = await createRoom(user, getNickname(), themeId);
      enterLobby(user, code);
    } catch (err) { showError(err); }
  });

  $("btn-join").addEventListener("click", async () => {
    $("home-error").textContent = "";
    try {
      const nick = getNickname();
      const code = $("room-code").value.trim().toUpperCase();
      if (!code) throw new Error("errors.code_required");
      await joinRoom(user, code, nick);
      enterLobby(user, code);
    } catch (err) { showError(err); }
  });

  $("btn-leave").addEventListener("click", async () => {
    const code = currentCode;
    const host = isHost;
    exitLobby();
    await leaveRoom(user, code, host);
  });

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