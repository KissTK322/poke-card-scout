import { GRADERS, GRADES, CONDITIONS, LANGS, RARITIES, ERAS, BUDGETS, CATEGORIES, WATCHLIST } from "./data.js";
import { appraise, fmt } from "./scoring.js";
import { searchAll, coverage, history, sparkline, rarityToModel, matchMarket, loadBacktest } from "./market.js";
import { parseText, getLog, saveLog, findComps, toCSV, fromJSON, backtestLog } from "./soldlog.js";

const API = "https://api.tcgdex.net/v2";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- storage (เผื่อเบราว์เซอร์บล็อก) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

// ---------- อัตราแลกเปลี่ยน ----------
const rates = { THB: store.get("pcs-fx", 33.6), EUR: 0.9, JPY: 150 };
let jpyThb = store.get("pcs-fx-jpy", null);
const fxInput = $("#fx");
fxInput.value = rates.THB;
fxInput.addEventListener("change", () => { rates.THB = Number(fxInput.value) || rates.THB; store.set("pcs-fx", rates.THB); renderRecommend(); });
fetch("https://open.er-api.com/v6/latest/USD").then((r) => r.json()).then((d) => {
  if (d?.rates?.THB && !store.get("pcs-fx-manual", false)) { rates.THB = +d.rates.THB.toFixed(2); fxInput.value = rates.THB; }
  if (d?.rates?.EUR) rates.EUR = d.rates.EUR;
  if (d?.rates?.JPY) rates.JPY = d.rates.JPY;
  const fj = $("#fx-jpy"); if (fj && !jpyThb) fj.value = (rates.THB / rates.JPY).toFixed(3);
}).catch(() => {});
fxInput.addEventListener("input", () => store.set("pcs-fx-manual", true));

const usdToThb = (usd) => usd * rates.THB;
const eurToThb = (eur) => (eur / rates.EUR) * rates.THB;
const jpyToThb = (jpy) => jpy * (jpyThb || rates.THB / rates.JPY);

// ---------- TCGdex ----------
async function getCard(ref) {
  const [lang, id] = ref.split(":");
  const key = `pcs-card-${ref}`;
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < 12 * 3600e3) return hit.d;
  const r = await fetch(`${API}/${lang}/cards/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  const slim = {
    id: d.id, lang, name: d.name, localId: d.localId, rarity: d.rarity, image: d.image,
    set: { id: d.set?.id, name: d.set?.name, official: d.set?.cardCount?.official },
    price: extractPrice(d),
  };
  store.set(key, { t: Date.now(), d: slim });
  return slim;
}

function extractPrice(d) {
  const out = {};
  const pools = [d.pricing, ...(d.variants_detailed || []).map((v) => v.pricing)].filter(Boolean);
  for (const p of pools) {
    const tp = p.tcgplayer || {};
    for (const [k, v] of Object.entries(tp)) {
      if (v && typeof v === "object" && v.marketPrice && !out.usd) { out.usd = v.marketPrice; out.variant = k; out.updated = tp.updated; }
    }
    const cm = p.cardmarket;
    if (cm && !out.eur && (cm.avg30 || cm.trend)) out.eur = cm.avg30 || cm.trend;
  }
  return out;
}

function priceThb(price) {
  if (!price) return null;
  if (price.usd) return usdToThb(price.usd);
  if (price.eur) return eurToThb(price.eur);
  return null;
}

function imgUrl(card, q = "low") {
  if (card?.image) return `${card.image}/${q}.webp`;
  // การ์ดไทยหลายใบไม่มีรูป → ลองรูปญี่ปุ่นเลขเดียวกัน (ภาพเดียวกัน)
  if (card?.lang === "th" && card.set?.id) {
    const serie = (card.set.id.match(/^[A-Za-z]+/) || [""])[0];
    return `https://assets.tcgdex.net/ja/${serie}/${card.set.id}/${card.localId}/${q}.webp`;
  }
  return null;
}

function artHtml(src, alt, badge, risk) {
  return `<div class="art">${src ? `<img loading="lazy" src="${esc(src)}" alt="${esc(alt)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'ยังไม่มีรูป'}))">` : `<div class="ph">ยังไม่มีรูป</div>`}
    ${badge ? `<span class="badge">${esc(badge)}</span>` : ""}${risk ? `<span class="badge risk">${esc(risk)}</span>` : ""}</div>`;
}

const LANG_BADGE = { en: "EN", ja: "JP", th: "TH" };

// ---------- tabs ----------
function showTab(name) {
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${name}`));
  store.set("pcs-tab", name);
  if (name === "saved") renderSaved();
  if (name === "log") renderLog();
  if (name === "backtest") renderBacktest();
  window.scrollTo({ top: 0 });
}
$$(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- แนะนำ ----------
const filt = { cat: "all", lang: "all", budget: "all", text: "" };
$("#f-cat").innerHTML = CATEGORIES.map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="${c.id === "all"}">${c.name}</button>`).join("");
$("#f-budget").innerHTML = BUDGETS.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
$("#f-cat").addEventListener("click", (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  filt.cat = b.dataset.cat;
  $$("#f-cat .chip").forEach((c) => c.setAttribute("aria-pressed", c === b));
  renderRecommend();
});
$("#f-lang").addEventListener("change", (e) => { filt.lang = e.target.value; renderRecommend(); });
$("#f-budget").addEventListener("change", (e) => { filt.budget = e.target.value; renderRecommend(); });
$("#f-text").addEventListener("input", (e) => { filt.text = e.target.value.toLowerCase(); renderRecommend(); });

const recCache = new Map();
function renderRecommend() {
  const list = WATCHLIST.filter((w) =>
    (filt.cat === "all" || w.cats.includes(filt.cat)) &&
    (filt.lang === "all" || w.lang === filt.lang) &&
    (filt.budget === "all" || w.budget === filt.budget) &&
    (!filt.text || w.name.toLowerCase().includes(filt.text) || (recCache.get(w.tcg)?.name || "").toLowerCase().includes(filt.text)));
  const grid = $("#rec-grid");
  if (!list.length) { grid.innerHTML = `<p class="status">ไม่มีการ์ดตรงกับตัวกรอง</p>`; return; }
  grid.innerHTML = list.map((w) => {
    const i = WATCHLIST.indexOf(w);
    const budget = BUDGETS.find((b) => b.id === w.budget)?.name;
    return `<article class="card" data-rec="${i}">
      ${artHtml(null, w.name, LANG_BADGE[w.lang], "เสี่ยง " + w.risk)}
      <div class="body">
        <h3>${esc(w.name)}</h3>
        <div class="meta">${esc(RARITIES.find((r) => r.id === w.rarity)?.name)} · งบ ${esc(budget)}</div>
        <div class="price" data-price></div>
        <div class="why">${esc(w.why)}</div>
      </div></article>`;
  }).join("");
  list.forEach((w) => hydrateRec(w, grid.querySelector(`[data-rec="${WATCHLIST.indexOf(w)}"]`)));
}

async function hydrateRec(w, el) {
  if (!w.tcg && !w.img) return;
  try {
    const card = w.tcg ? (recCache.get(w.tcg) || await getCard(w.tcg)) : null;
    if (card) recCache.set(w.tcg, card);
    let src = imgUrl(card);
    let borrowed = card && !card.image && card.lang === "th" ? "ja" : null;
    if (w.img) { const alt = await getCard(w.img).catch(() => null); if (imgUrl(alt)) { src = imgUrl(alt); borrowed = w.img.split(":")[0]; } }
    if (src) {
      const art = el.querySelector(".art");
      const img = Object.assign(document.createElement("img"), { loading: "lazy", src, alt: w.name });
      img.onerror = () => img.remove();
      art.querySelector(".ph")?.replaceWith(img);
      if (borrowed) art.insertAdjacentHTML("beforeend", `<span class="badge src">ภาพจากเวอร์ชัน ${LANG_BADGE[borrowed]} · หน้าการ์ดจริงเป็นภาษา${w.lang === "th" ? "ไทย" : "ญี่ปุ่น"}</span>`);
    }
    const thb = priceThb(card?.price);
    if (thb) el.querySelector("[data-price]").textContent = card.lang === "en"
      ? `ใบดิบ ~${fmt(thb)}${card.price.usd ? ` ($${card.price.usd})` : ""}`
      : `อ้างอิงราคา EN ~${fmt(thb)}`;
  } catch { /* ไม่มีข้อมูลก็แสดงแบบไม่มีรูป */ }
}

$("#rec-grid").addEventListener("click", (e) => {
  const el = e.target.closest("[data-rec]"); if (!el) return;
  const w = WATCHLIST[+el.dataset.rec];
  openDetail(recCache.get(w.tcg) || null, w, el.querySelector("img")?.src);
});

// ---------- ค้นหา (ฐานข้อมูลของเรา EN/JP/TH + TCGdex ภาษาอื่น) ----------
const qLang = $("#q-lang"), qOther = $("#q-other");
qLang.addEventListener("change", () => { qOther.hidden = qLang.value !== "tcgdex"; });
$("#search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (qLang.value === "tcgdex") await runSearch(q, qOther.value);
  else await runMarketSearch(q, qLang.value === "all" ? ["en", "ja", "th"] : [qLang.value]);
});

coverage().then((c) => {
  const parts = [c.en && `EN ${c.en.toLocaleString()} ใบ`, c.jp && `JP ${c.jp.toLocaleString()} ใบ (ราคาร้าน)`, c.th && `TH ${c.th.toLocaleString()} ใบ`].filter(Boolean);
  $("#coverage").textContent = parts.length
    ? `ฐานข้อมูล: ${parts.join(" · ")} · อัปเดต ${c.jpUpdated || c.enUpdated || c.thUpdated} · ภาษาอื่นค้นผ่าน TCGdex`
    : "ฐานข้อมูลตลาดยังไม่พร้อม — ใช้ TCGdex ชั่วคราว";
});

const marketResults = new Map();
function priceLine(c) {
  if (c.market === "jp") {
    const parts = [];
    if (c.sell) parts.push(`ร้านญี่ปุ่นขาย ¥${c.sell.toLocaleString()} (~${fmt(jpyToThb(c.sell))})`);
    if (c.buy) parts.push(`รับซื้อ ¥${c.buy.toLocaleString()}`);
    return parts.join(" · ");
  }
  if (c.market === "en") return c.usd ? `$${c.usd} (~${fmt(usdToThb(c.usd))})` : c.eur?.trend ? `€${c.eur.trend}` : "";
  return "ยังไม่มีราคาตลาดไทย — ดูในบันทึกราคาขาย";
}

async function runMarketSearch(raw, langs) {
  const st = $("#search-status"), grid = $("#search-grid");
  st.textContent = "กำลังค้นหา…"; grid.innerHTML = "";
  const { total, items } = await searchAll(raw, langs, 120);
  if (!items.length) {
    st.textContent = "ไม่พบในฐานข้อมูลของเรา — ลองค้นผ่าน TCGdex";
    return runSearch(raw, langs.length === 1 ? langs[0] : "en");
  }
  marketResults.clear();
  st.textContent = `พบ ${total.toLocaleString()} ใบ${total > items.length ? ` (แสดง ${items.length} ใบที่ราคาสูงสุด)` : ""} — แตะเพื่อดูราคา กราฟ และประเมิน`;
  grid.innerHTML = items.map((c, i) => {
    marketResults.set(String(i), c);
    return `<article class="card" data-mk="${i}">
      ${artHtml(c.img, c.name, LANG_BADGE[c.lang], c.rarity)}
      <div class="body"><h3>${esc(c.name)}</h3>
        <div class="meta">${esc(c.setName)} · ${esc(c.number)}</div>
        <div class="price">${esc(priceLine(c))}</div></div></article>`;
  }).join("");
}

$("#search-grid").addEventListener("click", async (e) => {
  const mk = e.target.closest("[data-mk]");
  if (mk) return openMarketDetail(marketResults.get(mk.dataset.mk), mk.querySelector("img")?.src);
  const el = e.target.closest("[data-ref]"); if (!el) return;
  try { openDetail(await getCard(el.dataset.ref), null, el.querySelector("img")?.src); }
  catch { $("#search-status").textContent = "โหลดรายละเอียดไม่สำเร็จ"; }
});

async function runSearch(raw, lang, target = { grid: $("#search-grid"), status: $("#search-status") }) {
  const num = raw.match(/(\d{1,3})(?:\s*\/\s*\d{1,3})?\s*$/);
  const name = (num ? raw.slice(0, num.index) : raw).trim() || raw;
  const params = new URLSearchParams({ name, "pagination:itemsPerPage": "60" });
  if (num && name !== raw) params.set("localId", num[1].padStart(lang === "en" ? 1 : 3, "0"));
  target.status.textContent = "กำลังค้นหาผ่าน TCGdex…";
  target.grid.innerHTML = "";
  try {
    let res = await fetch(`${API}/${lang}/cards?${params}`).then((r) => r.json());
    if ((!Array.isArray(res) || !res.length) && params.has("localId")) {
      params.set("localId", num[1]);
      res = await fetch(`${API}/${lang}/cards?${params}`).then((r) => r.json());
    }
    if (!Array.isArray(res) || !res.length) { target.status.textContent = "ไม่พบการ์ด ลองสะกดใหม่ หรือเปลี่ยนภาษา"; return []; }
    res = res.reverse();
    target.status.textContent = `TCGdex พบ ${res.length} ใบ — แตะเพื่อดูรายละเอียด`;
    target.grid.innerHTML = res.map((c) => `<article class="card" data-ref="${lang}:${esc(c.id)}">
      ${artHtml(imgUrl({ ...c, lang, set: { id: c.id.split("-")[0] } }), c.name, (LANG_BADGE[lang] || lang).toUpperCase())}${lang === "th" && !c.image ? `<span class="badge src static">ภาพจากเวอร์ชัน JP</span>` : ""}
      <div class="body"><h3>${esc(c.name)}</h3><div class="meta">${esc(c.id)}</div></div></article>`).join("");
    return res;
  } catch {
    target.status.textContent = "เชื่อมต่อฐานข้อมูลการ์ดไม่ได้ ลองใหม่อีกครั้ง";
    return [];
  }
}

// ---------- รายละเอียดการ์ดจากฐานข้อมูลตลาด ----------
async function openMarketDetail(c, fallbackImg) {
  if (!c) return;
  const src = c.img || fallbackImg;
  const comps = findComps(`${c.name} ${c.number}`, { lang: c.lang });
  const q = encodeURIComponent(`${c.name} ${String(c.number).split("/")[0]} ${c.lang === "ja" ? "japanese" : c.lang === "th" ? "thai" : ""}`.trim());
  const spread = c.sell && c.buy ? 1 - c.buy / c.sell : null;
  $("#modal-body").innerHTML = `<button class="btn small close" data-close>ปิด</button>
    <div class="modal">
      ${src ? `<img src="${esc(src)}" alt="${esc(c.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'ยังไม่มีรูป'}))">` : `<div class="art"><div class="ph">ยังไม่มีรูป</div></div>`}
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="meta">${esc([c.setName, c.number, c.rarity, LANG_BADGE[c.lang]].filter(Boolean).join(" · "))}</div>
        <dl class="kv" style="margin:14px 0">
          ${c.market === "jp" ? `
            <dt>ร้านในญี่ปุ่นขายถูกสุด</dt><dd>${c.sell ? `¥${c.sell.toLocaleString()} · ${fmt(jpyToThb(c.sell))}` : "–"}</dd>
            <dt>ร้านรับซื้อสูงสุด</dt><dd>${c.buy ? `¥${c.buy.toLocaleString()} · ${fmt(jpyToThb(c.buy))}` : "–"}</dd>
            <dt class="hint" style="grid-column:1/-1">ราคาในญี่ปุ่น ยังไม่รวมค่าส่ง/นำเข้า (ในไทยมักแพงกว่า 1.5–3 เท่าสำหรับใบราคาถูก)</dt>
            ${spread != null ? `<dt>ส่วนต่างซื้อ-ขาย</dt><dd class="tone-${spread > 0.45 ? "bad" : spread > 0.25 ? "ok" : "good"}">${Math.round(spread * 100)}%</dd>` : ""}` : ""}
          ${c.market === "en" ? `
            <dt>TCGplayer (${esc(c.variant || "-")})</dt><dd>${c.usd ? `$${c.usd} · ${fmt(usdToThb(c.usd))}` : "–"}</dd>
            ${c.eur?.a30 ? `<dt>Cardmarket เฉลี่ย 30 วัน / 7 วัน</dt><dd>€${c.eur.a30} / €${c.eur.a7 ?? "–"}</dd>` : ""}
            ${c.eur?.a30 && c.eur?.a7 ? `<dt>โมเมนตัม 7 วัน vs 30 วัน</dt><dd class="tone-${c.eur.a7 >= c.eur.a30 ? "good" : "bad"}">${((c.eur.a7 / c.eur.a30 - 1) * 100).toFixed(1)}%</dd>` : ""}` : ""}
          ${comps.rows?.length ? `<dt>ในบันทึกราคาขายของคุณ</dt><dd>${comps.rows.length} รายการ</dd>` : ""}
        </dl>
        <div id="detail-chart" class="hint">กำลังโหลดประวัติราคา…</div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" data-appraise>ประเมินใบนี้</button>
          ${c.url ? `<a class="btn" target="_blank" rel="noopener" href="${esc(c.url)}">แหล่งข้อมูล</a>` : ""}
          <a class="btn" target="_blank" rel="noopener" href="https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1">eBay ขายแล้ว</a>
          <a class="btn" target="_blank" rel="noopener" href="https://www.psacard.com/pop/search?q=${q}">PSA Pop</a>
        </div>
      </div>
    </div>`;
  const dlg = $("#modal");
  dlg.showModal();
  $("[data-close]", dlg).onclick = () => dlg.close();
  $("[data-appraise]", dlg).onclick = () => { dlg.close(); prefillFromMarket(c, src); showTab("appraise"); };
  if (c.market !== "th") {
    const h = await history(c.market, c.id);
    const el = $("#detail-chart");
    if (el) el.innerHTML = c.market === "jp" ? sparkline(h, ["ราคาขาย ¥", "รับซื้อ ¥"]) : sparkline(h, ["TCGplayer $", "Cardmarket €"]);
  } else $("#detail-chart").textContent = "";
}

function prefillFromMarket(c, src) {
  form.reset();
  setTimeout(() => {
    const f = form.elements;
    f.name.value = `${c.name} ${c.number}`.trim();
    f.lang.value = c.lang;
    f.rarity.value = rarityToModel(c.rarity, c.lang === "en" ? "en" : "ja");
    f.era.value = eraFromDate(c.release) || "modern";
    if (c.market === "jp" && c.sell) { f.compsRaw.value = Math.round(jpyToThb(c.sell)); f.mktSell.value = c.sell; f.mktBuy.value = c.buy || ""; }
    if (c.market === "en" && c.usd) f.compsRaw.value = Math.round(usdToThb(c.usd));
    f.grader.value = "raw";
    if (src) setPhoto(src);
    update();
    refreshAppraiseHelpers();
  });
}

function eraFromDate(d) {
  if (!d) return null;
  const years = (Date.now() - Date.parse(d.replace(/\//g, "-"))) / (365.25 * 864e5);
  return years < 0.25 ? "new" : years < 1 ? "recent" : years < 5 ? "modern" : years < 15 ? "older" : "vintage";
}

// ---------- modal รายละเอียด ----------
function openDetail(card, rec, fallbackImg) {
  const name = rec?.name || card?.name || "";
  const src = (card && card.image && imgUrl(card, "high")) || fallbackImg || (card && imgUrl(card, "high"));
  const borrowedNote = (card && !card.image && src) || (rec?.img && src) ? `<p class="hint">รูปนี้ยืมจากเวอร์ชันภาษาอื่นที่ภาพวาดเดียวกัน หน้าการ์ดจริงเป็นภาษา${(rec?.lang || card?.lang) === "th" ? "ไทย" : "ญี่ปุ่น"}</p>` : "";
  const thb = priceThb(card?.price);
  const q = encodeURIComponent(`${card?.name || name} ${card?.localId || ""} ${card?.set?.name || ""}`.trim());
  $("#modal-body").innerHTML = `<button class="btn small close" data-close>ปิด</button>
    <div class="modal">
      ${src ? `<img src="${esc(src)}" alt="${esc(name)}">` : `<div class="art"><div class="ph">ยังไม่มีรูป</div></div>`}
      <div>
        <h2>${esc(name)}</h2>
        <div class="meta">${esc([card?.set?.name, card?.localId && `#${card.localId}`, card?.rarity].filter(Boolean).join(" · "))}</div>
        ${borrowedNote}
        <dl class="kv" style="margin:14px 0">
          <dt>${card?.lang && card.lang !== "en" ? "ราคาเวอร์ชัน EN (อ้างอิง)" : "ราคาตลาดใบดิบ"}</dt><dd>${thb ? `${fmt(thb)}` : "ไม่มีข้อมูล"}</dd>
          ${card?.price?.usd ? `<dt>TCGplayer (${esc(card.price.variant)})</dt><dd>$${card.price.usd}</dd>` : ""}
          ${card?.price?.eur ? `<dt>Cardmarket เฉลี่ย 30 วัน</dt><dd>€${card.price.eur}</dd>` : ""}
          ${rec ? `<dt>ความเสี่ยง</dt><dd>${esc(rec.risk)}</dd>` : ""}
        </dl>
        ${card?.lang && card.lang !== "en" && thb ? `<p class="hint">ฐานข้อมูลยังไม่มีราคาภาษา${card.lang === "ja" ? "ญี่ปุ่น" : "ไทย"}โดยตรง ตัวเลขนี้คือราคาเวอร์ชันอังกฤษ ให้เช็กราคาขายจริงของภาษานี้ก่อน</p>` : ""}
        ${rec ? `<p><b>ทำไมน่าเก็บ:</b> ${esc(rec.why)}</p><p><b>ควรซื้อแบบ:</b> ${esc(rec.buy)}</p>` : ""}
        <div class="row" style="margin-top:12px">
          <button class="btn primary" data-appraise>ประเมินใบนี้</button>
          <a class="btn" target="_blank" rel="noopener" href="https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1">eBay ขายแล้ว</a>
          <a class="btn" target="_blank" rel="noopener" href="https://www.pricecharting.com/search-products?type=prices&q=${q}">PriceCharting</a>
        </div>
      </div>
    </div>`;
  const dlg = $("#modal");
  dlg.showModal();
  $("[data-close]", dlg).onclick = () => dlg.close();
  $("[data-appraise]", dlg).onclick = () => {
    dlg.close();
    prefillFromCard(card, rec, src, thb);
    showTab("appraise");
  };
}
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") e.target.close(); });

function rarityFromTcg(r = "", setId = "") {
  const s = r.toLowerCase();
  if (/special illustration|special art|alt/.test(s)) return "sar";
  if (/illustration|character/.test(s)) return "ar";
  if (/hyper|secret|mega hyper|crown/.test(s)) return "mur";
  if (/ultra|double/.test(s)) return "rr";
  if (/^(base|neo|gym|ecard|ex\d|pop|dp|pl|hgss|PMCG|E\d|PCG)/i.test(setId)) return "vintage";
  return "common";
}

// ---------- ฟอร์มประเมิน ----------
const form = $("#ap-form");
const fill = (sel, list) => { form.elements[sel].innerHTML = list.map((x) => `<option value="${x.id}">${x.name}</option>`).join(""); };
fill("lang", LANGS); fill("grader", GRADERS); fill("grade", GRADES); fill("condition", CONDITIONS); fill("rarity", RARITIES); fill("era", ERAS);
form.elements.grader.value = "psa"; form.elements.era.value = "modern"; form.elements.rarity.value = "sar";

function syncGraderFields() {
  const raw = form.elements.grader.value === "raw";
  $("#grade-wrap").hidden = raw; $("#cond-wrap").hidden = !raw;
}

function readForm() { return Object.fromEntries(new FormData(form)); }

let lastResult = null;
function update() {
  syncGraderFields();
  const input = readForm();
  const r = appraise(input);
  lastResult = { input, r };
  const box = $("#result");
  if (!input.name && r.fair == null) {
    box.innerHTML = `<p class="empty">ใส่ชื่อการ์ดและราคาที่ขายได้จริงอย่างน้อย 1 ช่อง แล้วระบบจะคำนวณคะแนนกับราคาประมูลสูงสุดให้ทันที<br><br>หรือไปที่แท็บ <b>ค้นหา</b> / <b>แนะนำ</b> แล้วกด "ประเมินใบนี้"</p>`;
    return;
  }
  const labels = { char: `ตัวละคร (${r.char.tier})`, rarity: "ความหายาก", grader: "เจ้าเกรด", lang: "ภาษา", era: "อายุชุด", deal: "ความคุ้ม", liquidity: "สภาพคล่อง", supply: "ซัพพลาย PSA" };
  const diff = r.maxBid != null && r.bid ? r.bid - r.maxBid : null;
  box.innerHTML = `
    <div class="score-ring tone-${r.tone}">
      <div class="ring" style="--p:${r.score}"><span>${r.score}</span></div>
      <div><div class="verdict">${esc(r.verdict)}</div><div class="method">ความมั่นใจของราคา: ${r.confidence}</div></div>
    </div>
    <dl class="kv">
      <dt>ประมูลได้ไม่เกิน</dt><dd class="big">${r.maxBid != null ? fmt(r.maxBid) : "ใส่ราคาก่อน"}</dd>
      <dt>มูลค่ายุติธรรม${r.qty > 1 ? ` (${r.qty} ใบ)` : ""}</dt><dd>${fmt(r.fair)}</dd>
      ${r.qty > 1 ? `<dt>ต่อใบ</dt><dd>${fmt(r.unit)}</dd>` : ""}
      ${r.bid ? `<dt>ราคาตอนนี้</dt><dd>${fmt(r.bid)}</dd>` : ""}
      ${diff != null ? `<dt>${diff > 0 ? "แพงกว่าเพดาน" : "ยังต่ำกว่าเพดาน"}</dt><dd class="tone-${diff > 0 ? "bad" : "good"}">${fmt(Math.abs(diff))}</dd>` : ""}
      <dt>ส่วนเผื่อที่หัก</dt><dd>${Math.round(r.discount * 100)}%</dd>
    </dl>
    <div class="bars">${Object.entries(r.parts).filter(([, v]) => v != null).map(([k, v]) => `<div class="bar"><span>${labels[k]}</span><i style="--v:${v}"></i><span>${Math.round(v * 100)}</span></div>`).join("")}</div>
    ${r.notes.length ? `<ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    ${r.method ? `<div class="method">วิธีคิด: ${esc(r.method)}</div>` : ""}`;
}
form.addEventListener("input", update);
form.addEventListener("change", update);
form.addEventListener("reset", () => setTimeout(() => { setPhoto(null); form.elements.grader.value = "psa"; form.elements.era.value = "modern"; form.elements.rarity.value = "sar"; update(); }));

function prefillFromCard(card, rec, src, thb) {
  form.reset();
  setTimeout(() => {
    const f = form.elements;
    f.name.value = card ? `${card.name}${card.localId ? ` ${card.localId}${card.set?.official ? "/" + card.set.official : ""}` : ""}` : rec?.name || "";
    f.lang.value = rec?.lang || card?.lang || "en";
    f.rarity.value = rec?.rarity || rarityFromTcg(card?.rarity, card?.set?.id);
    f.era.value = rec?.era || "modern";
    const isEn = (card?.lang || rec?.lang) === "en";
    if (thb && isEn) f.compsRaw.value = Math.round(thb);
    if (src) setPhoto(src);
    update();
  });
}

// ---------- รูป + OCR ----------
const drop = $("#photo-drop");
const fileIn = $("#photo");
const prev = $("#photo-preview");
const sel = $("#crop-sel");
let photoBitmap = null; // รูปต้นฉบับความละเอียดเต็ม (ใช้ตอนอ่านป้าย)
let crop = null;        // พื้นที่ที่ลากเลือก (สัดส่วน 0–1)

$("#photo-btn").addEventListener("click", (e) => { e.stopPropagation(); fileIn.click(); });
$("#photo-change").addEventListener("click", () => fileIn.click());
drop.addEventListener("click", () => { if (prev.hidden) fileIn.click(); });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("drag"); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
fileIn.addEventListener("change", () => { if (fileIn.files[0]) handleFile(fileIn.files[0]); fileIn.value = ""; });
document.addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
  if (f && $("#tab-appraise").classList.contains("active")) handleFile(f);
});

function setPhoto(src) {
  form.elements.image.value = src || "";
  prev.hidden = !src; $("#photo-empty").hidden = !!src; $("#photo-tools").hidden = !src || !photoBitmap;
  if (src) prev.src = src; else { prev.removeAttribute("src"); photoBitmap = null; }
  setCrop(null);
}

function setCrop(c) {
  crop = c;
  sel.hidden = !c;
  if (c) Object.assign(sel.style, { left: c.x * 100 + "%", top: c.y * 100 + "%", width: c.w * 100 + "%", height: c.h * 100 + "%" });
  $("#ocr-crop").disabled = !c;
}

// ลากเลือกพื้นที่ป้ายบนรูป
let dragStart = null;
const rel = (e) => {
  const r = prev.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
};
prev.addEventListener("pointerdown", (e) => { if (!photoBitmap) return; e.preventDefault(); prev.setPointerCapture(e.pointerId); dragStart = rel(e); setCrop(null); });
prev.addEventListener("pointermove", (e) => {
  if (!dragStart) return;
  const p = rel(e);
  setCrop({ x: Math.min(p.x, dragStart.x), y: Math.min(p.y, dragStart.y), w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) });
});
prev.addEventListener("pointerup", () => { dragStart = null; if (crop && (crop.w < 0.02 || crop.h < 0.02)) setCrop(null); });
prev.addEventListener("dragstart", (e) => e.preventDefault());

async function downscale(bmp, max = 480) {
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}

let tesseract;
function loadTesseract() {
  if (tesseract) return tesseract;
  tesseract = new Promise((res, rej) => {
    const s = Object.assign(document.createElement("script"), { src: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js" });
    s.onload = () => res(window.Tesseract); s.onerror = () => { tesseract = null; rej(); };
    document.head.appendChild(s);
  });
  return tesseract;
}

// รายชื่อโปเกมอนภาษาอังกฤษ (ใช้จับชื่อจากข้อความที่อ่านได้)
let speciesList;
function loadSpecies() {
  if (speciesList) return speciesList;
  const cached = store.get("pcs-species");
  if (cached?.length) return (speciesList = Promise.resolve(cached));
  speciesList = fetch("https://pokeapi.co/api/v2/pokemon-species?limit=2000").then((r) => r.json())
    .then((d) => { const names = d.results.map((x) => x.name.replace(/-/g, " ").toUpperCase()); store.set("pcs-species", names); return names; })
    .catch(() => []);
  return speciesList;
}

async function handleFile(file) {
  try { photoBitmap = await createImageBitmap(file); } catch { $("#ocr-status").textContent = "เปิดรูปไม่ได้"; return; }
  setPhoto(await downscale(photoBitmap));
  $("#photo-tools").hidden = false;
  runOcr(null);
}

// ขยายภาพ 3 เท่า + อ่านทั้งแบบปกติและแบบกลับสี (ป้ายกรอบเกรดหลายเจ้าเป็นตัวหนังสือขาวบนพื้นสี)
async function ocrCanvas(region, filter) {
  const b = photoBitmap;
  const sx = region ? region.x * b.width : 0, sy = region ? region.y * b.height : 0;
  const sw = region ? region.w * b.width : b.width, sh = region ? region.h * b.height : b.height;
  const scale = Math.min(3, 2400 / Math.max(sw, sh));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(sw * scale), height: Math.round(sh * scale) });
  const x = c.getContext("2d");
  x.filter = filter;
  x.drawImage(b, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

async function runOcr(region) {
  const st = $("#ocr-status");
  if (!photoBitmap) return;
  st.textContent = region ? "กำลังอ่านป้ายในกรอบที่เลือก…" : "กำลังอ่านข้อความบนรูป… (ถ้าอ่านไม่ได้ ให้ลากกรอบครอบป้ายแล้วกด 'อ่านป้ายส่วนที่เลือก')";
  try {
    const [T] = await Promise.all([loadTesseract(), loadSpecies()]);
    const texts = [];
    for (const f of ["grayscale(1) contrast(1.4)", "grayscale(1) invert(1) contrast(2)"]) {
      const { data } = await T.recognize(await ocrCanvas(region, f), "eng");
      texts.push(data.text || "");
    }
    applyOcr(texts.join("\n"), !!region);
  } catch {
    st.textContent = "อ่านรูปอัตโนมัติไม่สำเร็จ กรอกชื่อเองได้เลย";
  }
}
$("#ocr-crop").addEventListener("click", () => crop && runOcr(crop));

const REGION = ["ALOLAN", "GALARIAN", "HISUIAN", "PALDEAN", "MEGA", "DARK", "SHINING", "RADIANT", "ETERNAL"];
const SUFFIX = ["VMAX", "VSTAR", "GX", "EX", "V", "BREAK", "LV.X", "X", "Y"];
async function findPokemonName(T) {
  const names = await loadSpecies();
  const clean = T.replace(/[^A-Z0-9 \n.'-]/g, " ");
  let best = null;
  for (const n of names) {
    if (n.length < 3) continue;
    const m = clean.match(new RegExp(`(?:\\b(${REGION.join("|")})\\s+)?\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?:\\s+(${SUFFIX.join("|")})\\b)?`));
    if (m && (!best || n.length > best.n.length)) best = { n, text: m[0] };
  }
  return best ? best.text.replace(/\s+/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bEx\b/, "ex") : "";
}

async function applyOcr(text, fromCrop) {
  const st = $("#ocr-status");
  const T = text.toUpperCase();
  const f = form.elements;
  const found = [];

  const g = [["BLACK LABEL", "bgsbl"], ["PRISTINE", "cgcp"], ["\\bPSA\\b", "psa"], ["BECKETT", "bgs"], ["\\bBGS\\b", "bgs"], ["\\bCGC\\b", "cgc"], ["\\bSGC\\b", "sgc"], ["\\bTAG\\b", "tag"], ["\\bARS\\b", "ars"], ["\\bSQC\\b", "sqc"], ["\\bPCG\\b", "pcg"]].find(([k]) => new RegExp(k).test(T));
  if (g) { f.grader.value = g[1]; found.push(GRADERS.find((x) => x.id === g[1]).name); }
  const grade = /GEM|PRISTINE|PERFECT/.test(T) ? "10" : (T.match(/MINT\s*(9\.5|9|8)/) || [])[1];
  if (grade) { f.grade.value = grade; found.push("เกรด " + grade); }
  const lang = /JPN|JAPAN/.test(T) ? "ja" : /THAI/.test(T) ? "th" : null;
  if (lang) { f.lang.value = lang; found.push(LANG_BADGE[lang]); }
  if (/SPECIAL (ART|ILLUS)|\bSAR\b|\bSIR\b|ALT(ERNATE)? ART/.test(T)) f.rarity.value = "sar";
  else if (/\bAR\b|ART RARE|ILLUSTRATION RARE|\bIR\b/.test(T)) f.rarity.value = "ar";
  const yr = +(T.match(/\b(199\d|20[0-3]\d)\b/) || [])[1];
  if (yr) {
    const age = new Date().getFullYear() - yr;
    f.era.value = age < 1 ? "new" : age <= 1 ? "recent" : age <= 5 ? "modern" : age <= 15 ? "older" : "vintage";
    found.push("ปี " + yr);
  }
  const num = (T.match(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/) || [])[0]?.replace(/\s/g, "");
  const nameGuess = await findPokemonName(T);
  if (nameGuess || num) { f.name.value = [nameGuess, num].filter(Boolean).join(" "); found.push(f.name.value); }

  st.innerHTML = found.length
    ? `อ่านได้: ${esc(found.join(" · "))} — ตรวจสอบและแก้ได้`
    : fromCrop ? "ยังอ่านไม่ชัด ลองลากกรอบให้พอดีป้ายมากขึ้น หรือกรอกเอง" : "อ่านทั้งรูปไม่ชัด — ลากกรอบครอบป้ายบนกรอบเกรด แล้วกด 'อ่านป้ายส่วนที่เลือก'";
  if (nameGuess) {
    st.innerHTML += ` <button class="btn small" type="button" id="ocr-search">ค้นรูป/ราคาของ "${esc(nameGuess)}"</button>`;
    $("#ocr-search").onclick = () => { $("#q").value = `${nameGuess}${num ? " " + num.split("/")[0] : ""}`; $("#q-lang").value = "en"; showTab("search"); $("#search-form").requestSubmit(); };
  }
  update();
}

// ---------- บันทึก ----------
$("#save-btn").addEventListener("click", () => {
  if (!lastResult?.input.name) { $("#ocr-status").textContent = "ใส่ชื่อการ์ดก่อนบันทึก"; return; }
  const saved = store.get("pcs-saved", []);
  saved.unshift({ id: Date.now(), at: new Date().toISOString(), input: lastResult.input,
    r: { score: lastResult.r.score, verdict: lastResult.r.verdict, tone: lastResult.r.tone, maxBid: lastResult.r.maxBid, fair: lastResult.r.fair } });
  const ok = store.set("pcs-saved", saved.slice(0, 200));
  $("#ocr-status").textContent = ok ? "บันทึกแล้ว ดูได้ที่แท็บ 'ที่บันทึกไว้'" : "บันทึกไม่ได้ (เบราว์เซอร์ปิดการเก็บข้อมูล หรือพื้นที่เต็ม)";
});

function renderSaved() {
  const saved = store.get("pcs-saved", []);
  const el = $("#saved-list");
  if (!saved.length) { el.innerHTML = `<p class="status">ยังไม่มีรายการที่บันทึก — ประเมินการ์ดแล้วกด "บันทึก"</p>`; return; }
  el.innerHTML = saved.map((s) => `<div class="saved-item">
    ${s.input.image ? `<img src="${esc(s.input.image)}" alt="">` : `<div class="ph"></div>`}
    <div><h3>${esc(s.input.name)}</h3>
      <div class="meta">${esc(GRADERS.find((g) => g.id === s.input.grader)?.name)}${s.input.grader !== "raw" ? " " + esc(s.input.grade) : ""} · ${esc(LANG_BADGE[s.input.lang] || s.input.lang)} · ${new Date(s.at).toLocaleDateString("th-TH")}</div>
      <div class="meta"><b class="tone-${s.r.tone}">${s.r.score} · ${esc(s.r.verdict)}</b> · ไม่เกิน ${fmt(s.r.maxBid)}${s.input.bid ? ` · ราคาตอนนั้น ${fmt(+s.input.bid)}` : ""}</div></div>
    <div class="btns"><button class="btn small" data-open="${s.id}">เปิด</button><button class="btn small" data-del="${s.id}">ลบ</button></div></div>`).join("");
}
$("#saved-list").addEventListener("click", (e) => {
  const saved = store.get("pcs-saved", []);
  const open = e.target.closest("[data-open]"), del = e.target.closest("[data-del]");
  if (open) {
    const s = saved.find((x) => x.id == open.dataset.open);
    form.reset();
    setTimeout(() => { for (const [k, v] of Object.entries(s.input)) if (form.elements[k]) form.elements[k].value = v; setPhoto(s.input.image); update(); showTab("appraise"); });
  }
  if (del && confirm("ลบรายการนี้?")) { store.set("pcs-saved", saved.filter((x) => x.id != del.dataset.del)); renderSaved(); }
});

// ---------- ตัวช่วยในฟอร์มประเมิน: ราคาตลาด + บันทึกราคาขาย ----------
let helperTimer;
form.addEventListener("input", (e) => {
  if (["name", "lang", "grader", "grade"].includes(e.target.name)) {
    clearTimeout(helperTimer);
    helperTimer = setTimeout(refreshAppraiseHelpers, 400);
  }
});
form.addEventListener("change", (e) => { if (["lang", "grader", "grade"].includes(e.target.name)) refreshAppraiseHelpers(); });

const matchCache = new Map();
async function refreshAppraiseHelpers() {
  const f = form.elements;
  const name = f.name.value.trim();
  const box = $("#market-match");
  if (!name) { box.textContent = "พิมพ์ชื่อการ์ดแล้วระบบจะหาราคาตลาดให้"; $("#log-comps").innerHTML = ""; return; }
  const items = await matchMarket(name, f.lang.value);
  matchCache.clear();
  box.innerHTML = items.length
    ? `<div class="match-list">${items.slice(0, 4).map((c, i) => { matchCache.set(String(i), c); return `
        <div class="match"><span><b>${esc(c.name)}</b> <span class="hint">${esc(c.setName)} ${esc(c.number)} ${esc(c.rarity || "")} · ${LANG_BADGE[c.lang]}</span><br>${esc(priceLine(c))}</span>
        <button class="btn small" type="button" data-use="${i}">ใช้ราคานี้</button></div>`; }).join("")}</div>`
    : `<span class="hint">ไม่พบในฐานข้อมูลตลาด — ลองพิมพ์ชื่อภาษาเดียวกับการ์ด + เลขการ์ด</span>`;

  const comps = findComps(name, { grader: f.grader.value, grade: f.grade.value, lang: f.lang.value });
  const n = (comps.rows || []).length;
  $("#log-comps").innerHTML = n
    ? `พบในบันทึกราคาขาย ${n} รายการ (เกรดเดียวกัน ${comps.same.length} · ดิบ ${comps.raw.length} · PSA10 ${comps.psa10.length}) <button class="btn small" type="button" id="use-log">ใส่ราคาจากบันทึก</button>`
    : "";
  if (n) $("#use-log").onclick = () => {
    if (comps.same.length) f.compsSame.value = comps.same.map(Math.round).join(" ");
    if (comps.raw.length) f.compsRaw.value = comps.raw.map(Math.round).join(" ");
    if (comps.psa10.length) f.compsPsa10.value = comps.psa10.map(Math.round).join(" ");
    update();
  };
}
$("#market-match").addEventListener("click", (e) => {
  const b = e.target.closest("[data-use]"); if (!b) return;
  const c = matchCache.get(b.dataset.use), f = form.elements;
  if (c.market === "jp") { f.compsRaw.value = c.sell ? Math.round(jpyToThb(c.sell)) : ""; f.mktSell.value = c.sell || ""; f.mktBuy.value = c.buy || ""; }
  else if (c.market === "en" && c.usd) { f.compsRaw.value = Math.round(usdToThb(c.usd)); f.mktSell.value = ""; f.mktBuy.value = ""; }
  if (!f.image.value && c.img) setPhoto(c.img);
  update();
});

// ---------- PSA Population ----------
$("#psa-lookup").addEventListener("click", async () => {
  const st = $("#psa-status");
  const token = store.get("pcs-psa-token", "");
  const cert = $("#psa-cert").value.replace(/\D/g, "");
  if (!token) { st.textContent = "ยังไม่ได้ใส่ PSA API token (แท็บ 'วิธีคิด' → ตั้งค่า)"; return; }
  if (!cert) { st.textContent = "ใส่เลข cert PSA ก่อน (ดูบนป้ายกรอบ)"; return; }
  const h = { Authorization: `Bearer ${token}` };
  st.textContent = "กำลังดึงข้อมูลจาก PSA…";
  try {
    const c = await fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${cert}`, { headers: h }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const p = c.PSACert || {};
    let pop10 = null, total = null;
    if (p.SpecID) {
      const s = await fetch(`https://api.psacard.com/publicapi/pop/GetPSASpecPopulation/${p.SpecID}`, { headers: h }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      pop10 = s?.PSAPop?.Grade10 ?? null; total = s?.PSAPop?.Total ?? null;
    }
    if (pop10 == null && String(p.CardGrade || "").includes("10")) pop10 = p.TotalPopulation;
    if (pop10 != null) form.elements.pop10.value = pop10;
    if (total != null) form.elements.popTotal.value = total;
    st.textContent = `${p.Year || ""} ${p.Brand || ""} ${p.Subject || ""} #${p.CardNumber || ""} — cert นี้เกรด ${p.CardGrade || "?"} (เกรดนี้มี ${p.TotalPopulation ?? "?"} ใบ, สูงกว่า ${p.PopulationHigher ?? "?"} ใบ)`;
    update();
  } catch (e) {
    st.textContent = `ดึงไม่ได้ (${e.message}) — token ผิด, เกินโควตารายวัน หรือ cert ไม่ถูกต้อง · กรอกเองจาก PSA Pop Report ได้`;
  }
});

// ---------- แท็บบันทึกราคาขาย ----------
let preview = [];
const GRADER_OPTS = GRADERS.map((g) => `<option value="${g.id}">${g.name}</option>`).join("");
const LANG_OPTS = `<option value="">?</option>` + LANGS.map((l) => `<option value="${l.id}">${l.id.toUpperCase()}</option>`).join("");

$("#log-parse").addEventListener("click", () => {
  preview = parseText($("#log-text").value);
  $("#log-parse-status").textContent = preview.length ? `แยกได้ ${preview.length} รายการ — ตรวจแก้แล้วกดบันทึก` : "ไม่พบราคาในข้อความ (ต้องมีคำว่า ปิด/จบ/sold หรือหน่วย บาท/฿/.-/k)";
  renderPreview();
});

function rowInputs(r, i) {
  return `<tr data-i="${i}">
    <td><input type="date" data-k="date" value="${esc(r.date)}"></td>
    <td><input data-k="name" value="${esc(r.name)}"></td>
    <td><input data-k="number" value="${esc(r.number)}" size="7"></td>
    <td><select data-k="lang">${LANG_OPTS}</select></td>
    <td><select data-k="grader"><option value="">?</option>${GRADER_OPTS}</select></td>
    <td><input data-k="grade" value="${esc(r.grade)}" size="3"></td>
    <td><input type="number" data-k="qty" value="${r.qty || 1}" min="1" style="width:56px"></td>
    <td><input type="number" data-k="price" value="${r.price}" style="width:96px"></td>
    <td><button class="btn small" type="button" data-drop="${i}">ลบ</button></td></tr>`;
}
function renderPreview() {
  const el = $("#log-preview");
  if (!preview.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>วันที่</th><th>ชื่อการ์ด</th><th>เลข</th><th>ภาษา</th><th>เจ้าเกรด</th><th>เกรด</th><th>ใบ</th><th>ราคา (฿ รวม)</th><th></th></tr></thead>
    <tbody>${preview.map(rowInputs).join("")}</tbody></table></div>
    <div class="row"><button class="btn primary" type="button" id="log-save">บันทึก ${preview.length} รายการ</button></div>`;
  $$("#log-preview tr[data-i]").forEach((tr) => {
    const r = preview[+tr.dataset.i];
    $("[data-k=lang]", tr).value = r.lang || "";
    $("[data-k=grader]", tr).value = r.grader || "";
  });
  $("#log-save").onclick = () => {
    const rows = getLog();
    const ok = saveLog([...preview.map((r) => ({ ...r, qty: +r.qty || 1, price: +r.price })), ...rows]);
    $("#log-parse-status").textContent = ok ? `บันทึกแล้ว ${preview.length} รายการ` : "บันทึกไม่ได้ (เบราว์เซอร์ปิดการเก็บข้อมูล)";
    preview = []; renderPreview(); renderLog(); $("#log-text").value = "";
  };
}
$("#log-preview").addEventListener("input", (e) => {
  const tr = e.target.closest("tr[data-i]"); if (!tr) return;
  preview[+tr.dataset.i][e.target.dataset.k] = e.target.value;
});
$("#log-preview").addEventListener("click", (e) => {
  const b = e.target.closest("[data-drop]"); if (!b) return;
  preview.splice(+b.dataset.drop, 1); renderPreview();
});

function renderLog() {
  const all = getLog().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const f = ($("#log-filter").value || "").toLowerCase();
  const rows = f ? all.filter((r) => `${r.name} ${r.number}`.toLowerCase().includes(f)) : all;
  $("#log-count").textContent = `(${all.length} รายการ)`;
  const gname = (r) => r.grader === "raw" ? "ดิบ" : `${(GRADERS.find((g) => g.id === r.grader)?.name || r.grader || "?").split(" ")[0]} ${r.grade || ""}`;
  $("#log-table").innerHTML = rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>วันที่</th><th>การ์ด</th><th>ภาษา</th><th>เกรด</th><th class="num">ราคา/ใบ</th><th></th></tr></thead><tbody>
    ${rows.slice(0, 300).map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.name)} <span class="hint">${esc(r.number)}</span>${r.qty > 1 ? ` <span class="hint">×${r.qty}</span>` : ""}</td>
      <td>${esc(LANG_BADGE[r.lang] || (r.lang || "?").toUpperCase())}</td><td>${esc(gname(r))}</td><td class="num">${fmt(r.price / (r.qty || 1))}</td>
      <td><button class="btn small" type="button" data-del-log="${r.id}">ลบ</button></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="status">ยังไม่มีราคาที่บันทึก — วางข้อความจากกลุ่มประมูลด้านบน</p>`;
}
$("#log-filter").addEventListener("input", renderLog);
$("#log-table").addEventListener("click", (e) => {
  const b = e.target.closest("[data-del-log]"); if (!b) return;
  saveLog(getLog().filter((r) => String(r.id) !== b.dataset.delLog)); renderLog();
});
function download(name, text, type) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#log-csv").onclick = () => download(`sold-log-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + toCSV(getLog()), "text/csv");
$("#log-json").onclick = () => download(`sold-log-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ rows: getLog() }, null, 1), "application/json");
$("#log-import").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const rows = fromJSON(await file.text());
    const have = new Set(getLog().map((r) => String(r.id)));
    saveLog([...getLog(), ...rows.filter((r) => !have.has(String(r.id)))]);
    renderLog();
  } catch (err) { alert("นำเข้าไม่ได้: " + err.message); }
  e.target.value = "";
});

// ---------- แท็บ Backtest ----------
const pct = (v, d = 1) => (v == null ? "–" : `${(v * 100).toFixed(d)}%`);
const FACTOR_TH = { score: "คะแนนรวม", char: "ตัวละคร", rarity: "ความหายาก", momentum: "โมเมนตัม 30 วัน", liquidity: "สภาพคล่อง (spread)", logprice: "ระดับราคา", age: "อายุชุด" };
function icCell(v) {
  if (v == null) return "<td>–</td>";
  const tone = v > 0.05 ? "good" : v < -0.05 ? "bad" : "ok";
  return `<td class="num tone-${tone}">${v.toFixed(3)}</td>`;
}
function resultTable(r) {
  return `<table class="tbl"><thead><tr><th>ปัจจัย</th><th class="num">IC</th></tr></thead><tbody>
    ${Object.entries(r.ic).map(([k, v]) => `<tr><td>${FACTOR_TH[k] || k}</td>${icCell(v)}</tr>`).join("")}</tbody></table>
    <dl class="kv">
      <dt>ตัวอย่าง</dt><dd>${r.samples.toLocaleString()} (${r.dates} รอบ)</dd>
      <dt>ผลตอบแทน กลุ่มคะแนนสูงสุด 20%</dt><dd>${pct(r.top20_return)}</dd>
      <dt>ผลตอบแทน กลุ่มคะแนนต่ำสุด 20%</dt><dd>${pct(r.bottom20_return)}</dd>
      <dt>ผลตอบแทนเฉลี่ยทั้งตลาด</dt><dd>${pct(r.all_return)}</dd>
      <dt>กลุ่มบนที่ราคาขึ้น</dt><dd>${pct(r.hit_rate_top20, 0)}</dd>
      ${r.top20_roundtrip != null ? `<dt>ถ้าซื้อราคาร้านแล้วขายคืนร้าน (กลุ่มบน)</dt><dd>${pct(r.top20_roundtrip)}</dd>` : ""}
    </dl>
    ${r.suggested_weights ? `<p class="hint">น้ำหนักที่ข้อมูลแนะนำ: ${Object.entries(r.suggested_weights).map(([k, v]) => `${FACTOR_TH[k] || k} ${Math.round(v * 100)}%`).join(" · ")}</p>` : ""}`;
}

async function renderBacktest() {
  const el = $("#bt-body");
  el.innerHTML = `<p class="status">กำลังโหลดผล backtest…</p>`;
  const rep = await loadBacktest();
  const log = backtestLog();
  const jp = rep?.jp_forward;
  const horizons = jp ? Object.entries(jp.horizons) : [];
  el.innerHTML = `
    <div class="panel prose-lite">
      <h2>Backtest คืออะไร</h2>
      <p>ทดสอบว่าคะแนนของระบบ "ทายถูก" ไหม: ณ วันหนึ่ง ให้คะแนนการ์ดทุกใบด้วยข้อมูลที่มีถึงวันนั้น แล้วดูว่าอีก 7/30/90/180 วันต่อมาราคาไปทางไหน
      ค่า <b>IC</b> คือความสัมพันธ์เชิงอันดับระหว่างคะแนนกับผลตอบแทนจริง (−1 ถึง 1) · มากกว่า 0.05 ถือว่ามีความหมายสำหรับของสะสม · ติดลบแปลว่าปัจจัยนั้นชี้ผิดทาง</p>
      <p class="hint">อัปเดตล่าสุด: ${esc(rep?.updated || "ยังไม่มี")} · ข้อมูลราคาเก็บอัตโนมัติทุกวันด้วย GitHub Actions</p>
    </div>
    <div class="bt-grid">
      <div class="panel">
        <h3>ตลาดญี่ปุ่น — ทดสอบไปข้างหน้าจริง</h3>
        <p class="hint">ราคาร้านในญี่ปุ่นทุกใบ เก็บตั้งแต่ ${esc(jp?.history_since || "–")}</p>
        ${horizons.length ? horizons.map(([h, r]) => `<h4>ถือ ${h} วัน</h4>${resultTable(r)}`).join("")
          : `<p>ยังมีประวัติไม่พอ — ผลแรกจะขึ้นประมาณ: ${Object.entries(jp?.ready_on || { 7: "7 วันหลังเริ่มเก็บ" }).map(([h, d]) => `<b>${h} วัน</b> ≈ ${esc(d)}`).join(" · ")}</p>`}
      </div>
      <div class="panel">
        <h3>ตลาดอังกฤษ — เช็กโมเมนตัม 30 วัน (proxy)</h3>
        <p class="hint">เทียบราคาเฉลี่ย 7 วันกับ 30 วันของ Cardmarket ทุกใบ ใช้ได้ตั้งแต่วันแรก แต่ไม่ใช่การทดสอบไปข้างหน้าจริง</p>
        ${rep?.en_proxy_30d ? resultTable(rep.en_proxy_30d) : `<p class="status">ยังไม่มีข้อมูล</p>`}
      </div>
      <div class="panel">
        <h3>บันทึกราคาขายของคุณ</h3>
        <p class="hint">ถ้าตั้งเพดานเป็น "ราคากลางของครั้งก่อน − 15%" จะไม่จ่ายแพงกว่าราคาขายครั้งถัดไปบ่อยแค่ไหน</p>
        ${log.tests ? `<dl class="kv">
            <dt>การ์ดที่มีราคามากกว่า 1 ครั้ง</dt><dd>${log.cards}</dd>
            <dt>จำนวนการทดสอบ</dt><dd>${log.tests}</dd>
            <dt>เพดานปลอดภัย (ไม่จ่ายเกิน)</dt><dd>${pct(log.safeRate, 0)}</dd>
            <dt>ราคาครั้งถัดไปเปลี่ยนเฉลี่ย</dt><dd>${pct(log.avgChange)}</dd></dl>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>วันที่</th><th>การ์ด</th><th class="num">เพดาน</th><th class="num">ขายจริง</th></tr></thead><tbody>
            ${log.rows.map((t) => `<tr><td>${esc(t.date)}</td><td>${esc(t.name)}</td><td class="num">${fmt(t.cap)}</td><td class="num tone-${t.safe ? "good" : "bad"}">${fmt(t.next)}</td></tr>`).join("")}
          </tbody></table></div>`
          : `<p>ต้องมีการ์ดใบเดียวกัน (ชื่อ เกรด ภาษาเดียวกัน) ถูกบันทึกอย่างน้อย 2 ครั้ง</p>`}
      </div>
    </div>
    <ul class="notes">${(rep?.notes || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
}

// ---------- ตั้งค่า ----------
const tokenIn = $("#psa-token");
tokenIn.value = store.get("pcs-psa-token", "");
tokenIn.addEventListener("change", () => { store.set("pcs-psa-token", tokenIn.value.trim()); $("#settings-status").textContent = tokenIn.value ? "บันทึก token ในเบราว์เซอร์นี้แล้ว" : "ลบ token แล้ว"; });
const jpyIn = $("#fx-jpy");
if (jpyThb) jpyIn.value = jpyThb;
jpyIn.addEventListener("change", () => { jpyThb = Number(jpyIn.value) || null; store.set("pcs-fx-jpy", jpyThb); });

// ---------- start ----------
renderRecommend();
update();
showTab(store.get("pcs-tab", "recommend"));
