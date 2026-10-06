import { ref, push, set } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { db } from "./auth.js";

export function sendAction(code, uid, type, payload = {}) {
  return set(push(ref(db, `rooms/${code}/inbox`)), { uid, type, ...payload });
}