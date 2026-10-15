"""PSA population for tracked cards (optional — runs only when the PSA_TOKEN secret is set).

Get a free token at https://www.psacard.com/publicapi and add it as the repo secret PSA_TOKEN.
Track cards by adding PSA cert numbers (any slab of that card) to pipeline/psa_track.json:
  {"certs": ["12345678", ...]}
The free tier allows few calls per day, so each run uses at most PSA_BUDGET calls.
Output: data/psa/pop.json {spec_id: {"desc", "total", "grades": {"10": n, "9": n, ...}, "updated"}}
        data/psa/history/*.json per spec [[date, pop10, total], ...]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TODAY, append_history, fetch, load, save

API = "https://api.psacard.com/publicapi"
HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    token = os.environ.get("PSA_TOKEN")
    if not token:
        print("PSA_TOKEN not set — skipping PSA population")
        return
    budget = int(os.environ.get("PSA_BUDGET", "20"))
    headers = {"Authorization": f"Bearer {token}"}
    track = json.load(open(os.path.join(HERE, "psa_track.json"), encoding="utf-8"))
    pop = load("psa/pop.json", {})
    cert_spec = load("psa/cert_spec.json", {})

    def call(path):
        nonlocal budget
        if budget <= 0:
            raise StopIteration
        budget -= 1
        return json.loads(fetch(f"{API}{path}", delay=1, headers=headers))

    try:
        for cert in track.get("certs", []):
            if cert not in cert_spec:
                c = call(f"/cert/GetByCertNumber/{cert}").get("PSACert") or {}
                if c.get("SpecID"):
                    cert_spec[cert] = c["SpecID"]
        # refresh the specs updated longest ago first
        specs = sorted(set(cert_spec.values()), key=lambda s: pop.get(str(s), {}).get("updated", ""))
        for spec in specs:
            r = call(f"/pop/GetPSASpecPopulation/{spec}")
            d = r.get("PSAPop") or {}
            grades = {k[5:].replace("_", "."): v for k, v in d.items()
                      if k.startswith("Grade") and not k.endswith("Q") and isinstance(v, int)}
            pop[str(spec)] = {"desc": r.get("Description", ""), "total": d.get("Total"), "grades": grades, "updated": TODAY}
    except StopIteration:
        print("PSA call budget used up for today")
    save("psa/pop.json", pop)
    save("psa/cert_spec.json", cert_spec)
    append_history("psa", {k: [v["grades"].get("10"), v["total"]] for k, v in pop.items() if v.get("updated") == TODAY})
    print(f"{len(pop)} specs tracked")


if __name__ == "__main__":
    main()
