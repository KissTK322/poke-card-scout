"""Thai catalog: every Thai-language card from the official Pokémon Asia card search.

Incremental: list pages find card ids; detail pages (name, number, set) are fetched only for
new ids, at most MAX_DETAILS per run, so the full catalog fills in over a few daily runs.
Output: data/th/cards.json {"updated", "sets": {code: name}, "cards": {id: [name, number, regulation, set_code]}}
Card image: https://asia.pokemon-card.com/th/card-img/th%08d.png
"""
import html
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TODAY, fetch, load, save

BASE = "https://asia.pokemon-card.com/th/card-search"
MAX_DETAILS = int(os.environ.get("TH_MAX_DETAILS", "4000"))
DELAY = 1.0


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def list_ids(full):
    ids, page, total = [], 1, None
    while True:
        p = fetch(f"{BASE}/list/?pageNo={page}", delay=DELAY)
        found = [int(x) for x in re.findall(r"/th/card-search/detail/(\d+)/", p)]
        ids += found
        if total is None:
            m = re.search(r"ทั้งหมด\s*(\d+)\s*หน้า", clean(p))
            total = int(m.group(1)) if m else page
        if not found or page >= total or (not full and page >= 10):
            return ids, total
        page += 1


def detail(cid):
    p = fetch(f"{BASE}/detail/{cid}/", delay=DELAY)
    h1 = re.search(r'<h1 class="pageHeader cardDetail">(.*?)</h1>', p, re.S)
    name = h1.group(1) if h1 else ""
    name = clean(re.sub(r'<span class="evolveMarker">.*?</span>', "", name, flags=re.S))
    num = re.search(r'class="collectorNumber">\s*([^<]*?)\s*<', p)
    alpha = re.search(r'class="alpha">\s*([^<]*?)\s*<', p)
    exp = re.search(r'expansionCodes=([^"&]+)"[^>]*>(.*?)</a>', p, re.S)
    return [name, num.group(1) if num else "", alpha.group(1) if alpha else "",
            exp.group(1) if exp else ""], (exp.group(1), clean(exp.group(2))) if exp else None


def main():
    db = load("th/cards.json", {"sets": {}, "cards": {}})
    cards, sets = db["cards"], db["sets"]
    full = not cards or datetime.now().weekday() == 6  # full id scan on first run and Sundays
    ids, pages = list_ids(full)
    new = [i for i in dict.fromkeys(ids) if str(i) not in cards]
    print(f"{len(ids)} ids from {pages} pages, {len(new)} new", flush=True)
    for n, cid in enumerate(new[:MAX_DETAILS]):
        try:
            row, s = detail(cid)
        except Exception as e:
            print("skip", cid, e, flush=True)
            continue
        cards[str(cid)] = row
        if s:
            sets[s[0]] = s[1]
        if n % 200 == 0:
            print(f"detail {n}/{min(len(new), MAX_DETAILS)}", flush=True)
            save("th/cards.json", {"updated": TODAY, "source": "asia.pokemon-card.com/th", "sets": sets, "cards": cards})
    save("th/cards.json", {"updated": TODAY, "source": "asia.pokemon-card.com/th", "sets": sets, "cards": cards})
    print(f"catalog: {len(cards)} cards, {len(sets)} sets, {max(0, len(new) - MAX_DETAILS)} still to fetch", flush=True)


if __name__ == "__main__":
    main()
