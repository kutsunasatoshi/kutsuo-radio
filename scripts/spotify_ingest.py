import csv, json, os, re, glob
OUT = "data/spotify.json"
COL_TITLE = ["エピソードのタイトル","タイトル","episode","title"]
COL_PLAYS = ["ストリーミング数とダウンロード数","再生","plays","streams","downloads"]
COL_RANK  = ["ランク","rank"]
COL_URI   = ["Episode URI","URI","Spotify","リンク"]

def find_csv():
    cands = sorted(glob.glob("data/*.csv"))
    if not cands: return None
    pri = [p for p in cands if ("エピソード" in p and "ランキング" in p)]
    return (pri or cands)[-1]

def open_csv_guess(path):
    for enc in ("cp932","utf-8-sig","utf-8"):
        try:
            f = open(path, newline="", encoding=enc); csv.DictReader(f); f.seek(0); return f
        except Exception:
            try: f.close()
            except: pass
    raise RuntimeError("CSV encoding not supported. Try UTF-8 or cp932.")

def pick_key(keys, cands):
    for k in keys:
        k2 = str(k).strip().lower()
        for pat in cands:
            if pat.lower() in k2: return k
    return None

def to_open_url(uri):
    if not uri: return ""
    m = re.match(r"spotify:episode:([A-Za-z0-9]+)", uri)
    return f"https://open.spotify.com/episode/{m.group(1)}" if m else uri

def main():
    src = find_csv()
    if not src or not os.path.exists(src):
        print("[warn] CSV not found under data/. Put Spotify CSV there and rerun."); return
    f = open_csv_guess(src)
    reader = csv.DictReader(f); keys = reader.fieldnames or []
    k_title = pick_key(keys, COL_TITLE); k_plays = pick_key(keys, COL_PLAYS)
    k_rank  = pick_key(keys, COL_RANK ); k_uri   = pick_key(keys, COL_URI)
    rows=[]
    for r in reader:
        title = (r.get(k_title) or "").strip()
        plays_s = (r.get(k_plays) or "0").replace(",","").strip()
        rank_s  = (r.get(k_rank)  or "").strip()
        uri     = (r.get(k_uri)   or "").strip()
        try: plays = int(plays_s)
        except: plays = 0
        try: rank = int(rank_s)
        except: rank = 10**9
        rows.append({"title": title, "plays": plays, "rank": rank, "uri": to_open_url(uri)})
    rows.sort(key=lambda x: (x["rank"], -x["plays"]))
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as w:
        json.dump(rows, w, ensure_ascii=False, indent=2)
    f.close()
    print(f"wrote {len(rows)} entries to {OUT} from {src}")

if __name__ == "__main__":
    main()
