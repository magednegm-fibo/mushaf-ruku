#!/usr/bin/env python3
# =============================================================================
# find_word.py — يساعد على إيجاد رقم الصفحة ورمز QCF الصحيح لكلمة جديدة،
# تمهيدًا لإضافتها إلى qcf-words.json.
# =============================================================================
#
# الاستخدام:
#   python3 tools/find_word.py <رقم السورة> <رقم الآية>
#
# مثال:
#   python3 tools/find_word.py 2 43
#
# يطبع كل كلمات الآية مرقَّمة (بنفس ترقيم موضع الكلمة الطبيعي، يبدأ من 1)،
# مع رقم صفحة مصحف المدينة التي تقع عليها الآية، ورمز QCF (qpcV2) الرسمي
# لكل كلمة على حدة — انسخ القيم التي تحتاجها إلى qcf-words.json يدويًا.
#
# يحتاج اتصالًا بالإنترنت (يقرأ من نفس المصدر العلني المستخدم في بناء هذا
# المشروع أصلًا: مستودع zonetecde/mushaf-layout على GitHub، وهو انعكاس
# لبيانات مجمّع الملك فهد الرسمية). لا يعتمد على أي معرفة خاصة بهذا الـChat.
# =============================================================================

import sys
import json
import urllib.request

BASE = "https://raw.githubusercontent.com/zonetecde/mushaf-layout/refs/heads/main/mushaf/page-{:03d}.json"


def fetch_page(n):
    url = BASE.format(n)
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def page_ayah_range(pagedata):
    lo = hi = None
    for line in pagedata.get("lines", []):
        for w in line.get("words", []):
            if not isinstance(w, dict):
                continue
            loc = w.get("location")
            if not loc:
                continue
            parts = loc.split(":")
            if len(parts) < 2:
                continue
            key = (int(parts[0]), int(parts[1]))
            if lo is None or key < lo:
                lo = key
            if hi is None or key > hi:
                hi = key
    return lo, hi


def find_page(surah, ayah, lo=1, hi=604):
    target = (surah, ayah)
    tries = 0
    while lo <= hi and tries < 12:
        tries += 1
        mid = (lo + hi) // 2
        data = fetch_page(mid)
        rng = page_ayah_range(data)
        if rng[0] is None:
            hi = mid - 1
            continue
        pmin, pmax = rng
        if pmin <= target <= pmax:
            return mid, data
        elif target < pmin:
            hi = mid - 1
        else:
            lo = mid + 1
    return None, None


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: python3 find_word.py <surah> <ayah>")
    surah, ayah = int(sys.argv[1]), int(sys.argv[2])

    print(f"جاري البحث عن صفحة السورة {surah} الآية {ayah} ...")
    page, data = find_page(surah, ayah)
    if page is None:
        sys.exit("تعذّر إيجاد الصفحة — تحقق من رقم السورة/الآية، أو من الاتصال بالإنترنت.")

    print(f"\nالصفحة: {page}")
    print(f"نزّل ملف الخط من qul.tarteel.ai/resources/font/240 وضعه في "
          f"tools/qcf_source_fonts/p{page}.ttf إن لم يكن موجودًا بالفعل.\n")

    print(f"{'الموضع':<8}{'الكلمة':<20}{'رمز QCF (qpcV2)':<20}")
    print("-" * 48)
    position = 0
    for line in data.get("lines", []):
        for w in line.get("words", []):
            if not isinstance(w, dict):
                continue
            loc = w.get("location", "")
            if not loc.startswith(f"{surah}:{ayah}:"):
                continue
            position += 1
            word_text = w.get("word", "")
            v2 = w.get("qpcV2", "")
            # الكلمة الأخيرة في الآية: يُلصَق بها رمز دائرة رقم الآية كرمز
            # ثانٍ — يُستخدَم الرمز الأول فقط (كلمة نفسها)، ويُسقَط الثاني
            # عمدًا (التطبيق يرسم دائرة رقم الآية بنفسه بشكل منفصل).
            v2_word_only = v2.split(" ")[0] if v2 else ""
            codepoint_hex = f"{ord(v2_word_only[0]):04X}" if v2_word_only else "?"
            print(f"{position:<8}{word_text:<20}{codepoint_hex:<20}")

    print(f"\nمثال لإضافته في qcf-words.json (عدّل position/codepoint/label حسب الكلمة المطلوبة):")
    print(json.dumps({
        "surah": surah, "ayah": ayah, "position": 1,
        "page": page, "codepoint": "XXXX", "label": "..."
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
