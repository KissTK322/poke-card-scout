// บันทึกราคาปิดประมูล/ราคาขายจริง (เช่น copy จากกลุ่ม Facebook) — เก็บในเครื่อง ส่งออก/นำเข้าได้

const KEY = "pcs-soldlog";
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } },
};

export const getLog = () => store.get();
export const saveLog = (rows) => store.set(rows);

const GRADER_RE = /\b(psa|bgs|beckett|cgc|tag|sgc|ars|sqc|pcg)\s*(?:gem\s*mint\s*|gem\s*|mint\s*)?(10|9\.5|9|8\.5|8|7)?\b/i;
const BL_RE = /black\s*label|\bbl\b|แบล็คเลเบิล/i;
const RAW_RE = /\braw\b|ดิบ|ไม่เกรด|ยังไม่เกรด/i;
const LANG_RE = [
  ["ja", /\b(jp|jpn|japan(?:ese)?)\b|ญี่ปุ่น|ภาษาญี่ปุ่น/i],
  ["th", /\b(th|thai)\b|ภาษาไทย|การ์ดไทย|แปลไทย/i],
  ["en", /\b(en|eng|english)\b|อังกฤษ/i],
];
const CLOSE_RE = /(ปิด(?:ประมูล|ที่|ราคา)?|จบ(?:ที่|ราคา)?|ขายไป|ขายแล้ว|sold|ราคาปิด|ได้ไป|ปิดไป|win|final)\s*[:=]?\s*/i;
const PRICE_RE = /(?:฿\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K|พัน|หมื่น)?\s*(?:บาท|฿|thb|\.-|-(?!\d))?/g;

function toNumber(raw, unit) {
  let n = Number(String(raw).replace(/,/g, ""));
  if (/k|พัน/i.test(unit || "")) n *= 1000;
  if (/หมื่น/.test(unit || "")) n *= 10000;
  return n;
}

function parseDate(text) {
  const m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!m) return null;
  let [, d, mo, y] = m.map(Number);
  if (y < 100) y += y > 50 ? 2500 : 2000;
  if (y > 2400) y -= 543; // พ.ศ.
  if (mo > 12) [d, mo] = [mo, d];
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isNaN(Date.parse(iso)) ? null : iso;
}

/** หาราคาในบรรทัด: ตัวเลขหลังคำว่า ปิด/จบ/sold มาก่อน, ไม่งั้นตัวเลขที่มีหน่วยเงิน */
const DATE_RE = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g;

function findPrice(line) {
  line = line.replace(DATE_RE, " ").replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " ");
  const close = line.match(new RegExp(CLOSE_RE.source + PRICE_RE.source.replace("/g", ""), "i"));
  if (close) {
    const m = line.slice(close.index).match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K|พัน|หมื่น)?/);
    if (m) return { price: toNumber(m[1], m[2]), strong: true };
  }
  let best = null;
  for (const m of line.matchAll(PRICE_RE)) {
    const n = toNumber(m[1], m[2]);
    const hasUnit = /บาท|฿|thb|\.-|k|พัน|หมื่น/i.test(m[0]);
    const around = line.slice(Math.max(0, m.index - 1), m.index + m[0].length + 1);
    if (/\d\s*\/\s*\d/.test(around) || /^(10|9\.5|9|8)$/.test(m[1]) && GRADER_RE.test(line)) continue; // เลขการ์ด/เกรด
    if (n < 20 || n > 5e7) continue;
    if (hasUnit || !best) best = { price: n, strong: hasUnit };
  }
  return best;
}

/** แปลงข้อความที่วางมาเป็นรายการ — คั่นโพสต์ด้วยบรรทัดว่าง */
export function parseText(text, today = new Date().toISOString().slice(0, 10)) {
  const blocks = String(text).replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const rows = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let ctxName = "";
    const blockDate = parseDate(block) || today;
    const blockAll = block;
    for (const line of lines) {
      const p = findPrice(line);
      const name = cleanName(line);
      if (!p || (!p.strong && name.length > 3 && !CLOSE_RE.test(line))) {
        if (name.length > 2 && !p) ctxName = ctxName || name;
        if (!p) continue;
      }
      const src = `${line} ${ctxName ? "" : blockAll}`;
      const g = line.match(GRADER_RE) || blockAll.match(GRADER_RE);
      const grader = BL_RE.test(src) ? "bgsbl" : g ? normGrader(g[1]) : RAW_RE.test(src) ? "raw" : "";
      const grade = grader && grader !== "raw" ? (g?.[2] || (grader === "bgsbl" ? "10" : "")) : "";
      const lang = (LANG_RE.find(([, re]) => re.test(line)) || LANG_RE.find(([, re]) => re.test(blockAll)) || [""])[0];
      const numRe = /\b\d{1,3}\s*\/\s*\d{1,3}\b(?![/.-]\d)/;
      const num = (line.replace(DATE_RE, " ").match(numRe) || blockAll.replace(DATE_RE, " ").match(numRe) || [""])[0].replace(/\s/g, "");
      const qty = Number((line.match(/(\d+)\s*(?:ใบ|pcs|ea)\b/i) || blockAll.match(/(?:คู่|ชุด)\s*(\d+)\s*ใบ|(\d+)\s*ใบ/) || [])[1] || (/คู่/.test(blockAll) ? 2 : 1)) || 1;
      rows.push({
        id: Date.now() + rows.length,
        date: parseDate(line) || blockDate,
        name: (/\p{L}{3,}/u.test(name) && !(ctxName && CLOSE_RE.test(line) && name.length < 12) ? name : ctxName || name) || "",
        number: num, lang, grader, grade, qty, price: p.price, note: line.slice(0, 140),
      });
    }
  }
  return rows;
}

function normGrader(g) {
  g = g.toLowerCase();
  return g === "beckett" ? "bgs" : g;
}

function cleanName(line) {
  return line
    .replace(DATE_RE, " ")
    .replace(CLOSE_RE, " ")
    .replace(PRICE_RE, (m) => (/\d/.test(m) && /บาท|฿|thb|\.-|k|พัน/i.test(m) ? " " : m))
    .replace(/\b(psa|bgs|cgc|tag|sgc|ars|sqc|pcg)\s*(gem\s*mint|gem|mint)?\s*(10|9\.5|9|8)?\b/gi, " ")
    .replace(/ประมูล|เริ่ม|บิด|เคาะ|ละ|ราคา|ส่งฟรี|ค่าส่ง|\bmin\b|นาที|โอน|ภายใน|ชม\.?|วัน/gi, " ")
    .replace(/[#@:|•\-–—_*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- ใช้กับฟอร์มประเมิน ----------
const tokens = (s) => String(s || "").toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}/]+/u).filter((t) => t.length > 1);

/** หาราคาในบันทึกที่น่าจะเป็นการ์ดใบเดียวกัน */
export function findComps(name, { grader, grade, lang } = {}) {
  const want = tokens(name).filter((t) => !/^(psa|bgs|cgc|pcg|sqc|tag|ar|sar|sir|ex|jp|en|th)$/.test(t));
  const num = (String(name).match(/\d{1,3}\/\d{1,3}/) || [])[0];
  if (!want.length) return { same: [], raw: [], psa10: [] };
  const hits = getLog().filter((r) => {
    if (lang && r.lang && r.lang !== lang) return false;
    if (num && r.number && r.number !== num) return false;
    const have = tokens(`${r.name} ${r.number}`);
    const overlap = want.filter((t) => have.some((h) => h.includes(t) || t.includes(h))).length;
    return overlap >= Math.min(2, want.length);
  });
  const per = (r) => r.price / (r.qty || 1);
  return {
    same: hits.filter((r) => r.grader === grader && (grader === "raw" || String(r.grade) === String(grade))).map(per),
    raw: hits.filter((r) => r.grader === "raw").map(per),
    psa10: hits.filter((r) => r.grader === "psa" && String(r.grade) === "10").map(per),
    rows: hits,
  };
}

// ---------- export / import ----------
export function toCSV(rows) {
  const cols = ["date", "name", "number", "lang", "grader", "grade", "qty", "price", "note"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n");
}

export function fromJSON(text) {
  const d = JSON.parse(text);
  const rows = Array.isArray(d) ? d : d.rows;
  if (!Array.isArray(rows)) throw new Error("รูปแบบไฟล์ไม่ถูกต้อง");
  return rows.filter((r) => r && r.price > 0).map((r, i) => ({ id: r.id || Date.now() + i, ...r }));
}

/** backtest บันทึก: ถ้าใช้เพดานจากราคาที่เคยขายก่อนหน้า จะซื้อแพงกว่าราคาขายครั้งต่อไปบ่อยแค่ไหน */
export function backtestLog(discount = 0.15) {
  const groups = {};
  for (const r of getLog()) {
    const key = [tokens(r.name).sort().join(" "), r.number, r.lang, r.grader, r.grade].join("|");
    (groups[key] ||= []).push(r);
  }
  const tests = [];
  for (const [key, rows] of Object.entries(groups)) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < rows.length; i++) {
      const prev = rows.slice(0, i).map((r) => r.price / (r.qty || 1)).sort((a, b) => a - b);
      const med = prev[Math.floor(prev.length / 2)];
      const cap = med * (1 - discount);
      const next = rows[i].price / (rows[i].qty || 1);
      tests.push({ key, name: rows[i].name, date: rows[i].date, cap, next, change: next / med - 1, safe: cap <= next });
    }
  }
  const n = tests.length;
  return {
    cards: Object.values(groups).filter((g) => g.length > 1).length,
    tests: n,
    safeRate: n ? tests.filter((t) => t.safe).length / n : null,
    avgChange: n ? tests.reduce((s, t) => s + t.change, 0) / n : null,
    rows: tests.slice(-30).reverse(),
  };
}
