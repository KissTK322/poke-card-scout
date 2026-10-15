"""Backtest: does the scoring model predict which cards go up?

For every card/date pair where we know the price at t and t+H, compute the model's factors
using only information available at t, then measure the forward return.
  - IC (information coefficient) = Spearman rank correlation, factor vs forward return, averaged over dates
  - quintile spread = mean return of top 20% scores minus bottom 20%
  - round-trip return (JP) = shop buy price at t+H / shop sell price at t − 1 (what a collector really gets)
Also runs a 30-day proxy check on English cards from Cardmarket avg1 vs avg30 so there is a result
from day one, clearly marked as a proxy.
Output: data/backtest/report.json
"""
import math
import os
import re
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, SHARDS, TODAY, load, save

HORIZONS = [7, 30, 90, 180]
WEIGHTS = {"char": 0.25, "rarity": 0.20, "momentum": 0.0, "liquidity": 0.0}


# ---------- model factors (kept in sync with js/data.js) ----------
def char_tiers():
    src = open(os.path.join(ROOT, "js", "data.js"), encoding="utf-8").read()
    block = src.split("export const CHAR_TIERS", 1)[1].split("];", 1)[0]
    tiers = []
    for score, keys in re.findall(r"score:\s*([\d.]+),\s*keys:\s*\[(.*?)\]", block, re.S):
        tiers.append((float(score), [k.lower() for k in re.findall(r'"([^"]+)"', keys)]))
    return tiers


TIERS = char_tiers()


def char_score(name):
    n = (name or "").lower()
    for score, keys in TIERS:
        if any(k in n for k in keys):
            return score
    return 0.4


JP_RARITY = {"SAR": 1.0, "SSR": 0.9, "CSR": 0.95, "MUR": 0.75, "UR": 0.75, "BWR": 0.75, "HR": 0.7, "SR": 0.7,
             "AR": 0.55, "CHR": 0.55, "K": 0.6, "PR": 0.5, "ACE": 0.4, "RRR": 0.3, "RR": 0.25, "TR": 0.3,
             "S": 0.5, "A": 0.45, "H": 0.3, "R": 0.2, "U": 0.15, "C": 0.1, "☆": 0.9, "★": 0.6}


def en_rarity(r):
    r = (r or "").lower()
    if "special illustration" in r: return 1.0
    if "illustration" in r: return 0.55
    if any(k in r for k in ["hyper", "secret", "rainbow", "gold", "mega hyper"]): return 0.75
    if any(k in r for k in ["star", "shining", "lv.x", "prime", "legend"]): return 0.9
    if "ultra" in r or "double" in r or "vmax" in r or "vstar" in r: return 0.3
    if "holo" in r: return 0.25
    return 0.12


# ---------- helpers ----------
def d2(s):
    y, m, d = map(int, s.split("-"))
    return date(y, m, d)


def value_at(series, day):
    """series: [[date, v...], ...] stored on change. Returns values at `day` or None if before first point."""
    best = None
    for p in series:
        if p[0] <= day:
            best = p
        else:
            break
    return best


def rank(xs):
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(a, b):
    if len(a) < 8:
        return None
    ra, rb = rank(a), rank(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    cov = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    va = math.sqrt(sum((x - ma) ** 2 for x in ra))
    vb = math.sqrt(sum((y - mb) ** 2 for y in rb))
    return cov / (va * vb) if va and vb else None


def summarize(rows, factors):
    """rows: list of dicts with factor values, 'score', 'ret', 'date'."""
    if not rows:
        return None
    by_date = {}
    for r in rows:
        by_date.setdefault(r["date"], []).append(r)
    ics = {f: [] for f in factors + ["score"]}
    for rs in by_date.values():
        for f in ics:
            ic = spearman([r[f] for r in rs], [r["ret"] for r in rs])
            if ic is not None:
                ics[f].append(ic)
    srt = sorted(rows, key=lambda r: r["score"])
    q = max(1, len(srt) // 5)
    bottom, top = srt[:q], srt[-q:]
    mean = lambda xs: sum(xs) / len(xs) if xs else None
    out = {
        "samples": len(rows),
        "dates": len(by_date),
        "ic": {f: (round(mean(v), 4) if v else None) for f, v in ics.items()},
        "top20_return": round(mean([r["ret"] for r in top]), 4),
        "bottom20_return": round(mean([r["ret"] for r in bottom]), 4),
        "all_return": round(mean([r["ret"] for r in rows]), 4),
        "hit_rate_top20": round(sum(1 for r in top if r["ret"] > 0) / len(top), 3),
    }
    if "rt" in rows[0]:
        out["top20_roundtrip"] = round(mean([r["rt"] for r in top]), 4)
        out["all_roundtrip"] = round(mean([r["rt"] for r in rows]), 4)
    pos = {f: max(0.0, v) for f, v in out["ic"].items() if f != "score" and v is not None}
    tot = sum(pos.values())
    out["suggested_weights"] = {f: round(v / tot, 3) for f, v in pos.items()} if tot else None
    return out


def load_history(market):
    h = {}
    for s in range(SHARDS):
        h.update(load(f"{market}/history/{s:02d}.json", {}))
    return h


def score_of(f):
    return 0.5 * f["char"] + 0.4 * f["rarity"] + 0.1 * f.get("liquidity", 0.5)


# ---------- JP forward backtest ----------
def jp_backtest():
    db = load("jp/cards.json", {})
    hist = load_history("jp")
    meta = {str(c[0]): c for c in db.get("cards", [])}
    first = min((s[0][0] for s in hist.values() if s), default=TODAY)
    results, need = {}, {}
    for H in HORIZONS:
        rows = []
        start = d2(first)
        end = d2(TODAY) - timedelta(days=H)
        day = start
        while day <= end:
            t, t2 = day.isoformat(), (day + timedelta(days=H)).isoformat()
            back = (day - timedelta(days=30)).isoformat()
            for cid, series in hist.items():
                c = meta.get(cid)
                a, b = value_at(series, t), value_at(series, t2)
                if not (c and a and b and a[1] and b[1]) or a[1] < 300:  # ignore bulk (< ¥300)
                    continue
                p = value_at(series, back)
                mom = (a[1] / p[1] - 1) if p and p[1] and series[0][0] <= back else 0.0
                spread = 1 - (a[2] / a[1]) if a[2] else 1.0
                f = {"char": char_score(c[1]), "rarity": JP_RARITY.get(c[2], 0.2),
                     "momentum": mom, "liquidity": 1 - min(1, max(0, spread)), "logprice": math.log(a[1])}
                rows.append({**f, "score": score_of(f), "date": t, "ret": b[1] / a[1] - 1,
                             "rt": ((b[2] or 0) / a[1] - 1)})
            day += timedelta(days=7)  # weekly rebalance dates
        res = summarize(rows, ["char", "rarity", "momentum", "liquidity", "logprice"])
        if res:
            results[str(H)] = res
        else:
            need[str(H)] = (d2(first) + timedelta(days=H)).isoformat()
    return {"history_since": first, "horizons": results, "ready_on": need}


# ---------- EN 30-day proxy (available on day one) ----------
def en_proxy():
    db = load("en/cards.json", {})
    sets = db.get("sets", {})
    rows = []
    for c in db.get("cards", []):
        cid, name, num, rarity, sid, usd, var, a1, a7, a30, trend = c
        if not (a30 and a7) or a30 < 2:
            continue
        rel = (sets.get(sid) or ["", ""])[1] or ""
        age = (d2(TODAY) - d2(rel.replace("/", "-"))).days / 365 if rel else 5
        f = {"char": char_score(name), "rarity": en_rarity(rarity), "logprice": math.log(a30),
             "age": min(age, 30) / 30}
        rows.append({**f, "score": score_of(f), "date": "proxy", "ret": a7 / a30 - 1})
    return summarize(rows, ["char", "rarity", "logprice", "age"])


def main():
    jp = jp_backtest()
    report = {
        "updated": TODAY,
        "jp_forward": jp,
        "en_proxy_30d": en_proxy(),
        "notes": [
            "jp_forward: true out-of-sample test on daily shop prices collected by this project; horizons appear once enough history exists.",
            "en_proxy_30d: Cardmarket 7-day average vs 30-day average for every English card — a recent-momentum proxy, not a true forward test.",
            "IC > 0.05 is meaningful for collectibles; negative IC means the factor pointed the wrong way.",
        ],
    }
    save("backtest/report.json", report)
    print({k: (v if k != "jp_forward" else {"since": v["history_since"], "ready": list(v["horizons"])}) for k, v in report.items() if k != "notes"})


if __name__ == "__main__":
    main()
