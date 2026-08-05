#!/usr/bin/env python3
# =============================================================================
# build_habti_words.py — يولّد habti-waqf-data.js من data/habti-stops.json.
#
# data/habti-stops.json يبقى مصدر الحقيقة الوحيد (راجع
# docs/habti-waqf-store.md) — هذا السكربت لا يضيف أو يعدّل أي بيانات،
# فقط يحوّل نفس السجلات إلى متغيّر JS (window.HABTI_WAQF_STOPS) يُحمَّل
# مباشرة عبر <script> في index.html، بنفس أسلوب باقي ملفات البيانات في
# هذا المشروع (waqf-positions.js، non-kufi-heads.js) — تضمين وقت البناء
# بدل fetch() وقت التشغيل، لأنه أبسط وأوثق للعمل بلا اتصال (Service
# Worker) ولا يضيف طلب شبكة إضافيًا.
#
# شغّله في كل مرة يتغيّر فيها data/habti-stops.json:
#   python3 tools/build_habti_words.py
#
# لا تُعدّل habti-waqf-data.js يدويًا أبدًا — أي تعديل يدوي فيه سيُفقَد
# ويصبح مصدر تعارض مع data/habti-stops.json في المرة القادمة التي
# يُشغَّل فيها هذا السكربت.
# =============================================================================

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "habti-stops.json"
OUTPUT = ROOT / "habti-waqf-data.js"


def main():
    with open(SOURCE, encoding="utf-8") as f:
        store = json.load(f)

    stops = store["stops"]

    # تحقق سلامة أساسي قبل التوليد — نفس الفحوصات الموثقة في
    # docs/habti-waqf-store.md، مطبَّقة هنا آليًا كخط دفاع أخير قبل
    # توليد الملف الذي يقرأه التطبيق فعليًا.
    seen_source_ids = set()
    seen_positions = set()
    for s in stops:
        if s["source_id"] in seen_source_ids:
            raise SystemExit(f"خطأ: source_id مكرر: {s['source_id']}")
        seen_source_ids.add(s["source_id"])
        key = (s["surah"], s["ayah"], s["position"])
        if key in seen_positions:
            raise SystemExit(f"خطأ: موضع مكرر: {key}")
        seen_positions.add(key)

    for batch in store["batches"]:
        actual = sum(1 for s in stops if s["batch"] == batch["id"])
        if actual != batch["count"]:
            raise SystemExit(
                f"خطأ: batches['{batch['id']}'].count={batch['count']} "
                f"لا يطابق العدد الفعلي {actual} في stops[]"
            )

    # مصفوفة مبسّطة وقت التشغيل: فقط الحقول التي يحتاجها العرض
    # (surah/ayah/position/word) — source_id وbatch بيانات تتبّع
    # خاصة بمخزن المصدر نفسه، لا حاجة لهما في التطبيق.
    runtime_stops = [
        {"surah": s["surah"], "ayah": s["ayah"], "position": s["position"], "word": s["word"]}
        for s in stops
    ]

    header = (
        "// habti-waqf-data.js — يُولَّد آليًا من data/habti-stops.json\n"
        "// عبر tools/build_habti_words.py. لا تُعدّله يدويًا.\n"
        "// راجع docs/habti-waqf-store.md لبنية البيانات والمنهجية الكاملة.\n"
        f"// توليد تلقائي — {len(runtime_stops)} موضعًا.\n"
    )
    body = "window.HABTI_WAQF_STOPS = " + json.dumps(runtime_stops, ensure_ascii=False) + ";\n"

    OUTPUT.write_text(header + body, encoding="utf-8")
    print(f"تم توليد {OUTPUT.relative_to(ROOT)} — {len(runtime_stops)} موضعًا.")


if __name__ == "__main__":
    main()
