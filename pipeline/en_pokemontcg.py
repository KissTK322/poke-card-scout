"""English market: TCGplayer market price + Cardmarket averages for every English card.

Source: api.pokemontcg.io v2 (free; set POKEMONTCG_API_KEY for higher limits).
Output:
  data/en/cards.json  {"updated", "sets": {id: [name, releaseDate, printedTotal]},
                       "cards": [[id, name, number, rarity, set_id, usd, variant, eur_avg1, eur_avg7, eur_avg30, eur_trend], ...]}
  data/en/history/*.json  per-card [[date, usd, eur_trend], ...]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TODAY, append_history, fetch, load, save

API = "https://api.pokemontcg.io/v2/cards"
VARIANT_ORDER = ["holofoil", "normal", "reverseHolofoil", "1stEditionHolofoil", "unlimitedHolofoil", "1stEdition", "unlimited"]


def main():
    key = os.environ.get("POKEMONTCG_API_KEY")
    headers = {"X-Api-Key": key} if key else {}
    sets, cards, page = {}, [], 1
    while True:
        url = f"{API}?page={page}&pageSize=250&select=id,name,number,rarity,set,tcgplayer,cardmarket"
        d = json.loads(fetch(url, delay=2.2 if not key else 0.5, headers=headers, retries=10))
        for c in d["data"]:
            s = c["set"]
            sets.setdefault(s["id"], [s["name"], s.get("releaseDate", ""), s.get("printedTotal")])
            prices = (c.get("tcgplayer") or {}).get("prices") or {}
            usd, variant = None, ""
            for v in VARIANT_ORDER + list(prices):
                p = prices.get(v) or {}
                if p.get("market"):
                    usd, variant = p["market"], v
                    break
            cm = (c.get("cardmarket") or {}).get("prices") or {}
            cards.append([c["id"], c["name"], c["number"], c.get("rarity", ""), s["id"], usd, variant,
                          cm.get("avg1"), cm.get("avg7"), cm.get("avg30"), cm.get("trendPrice")])
        print(f"page {page}: {len(cards)}/{d['totalCount']}", flush=True)
        if page * 250 >= d["totalCount"]:
            break
        page += 1

    old = load("en/cards.json", {})
    if old.get("cards") and len(cards) < 0.9 * len(old["cards"]):
        sys.exit(f"only {len(cards)} cards vs {len(old['cards'])} before — refusing to overwrite")
    save("en/cards.json", {"updated": TODAY, "source": "pokemontcg.io (TCGplayer, Cardmarket)", "sets": sets, "cards": cards})
    changed = append_history("en", {c[0]: [c[5], c[10]] for c in cards if c[5] or c[10]})
    print(f"saved {len(cards)} cards, {changed} price changes", flush=True)


if __name__ == "__main__":
    main()
