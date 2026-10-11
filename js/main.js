// ===================================
// MAIN.JS - Game entry. Import order is evaluation order and replaces the old <script> list:
// audio.js registers its load handler first, then game.js (new Game on load), then splash.js.
// Quick View is a separate entry (qv.js), so it keeps working if this graph fails.
// ===================================
import "./audio.js";
import "./game.js";
import "./mobile-controls.js";
import "./splash.js";
import "./visitor-counter.js";
