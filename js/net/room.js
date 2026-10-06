import { ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./auth.js";
import { RULES } from "../config/game-config.js";

// sem 0/O, 1/I/L pra não confundir na hora de digitar
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(len = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

async function addPlayer(code, user, nickname) {
  const playerRef = ref(db, `rooms/${code}/players/${user.uid}`);
  await set(playerRef, { name: nickname, joinedAt: serverTimestamp() });
  // se fechar a aba no lobby, sai da lista (a gente cancela isso quando a partida começar)
  onDisconnect(playerRef).remove();
}

export async function createRoom(user, nickname, themeId) {
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const exists = (await get(ref(db, `rooms/${code}/public`))).exists();
    if (exists) continue;
    await set(ref(db, `rooms/${code}/public`), {
      hostUid: user.uid,
      phase: "lobby",
      themeId,
      createdAt: serverTimestamp(),
    });
    await addPlayer(code, user, nickname);
    return code;
  }
  throw new Error("errors.try_again");
}

export async function joinRoom(user, code, nickname) {
  const pub = (await get(ref(db, `rooms/${code}/public`))).val();
  if (!pub || pub.phase === "closed") throw new Error("errors.room_not_found");
  if (pub.phase !== "lobby") throw new Error("errors.room_started");

  const players = (await get(ref(db, `rooms/${code}/players`))).val() || {};
  if (!players[user.uid] && Object.keys(players).length >= RULES.players.max) {
    throw new Error("errors.room_full");
  }
  await addPlayer(code, user, nickname);
}

export async function leaveRoom(user, code, isHost) {
  await remove(ref(db, `rooms/${code}/players/${user.uid}`)).catch(() => {});
  if (isHost) {
    await update(ref(db, `rooms/${code}/public`), { phase: "closed" }).catch(() => {});
  }
}

// escuta public e players separadamente (private não pode ser lido de cima)
export function watchRoom(code, onChange) {
  let pub, players;
  const emit = () => {
    if (pub !== undefined && players !== undefined) {
      onChange({ public: pub, players: players || {} });
    }
  };
  const offPub = onValue(ref(db, `rooms/${code}/public`), (s) => { pub = s.val(); emit(); });
  const offPlayers = onValue(ref(db, `rooms/${code}/players`), (s) => { players = s.val(); emit(); });
  return () => { offPub(); offPlayers(); };
}