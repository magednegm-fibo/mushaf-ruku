#!/usr/bin/env python3
# =============================================================================
# build_qcf_font.py — يبني fonts/qcf-merged.woff2 ويحدّث جدول qcf-override.js
# تلقائيًا، من قائمة الكلمات في qcf-words.json وملفات QCF المصدرية.
# =============================================================================
#
# الاستخدام:
#   python3 tools/build_qcf_font.py
#
# المدخلات المطلوبة (راجع tools/README.md للتفصيل الكامل):
#   1. tools/qcf-words.json          — قائمة الكلمات المعتمدة (تُحرَّر يدويًا)
#   2. tools/qcf_source_fonts/pN.ttf — ملف QCF الرسمي الأصلي لكل رقم صفحة
#                                       مذكور في qcf-words.json (يُنزَّل يدويًا
#                                       من qul.tarteel.ai/resources/font/240 —
#                                       هذه الملفات محمية الحقوق ولا يجوز
#                                       تضمينها في هذا المستودع مباشرة).
#
# المخرجات:
#   1. fonts/qcf-merged.woff2   — خط واحد مُجمَّع يحتوي كل الكلمات المعتمدة
#   2. qcf-override.js          — يُحدَّث تلقائيًا (جدول QCF_OVERRIDE_TABLE
#                                  فقط، بين علامتين واضحتين)، بلا أي تحرير يدوي
#
# التحقق الإلزامي المدمج (لا يمكن تجاوزه):
#   قبل بناء أي شيء، يتحقق السكربت أن كل كلمة في qcf-words.json موجودة
#   فعليًا عند نفس الموضع (position) في نص الآية الحقيقي من data.js —
#   عبر تشغيل نفس منطق التقطيع الحقيقي المستخدم في التطبيق (tokenize.js،
#   نسخة طبق الأصل من دالة tokenizeAyahWords في readerManager.js). إن لم
#   تتطابق كلمة واحدة، يتوقف البناء فورًا برسالة خطأ واضحة، ولا يُنتج أي
#   ملف. هذا يمنع أي احتمال لاستبدال كلمة خاطئة بصمت.
# =============================================================================

import json
import subprocess
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.C_O_L_R_ import table_C_O_L_R_, LayerRecord
from fontTools.ttLib.tables.C_P_A_L_ import table_C_P_A_L_, Color

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
WORDS_FILE = TOOLS / "qcf-words.json"
SOURCE_FONTS_DIR = TOOLS / "qcf_source_fonts"
OUTPUT_FONT = ROOT / "fonts" / "qcf-merged.woff2"
OVERRIDE_JS = ROOT / "qcf-override.js"
TOKENIZER_JS = TOOLS / "tokenize.js"
DATA_JS = ROOT / "data.js"

TABLE_START = "  var QCF_OVERRIDE_TABLE = {"
TABLE_END = "  };"

# PUA الخاص بالمشروع — لا علاقة له بترميز QCF الأصلي (غير عالمي عبر الصفحات).
PROJECT_PUA_START = 0xE000


def load_words():
    if not WORDS_FILE.exists():
        sys.exit(f"خطأ: الملف غير موجود: {WORDS_FILE}")
    with open(WORDS_FILE, encoding="utf-8") as f:
        words = json.load(f)
    seen_keys = set()
    for w in words:
        for field in ("surah", "ayah", "position", "page", "codepoint", "label"):
            if field not in w:
                sys.exit(f"خطأ: مدخل ناقص الحقل '{field}': {w}")
        key = f"{w['surah']}:{w['ayah']}:{w['position']}"
        if key in seen_keys:
            sys.exit(f"خطأ: موضع مكرر في qcf-words.json: {key}")
        seen_keys.add(key)
    return words


def verify_words_against_real_app(words):
    """يتحقق أن كل كلمة موجودة فعليًا عند موضعها المزعوم، عبر تشغيل نفس
    منطق تقطيع الكلمات الحقيقي للتطبيق (Node.js) على نص data.js الفعلي.
    هذا هو خط الدفاع الوحيد ضد استبدال كلمة خاطئة — لا يجوز حذفه أو تعطيله."""
    if not TOKENIZER_JS.exists():
        sys.exit(f"خطأ: أداة التحقق غير موجودة: {TOKENIZER_JS}")
    payload = json.dumps([[w["surah"], w["ayah"]] for w in words])
    try:
        result = subprocess.run(
            ["node", str(TOKENIZER_JS), str(DATA_JS), payload],
            capture_output=True, text=True, check=True,
        )
    except FileNotFoundError:
        sys.exit("خطأ: Node.js غير مثبَّت على هذا الجهاز — مطلوب للتحقق.")
    except subprocess.CalledProcessError as e:
        sys.exit(f"خطأ أثناء تشغيل أداة التحقق:\n{e.stderr}")

    tokenized = json.loads(result.stdout)  # { "surah:ayah": ["word0", "word1", ...] }
    errors = []
    for w in words:
        ayah_key = f"{w['surah']}:{w['ayah']}"
        words_in_ayah = tokenized.get(ayah_key)
        if words_in_ayah is None:
            errors.append(f"الآية {ayah_key} غير موجودة في data.js إطلاقًا")
            continue
        idx = w["position"] - 1
        if idx < 0 or idx >= len(words_in_ayah):
            errors.append(
                f"{ayah_key}:{w['position']} — الموضع خارج نطاق الآية "
                f"(عدد كلماتها الفعلي: {len(words_in_ayah)})"
            )
            continue
        actual_word = words_in_ayah[idx]
        # مطابقة الهيكل الصوتي: تُجرَّد الحركات، ويُطبَّع الألف والهمزة بكل
        # أشكالها إلى رمز واحد لكل منهما — لأن "إسرائيل" بالإملاء الحديث
        # (إ-س-ر-ا-ئ-ي-ل) و"إِسْرَـٰٓءِيلَ" برسم القرآن (إ-س-ر-ء-ي-ل) نفس
        # الكلمة صوتيًا، لكنهما تهجئتان مختلفتان حرفيًا (مقعد همزة مختلف)؛
        # بلا هذا التطبيع، ستفشل المطابقة رغم صحة الموضع تمامًا.
        import unicodedata
        def skeleton(s):
            out = []
            for c in unicodedata.normalize("NFC", s):
                if unicodedata.category(c) == "Mn" or c == "\u0640":
                    continue
                if c in "\u0627\u0671\u0622":  # ا ٱ آ — تُحذَف (غالبًا حامل إملائي فقط)
                    continue
                if c in "\u0621\u0624\u0626\u0623\u0625":  # ء ؤ ئ أ إ -> رمز همزة واحد
                    out.append("\u0621")
                    continue
                out.append(c)
            return "".join(out)
        if skeleton(actual_word) != skeleton(w["label"]):
            errors.append(
                f"{ayah_key}:{w['position']} — المتوقع '{w['label']}' "
                f"لكن الموجود فعليًا '{actual_word}'"
            )

    if errors:
        print("توقف البناء — تحقق فشل لهذه المواضع:", file=sys.stderr)
        for e in errors:
            print("  - " + e, file=sys.stderr)
        sys.exit(1)
    print(f"تحقق ناجح: كل الـ{len(words)} كلمة مطابقة فعليًا لمواضعها في data.js.")


def build_font(words):
    """يبني qcf-merged.woff2 من خطوط المصدر.

    يُفضَّل مصدر QCF v4 غير الملوّن (بدون COLR) — جليف واحد مكتمل
    بوزن مطابق لرسم المصحف. مصادر التجويد الملوّنة (COLR/CPAL) تُسبّب
    سمكًا زائدًا عند فرض لون موحّد عبر font-palette لأن طبقات الألوان
    تُرسَم فوق بعضها بالأسود.
    """
    pages_needed = sorted(set(w["page"] for w in words))
    for p in pages_needed:
        src = SOURCE_FONTS_DIR / f"p{p}.ttf"
        if not src.exists():
            sys.exit(
                f"خطأ: ملف الخط المصدري غير موجود: {src}\n"
                f"نزّله من qul.tarteel.ai/resources/font/240 وضعه في "
                f"{SOURCE_FONTS_DIR}/ باسم p{p}.ttf"
            )

    template_path = str(SOURCE_FONTS_DIR / f"p{pages_needed[0]}.ttf")
    new = TTFont(template_path)
    notdef_glyf = new["glyf"][".notdef"]
    notdef_hmtx = new["hmtx"][".notdef"]
    _ = new["glyf"].glyphs
    _ = dict(new["hmtx"].metrics)

    glyph_order = [".notdef"]
    new_glyf_entries = {}
    new_hmtx = {}
    new_cmap = {}
    used_colr = False  # يُفعَّل فقط إن وُجدت مصادر COLR

    src_cache = {}
    def get_src(page):
        if page not in src_cache:
            f = TTFont(str(SOURCE_FONTS_DIR / f"p{page}.ttf"))
            _ = f["glyf"].glyphs
            _ = dict(f["hmtx"].metrics)
            src_cache[page] = f
        return src_cache[page]

    next_cp = PROJECT_PUA_START
    for w in words:
        src = get_src(w["page"])
        src_cmap = src.getBestCmap()
        src_glyf = src["glyf"]
        src_hmtx = src["hmtx"]

        cp = int(w["codepoint"], 16)
        if cp not in src_cmap:
            sys.exit(
                f"خطأ: الرمز {w['codepoint']} غير موجود في p{w['page']}.ttf "
                f"(كلمة '{w['label']}' عند {w['surah']}:{w['ayah']}:{w['position']})"
            )
        base_gname_src = src_cmap[cp]
        prefix = f"p{w['page']}_{base_gname_src}"
        new_base_name = f"base_{prefix}"

        # مصدر غير ملوّن (v4): انسخ الجليف كما هو — وزن مطابق 100%.
        # مصدر COLR (تجويد): انسخ الطبقة السوداء فقط إن وُجدت، وإلا كل
        # الطبقات تُدمَج لاحقًا عبر palette (السلوك القديم، مع خطر السمك).
        if "COLR" not in src:
            new_glyf_entries[new_base_name] = src_glyf[base_gname_src]
            new_hmtx[new_base_name] = src_hmtx[base_gname_src]
            glyph_order.append(new_base_name)
        else:
            used_colr = True
            # مصدر COLR (تجويد): استخدم الجليف الأساسي (outline الكامل)
            # الموجود تحت اسم الـcmap نفسه. الطبقات الملوّنة قد تقسّم
            # أجزاء الحرف على أكثر من طبقة، فأخذ طبقة واحدة (أو حتى
            # الطبقات الداكنة فقط) يُنتج رسماً ناقصاً. الجليف الأساسي
            # يحتوي الشكل الكامل أحادي اللون.
            new_glyf_entries[new_base_name] = src_glyf[base_gname_src]
            new_hmtx[new_base_name] = src_hmtx[base_gname_src]
            glyph_order.append(new_base_name)

        new_cmap[next_cp] = new_base_name
        w["_assigned_codepoint"] = next_cp
        next_cp += 1

    new.setGlyphOrder(glyph_order)
    new["glyf"].glyphs = {".notdef": notdef_glyf}
    for name in glyph_order[1:]:
        new["glyf"][name] = new_glyf_entries[name]
    new["hmtx"].metrics = {".notdef": notdef_hmtx}
    for name, val in new_hmtx.items():
        new["hmtx"][name] = val
    for st in list(new["cmap"].tables):
        st.cmap = dict(new_cmap)

    # لا COLR/CPAL عند المصادر غير الملوّنة — اللون من CSS (color / night).
    for tag in ("COLR", "CPAL"):
        if tag in new:
            del new[tag]

    new["maxp"].numGlyphs = len(glyph_order)
    new["post"].formatType = 3.0
    if hasattr(new["post"], "extraNames"):
        new["post"].extraNames = []
    if hasattr(new["post"], "mapping"):
        new["post"].mapping = {}

    new.flavor = "woff2"
    OUTPUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    new.save(str(OUTPUT_FONT))
    mode = "ملوّن→طبقة سوداء فقط" if used_colr else "جليف أحادي (v4 غير ملوّن)"
    print(f"تم بناء {OUTPUT_FONT} — {len(glyph_order)} glyph — {mode}.")


def update_override_js(words):
    if not OVERRIDE_JS.exists():
        sys.exit(f"خطأ: {OVERRIDE_JS} غير موجود.")
    content = OVERRIDE_JS.read_text(encoding="utf-8")
    if TABLE_START not in content or TABLE_END not in content:
        sys.exit(
            f"خطأ: لم أجد علامتي الجدول المتوقعتين في {OVERRIDE_JS}.\n"
            f"تأكد أن السطر '{TABLE_START.strip()}' والسطر '{TABLE_END.strip()}' "
            f"ما زالا موجودين بنفس الصيغة."
        )
    start_idx = content.index(TABLE_START) + len(TABLE_START)
    end_idx = content.index(TABLE_END, start_idx)

    lines = []
    for w in sorted(words, key=lambda w: (w["surah"], w["ayah"], w["position"])):
        key = f"{w['surah']}:{w['ayah']}:{w['position'] - 1}"
        cp_hex = f"\\u{w['_assigned_codepoint']:04X}"
        extras = ""
        if w.get("scale") is not None:
            extras += f", scale: {w['scale']}"
        if w.get("margin_factor") is not None:
            extras += f", marginFactor: {w['margin_factor']}"
        lines.append(f"    '{key}': {{ glyph: '{cp_hex}'{extras} }}, // {w['label']}")
    new_table_body = "\n" + "\n".join(lines) + "\n"

    new_content = content[:start_idx] + new_table_body + content[end_idx:]
    OVERRIDE_JS.write_text(new_content, encoding="utf-8")
    print(f"تم تحديث جدول QCF_OVERRIDE_TABLE في {OVERRIDE_JS} — {len(words)} مدخلًا.")


def main():
    words = load_words()
    print(f"عدد الكلمات في qcf-words.json: {len(words)}")
    verify_words_against_real_app(words)
    build_font(words)
    update_override_js(words)
    print("\nاكتمل البناء بنجاح. الملفات المحدَّثة:")
    print(f"  - {OUTPUT_FONT.relative_to(ROOT)}")
    print(f"  - {OVERRIDE_JS.relative_to(ROOT)}")
    print("\nلا تنسَ رفع رقم الإصدار في version.js وmanifest.json قبل التعبئة.")


if __name__ == "__main__":
    main()
