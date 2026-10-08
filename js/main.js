import { loadTheme, applyTheme } from "./theme/loader.js";
import { loadLocale, applyI18n } from "./i18n/i18n.js";
import { login } from "./net/auth.js";
import { show } from "./ui/router.js";
import { initLobby, resumeSession } from "./ui/lobby.js";
import { initMenu } from "./ui/menu.js";
import { initBackground } from "./ui/background.js";
import { initAudio, playLobby } from "./audio/audio.js";
import { initSfx } from "./audio/sfx.js";

const THEME_ID = "democratas";
const LOCALE = "pt-BR";

async function start() {
  try {
    await loadLocale(LOCALE);
    await loadTheme(THEME_ID);
    applyI18n();
    applyTheme();
    initBackground();
    initAudio();
    initSfx();
    initMenu();
    playLobby();

    const user = await login();
    initLobby(user, THEME_ID);

    // se você estava numa sala, volta pra ela; senão, tela inicial
    const resumed = await resumeSession(user);
    if (!resumed) show("title");
  } catch (err) {
    console.error(err);
    show("error");
  }
}

start();