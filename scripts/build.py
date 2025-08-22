# -*- coding: utf-8 -*-
# 高速2段構えビルド:
#  - data/index.json …… 一覧・検索用（軽量）
#  - data/ep/<slug>.json …… 各エピソード詳細（必要時のみ取得）
#
# 変更点：RSSの<link>を公開用URLへ正規化（creators → podcasters など）

import re, json, os, urllib.request, urllib.parse, xml.etree.ElementTree as ET, hashlib
from html import unescape

FEED = "https://anchor.fm/s/10684950c/podcast/rss"
OUT_INDEX = "data/index.json"
OUT_DIR_EP = "data/ep"

# ------------------------ ユーティリティ ------------------------
def norm(s: str) -> str:
    s = (s or "").strip().replace("\u3000", " ")
    return re.sub(r"\s+", " ", s)

def slugify(s: str) -> str:
    return hashlib.sha1((s or "").encode("utf-8", errors="ignore")).hexdigest()[:16]

def truncate_multiline(text: str, max_lines=3, max_chars=220) -> str:
    if not text: return ""
    lines = text.split("\n")
    clipped = "\n".join(lines[:max_lines])
    return (clipped[:max_chars-1] + "…") if len(clipped) > max_chars else clipped

# ----------- creators / anchor のリンクを公開用に正規化 -----------
def to_public_url(link: str) -> str:
    """
    RSSの<link>をリスナー向け公開URLへ変換する。
    例) creators.spotify.com → podcasters.spotify.com/pod/show/<handle>/episodes/<slug>
        anchor.fm → podcasters.spotify.com/pod/show/… に寄せる
    """
    if not link: return ""
    link = link.strip()

    # 旧Anchorドメインは podcasters (公開ページ) に寄せる
    if link.startswith("https://anchor.fm/"):
        link = link.replace("https://anchor.fm/", "https://podcasters.spotify.com/")

    # クリエイター用URL → 公開用URL
    # 例) https://creators.spotify.com/pod/profile/<handle>/episodes/<slug>
    m = re.match(r"https://creators\.spotify\.com/pod/profile/([^/]+)/episodes/([^/?#]+)", link)
    if m:
        handle, slug = m.groups()
        return f"https://podcasters.spotify.com/pod/show/{handle}/episodes/{slug}"

    return link

# ------------------------ 掲載誌（略称） ------------------------
JMAP = [
    (r"\bNEJM\b|New England Journal", "NEJM"),
    (r"Lancet Infectious Diseases|Lancet ID", "Lancet ID"),
    (r"\bLancet\b(?! ID)", "Lancet"),
    (r"JAMA Network Open", "JAMA Netw Open"),
    (r"\bJAMA\b", "JAMA"),
    (r"Clinical Infectious Diseases|CID\b", "CID"),
    (r"Open Forum Infectious Diseases|OFID\b", "OFID"),
    (r"Emerging Infectious Diseases|EID\b", "EID"),
    (r"Eurosurveillance", "Eurosurveillance"),
    (r"Infection Control & Hospital Epidemiology|ICHE\b", "ICHE"),
    (r"Journal of Hospital Infection|JHI\b", "JHI"),
    (r"International Journal of Infectious Diseases|IJID\b", "IJID"),
    (r"Journal of Infection(?! and Chemotherapy)", "Journal of Infection"),
    (r"Journal of Infection and Chemotherapy", "J Infect Chemother"),
    (r"Nature Reviews Disease Primers", "NRDP"),
    (r"Nature Reviews Microbiology", "NRevMicro"),
    (r"Nature Communications", "Nat Commun"),
    (r"\bBMJ\b", "BMJ"),
    (r"\bMMWR\b", "MMWR"),
    (r"BMC Medicine", "BMC Medicine"),
]

def guess_journal(title: str) -> str:
    for pat, name in JMAP:
        if re.search(pat, title or "", re.I): return name
    if "　" in (title or ""):
        maybe = title.rsplit("　", 1)[-1]
        for pat, name in JMAP:
            if re.search(pat, maybe or "", re.I): return name
    return ""

# ------------------------ 分類辞書 ------------------------
INFECTION_PATHOGEN = {
    "COVID-19": r"COVID|SARS[- ]?CoV[- ]?2|コロナ",
    "インフルエンザ": r"インフル|Influenza|H5N1|HPAI",
    "SFTS": r"\bSFTS\b|重症熱性血小板減少症候群",
    "結核": r"結核|tuberculosis|M\.?\s?tuberculosis",
    "アスペルギルス": r"Aspergillus|アスペル",
    "チクングニア": r"Chikungunya|チクングニア",
    "デング": r"Dengue|デング",
    "ジカ": r"Zika|ジカ",
    "HIV": r"\bHIV\b|AIDS",
    "ペスト": r"Yersinia pestis|ペスト",
    "レジオネラ": r"Legionella|レジオネラ",
    "感染性心内膜炎": r"心内膜炎|endocarditis",
    "尿路感染症": r"尿路感染|UTI",
    "肺炎": r"肺炎|pneumoni",
    "菌血症/BSI": r"菌血症|BSI|bloodstream infection",
    "CRBSI": r"\bCRBSI\b|カテーテル関連血流感染",
    "黄色ブドウ球菌": r"Staphylococcus aureus|黄色ブドウ球菌|S\.?\s?aureus",
    "緑膿菌": r"Pseudomonas aeruginosa|緑膿菌|P\.?\s?aeruginosa",
    "腸球菌": r"Enterococcus|腸球菌",
    "CNS": r"coagulase[- ]negative staphylococci|CNS|コアグラーゼ陰性",
    "カンジダ": r"Candida|カンジダ",
    "麻疹": r"麻疹|measles",
    "風疹": r"風疹|rubella",
    "マラリア": r"malaria|マラリア|Plasmodium",
    "腸チフス": r"typhoid|腸チフス|Salmonella Typhi",
    "CRE": r"\bCRE\b|carbapenem[- ]resistant.*Enterobacter",
    "VRE": r"\bVRE\b|vancomycin[- ]resistant.*Enterococc",
    "MRSA": r"\bMRSA\b",
    "アシネトバクター": r"Acinetobacter|アシネト",
    "腸内細菌目": r"Enterobacterales|腸内細菌目",
    "エボラ": r"Ebola|エボラ",
    "日本紅斑熱": r"日本紅斑熱|Japanese Spotted Fever|Rickettsia japonica",
    "ツツガムシ病": r"tsutsugamushi|Orientia tsutsugamushi|ツツガムシ",
    "肺炎球菌": r"Streptococcus pneumoniae|肺炎球菌",
    "髄膜炎菌": r"Neisseria meningitidis|髄膜炎菌",
    "淋菌": r"Neisseria gonorrhoeae|淋菌",
    "クラミジア": r"Chlamydia trachomatis|クラミジア",
    "梅毒": r"Treponema pallidum|梅毒",
    "真菌": r"真菌|fungal|mycos",
    "帯状疱疹": r"帯状疱疹|zoster|VZV",
    "溶連菌": r"溶連菌|Streptococcus (?:pyogenes|agalactiae)|GAS|GBS",
    "かぜ": r"かぜ|風邪|common cold",
    "CMV": r"\bCMV\b|cytomegalovirus|サイトメガロ",
    "エムポックス": r"\bmpox\b|monkeypox|サル痘",
    "ウイルス": r"\bvirus\b|ウイルス",
    "SSI": r"\bSSI\b|手術部位感染|surgical site infection",
    "髄膜炎": r"髄膜炎|meningitis",
    "胆嚢炎": r"胆嚢炎|cholecystitis",
    "肝膿瘍": r"肝膿瘍|liver abscess",
    "前立腺炎": r"前立腺炎|prostatitis",
    "皮膚軟部組織感染症": r"皮膚|軟部|SSTI|cellulitis|膿瘍",
    "関節炎": r"関節炎|arthritis|化膿性関節炎",
}
TOPICS = {
    "ワクチン": r"ワクチン|vaccine|immuni[sz]ation",
    "抗菌薬": r"抗菌薬|antibiotic|β-?lactam|penem|cef|macrolide|doxy|fosfomycin|aminoglycoside",
    "疫学": r"疫学|epidemiolog|incidence|prevalence|trend",
    "診断": r"診断|NAAT|PCR|抗原|culture|迅速検査|sequenc",
    "感染対策": r"感染対策|手指衛生|outbreak|サーベイランス|surveillance|ICHE|JHI",
    "抗ウイルス薬": r"抗ウイルス|antiviral|nirmatrelvir|favipiravir|remdesivir|oseltamivir",
    "抗真菌薬": r"抗真菌|antifungal|azole|echinocandin|amphotericin",
    "抗原虫薬": r"antiprotozoal|抗原虫|chloroquine|artemisinin|tafenoquine",
    "病原体": r"(?:病原体|pathogen|bacteri|virus|fungi)"
}
FREE_TAGS = {
    "熱帯医学": r"マラリア|デング|チクングニア|ジカ|熱帯|tropical",
    "節足動物媒介感染症": r"蚊|ダニ|ベクター|vector[- ]borne|媒介",
    "One Health": r"One Health|動物|家畜|環境微生物",
    "免疫不全": r"免疫不全|immunocompromised|免疫低下",
    "移植": r"移植|transplant|移植後",
    "性感染症": r"性感|性行為感染|sexually transmitted|STI",
    "耐性菌": r"耐性|AMR|resistan|CRE|VRE|MRSA|ESBL|CPE",
    "小児": r"小児|小児科|pediatric|children",
    "周産期": r"妊娠|妊婦|周産期|neonat|perinatal|pregnan",
    "外科感染症": r"手術|術後|外科|SSI",
    "人工物感染症": r"カテ|人工|デバイス|プロテーゼ|留置|device|prosthe",
    "アウトブレイク": r"outbreak|アウトブレイク",
    "サーベイランス": r"surveillance|サーベイランス",
    "院内感染": r"healthcare[- ]associated|hospital[- ]acquired|院内感染|医療関連感染",
    "重症": r"severe|重症|ICU|集中治療",
    "高齢者": r"高齢者|elderly|older adult|高齢|frail",
    "妊娠": r"pregnan|妊娠|妊婦",
}

def pick_many(text: str, patterns: dict) -> list:
    found = []
    for label, pat in patterns.items():
        if re.search(pat, text or "", re.I): found.append(label)
    order = {k: i for i, k in enumerate(patterns.keys())}
    return sorted(set(found), key=lambda x: order.get(x, 10**9))

# ------------------------ 要旨（改行保持） ------------------------
def strip_html_preserve_newlines(s: str) -> str:
    if not s: return ""
    s = unescape(s)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</p\s*>", "\n\n", s)
    s = re.sub(r"(?i)</li\s*>", "\n", s)
    s = re.sub(r"(?i)</h[1-6]\s*>", "\n\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"\n{3,}", "\n\n", s)
    lines = [re.sub(r"[ \t]{2,}", " ", ln.strip()) for ln in s.split("\n")]
    return "\n".join(lines).strip()

def pick_summary(item: ET.Element) -> str:
    desc = item.findtext("description")
    if desc: return strip_html_preserve_newlines(desc)
    for tag in item:
        if tag.tag.lower().endswith("summary") and (tag.text or "").strip():
            return strip_html_preserve_newlines(tag.text or "")
    for tag in item:
        if tag.tag.lower().endswith("encoded") and (tag.text or "").strip():
            return strip_html_preserve_newlines(tag.text or "")
    return ""

# ------------------------ ビルド本体 ------------------------
def main():
    xml = urllib.request.urlopen(FEED, timeout=30).read().decode("utf-8", errors="ignore")
    root = ET.fromstring(xml)
    items = root.find("channel").findall("item")

    os.makedirs("data", exist_ok=True)
    os.makedirs(OUT_DIR_EP, exist_ok=True)

    index = []
    for it in items:
        title = norm(it.findtext("title") or "")
        link  = norm(it.findtext("link")  or "")
        link  = to_public_url(link)               # ★ 公開用URLへ正規化
        pub   = norm(it.findtext("pubDate") or "")
        guid  = norm(it.findtext("guid")    or "")
        summary = pick_summary(it)

        _id = guid or link or title
        slug = slugify(_id)

        base = {
            "id": _id,
            "slug": slug,
            "title": title,
            "url": link,            # ← 公開用URL
            "pubDate": pub,
            "journal": guess_journal(title),
            "pathogens": pick_many(title, INFECTION_PATHOGEN),
            "topics":    pick_many(title, TOPICS),
            "tags":      pick_many(title, FREE_TAGS),
        }
        base["infection_type"] = base["pathogens"][0] if base["pathogens"] else "その他"

        t = title
        if   re.search(r"レビュー|review|primer|overview|update", t, re.I): base["study_design"]="レビュー"
        elif re.search(r"guideline|ガイドライン|recommendation|strategy", t, re.I): base["study_design"]="ガイドライン"
        elif re.search(r"random|無作為|第[1-4]相|phase\s?[1-4]|trial", t, re.I):  base["study_design"]="RCT"
        elif re.search(r"前向き|prospective", t, re.I): base["study_design"]="前向きコホート"
        elif re.search(r"後ろ向き|retrospective", t, re.I): base["study_design"]="後ろ向きコホート"
        elif re.search(r"サーベイランス|surveillance|registry|cohort", t, re.I): base["study_design"]="サーベイランス"
        elif re.search(r"症例|case report|case series", t, re.I): base["study_design"]="症例報告"
        else: base["study_design"]="不明"

        # 詳細JSON（各1件）
        detail = dict(base)
        detail["summary"] = summary
        with open(os.path.join(OUT_DIR_EP, f"{slug}.json"), "w", encoding="utf-8") as f:
            json.dump(detail, f, ensure_ascii=False, indent=2)

        # 軽量 index.json 行（要旨短縮）
        row = dict(base)
        row["summary_short"] = truncate_multiline(summary, 3, 220)
        index.append(row)

    # 新着順
    index.sort(key=lambda x: x.get("pubDate", ""), reverse=True)
    with open(OUT_INDEX, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"wrote {len(index)} records to {OUT_INDEX} and details to {OUT_DIR_EP}/<slug>.json")

if __name__ == "__main__":
    main()
