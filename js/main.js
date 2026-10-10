import { loadTheme, applyTheme } from "./theme/loader.js";
import { loadLocale, applyI18n } from "./i18n/i18n.js";
import { login } from "./net/auth.js";
import { show } from "./ui/router.js";
import { initLobby, resumeSession, applyInvite } from "./ui/lobby.js";
import { loadSession } from "./net/session.js";
import { readInvite, clearInviteFromUrl } from "./net/invite.js";
import { initToggles } from "./ui/toggles.js";
import { initMenu } from "./ui/menu.js";
import { initBackground } from "./ui/background.js";
import { initAudio, playLobby } from "./audio/audio.js";
import { initSfx } from "./audio/sfx.js";
import { preloadTheme } from "./theme/preload.js";
import { initHowTo } from "./ui/howto.js";

const THEME_ID = "democratas";
const LOCALE = "pt-BR";

async function start() {
  try {
    await loadLocale(LOCALE);
    await loadTheme(THEME_ID);
    applyI18n();
    applyTheme();
    await preloadTheme(); // a tela "Carregando..." fica visível enquanto as imagens baixam
    initBackground();
    initAudio();
    initSfx();
    initMenu();
    initToggles();
    playLobby();

    const user = await login();
    initLobby(user, THEME_ID);

    // link de convite (?sala=CODIGO): tem prioridade sobre a sessão salva de outra sala
    const invite = readInvite();
    if (invite) clearInviteFromUrl();
    const sameRoom = !invite || loadSession()?.code === invite;
    const resumed = sameRoom ? await resumeSession(user) : false;
    if (!resumed) {
      if (invite) applyInvite(invite);
      else show("title");
    }
  } catch (err) {
    console.error(err);
    show("error");
  }
}

start();