// ข้อมูลอ้างอิงทั้งหมดของระบบ — แก้ตัวเลขในไฟล์นี้ได้เลยถ้าตลาดเปลี่ยน

// k = สัดส่วนของ "ส่วนต่างราคา PSA 10 กับใบดิบ" ที่เจ้าเกรดนี้ได้ (PSA = 1.0)
// score = คะแนนความน่าเชื่อถือ/สภาพคล่องของเจ้าเกรด (0–1)
export const GRADERS = [
  { id: "raw",   name: "ใบดิบ (Raw)",             k: 0,    score: 0.6 },
  { id: "psa",   name: "PSA",                     k: 1.0,  score: 1.0 },
  { id: "bgsbl", name: "BGS Black Label 10",      k: 1.4,  score: 1.0 },
  { id: "bgs",   name: "BGS (Beckett)",           k: 0.85, score: 0.8 },
  { id: "cgcp",  name: "CGC Pristine / Perfect 10", k: 0.95, score: 0.85 },
  { id: "cgc",   name: "CGC",                     k: 0.75, score: 0.75 },
  { id: "sgc",   name: "SGC",                     k: 0.7,  score: 0.7 },
  { id: "tag",   name: "TAG",                     k: 0.6,  score: 0.65 },
  { id: "ars",   name: "ARS (ญี่ปุ่น)",            k: 0.5,  score: 0.55 },
  { id: "sqc",   name: "SQC (ไทย)",               k: 0.3,  score: 0.45 },
  { id: "pcg",   name: "PCG",                     k: 0.2,  score: 0.3 },
  { id: "other", name: "เจ้าเล็ก/ไม่รู้จัก",       k: 0.15, score: 0.25 },
];

// ตัวคูณ "ส่วนเพิ่มจากการเกรด" ตามเกรดที่ได้ (เทียบกับเกรด 10 ของเจ้าเดียวกัน)
export const GRADES = [
  { id: "10",  name: "10",   f: 1.0 },
  { id: "9.5", name: "9.5",  f: 0.6 },
  { id: "9",   name: "9",    f: 0.25 },
  { id: "8",   name: "8",    f: 0.08 },
  { id: "7",   name: "7 หรือต่ำกว่า", f: 0 },
];

// สภาพใบดิบ (ใช้เมื่อเลือกเจ้าเกรดเป็น Raw)
export const CONDITIONS = [
  { id: "nm", name: "NM (สวยมาก)", f: 1.0 },
  { id: "lp", name: "LP (มีรอยเล็กน้อย)", f: 0.7 },
  { id: "mp", name: "MP (มีตำหนิชัด)", f: 0.45 },
  { id: "hp", name: "HP/เสียหาย", f: 0.25 },
];

export const LANGS = [
  { id: "en", name: "อังกฤษ (EN)", score: 1.0, p10: 0.35 },
  { id: "ja", name: "ญี่ปุ่น (JP)", score: 0.9, p10: 0.55 },
  { id: "th", name: "ไทย (TH)",    score: 0.6, p10: 0.4 },
  { id: "other", name: "ภาษาอื่น (KR/CN/…)", score: 0.5, p10: 0.4 },
];

export const RARITIES = [
  { id: "sar",     name: "SAR / SIR / Alt Art", score: 1.0 },
  { id: "vintage", name: "Holo วินเทจ / 1st Edition / Gold Star", score: 0.9 },
  { id: "mur",     name: "MUR / UR ทอง / Hyper Rare", score: 0.75 },
  { id: "promo",   name: "โปรโมพิเศษ / Limited", score: 0.6 },
  { id: "ar",      name: "AR / IR / CHR / TG", score: 0.55 },
  { id: "rr",      name: "RR / ex / V / GX ทั่วไป", score: 0.25 },
  { id: "common",  name: "ธรรมดา / Holo ทั่วไป", score: 0.15 },
];

export const ERAS = [
  { id: "new",     name: "ชุดเพิ่งออก (< 3 เดือน)", score: 0.3 },
  { id: "recent",  name: "3–12 เดือน", score: 0.6 },
  { id: "modern",  name: "1–5 ปี", score: 0.85 },
  { id: "older",   name: "5–15 ปี", score: 0.9 },
  { id: "vintage", name: "วินเทจ (15 ปีขึ้นไป)", score: 1.0 },
];

// ความนิยมตัวละคร: ค้นจากชื่อ EN / JP / TH (ตัวที่เจาะจงกว่าต้องมาก่อน เช่น mewtwo ก่อน mew)
export const CHAR_TIERS = [
  { tier: "S", score: 1.0, keys: ["charizard", "リザードン", "ลิซาร์ดอน", "pikachu", "ピカチュウ", "พิคาชู", "umbreon", "ブラッキー", "แบล็กกี้"] },
  { tier: "A", score: 0.8, keys: ["mewtwo", "ミュウツー", "มิวทู", "lugia", "ルギア", "ลูเกีย", "rayquaza", "レックウザ", "เร็คควอซา", "เร็กควอซา", "gengar", "ゲンガー", "เก็งการ์", "eevee", "イーブイ", "อีวุย", "sylveon", "ニンフィア", "นิมเฟีย", "espeon", "エーフィ", "เอฟี", "vaporeon", "シャワーズ", "jolteon", "サンダース", "flareon", "ブースター", "leafeon", "リーフィア", "glaceon", "グレイシア", "giratina", "ギラティナ", "กิราตินา", "gardevoir", "サーナイト", "เซอไนท์", "greninja", "ゲッコウガ", "เก็คโคกะ", "darkrai", "ダークライ", "ดาร์กไร", "snorlax", "カビゴン", "คาบิกอน", "dragonite", "カイリュー", "ไคริว", "blastoise", "カメックス", "คาเม็กซ์", "venusaur", "フシギバナ", "ฟุชิกิบานะ", "gyarados", "ギャラドス", "กยาราดอส"] },
  { tier: "S", score: 1.0, keys: ["mew", "ミュウ", "มิว"] },
  { tier: "B", score: 0.55, keys: ["meowth", "ニャース", "เนียส", "charmander", "ヒトカゲ", "ฮิโตคาเงะ", "squirtle", "ゼニガメ", "เซนิกาเมะ", "bulbasaur", "フシギダネ", "ฟุชิกิดาเนะ", "psyduck", "コダック", "โคดัก", "lucario", "ルカリオ", "ลูคาริโอ", "mimikyu", "ミミッキュ", "มิมิคคิว", "ditto", "メタモン", "เมตามอน", "dragapult", "ドラパルト", "ドラパルト", "togepi", "トゲピー", "piplup", "ポッチャマ", "cubone", "カラカラ"] },
];
export const DEFAULT_CHAR = { tier: "C", score: 0.4 };

// น้ำหนักคะแนน (รวม = 1)
export const WEIGHTS = { char: 0.25, rarity: 0.20, grader: 0.15, lang: 0.10, era: 0.10, deal: 0.20 };

export const BUDGETS = [
  { id: "all", name: "ทุกงบ" },
  { id: "b1", name: "< 3,000 ฿" },
  { id: "b2", name: "3k–20k ฿" },
  { id: "b3", name: "20k–100k ฿" },
  { id: "b4", name: "100k ฿ ขึ้นไป" },
];

export const CATEGORIES = [
  { id: "all", name: "ทั้งหมด" },
  { id: "bluechip", name: "Blue-chip" },
  { id: "vintage", name: "วินเทจ" },
  { id: "mega", name: "Mega / 2026" },
  { id: "japan", name: "ญี่ปุ่น" },
  { id: "thai", name: "ภาษาไทย" },
  { id: "budget", name: "งบน้อย" },
];

// รายการแนะนำ (ข้อมูล ณ ต.ค. 2026) — ราคา EN ดึงสดจาก TCGdex (TCGplayer) ตอนเปิดหน้า
// img: ใช้รูปจากการ์ดอื่น (เวอร์ชันภาษาอื่นที่ภาพเดียวกัน) เมื่อฐานข้อมูลยังไม่มีรูป
export const WATCHLIST = [
  // ---- วินเทจ ----
  { tcg: "en:base1-4", name: "Charizard — Base Set", lang: "en", rarity: "vintage", era: "vintage", cats: ["vintage", "bluechip"], budget: "b3",
    why: "การ์ดที่ตลาดยอมรับมากที่สุดในโลก มีประวัติราคาย้อนหลังยาวที่สุด ขายออกง่ายทุกเกรด",
    buy: "PSA 7–9 หรือใบดิบ LP ขึ้นไป · PSA 10 ราคาหลักล้าน", risk: "ต่ำ", },
  { tcg: "en:neo1-9", name: "Lugia — Neo Genesis", lang: "en", rarity: "vintage", era: "vintage", cats: ["vintage", "bluechip"], budget: "b3",
    why: "Holo วินเทจที่ได้เกรดสูงยากมาก (centering แย่) ประชากร PSA 10 น้อย",
    buy: "1st Edition PSA 8–9 / Unlimited ใบดิบสภาพดี", risk: "ต่ำ" },
  { tcg: "en:ex8-107", name: "Rayquaza ☆ Gold Star — EX Deoxys", lang: "en", rarity: "vintage", era: "vintage", cats: ["vintage"], budget: "b3",
    why: "Gold Star เป็นตระกูลที่หายากจริง จำนวนพิมพ์น้อย ไม่มีการพิมพ์ซ้ำ",
    buy: "PSA 8–9 หรือใบดิบ NM · ระวังของปลอมเยอะ", risk: "ต่ำ–กลาง" },

  // ---- Modern blue-chip ----
  { tcg: "en:swsh7-215", name: "Umbreon VMAX Alt Art (Moonbreon)", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b3",
    why: "Grail ของยุคโมเดิร์น ราคาผ่านการทดสอบมาหลายรอบ สภาพคล่องสูงมาก",
    buy: "ใบดิบ NM หรือ PSA 10 · เช็ก centering ให้ดี", risk: "ต่ำ–กลาง" },
  { tcg: "en:swsh7-218", name: "Rayquaza VMAX Alt Art", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b3",
    why: "Alt Art ยอดนิยมอันดับต้นของ Evolving Skies ชุดเลิกพิมพ์แล้ว",
    buy: "ใบดิบ NM / PSA 10", risk: "ต่ำ–กลาง" },
  { tcg: "en:swsh12-186", name: "Lugia V Alt Art — Silver Tempest", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b2",
    why: "ตัวละครดัง + ภาพสวย ราคายังไม่สูงเท่ากลุ่ม Evolving Skies",
    buy: "ใบดิบ NM แล้วส่ง PSA", risk: "กลาง" },
  { tcg: "en:swsh11-186", name: "Giratina V Alt Art — Lost Origin", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b3",
    why: "หนึ่งใน Alt Art ที่คนยกให้ภาพสวยที่สุด ความต้องการคงที่",
    buy: "ใบดิบ NM / PSA 10", risk: "กลาง" },
  { tcg: "en:swsh8-271", name: "Gengar VMAX Alt Art — Fusion Strike", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b3",
    why: "Gengar กำลังมาแรงในยุค Mega ภาพ Alt Art เป็นที่จดจำ",
    buy: "ใบดิบ NM / PSA 10", risk: "กลาง" },
  { tcg: "en:sv08.5-161", name: "Umbreon ex SIR — Prismatic Evolutions", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b3",
    why: "การ์ดยุค SV ที่แพงที่สุด แต่ชุดนี้พิมพ์ซ้ำเยอะ ต้องระวัง",
    buy: "รอจังหวะราคาย่อ · PSA 10 เท่านั้นถ้าจะเก็บยาว", risk: "กลาง" },
  { tcg: "en:sv03.5-199", name: "Charizard ex SIR — 151", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b2",
    why: "ลิซาร์ดอน + ชุด 151 ที่คนคิดถึง เป็นตัวที่หลายคนตั้งใจเก็บ",
    buy: "PSA 10 หรือใบดิบ NM แล้วส่งเกรด", risk: "กลาง" },
  { tcg: "en:sv08-238", name: "Pikachu ex SIR — Surging Sparks", lang: "en", rarity: "sar", era: "modern", cats: ["bluechip"], budget: "b2",
    why: "พิคาชู SIR ตัวหลักของยุค SV",
    buy: "PSA 10", risk: "กลาง" },

  // ---- Mega / 2026 ----
  { tcg: "en:me02.5-284", name: "Mega Gengar ex SIR — Ascended Heroes", lang: "en", rarity: "sar", era: "recent", cats: ["mega"], budget: "b3",
    why: "ตัวไล่ล่าอันดับ 1 ของปี 2026",
    buy: "รอ 6–12 เดือนหลังชุดออกให้ราคานิ่งก่อน", risk: "สูง (ชุดใหม่)" },
  { tcg: "en:me02.5-276", name: "Pikachu ex SIR — Ascended Heroes", lang: "en", rarity: "sar", era: "recent", cats: ["mega"], budget: "b3",
    why: "พิคาชู SIR ชุดใหญ่ประจำปี ความต้องการสูง",
    buy: "PSA 10 หลังราคาย่อตัว", risk: "สูง (ชุดใหม่)" },
  { tcg: "en:me02-125", name: "Mega Charizard X ex SIR — Phantasmal Flames", lang: "en", rarity: "sar", era: "recent", cats: ["mega"], budget: "b3",
    why: "ลิซาร์ดอนเวอร์ชัน Mega ตัวแรกของยุคนี้",
    buy: "ใบดิบ NM แล้วส่งเกรด", risk: "กลาง–สูง" },
  { tcg: "en:30th-152", name: "Mew ex SIR — 30th Celebration", lang: "en", rarity: "sar", era: "new", cats: ["mega"], budget: "b2",
    why: "ชุดฉลองครบรอบ 30 ปี (ออก 16 ก.ย. 2026) มิวคือตัวเด่นของชุด",
    buy: "อย่าเพิ่งไล่ราคาเดือนแรก รอราคานิ่ง", risk: "สูง (เพิ่งออก)" },

  // ---- ญี่ปุ่น ----
  { tcg: "ja:SV2a-201", name: "リザードンex SAR — 151 (JP)", lang: "ja", rarity: "sar", era: "modern", cats: ["japan", "bluechip"], budget: "b2",
    why: "QC ญี่ปุ่นดีกว่า ได้ PSA 10 ง่ายกว่า ราคาเข้าซื้อถูกกว่า EN",
    buy: "ใบดิบ NM แล้วส่ง PSA (คุ้มสุดในกลุ่มนี้)", risk: "กลาง" },
  { tcg: "ja:SV2a-205", name: "ミュウex SAR — 151 (JP)", lang: "ja", rarity: "sar", era: "modern", cats: ["japan"], budget: "b2",
    why: "มิว SAR ในชุด 151 ภาษาญี่ปุ่น ภาพสวย ตัวละครระดับ S",
    buy: "ใบดิบ NM → PSA", risk: "กลาง" },
  { tcg: "ja:SV8a-217", name: "ブラッキーex SAR — Terastal Fest (JP)", lang: "ja", rarity: "sar", era: "modern", cats: ["japan", "bluechip"], budget: "b2",
    why: "Umbreon SAR เวอร์ชันญี่ปุ่น ถูกกว่า EN มาก แต่ตัวละครเดียวกัน",
    buy: "ใบดิบ NM → PSA 10", risk: "กลาง" },
  { tcg: "ja:M2a-240", img: "en:me02.5-284", name: "メガゲンガーex SAR — MEGA Dream ex (JP)", lang: "ja", rarity: "sar", era: "recent", cats: ["japan", "mega"], budget: "b2",
    why: "Mega Gengar เวอร์ชันญี่ปุ่น ราคาเข้าซื้อต่ำกว่า EN",
    buy: "ใบดิบ NM → PSA", risk: "กลาง–สูง" },
  { tcg: "ja:M2-110", img: "en:me02-125", name: "メガリザードンXex SAR — Inferno X (JP)", lang: "ja", rarity: "sar", era: "recent", cats: ["japan", "mega"], budget: "b2",
    why: "ลิซาร์ดอน Mega ภาษาญี่ปุ่น ได้ 10 ง่ายกว่า",
    buy: "ใบดิบ NM → PSA", risk: "กลาง" },

  // ---- ภาษาไทย ----
  { tcg: "th:SV2a-201", img: "ja:SV2a-201", name: "ลิซาร์ดอน ex SAR — โปเกมอนการ์ด 151 (TH)", lang: "th", rarity: "sar", era: "modern", cats: ["thai"], budget: "b2",
    why: "ตัวท็อปของการ์ดภาษาไทย ฐานคนเก็บในไทยกำลังโต",
    buy: "ใบดิบ NM หรือ PSA 10 (PSA ขายต่างประเทศได้ด้วย)", risk: "กลาง (ตลาดแคบ)" },
  { tcg: "th:SV2a-205", img: "ja:SV2a-205", name: "มิว ex SAR — โปเกมอนการ์ด 151 (TH)", lang: "th", rarity: "sar", era: "modern", cats: ["thai"], budget: "b2",
    why: "SAR ตัวละครระดับ S ของชุดไทยที่คนตามเยอะ",
    buy: "ใบดิบ NM", risk: "กลาง (ตลาดแคบ)" },
  { tcg: "th:SV2a-173", img: "en:sv03.5-173", name: "พิคาชู AR — โปเกมอนการ์ด 151 (TH)", lang: "th", rarity: "ar", era: "modern", cats: ["thai", "budget"], budget: "b1",
    why: "AR พิคาชูราคาเข้าถึงง่าย เหมาะเริ่มเก็บภาษาไทย",
    buy: "ใบดิบ NM", risk: "กลาง" },
  { tcg: null, name: "ชุดโปรโมเถ้าแก่น้อย (ขายเฉพาะไทย)", lang: "th", rarity: "promo", era: "modern", cats: ["thai", "budget"], budget: "b1",
    why: "ขายเฉพาะในไทย 12 ใบ (ฟอยล์ 3 ตัวเริ่มต้น) คนต่างชาติหายาก",
    buy: "เก็บแบบซีลครบชุด", risk: "กลาง" },

  // ---- งบน้อย ----
  { tcg: "en:sv03.5-173", name: "Pikachu IR — 151", lang: "en", rarity: "ar", era: "modern", cats: ["budget"], budget: "b1",
    why: "IR พิคาชูราคาไม่แพง ความต้องการต่อเนื่อง",
    buy: "ใบดิบ NM", risk: "ต่ำ–กลาง" },
  { tcg: "en:sv03.5-166", name: "Bulbasaur IR — 151", lang: "en", rarity: "ar", era: "modern", cats: ["budget"], budget: "b1",
    why: "IR ตัวเริ่มต้นจาก 151 ภาพเป็นที่ชื่นชอบ",
    buy: "ใบดิบ NM", risk: "กลาง" },
  { tcg: "en:sv08.5-167", name: "Eevee ex SIR — Prismatic Evolutions", lang: "en", rarity: "sar", era: "modern", cats: ["budget", "bluechip"], budget: "b2",
    why: "อีวุย SIR ราคายังจับต้องได้ในชุดที่แรงที่สุดของยุค",
    buy: "ใบดิบ NM → PSA", risk: "กลาง" },
];
