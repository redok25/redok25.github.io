// ===================================
// REDOK.JS - Console API (T2, R30): window.redok for curious devs. A thin layer over the
// calls the UI already uses (fast travel, time of day, weather), with friendly answers.
// ===================================
import { JOR } from "./helpers.js";
import { COPY } from "./copy.js";
import { CHAPTERS } from "./journey.js";

// Console words -> effects.setTimeOfDay modes (null = follow the clock).
const TIMES = {
  pagi: "morning",
  siang: "noon",
  sore: "afternoon",
  malam: "night",
  auto: null,
  morning: "morning",
  noon: "noon",
  afternoon: "afternoon",
  night: "night",
};

// Console words -> weather kinds (V8, R9). true/false are the old rain on/off.
const WEATHERS = {
  hujan: "rain",
  salju: "snow",
  kabut: "fog",
  cerah: "clear",
  rain: "rain",
  snow: "snow",
  fog: "fog",
  clear: "clear",
};

export function createRedok(game) {
  return Object.freeze({
    help() {
      console.log(COPY.console.help.join("\n"));
    },
    goto(n) {
      const id = Number(n);
      if (!Number.isInteger(id) || id < 1 || id >= CHAPTERS.length) return COPY.console.gotoBad;
      if (!game.travelTo(id)) return COPY.console.gotoBusy;
      return JOR.fillTokens(COPY.console.gotoOk, CHAPTERS[id]);
    },
    time(mode = "auto") {
      const key = String(mode).toLowerCase();
      if (!Object.hasOwn(TIMES, key)) return COPY.console.timeBad;
      game.effects.setTimeOfDay(TIMES[key]);
      return JOR.fillTokens(COPY.console.timeOk, { mode: key });
    },
    // A cheat-level override (R10): beats real weather until the reset cheat; never an achievement.
    weather(kind = "hujan") {
      const key = kind === true ? "hujan" : kind === false ? "cerah" : String(kind).toLowerCase();
      if (!Object.hasOwn(WEATHERS, key)) return COPY.console.weatherBad;
      game.effects.cheatWeather = WEATHERS[key];
      return JOR.fillTokens(COPY.console.weatherOk, { kind: key });
    },
    // Kartu Pos (T3, R16): the view as it is, clean and framed, straight to a download.
    photo() {
      return game.photo.shoot() ? COPY.console.photoOk : COPY.console.gotoBusy;
    },
  });
}
