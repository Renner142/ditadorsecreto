const NICK = "nick.v1";

export function inviteUrl(code) {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("sala", code);
  return u.toString();
}

export function readInvite() {
  try {
    const raw = new URLSearchParams(location.search).get("sala");
    const code = (raw || "").trim().toUpperCase();
    return /^[A-Z0-9]{3,8}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

// tira o ?sala= da barra de endereço (recarregar a página não repete o convite)
export function clearInviteFromUrl() {
  try { history.replaceState(null, "", location.pathname + location.hash); } catch {}
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try { // reserva para navegadores sem a API de área de transferência
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function rememberNick(nick) {
  try { localStorage.setItem(NICK, nick); } catch {}
}

export function recallNick() {
  try { return localStorage.getItem(NICK) || ""; } catch { return ""; }
}