# -*- coding: utf-8 -*-
# RSSから data/episodes.json を生成して保存するスクリプトである。
# GitHub Actions から毎日実行され、自動デプロイされる。

import re, json, os, urllib.request, xml.etree.ElementTree as ET

FEED = "https://anchor.fm/s/10684950c/podcast/rss"
OUT  = "data/episodes.json"

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
    (r"BMC Medicine", "BMC Medicine"),
    (r"BMJ\b", "BMJ"),
    (r"MMWR", "MMWR"),
]

INFECTIONS = {
    "COVID-19": r"COVID|SARS-CoV-2|XBB|JN\.1|mRNA|オミクロン",
    "インフルエンザ": r"インフル|Influenza|H5N1|HPAI",
    "結核": r"結核|tuberculosis|TB",
    "SFTS": r"\bSFTS\b|重症熱性血小板減少症候群",
    "HIV": r"\bHIV\b|AIDS",
    "性感染症": r"淋|梅毒|STI|性病|クラミジア|HPV|mpox",
    "真菌症": r"カンジダ|アスペル|fung|mycosis|Aspergillus|Candida|Histoplasma",
    "ダニ媒介": r"ダニ|リケッチア|紅斑熱|ツツガムシ|アナプラズマ",
    "抗菌薬耐性菌": r"CRE|耐性|ESBL|MRSA|MDR|緑膿菌|アシネト|CPE|セフィデロコル",
    "寄生虫症": r"マラリア|Vivax|寄生虫",
    "その他": r".*"
}

DESIGNS = {
    "レビュー": r"レビュー|review|primer|overview|update",
    "ガイドライン": r"ガイドライン|guideline|recommendation|strategy",
    "RCT": r"無作為|random|trial|第[1-4]相|phase\s?[1-4]",
    "前向きコホート": r"前向き|prospective",
    "後ろ向きコホート": r"後ろ向き|retrospective",
    "サーベイランス": r"サーベイランス|surveillance|registry|cohort",
    "症例報告": r"症例|case report|case series",
}

def guess_journal(title):
    for pat, name in JMAP:
        if re.search(pat, title, re.I): return name
    if "　" in title:
        maybe = title.rsplit("　", 1)[-1]
        for pat, name in JMAP:
            if re.search(pat, maybe, re.I): return name
    return ""

def guess(patterns, text, default):
    for k, pat in patterns.items():
        if re.search(pat, text, re.I): return k
    return default

# RSS取得 → パース
xml = urllib.request.urlopen(FEED, timeout=30).read().decode("utf-8")
root = ET.fromstring(xml)
items = root.find('channel').findall('item')

data = []
for it in items:
    title = (it.findtext('title') or "").strip()
    link  = (it.findtext('link')  or "").strip()
    pub   = (it.findtext('pubDate') or "").strip()
    guid  = (it.findtext('guid')  or "").strip()
    _id   = guid or link or title
    data.append({
        "id": _id,
        "title": title,
        "url": link,
        "pubDate": pub,
        "journal":       guess_journal(title),
        "infection_type":guess(INFECTIONS, title, "その他"),
        "study_design":  guess(DESIGNS, title, "不明")
    })

os.makedirs("data", exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"wrote {len(data)} records to {OUT}")
