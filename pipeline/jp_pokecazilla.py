"""Japanese market: lowest shop sell price + highest shop buy price for every card.

Source: pokecazilla.com set list pages (price info supplied by partner shops).
Respects robots.txt (only list pages + sitemap are fetched), 1.5 s between requests.
Output:
  data/jp/cards.json   {"updated", "packs": {pack_id: name}, "cards": [[id, name, rarity, set, number, pack_id, sell, buy, image], ...]}
  data/jp/history/*.json  per-card [[date, sell, buy], ...] (appended when changed)
"""
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TODAY, append_history, fetch, load, save

BASE = "https://pokecazilla.com"


def packs_from_sitemap():
    xml = fetch(f"{BASE}/sitemap_category.xml")
    urls = re.findall(r"<loc>(https://pokecazilla\.com/pokemon/products/list\?category_id=\d+&amp;pack_id=\d+)</loc>", xml)
    return [html.unescape(u) for u in dict.fromkeys(urls)]


def yen(s):
    m = re.search(r"[￥¥]\s*([\d,]+)", s or "")
    return int(m.group(1).replace(",", "")) if m else None


CARD_RE = re.compile(r'<article class="c-cassette c-cassette--card[^"]*">(.*?)</article>', re.S)


def parse_list(page, pack_id):
    out = []
    for block in CARD_RE.findall(page):
        m_id = re.search(r"/pokemon/products/detail/(\d+)", block)
        m_name = re.search(r'c-cassette__name">\s*(.*?)\s*</h3>', block, re.S)
        if not (m_id and m_name):
            continue
        text = html.unescape(re.sub(r"<[^>]+>", " ", block))
        text = re.sub(r"\s+", " ", text)
        sell = yen(text.split("最低価格", 1)[1].split("最高買取", 1)[0]) if "最低価格" in text else None
        buy = yen(text.split("最高買取", 1)[1]) if "最高買取" in text else None
        m_code = re.search(r"\[([^\]]*)\]\s*([\w\-/]+)?\s*\(([^)]*)\)", text)
        set_code, number, rarity = (m_code.group(1), m_code.group(2) or "", m_code.group(3)) if m_code else ("", "", "")
        name = html.unescape(re.sub(r"<[^>]+>", "", m_name.group(1))).strip()
        name = re.sub(r"\((?:[A-Z☆★◆●]+|-)\)$", "", name).strip()
        m_img = re.search(r'c-cassette__thumbnail">\s*<img src="([^"]+)"', block)
        img = m_img.group(1) if m_img and "no_image" not in m_img.group(1) else ""
        out.append([int(m_id.group(1)), name, rarity if rarity != "-" else "", set_code, number, pack_id, sell, buy, img])
    return out


def main(limit=None):
    packs = packs_from_sitemap()
    if limit:
        packs = packs[-int(limit):]
    print(f"{len(packs)} packs", flush=True)
    names, cards, seen = {}, [], set()
    for i, url in enumerate(packs):
        pack_id = int(url.rsplit("=", 1)[1])
        next_url = url
        while next_url:
            try:
                page = fetch(next_url)
            except Exception as e:  # skip a broken page, keep the crawl going
                print("skip", next_url, e, flush=True)
                break
            t = re.search(r"<title>(.*?)のシングル価格", page, re.S)
            if t:
                names[pack_id] = html.unescape(t.group(1)).strip()
            for row in parse_list(page, pack_id):
                if row[0] not in seen:
                    seen.add(row[0])
                    cards.append(row)
            nx = re.search(r'<link rel="next" href="([^"]+)"', page)
            next_url = html.unescape(nx.group(1)) if nx else None
        if i % 25 == 0:
            print(f"{i + 1}/{len(packs)} packs, {len(cards)} cards", flush=True)

    if not cards:
        sys.exit("no cards parsed — page layout may have changed")
    old = load("jp/cards.json", {})
    if old.get("cards") and len(cards) < 0.8 * len(old["cards"]) and not limit:
        sys.exit(f"only {len(cards)} cards vs {len(old['cards'])} before — refusing to overwrite")
    save("jp/cards.json", {"updated": TODAY, "source": "pokecazilla.com", "packs": names, "cards": cards})
    changed = append_history("jp", {str(c[0]): [c[6], c[7]] for c in cards if c[6] or c[7]})
    print(f"saved {len(cards)} cards, {changed} price changes", flush=True)


if __name__ == "__main__":
    main(*sys.argv[1:])
