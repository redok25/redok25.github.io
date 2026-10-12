// ===================================
// COPY.JS - New game copy in one place (R2, D509): casual Indonesian, short enough for a
// 375 px phone. Numbers are {tokens} filled from Quick View markup (JOR.fillTokens +
// JOR.contentTokens, D498), never typed in. "**x**" marks bold; it is rendered as a
// <strong> node, never through innerHTML. Game graph only; no DOM, so node tests import it.
// Phase 2b keys: stations, billboard, strip, credits, console.
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
  // "Tujuan:" tooltip names of the four stations (W4, D511: no English). Key = station id.
  stations: {
    about: "Tiang Tentang Aku",
    skills: "Papan Skill",
    projects: "Warung Proyek",
    contact: "Kotak Surat",
  },
  // Year billboards (W1). {count} = that year's projects in the Quick View list.
  billboard: { count: "{count} proyek" },
  // Journey strip (W5) node titles; {label} and {title} come from the chapters above.
  strip: {
    prolog: "Prolog · udah lewat, nggak bisa putar balik",
    node: "Lompat ke {label} · {title}",
  },
  // Credits card (R9) at the end of the road.
  credits: {
    title: "Sampai juga di ujung jalan",
    lines: ["Makasih udah nemenin sampai sini.", "Proyek berikutnya? Siapa tahu punyamu."],
    stats: "{projectCount} proyek · {firstYear} → {lastYear}",
    contacts: { email: "Email", whatsapp: "WhatsApp", linkedin: "LinkedIn", github: "GitHub" },
    replay: "Ulangi perjalanan",
    quickView: "Quick View",
    close: "Tutup",
  },
  // Console API (T2): window.redok, for devs, so code words are fine here.
  console: {
    banner: "🏍️ Psst, dev! Motor ini bisa disetir dari console. Ketik redok.help()",
    help: [
      "redok.goto(n)      lompat ke Bab n (1-4)",
      "redok.time(mode)   pagi | siang | sore | malam | auto",
      "redok.weather(on)  hujan nyala (true) atau reda (false)",
    ],
    gotoBad: "Bab-nya 1 sampai 4 aja ya.",
    gotoBusy: "Lagi sibuk (minigame, modal, atau lagi jalan). Coba lagi bentar.",
    gotoOk: "Meluncur ke {label} · {title}...",
    timeBad: "Pilihannya: pagi, siang, sore, malam, auto.",
    timeOk: "Waktu: {mode}.",
    weatherOk: "Hujan: {state}.",
  },
};
