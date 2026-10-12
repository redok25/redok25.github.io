// ===================================
// COPY.JS - New game copy in one place (R2, D509): casual Indonesian, short enough for a
// 375 px phone. Numbers are {tokens} filled from Quick View markup (JOR.fillTokens +
// JOR.contentTokens, D498), never typed in. "**x**" marks bold; it is rendered as a
// <strong> node, never through innerHTML. Game graph only; no DOM, so node tests import it.
// Phase 2b appends its own keys (billboards, gauges, strip, credits, console, toasts).
// ===================================
export const COPY = {
  // Chapter title cards (V5): "label · title" over the subtitle. Index = chapter id.
  chapters: [
    { label: "Prolog", title: "Berangkat", subtitle: "" },
    { label: "Bab 1", title: "Asal-Usul", subtitle: "Awalnya cuma satu baris kode" },
    { label: "Bab 2", title: "Bengkel Skill", subtitle: "Servis berkala biar kode nggak mogok" },
    { label: "Bab 3", title: "Kota Proyek", subtitle: "{projectCount} proyek · {firstYear} → {lastYear}" },
    { label: "Bab 4", title: "Cakrawala", subtitle: "Ujung jalan, awal ngobrol" },
  ],
  // Opening ride subtitle beats (V6): the three #opening-story sentences, verbatim.
  prologue: [
    "Selamat datang di **Journey of Redok** sebuah portofolio interaktif bergaya pixel art 2D.",
    "Saya seorang PHP & Laravel developer yang menggabungkan kecintaan pada coding dan petualangan, silakan jelajahi proyek, kemampuan, dan kisah perjalanan saya.",
    "Terima kasih sudah mampir!",
  ],
};
