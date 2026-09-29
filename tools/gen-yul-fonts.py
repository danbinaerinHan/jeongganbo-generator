#!/usr/bin/env python3
"""악보 율명 글자만 남긴 웹폰트(woff2)를 js/yul-fonts.js로 굽는다.

왜 필요한가:
  율명 한자 58자 중 34자가 유니코드 확장 A(㴌·㳞·㑀…), 7자가 한국 표준 한자 밖(汏·僙…)이다.
  맥의 Kaiti SC는 전부 갖고 있지만 한국어 윈도우의 바탕에는 없어서, 윈도우가 **없는 글자만**
  딴 폰트(SimSun·MingLiU…)에서 빌려 와 한 악보 안에서 율명 굵기·모양이 제각각이 됐다
  (2026-09-29 사용자 제보). 설치된 폰트에 기대는 한 못 고치므로 글자를 앱에 싣는다.

왜 패스가 아니라 웹폰트인가:
  같은 58자가 패스로는 144KB, woff2 부분 폰트로는 base64까지 36KB였다(TW-Kai 실측).
  그리고 웹폰트는 SVG <text>·팔레트·건반 CSS가 **같은 글씨**를 그대로 쓴다.
  워드마크(gen-wordmark.py)가 패스인 것은 EBS 라이선스가 폰트 변형을 막아서이고, 여기
  두 폰트는 OFL 1.1이라 부분 폰트로 만들어 싣는 것이 허용된다.
  · OFL의 '예약 글꼴 이름' 조항을 건드리지 않도록 **글꼴 이름을 우리 이름으로 바꿔** 싣는다
    ('JGB Yul …'). 저작권 문구와 라이선스는 출력 파일 머리에 그대로 옮긴다.

실을 폰트(둘 다 58자 전부 있음 — 2026-09-29 확인):
  twkai  전자정자 정해체(TW-Kai, 全字庫正楷體) — 대만 디지털발전부.
         OGDL v1.0 또는 SIL OFL 1.1 중 택일(폰트 안의 저작권 문구). Kaiti SC와 가장 닮았다.
         받는 곳: https://www.cns11643.gov.tw/opendata/Fonts_Kai.zip → TW-Kai-98_1.ttf
  lxgw   LXGW WenKai(霞鹜文楷) — SIL OFL 1.1. 단정한 해서체.
         받는 곳: https://github.com/lxgw/LxgwWenKai/releases → LXGWWenKai-Regular.ttf

쓰는 법:
  python3 tools/gen-yul-fonts.py --twkai <TW-Kai-98_1.ttf> --lxgw <LXGWWenKai-Regular.ttf>
  → js/yul-fonts.js를 새로 쓴다(생성 파일 — 직접 고치지 말 것).
  글자 목록은 js/app.js의 YUL·OCT_HANJA에서 그 자리에서 읽는다. 율명 한자를 늘리거나
  바꾸면 이 생성기를 다시 돌려야 한다(안 돌리면 새 글자만 기기 서체로 빠진다).

필요한 것: fontTools, brotli(woff2). 폰트 파일은 리포에 넣지 않는다(30~40MB).
"""
import argparse
import base64
import io
import os
import re
import sys

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "js", "app.js")
OUT = os.path.join(ROOT, "js", "yul-fonts.js")

# 악보의 율명 자리(drawGlyph의 글자 크기·기준선 y = 가운데 + size*0.34)는 Kaiti SC에 맞춰 잡은
# 값이다. 그 글꼴의 율명 잉크 평균(2026-09-29 실측, em 단위): 기준선 위 중심 0.298 · 높이 0.821.
# 폰트마다 이 둘에 맞도록 크기(scale)·세로(dy, em)를 적어 두면 app.js가 그대로 입힌다 —
# 서체를 바꿔도 정간 안의 크기·자리가 안 흔들린다. (TW-Kai는 0.296·0.813이라 거의 1·0)
REF_CENTER = 0.298
REF_HEIGHT = 0.821

FONTS = [
    # key, 표시 이름, 글꼴 이름(우리가 붙이는 것), 출처 한 줄
    ("twkai", "정해체", "JGB Yul TWKai",
     "전자정자 정해체(TW-Kai, 全字庫正楷體) · 대만 디지털발전부 · SIL OFL 1.1"),
    ("lxgw", "문해체", "JGB Yul LXGW",
     "LXGW WenKai(霞鹜文楷) · LXGW · SIL OFL 1.1"),
]


def yul_chars() -> str:
    src = open(APP, encoding="utf-8").read()
    a = src.index("const YUL =")
    b = src.index("const NOTE_FONT")
    chars = sorted(set(c for c in src[a:b]
                       if 0x3400 <= ord(c) <= 0x9FFF or 0x20000 <= ord(c) <= 0x3FFFF))
    if len(chars) < 20:
        sys.exit("app.js에서 율명 한자를 못 읽었습니다(YUL·OCT_HANJA 자리가 바뀌었나?)")
    return "".join(chars)


def build_one(path: str, chars: str, family: str):
    font = TTFont(path)
    cmap = font.getBestCmap()
    missing = [c for c in chars if ord(c) not in cmap]
    if missing:
        sys.exit(f"{os.path.basename(path)}에 없는 글자: {''.join(missing)}")
    name = font["name"]
    copyright_ = name.getDebugName(0) or ""
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cs, hs = [], []
    for c in chars:
        bp = BoundsPen(gs)
        gs[cmap[ord(c)]].draw(bp)
        x0, y0, x1, y1 = bp.bounds
        cs.append((y0 + y1) / 2 / upm)
        hs.append((y1 - y0) / upm)
    center, height = sum(cs) / len(cs), sum(hs) / len(hs)
    scale = REF_HEIGHT / height
    # 줄인 뒤의 잉크 중심을 기준 중심으로 — 양수 dy = 아래로(글자 크기 대비)
    dy = center * scale - REF_CENTER

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = []
    opts.notdef_outline = False
    opts.name_IDs = []          # 이름표는 아래서 우리 이름으로 새로 적는다
    opts.drop_tables += ["FFTM", "DSIG"]
    sub = subset.Subsetter(opts)
    sub.populate(text=chars)
    sub.subset(font)
    # 예약 글꼴 이름을 안 쓰도록 이름을 우리 것으로(저작권 문구는 그대로 남긴다)
    name.names = []
    for nid, val in ((0, copyright_), (1, family), (2, "Regular"),
                     (4, family), (6, family.replace(" ", "")),
                     (13, "SIL Open Font License, Version 1.1"),
                     (14, "https://openfontlicense.org")):
        name.setName(val, nid, 3, 1, 0x409)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode("ascii"), copyright_, round(scale, 3), round(dy, 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--twkai", required=True, help="TW-Kai-98_1.ttf 경로")
    ap.add_argument("--lxgw", required=True, help="LXGWWenKai-Regular.ttf 경로")
    args = ap.parse_args()
    paths = {"twkai": args.twkai, "lxgw": args.lxgw}
    chars = yul_chars()

    head = [
        "// 생성 파일 — 직접 고치지 말 것. 다시 만들기: python3 tools/gen-yul-fonts.py (머리말 참고)",
        "// 악보 율명 한자 %d자만 남긴 부분 웹폰트(woff2). 글꼴 이름은 원래 이름이 아니라 'JGB Yul …'로" % len(chars),
        "// 바꿔 실었다(OFL 예약 글꼴 이름 조항). 원 저작권 문구와 라이선스:",
    ]
    entries = []
    for key, label, family, credit in FONTS:
        b64, cr, scale, dy = build_one(paths[key], chars, family)
        head.append("//   · " + credit)
        head.append("//     " + cr.replace("\n", " ")[:400])
        entries.append('  %s: { label: "%s", family: "%s", credit: "%s", scale: %s, dy: %s,\n    src: "data:font/woff2;base64,%s" }'
                       % (key, label, family, credit, scale, dy, b64))
    head.append("//   SIL Open Font License 1.1 전문: https://openfontlicense.org")
    out = "\n".join(head) + "\nwindow.JGB_YUL_FONTS = {\n" + ",\n".join(entries) + "\n};\n"
    open(OUT, "w", encoding="utf-8").write(out)
    print(f"{OUT} — {len(chars)}자, {len(out) // 1024}KB")


if __name__ == "__main__":
    main()
