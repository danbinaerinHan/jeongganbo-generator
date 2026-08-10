#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""오선보에 쓰는 악보 글리프를 Bravura에서 **아웃라인 패스로 떠서** js/staff-glyphs.js를 만든다.

    python3 tools/gen-staff-glyphs.py [Bravura.otf 경로]

왜 이렇게 하나
--------------
자리표·임시표·박자표를 유니코드 글자로 쓰면 **시스템 폰트에서 빌려오게 된다**. 악보 글꼴이
깔려 있지 않은 컴퓨터에서는 𝄞가 Apple Symbols, ♭이 Times에서 나오는데, 둘 다 악보용으로
그려진 글자가 아니라 획 굵기가 음표와 안 맞고 모양도 조판 관행과 다르다 — 악보가 '손글씨처럼'
보이던 까닭이 이것이었다. 게다가 폰트마다 baseline이 어디 놓이는지가 딴판이라 크기·자리를
잡으려면 잉크 상자를 실시간으로 재야 했다.

패스로 구우면 셋이 한꺼번에 풀린다: 어느 OS에서든 같은 모양 · 잰다는 일 자체가 없어짐 ·
폰트 파일을 안 실음. 리포의 워드마크(tools/gen-wordmark.py)가 같은 수법이다.

라이선스
--------
Bravura는 SIL Open Font License 1.1 (Steinberg Media Technologies GmbH). OFL은 임베딩과
파생물 배포를 허용하고, 여기서 만드는 것은 **글자 몇 자의 윤곽선을 그림으로 구운 것**이라
폰트 자체의 재배포가 아니다. 폰트 파일은 리포에 두지 않는다 — 이 생성기의 입력일 뿐이다.
받는 곳: https://github.com/steinbergmedia/bravura (redist/otf/Bravura.otf)

좌표
----
SMuFL은 오선 한 칸을 기준 단위로 삼고, Bravura는 em이 4칸이다(upem 1000 → 한 칸 250).
그래서 여기서 뽑는 패스는 **오선 한 칸을 1로 본 좌표**이고, 부호는 SVG에 맞춰 y를 뒤집는다.
그리는 쪽은 `translate(x, y) scale(SP)` 한 번만 걸면 된다.

기준점(origin)도 SMuFL이 정해 둔 자리라 그대로 쓰면 된다:
  자리표 — 그 자리표가 가리키는 줄(높은음자리표는 G선, 낮은음자리표는 F선)
  임시표·쉼표·박자표 — 붙는 줄(또는 가운뎃줄)의 높이, 왼쪽 끝
  꼬리(flag) — 기둥 **끝**에 맞춘다
"""

import json
import re
import os
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

# 뽑을 글리프 — 오선보가 손으로 그리던 것 전부. 음표머리는 일부러 뺐다(아래 주석 참고).
GLYPHS = {
    "gClef": 0xE050, "fClef": 0xE062,
    "flat": 0xE260, "natural": 0xE261, "sharp": 0xE262,
    "restWhole": 0xE4E3, "restHalf": 0xE4E4, "restQuarter": 0xE4E5,
    "rest8th": 0xE4E6, "rest16th": 0xE4E7, "rest32nd": 0xE4E8, "rest64th": 0xE4E9,
    "flag8thUp": 0xE240, "flag8thDown": 0xE241,
    "flag16thUp": 0xE242, "flag16thDown": 0xE243,
    "flag32ndUp": 0xE244, "flag32ndDown": 0xE245,
    "flag64thUp": 0xE246, "flag64thDown": 0xE247,
    "dot": 0xE1E7,
}
for _d in range(10):
    GLYPHS["time%d" % _d] = 0xE080 + _d

# 음표머리(noteheadBlack 등)는 안 뽑는다 — 회전한 타원으로 그리고 있고 실물과 거의 같은 데다,
# 기둥 붙는 자리·점·덧줄 길이가 전부 headRx 하나를 기준으로 짜여 있어 패스로 바꾸면 그
# 셈이 통째로 흔들린다. 눈에 거슬리던 것은 자리표·임시표 쪽이었다.

ROUND = 3


def num(v):
    r = round(v, ROUND)
    return int(r) if r == int(r) else r


def trim(d):
    """패스 문자열의 소수 자리를 ROUND까지로 줄인다 (파일 크기가 절반 가까이 준다)."""
    return re.sub(r"-?\d+\.\d+", lambda m: str(num(float(m.group()))), d)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/bravura-master/redist/otf/Bravura.otf"
    if not os.path.exists(src):
        sys.exit("Bravura.otf를 못 찾음: %s\n"
                 "  https://github.com/steinbergmedia/bravura 에서 받아 경로를 인자로 주세요." % src)

    font = TTFont(src)
    upem = font["head"].unitsPerEm
    sp = upem / 4.0                      # 오선 한 칸 = em의 1/4
    cmap = font.getBestCmap()
    gset = font.getGlyphSet()
    hmtx = font["hmtx"]

    out = {}
    for key, cp in sorted(GLYPHS.items()):
        if cp not in cmap:
            sys.exit("글리프 없음: %s (U+%04X)" % (key, cp))
        name = cmap[cp]
        glyph = gset[name]

        bp = BoundsPen(gset)
        glyph.draw(bp)
        if bp.bounds is None:
            sys.exit("빈 글리프: %s" % key)
        x0, y0, x1, y1 = bp.bounds

        # ntos 인자는 fontTools 4.30쯤에 생겼다 — 없는 판에서는 소수 자리를 직접 줄인다
        try:
            pen = SVGPathPen(gset, ntos=lambda v: str(num(v)))
        except TypeError:
            pen = SVGPathPen(gset)
        # 한 칸을 1로, y는 SVG에 맞춰 뒤집는다
        glyph.draw(TransformPen(pen, (1 / sp, 0, 0, -1 / sp, 0, 0)))
        out[key] = {
            "d": trim(pen.getCommands()),
            # 잉크 상자(한 칸 단위, y는 뒤집은 뒤 기준 — 위가 음수)
            "box": [num(x0 / sp), num(-y1 / sp), num(x1 / sp), num(-y0 / sp)],
            # 보내는 폭 — 박자표처럼 글자를 잇대어 놓을 때는 잉크가 아니라 이 값으로 나아간다
            "w": num(hmtx[name][0] / sp),
        }

    body = ",\n".join(
        '    "%s": { d: %s, box: %s, w: %s }'
        % (k, json.dumps(v["d"]), json.dumps(v["box"]), json.dumps(v["w"]))
        for k, v in sorted(out.items()))

    js = '''// 오선보 글리프 — **생성 파일이다. 직접 고치지 말 것.**
//
//   python3 tools/gen-staff-glyphs.py [Bravura.otf 경로]
//
// Bravura(SIL OFL 1.1, Steinberg Media Technologies GmbH)의 윤곽선을 떠 온 것이다.
// 폰트 파일은 리포에 없다 — 왜 글자가 아니라 패스인지는 생성기 머리말 참고.
//
// 좌표는 **오선 한 칸을 1로 본 값**이고 y는 SVG 방향(아래가 +)이다. 기준점은 SMuFL이 정한
// 자리 그대로 — 자리표는 제가 가리키는 줄, 임시표·쉼표·박자표는 붙는 줄, 꼬리는 기둥 끝.
// 그리는 쪽은 translate(x, y) scale(SP) 한 번만 걸면 된다.
//   box = [x0, y0, x1, y1] 잉크 상자 · w = 보내는 폭(글자를 잇댈 때 쓴다)
(function (root) {
  "use strict";
  root.JGB_STAFF_GLYPHS = {
%s
  };
})(typeof window !== "undefined" ? window : globalThis);
''' % body

    dest = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "js", "staff-glyphs.js")
    with open(dest, "w", encoding="utf-8") as fp:
        fp.write(js)
    print("%s — 글리프 %d개, %.1fKB" % (dest, len(out), len(js) / 1024))


if __name__ == "__main__":
    main()
