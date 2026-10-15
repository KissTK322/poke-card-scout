import { GRADERS, GRADES, CONDITIONS, LANGS, RARITIES, ERAS, CHAR_TIERS, DEFAULT_CHAR, WEIGHTS } from "./data.js";

const byId = (list, id, fallback = list[0]) => list.find((x) => x.id === id) || fallback;

export function parsePrices(text) {
  return String(text || "")
    .replace(/,(?=\d{3}\b)/g, "")
    .split(/[^\d.]+/)
    .map(Number)
    .filter((n) => n > 0);
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectCharacter(name) {
  const n = String(name || "").toLowerCase();
  for (const t of CHAR_TIERS) {
    if (t.keys.some((k) => n.includes(k.toLowerCase()))) return { tier: t.tier, score: t.score };
  }
  return DEFAULT_CHAR;
}

const lerp = (x, x0, y0, x1, y1) => y0 + ((Math.min(Math.max(x, x0), x1) - x0) * (y1 - y0)) / (x1 - x0);

// อัตราส่วนราคาประมูลต่อราคาสูงสุดที่ควรจ่าย → คะแนนความคุ้ม
export function dealScore(bid, maxBid) {
  if (!bid || !maxBid) return 0.6;
  const r = bid / maxBid;
  if (r <= 0.7) return 1;
  if (r <= 1) return lerp(r, 0.7, 1, 1, 0.6);
  return lerp(r, 1, 0.6, 1.5, 0);
}

/**
 * input: { name, lang, grader, grade, condition, rarity, era, qty, purpose,
 *          compsSame, compsRaw, compsPsa10, ratio, bid, shipping }
 * ราคาทั้งหมดเป็นบาท ต่อ 1 ใบ (ยกเว้น bid = ราคารวมทั้งล็อต)
 */
export function appraise(input) {
  const grader = byId(GRADERS, input.grader);
  const grade = byId(GRADES, input.grade);
  const cond = byId(CONDITIONS, input.condition);
  const lang = byId(LANGS, input.lang);
  const rarity = byId(RARITIES, input.rarity);
  const era = byId(ERAS, input.era, ERAS[2]);
  const qty = Math.max(1, Number(input.qty) || 1);
  const char = detectCharacter(input.name);

  const same = parsePrices(input.compsSame);
  const raws = parsePrices(input.compsRaw);
  const psas = parsePrices(input.compsPsa10);
  const notes = [];

  let raw = median(raws);
  let psa10 = median(psas);
  // PSA10 ÷ ใบดิบ: การ์ดถูกส่วนต่างจากการเกรดเป็นหลายเท่า การ์ดแพงส่วนต่างน้อยลง
  const autoRatio = (v) => (v < 500 ? 6 : v < 3000 ? 3 : v < 20000 ? 2 : 1.5);
  let ratio = Number(input.ratio) || (raw ? autoRatio(raw) : psa10 ? autoRatio(psa10 / 3) : 3);
  if (raw && psa10) ratio = psa10 / raw;
  else if (raw) psa10 = raw * ratio;
  else if (psa10) raw = psa10 / ratio;

  let unit = null;
  let method = "";
  let confidence = "ต่ำ";
  if (same.length) {
    unit = median(same);
    method = `มัธยฐานราคาขายจริงของใบสภาพ/เกรดเดียวกัน (${same.length} รายการ)`;
    confidence = same.length >= 3 ? "สูง" : "กลาง";
  } else if (raw) {
    if (grader.id === "raw") {
      unit = raw * cond.f;
      method = `ราคาใบดิบ × สภาพ ${cond.name} (${cond.f})`;
    } else {
      const premium = Math.max(0, psa10 - raw);
      unit = raw + premium * grader.k * grade.f;
      method = `ใบดิบ ${fmt(raw)} + (PSA10 ${fmt(psa10)} − ใบดิบ) × ${grader.name} ${grader.k} × เกรด ${grade.name} ${grade.f}`;
    }
    confidence = raws.length + psas.length >= 3 ? "กลาง" : "ต่ำ";
    if (!(raws.length && psas.length)) notes.push(`ใช้ค่า PSA10 ÷ ใบดิบ = ${ratio.toFixed(1)} เท่า (ประมาณการ) ถ้ามีราคาจริงทั้งสองแบบจะแม่นขึ้น`);
  }

  const purposeMargin = input.purpose === "flip" ? 0.3 : 0.1;
  const liquidity = (1 - grader.score) * 0.15 + (1 - lang.score) * 0.1;
  const lowConf = confidence === "ต่ำ" ? 0.1 : 0;
  const discount = Math.min(0.6, purposeMargin + liquidity + lowConf);
  const shipping = Number(input.shipping) || 0;

  const fair = unit != null ? unit * qty : null;
  const maxBid = fair != null ? Math.max(0, Math.floor((fair * (1 - discount) - shipping) / 10) * 10) : null;
  const bid = Number(input.bid) || 0;

  const parts = {
    char: char.score,
    rarity: rarity.score,
    grader: grader.score,
    lang: lang.score,
    era: era.score,
    deal: dealScore(bid, maxBid),
  };
  const score = Math.round(Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0) * 100);

  let verdict, tone;
  if (maxBid != null && bid > maxBid * 1.15) { verdict = "แพงเกินไป — อย่าไล่ราคา"; tone = "bad"; }
  else if (score >= 75) { verdict = "น่าซื้อ"; tone = "good"; }
  else if (score >= 55) { verdict = "พอได้ ถ้าไม่เกินราคาสูงสุด"; tone = "ok"; }
  else { verdict = "ข้ามไปก่อน"; tone = "bad"; }

  if (grader.score < 0.5) notes.push(`${grader.name} เป็นเจ้าเกรดที่ตลาดรู้จักน้อย ขายต่อยากและได้ราคาใกล้ใบดิบ`);
  if (era.id === "new") notes.push("ชุดเพิ่งออก ราคามักลดลงในช่วง 3–6 เดือนแรก");
  if (lang.id === "th") notes.push("ภาษาไทยมีคนซื้อส่วนใหญ่อยู่ในไทย สภาพคล่องต่ำกว่า EN/JP");
  if (grader.id === "raw" && raw && psa10 && input.lang) {
    const fee = Number(input.gradeFee) || 3000;
    const p10 = lang.p10, p9 = 0.35;
    const psa9 = raw + (psa10 - raw) * 0.25;
    const ev = p10 * psa10 + p9 * psa9 + (1 - p10 - p9) * raw - fee;
    notes.push(`ถ้าซื้อดิบแล้วส่ง PSA (ค่าส่งราว ${fmt(fee)}): มูลค่าคาดหวังราว ${fmt(ev)} ต่อใบ เทียบใบดิบ ${fmt(raw)} → ${ev > raw * 1.15 ? "คุ้มที่จะส่งเกรด" : "ไม่ค่อยคุ้มส่งเกรด"}`);
  }

  return { score, verdict, tone, parts, char, unit, fair, maxBid, bid, discount, method, confidence, notes, raw, psa10, ratio, qty };
}

export function fmt(n) {
  if (n == null || isNaN(n)) return "–";
  return "฿" + Math.round(n).toLocaleString("th-TH");
}
