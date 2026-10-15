"""Shared helpers for the data pipeline (stdlib only)."""
import gzip
import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = "PokeCardScoutBot/1.0 (+https://github.com/KissTK322/poke-card-scout; personal price tracker)"
TODAY = datetime.now(timezone(timedelta(hours=7))).strftime("%Y-%m-%d")  # Bangkok date
SHARDS = 64

_last = {}


def fetch(url, delay=1.5, headers=None, retries=3, binary=False):
    """GET with a per-host delay, polite UA, gzip support and simple retries."""
    host = url.split("/")[2]
    wait = delay - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    h = {"User-Agent": UA, "Accept-Encoding": "gzip", "Accept-Language": "ja,th,en;q=0.8"}
    h.update(headers or {})
    for attempt in range(retries):
        try:
            _last[host] = time.time()
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return body if binary else body.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                raise
            time.sleep(5 * (attempt + 1))
        except Exception:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"failed: {url}")


def load(path, default):
    p = os.path.join(DATA, path)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(path, obj):
    p = os.path.join(DATA, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def shard_of(key):
    h = 0
    for ch in str(key):
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % SHARDS


def append_history(market, rows):
    """rows: {card_id: [v1, v2, ...]} -> data/<market>/history/<shard>.json
    Each card keeps [[date, v1, v2, ...], ...]; a point is added only when values change
    (and always on the first day), so files stay small."""
    by_shard = {}
    for cid, vals in rows.items():
        by_shard.setdefault(shard_of(cid), {})[cid] = vals
    changed = 0
    for s, items in by_shard.items():
        path = f"{market}/history/{s:02d}.json"
        hist = load(path, {})
        for cid, vals in items.items():
            series = hist.setdefault(cid, [])
            if not series or series[-1][1:] != vals:
                if series and series[-1][0] == TODAY:
                    series[-1] = [TODAY, *vals]
                else:
                    series.append([TODAY, *vals])
                changed += 1
        save(path, hist)
    return changed
