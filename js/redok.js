// ===================================
// REDOK.JS - Console API (T2, R30): window.redok for curious devs. A thin layer over the
// calls the UI already uses (fast travel, time of day, rain), with friendly answers.
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
    weather(on = true) {
      game.effects.toggleRain(!!on);
      return JOR.fillTokens(COPY.console.weatherOk, { state: on ? "nyala" : "reda" });
    },
  });
}
