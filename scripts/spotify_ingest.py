# scripts/spotify_ingest.py
import csv, json, os, re, glob, sys

OUT = "data/spotify.json"

COL_TITLE = ["エピソードのタイトル","タイトル","episode","title"]
COL_PLAYS = ["ストリーミング数とダウンロード数","再生","plays","streams","downloads"]
COL_RANK  = ["ランク","rank"]
COL_URI   = ["Episode URI","URI","Spotify","リンク"]

def log(msg): print(f"[spotify_ingest] {msg}")

def find_csv():
    cands = sorted(glob.glob("data/*.csv"))
    if not cands: return None
    pri = [p for p in cands if ("エピソード" in p and "ランキング" in p)]
    return (pri or cands)[-1]

def open_csv_guess(path):
    for enc in ("cp932","utf-8-sig","utf-8"):
        try:
            f = open(path, newline="", encoding=enc)
            reader = csv.DictReader(f); _ = reader.fieldnames; f.seek(0)
            log(f"open ok: {path} (encoding={enc})")
            return f
        except Exception as e:
            try: f.close()
            except: pass
            log(f"open failed with encoding={enc}: {e}")
    return None

def pick_key(keys, cands):
    keys = [str(k).strip() for k in (keys or [])]
    for cand in cands:
        for k in keys:
            if cand.lower() in k.lower():
                return k
    return None

def to_open_url(uri):
    if not uri: return ""
    m = re.match(r"spotify:episode:([A-Za-z0-9]+)", uri)
    return f"https://open.spotify.com/episode/{m.group(1)}" if m else uri

def write_json(rows):
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as w:
        json.dump(rows, w, ensure_ascii=False, indent=2)
    log(f"wrote {len(rows)} entries to {OUT}")

def main():
    src = find_csv()
    if not src or not os.path.exists(src):
        log("CSV not found under data/. write empty json and exit 0.")
        write_json([])
        return 0

    f = open_csv_guess(src)
    if not f:
        log("failed to open CSV with supported encodings. write empty json.")
        write_json([])
        return 0

    try:
        reader = csv.DictReader(f)
        keys = reader.fieldnames or []
        log(f"columns: {keys}")

        k_title = pick_key(keys, COL_TITLE)
        k_plays = pick_key(keys, COL_PLAYS)
        k_rank  = pick_key(keys, COL_RANK)
        k_uri   = pick_key(keys, COL_URI)

        if not k_title or not k_plays:
            log(f"required columns not found (title={k_title}, plays={k_plays}). write empty json.")
            write_json([])
            return 0

        rows = []
        for r in reader:
            title = (r.get(k_title) or "").strip()
            plays_s = (r.get(k_plays) or "0").replace(",","").strip()
            rank_s  = (r.get(k_rank)  or "").strip() if k_rank else ""
            uri     = (r.get(k_uri)   or "").strip() if k_uri else ""
            try: plays = int(plays_s)
            except: plays = 0
            try: rank = int(rank_s)
            except: rank  = 10**9
            rows.append({"title": title, "plays": plays, "rank": rank, "uri": to_open_url(uri)})

        rows.sort(key=lambda x: (x["rank"], -x["plays"]))
        write_json(rows)
        log(f"source: {src}")
        return 0

    except Exception as e:
        log(f"exception while parsing CSV: {e}. write empty json.")
        write_json([])
        return 0
    finally:
        try: f.close()
        except: pass

if __name__ == "__main__":
    sys.exit(main())
