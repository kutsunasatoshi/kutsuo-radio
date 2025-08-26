# scripts/spotify_ingest.py
# 目的: data/＜CSVファイル＞ を読み込み、data/spotify.json を生成する
# 使う列（日本語ヘッダー）:
#   - エピソードのタイトル
#   - ストリーミング数とダウンロード数
#   - ランク（任意）
#   - Episode URI（任意）

import csv, json, os

# ★ CSVファイル名をあなたの実ファイル名に合わせること
INPUT = "data/くつ王レディオ_エピソードランキング_全期間.csv"
OUT   = "data/spotify.json"

def main():
    if not os.path.exists(INPUT):
        print(f"[warn] CSV not found: {INPUT}")
        return

    rows = []
    with open(INPUT, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            title = (r.get("エピソードのタイトル") or "").strip()
            plays = (r.get("ストリーミング数とダウンロード数") or "0").replace(",", "").strip()
            rank  = (r.get("ランク") or "").strip()
            uri   = (r.get("Episode URI") or "").strip()
            try:
                plays_i = int(plays)
            except ValueError:
                plays_i = 0
            try:
                rank_i = int(rank)
            except ValueError:
                rank_i = 10**9  # ランクが無いものは末尾へ

            rows.append({
                "title": title,
                "plays": plays_i,
                "rank":  rank_i,
                "uri":   uri
            })

    # ランク優先 → 次に再生数で降順
    rows.sort(key=lambda x: (x["rank"], -x["plays"]))

    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f"wrote {len(rows)} entries to {OUT}")

if __name__ == "__main__":
    main()
