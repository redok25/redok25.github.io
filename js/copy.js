// ===================================
// COPY.JS - New game copy in one place (R2, D509): casual Indonesian, short enough for a
// 375 px phone. Numbers are {tokens} filled from Quick View markup (JOR.fillTokens +
// JOR.contentTokens, D498), never typed in. "**x**" marks bold; it is rendered as a
// <strong> node, never through innerHTML. Game graph only; no DOM, so node tests import it.
// Phase 2b keys: stations, billboard, strip, credits, console. Phase 3a: minigame.
// Phase 3b: kopi, achievements, journal, npc. Phase 5: bengkel, photo, ghost.
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
  // Epilog ride subtitle (R-E5, T300): two beats in #epilog-story while the bike rides on into
  // the night past the end of the road; the second one lands as it rolls to a stop.
  epilog: {
    beats: ["Malam turun, lampu kota **makin jauh**.", "Mesin pelan, tinggal nunggu pagi."],
  },
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
    bengkel: "🔧 Penasaran dapur mesinnya? Buka Mode Bengkel", // R8: a link to ?bengkel (phones too)
    photo: "Simpan Kartu Pos", // T3, R17: the scene behind the card as a postcard
  },
  // Console API (T2): window.redok, for devs, so code words are fine here.
  console: {
    banner: "🏍️ Psst, dev! Motor ini bisa disetir dari console. Ketik redok.help()",
    help: [
      "redok.goto(n)      lompat ke Bab n (1-4)",
      "redok.time(mode)   pagi | siang | sore | malam | auto",
      "redok.weather(k)   hujan | salju | kabut | cerah",
      "redok.photo()      simpan kartu pos dari layar sekarang",
      "redok.ghost.export()  link tantangan dari ghost rekormu",
    ],
    ghostNone: "Belum ada ghost. Menangin Drag atau Lampu Merah dulu ya.",
    gotoBad: "Bab-nya 1 sampai 4 aja ya.",
    gotoBusy: "Lagi sibuk (minigame, modal, atau lagi jalan). Coba lagi bentar.",
    gotoOk: "Meluncur ke {label} · {title}...",
    timeBad: "Pilihannya: pagi, siang, sore, malam, auto.",
    timeOk: "Waktu: {mode}.",
    weatherBad: "Pilihannya: hujan, salju, kabut, cerah.",
    weatherOk: "Cuaca: {kind}.",
    photoOk: "Cekrek! Kartu pos lagi diunduh.",
  },
  // Kartu Pos (T3): the 📷 button, photo mode's toolbar and the postcard frame. The toolbar
  // shows the time and weather in use; a click moves to the next. The frame's chapter line
  // takes {label} and {title} from the chapters above; its date comes from Intl (D498).
  photo: {
    button: "Kartu Pos (P)",
    title: "Kartu Pos",
    time: { morning: "Waktu: Pagi", noon: "Waktu: Siang", afternoon: "Waktu: Sore", night: "Waktu: Malam" },
    weather: { clear: "Cuaca: Cerah", rain: "Cuaca: Hujan", snow: "Cuaca: Salju", fog: "Cuaca: Kabut" },
    left: "Geser kiri",
    right: "Geser kanan",
    save: "Simpan",
    close: "Tutup",
    chapter: "{label} · {title}",
    site: "redok.me",
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
  // Ghost + challenge link (T4). {course} = a course name from journal.courses. The ghost is a
  // blue "bayangan" on the road (D511: no English UI); tags are drawn on the canvas over it.
  ghost: {
    invalid: "Link tantangan tidak valid",
    title: "Tantangan: {course}",
    desc: "Temanmu nantang kamu! Salip bayangan birunya sampai finish.",
    share: "Tantang teman",
    copied: "Link tantangan tersalin!",
    link: "Link tantangan, salin manual",
    tagFriend: "👻 TEMAN",
    tagBest: "👻 REKORMU",
    vs: {
      beat: "Tantangan temanmu kamu kalahkan!",
      tie: "Seri! Sama cepat sama temanmu.",
      notYet: "Belum, temanmu masih lebih cepat.",
    },
  },
  // Kopi Rahasia (P3). Toasts are plain text (no **bold**): {found} and {total} are counted
  // from js/kopi.js. hints: one line per cup for the journal (P1), keyed by KOPI id.
  kopi: {
    found: "☕ Kopi rahasia ketemu! {found}/{total}",
    emas: "✨ Semua kopi ketemu! Motormu sekarang Motor Emas.",
    // R10: once, for a visitor who had every cup before a new one was added.
    newCup: "☕ Ada kopi rahasia baru. Motor Emas balik kalau ketemu!",
    hints: {
      pagar: "Malam-malam, ada kopi nangkring di pagar Asal-Usul.",
      wheelie: "Ada kopi melayang di Bengkel Skill. Angkat roda depan!",
      warung: "Pas hujan, ada kopi neduh di emperan warung.",
      ujung: "Jalan belum habis waktu kartu terakhir muncul.",
      bengkel: "Ada kopi yang cuma kelihatan di kotak tabrak Mode Bengkel.",
    },
  },
  // Mode Bengkel v2 (T1, R1-R6). A dev view a visitor can open, so Indonesian (D511); units
  // (fps, ms, p95, px, km/j, x) are not words. Labels: the DOM aside (textContent). rows: the
  // canvas panel's new lines, filled while the panel is open; lightOff stands in for an empty
  // light buffer; weather names the kinds as redok.weather does; legend: the hitbox colours.
  bengkel: {
    title: "Mode Bengkel",
    layers: "Sembunyikan layer",
    hitbox: "Kotak tabrak",
    light: "Peta cahaya",
    slow: "Gerak lambat",
    compact: "Ringkas", // the panel's first row only (on by default on phones)
    source: "Lihat source",
    close: "Tutup",
    save: "Data save (JSON)",
    lightOff: "Peta cahaya kosong: belum malam / mode hemat",
    rows: {
      split: "p95 sim {sim} · gambar {draw} ms · laju {scale}x",
      count: "salju {snow} · npc {npc} · minigame {special}",
      place: "{chapter} · x {x} · kamera {cam} · v {v}",
      weather: "cuaca {kind} · kode {code} · angin {wind}",
      wind: "{kmh} km/j {from}°",
    },
    weather: { rain: "hujan", snow: "salju", fog: "kabut", clear: "cerah" },
    legend: ["kotak", "jarak E", "noleh", "kaget", "skill", "kopi"],
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
