// ข้อมูลตลาดที่ GitHub Actions เก็บทุกวัน (โฟลเดอร์ data/) — โหลดเฉพาะตอนใช้
const cache = {};
const SHARDS = 64;

async function getJSON(path) {
  if (!cache[path]) {
    cache[path] = fetch(path, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return cache[path];
}

export const loadJP = () => getJSON("data/jp/cards.json");
export const loadEN = () => getJSON("data/en/cards.json");
export const loadTH = () => getJSON("data/th/cards.json");
export const loadBacktest = () => getJSON("data/backtest/report.json");
export const loadPSA = () => getJSON("data/psa/pop.json");

// ต้องตรงกับ shard_of() ใน pipeline/common.py
export function shardOf(key) {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % SHARDS;
}

export async function history(market, id) {
  const s = String(shardOf(id)).padStart(2, "0");
  const d = await getJSON(`data/${market}/history/${s}.json`);
  return d?.[id] || [];
}

// ---------- normalize ----------
// แปลงคาตาคานะเป็นฮิรางานะไม่จำเป็น — เทียบตรงตัว + ตัดช่องว่าง/สัญลักษณ์
const norm = (s) => String(s || "").toLowerCase().normalize("NFKC").replace(/[\s・·'’.\-_()（）[\]【】]/g, "");

export function rarityToModel(r = "", lang = "ja") {
  const s = String(r);
  if (lang === "ja") {
    if (/^(SAR|CSR|SSR)$/.test(s)) return "sar";
    if (/^(UR|MUR|HR|BWR|SR|ACE)$/.test(s)) return "mur";
    if (/^(AR|CHR|K)$/.test(s)) return "ar";
    if (/^(PR|S|A)$/.test(s)) return "promo";
    if (/^(RR|RRR|TR)$/.test(s)) return "rr";
    if (/[☆★]/.test(s)) return "vintage";
    return "common";
  }
  const l = s.toLowerCase();
  if (/special illustration|alt/.test(l)) return "sar";
  if (/illustration|character/.test(l)) return "ar";
  if (/hyper|secret|rainbow|gold|mega hyper/.test(l)) return "mur";
  if (/star|shining|lv\.x|prime|legend/.test(l)) return "vintage";
  if (/ultra|double|vmax|vstar|\bv\b|ex|gx/.test(l)) return "rr";
  if (/promo/.test(l)) return "promo";
  return "common";
}

// ---------- unified card objects ----------
function fromJP(c, db) {
  const [id, name, rarity, set, number, pack, sell, buy, image] = c;
  return { market: "jp", lang: "ja", id: String(id), name, rarity, set, setName: db.packs?.[pack] || set, number, sell, buy,
    img: image || tcgdexJaImage(set, number), url: `https://pokecazilla.com/pokemon/products/detail/${id}` };
}
function fromEN(c, db) {
  const [id, name, number, rarity, set, usd, variant, a1, a7, a30, trend] = c;
  const s = db.sets?.[set] || [];
  return { market: "en", lang: "en", id, name, rarity, set, setName: s[0] || set, release: s[1], number: s[2] ? `${number}/${s[2]}` : number,
    usd, variant, eur: { a1, a7, a30, trend }, img: `https://images.pokemontcg.io/${set}/${number}.png` };
}
function fromTH(id, row, db) {
  const [name, number, reg, set] = row;
  return { market: "th", lang: "th", id: String(id), name, number, set, setName: db.sets?.[set] || set, reg,
    img: `https://asia.pokemon-card.com/th/card-img/th${String(id).padStart(8, "0")}.png`,
    url: `https://asia.pokemon-card.com/th/card-search/detail/${id}/` };
}

function tcgdexJaImage(set, number) {
  const n = String(number || "").split("/")[0];
  if (!set || !/^\d+$/.test(n)) return null;
  const serie = (set.match(/^[A-Za-z]+/) || [""])[0];
  return `https://assets.tcgdex.net/ja/${serie}/${set}/${n.padStart(3, "0")}/low.webp`;
}

/** ค้นทุกตลาด: query = ชื่อ (+ เลขการ์ด) · langs = ["en","ja","th"] */
export async function searchAll(query, langs = ["en", "ja", "th"], limit = 120) {
  const m = query.match(/(\d{1,3})(?:\s*\/\s*\d{1,3})?\s*$/);
  const num = m ? m[1].replace(/^0+/, "") : null;
  const q = norm(m ? query.slice(0, m.index) : query);
  const okNum = (n) => !num || String(n || "").split("/")[0].replace(/^0+/, "") === num;
  const okName = (n) => !q || norm(n).includes(q);
  const out = [];
  const [jp, en, th] = await Promise.all([langs.includes("ja") ? loadJP() : null, langs.includes("en") ? loadEN() : null, langs.includes("th") ? loadTH() : null]);
  if (en) for (const c of en.cards) if (okName(c[1]) && okNum(c[2])) out.push(fromEN(c, en));
  if (jp) for (const c of jp.cards) if (okName(c[1]) && okNum(c[4])) out.push(fromJP(c, jp));
  if (th) for (const [id, row] of Object.entries(th.cards)) if (okName(row[0]) && okNum(row[1])) out.push(fromTH(id, row, th));
  // การ์ดแพงก่อน (ใบที่น่าสนใจ) แล้วตามด้วยใบที่ไม่มีราคา
  const val = (c) => c.usd ? c.usd * 150 : c.sell || 0;
  out.sort((a, b) => val(b) - val(a));
  return { total: out.length, items: out.slice(0, limit) };
}

export async function coverage() {
  const [jp, en, th] = await Promise.all([loadJP(), loadEN(), loadTH()]);
  return {
    en: en?.cards.length || 0, enUpdated: en?.updated,
    jp: jp?.cards.length || 0, jpUpdated: jp?.updated,
    th: th ? Object.keys(th.cards).length : 0, thUpdated: th?.updated,
  };
}

/** หาข้อมูลตลาดที่ตรงกับชื่อในฟอร์มประเมิน */
export async function matchMarket(name, lang) {
  if (!name) return [];
  const langs = lang === "ja" ? ["ja"] : lang === "th" ? ["th", "ja"] : ["en"];
  const { items } = await searchAll(name.replace(/\b(psa|bgs|cgc|tag|pcg|sqc|ar|sar|sir|ex)\b/gi, " ").replace(/\s+/g, " ").trim(), langs, 6);
  return items;
}

/** เส้นราคาเป็น SVG เล็ก ๆ — series: [[date, a, b], ...] */
export function sparkline(series, labels = ["ขาย", "รับซื้อ"], w = 320, h = 90) {
  const pts = series.filter((p) => p[1] != null || p[2] != null);
  if (pts.length < 2) return `<p class="hint">ประวัติราคาเริ่มเก็บ ${pts[0]?.[0] || "วันนี้"} — กราฟจะขึ้นเมื่อมีข้อมูลมากกว่า 1 วันที่ราคาเปลี่ยน</p>`;
  const t0 = Date.parse(pts[0][0]), t1 = Date.parse(pts.at(-1)[0]) || t0 + 1;
  const vals = pts.flatMap((p) => [p[1], p[2]]).filter((v) => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals) || 1;
  const x = (d) => 4 + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (w - 8);
  const y = (v) => h - 14 - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - 24);
  const path = (i) => pts.filter((p) => p[i] != null).map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[i]).toFixed(1)}`).join("");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="กราฟราคา">
    <path d="${path(1)}" class="s1"/><path d="${path(2)}" class="s2"/>
    <text x="4" y="${h - 2}">${pts[0][0]}</text><text x="${w - 4}" y="${h - 2}" text-anchor="end">${pts.at(-1)[0]}</text>
    <text x="${w - 4}" y="10" text-anchor="end"><tspan class="t1">— ${labels[0]}</tspan>${labels[1] ? ` <tspan class="t2">— ${labels[1]}</tspan>` : ""}</text></svg>`;
}
