// ===================================
// COPY.JS - New game copy in one place (R2, D509): casual Indonesian, short enough for a
// 375 px phone. Numbers are {tokens} filled from Quick View markup (JOR.fillTokens +
// JOR.contentTokens, D498), never typed in. "**x**" marks bold; it is rendered as a
// <strong> node, never through innerHTML. Game graph only; no DOM, so node tests import it.
// Phase 2b keys: stations, billboard, strip, credits, console. Phase 3a: minigame.
// Phase 3b: kopi, achievements, journal, npc.
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
  // Minigame result card (P6). {time} = seconds with a decimal comma ("5,33"), filled by the
  // game. RLGL times only the steps outside red lights: their length is luck, not skill.
  minigame: {
    time: {
      wheelie_challenge: "Waktu dari awal: {time} detik",
      red_light_green_light: "Waktu tanpa lampu merah: {time} detik",
      drag_race: "Waktu: {time} detik",
    },
    best: "Rekor: {time} detik",
    newBest: "REKOR BARU!",
  },
  // Kopi Rahasia (P3). Toasts are plain text (no **bold**): {found} and {total} are counted
  // from js/kopi.js. hints: one line per cup for the journal (P1), keyed by KOPI id.
  kopi: {
    found: "☕ Kopi rahasia ketemu! {found}/{total}",
    emas: "✨ Semua kopi ketemu! Motormu sekarang Motor Emas.",
    hints: {
      pagar: "Malam-malam, ada kopi nangkring di pagar Asal-Usul.",
      wheelie: "Ada kopi melayang di Bengkel Skill. Angkat roda depan!",
      warung: "Pas hujan, ada kopi neduh di emperan warung.",
      ujung: "Jalan belum habis waktu kartu terakhir muncul.",
    },
  },
  // Achievements (P5). Key = save id (save.js ACHIEVEMENT_IDS, same order: the journal's).
  // name: the toast and the journal; desc: the journal's hint. Plain text (toasts use
  // textContent, so no **bold**); {name} in the toast is the only token.
  achievements: {
    toast: "🏆 Pencapaian: {name}",
    list: {
      berangkat: { name: "Berangkat", desc: "Beres prolog, motor mulai jalan." },
      tur: { name: "Tur Lengkap", desc: "Kumpulin stempel di semua stasiun." },
      kurator: { name: "Kurator", desc: "Lihat semua proyek di Quick View." },
      kopi: { name: "Pemburu Kopi", desc: "Temukan semua kopi rahasia." },
      cuaca: { name: "Peretas Cuaca", desc: "Ubah langit pakai kode rahasia." },
      wheelie: { name: "Raja Wheelie", desc: "Menang tantangan wheelie." },
      lampu: { name: "Lampu Hijau", desc: "Lolos lampu merah sampai finish." },
      drag: { name: "Raja Drag", desc: "Kalahkan rival di balap drag." },
      rekor: { name: "Kalahkan Diri Sendiri", desc: "Pecahkan rekor minigame-mu sendiri." },
      tamat: { name: "Tamat", desc: "Sampai di ujung jalan." },
      insinyur: { name: "Insinyur", desc: "Intip dapur mesin di Mode Bengkel." },
    },
  },
  // Jurnal Perjalanan (P1). {got}/{total} are counts from the save over the list each comes
  // from (stations, Quick View cards, kopi, secrets, achievements). {words} = the secret words
  // found so far: typed input, not UI copy. Course names key on the minigame ids (BEST_IDS).
  journal: {
    button: "Jurnal Perjalanan (J)",
    title: "📔 Jurnal Perjalanan",
    close: "Tutup jurnal",
    count: "{got}/{total}",
    stamps: "Stempel stasiun",
    seen: "Proyek dilihat",
    seenHint: "Dihitung jujur: cuma kartu proyek yang beneran kebaca di Quick View.",
    seenOpen: "Buka daftar proyek",
    kopi: "Kopi rahasia",
    kopiFound: "Sudah ketemu!",
    secrets: "Kata rahasia",
    secretsHint: "Ada kata ajaib yang bisa diketik. NPC kadang keceplosan.",
    secretsFound: "Ketemu: {words}",
    bests: "Rekor minigame",
    noBest: "Belum ada rekor",
    courses: {
      wheelie_challenge: "Tantangan Wheelie",
      red_light_green_light: "Lampu Merah Lampu Hijau",
      drag_race: "Balap Drag",
    },
    achievements: "Pencapaian",
  },
  // Regular NPCs (W7, D537). The first NPC met each load says one memory line: a first
  // visit, a new day ({visitCount} = days visited, from the save, never typed), or a reload
  // on the same day. Rain lines greet the bike while it rains.
  npc: {
    first: "Wah, muka baru! Selamat jalan-jalan ya.",
    returning: "Kunjungan ke-{visitCount}! Makin betah nih?",
    sameDay: "Lho, balik lagi? Tadi kan udah mampir.",
    rain: [
      "Hujan nih, rem pelan-pelan ya.",
      "Duh, lupa bawa payung lagi.",
      "Hujan gini enaknya ngopi di warung.",
    ],
  },
};
