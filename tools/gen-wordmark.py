#!/usr/bin/env python3
"""상단바 워드마크 '우물사이'를 EBS훈민정음 SB 아웃라인 패스로 떠서 SVG로 만든다.

왜 폰트를 안 싣고 패스를 뜨나:
  EBS훈민정음 라이선스는 웹 사용·임베딩·BI/CI(브랜드명·로고)는 허용하지만, 폰트 파일
  자체의 변형(=서브셋 포함)·재배포는 EBS 사전 서면승인 대상이다. 패스로 뜨면 폰트를
  배포하는 게 아니라 '폰트로 만든 로고'라 그 조항을 건드리지 않는다.
  덤으로 3KB고(전체 폰트 2.8MB), 폰트 설치 여부와 무관하게 모든 OS에서 동일하게 나온다.
  라이선스 원문: https://about.ebs.co.kr/kor/organization/font?tabVal=hunmin

쓰는 법:
  python3 tools/gen-wordmark.py          # 화면에 SVG 출력
  결과를 index.html의 #brandWord 자리에 붙여넣는다(수동 — 어쩌다 한 번 하는 일이라
  자동 주입까지 만들 이유가 없다).

필요한 것: fontTools, 그리고 ~/Library/Fonts/EBS훈민정음SB.otf
  폰트는 위 EBS 페이지에서 무료로 받는다. 리포에는 넣지 않는다(재배포 금지).
"""
import os
import sys

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = os.path.expanduser("~/Library/Fonts/EBS훈민정음SB.otf")
TEXT = "우물사이"
TRACK_EM = 0.10  # 원래 CSS의 letter-spacing 2px @ font-size 20px = 0.1em


def build() -> str:
    if not os.path.exists(FONT):
        sys.exit(f"폰트가 없습니다: {FONT}\nEBS 페이지에서 EBS훈민정음 OTF를 받아 설치하세요.")

    font = TTFont(FONT)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    glyphs = font.getGlyphSet()

    # 글자를 가로로 이어 붙이며 하나의 패스로. y를 뒤집는다(폰트는 위가 +, SVG는 아래가 +).
    # 자간은 정수 유닛으로 — 0.10*1000이 부동소수점 오차로 100.00000000000001이 되면
    # 좌표가 죄다 실수로 찍혀 패스가 500B쯤 불어나고 매번 결과가 미묘하게 달라진다.
    track = round(TRACK_EM * upem)
    rec = RecordingPen()
    x = 0
    for ch in TEXT:
        if ord(ch) not in cmap:
            sys.exit(f"이 폰트에 '{ch}' 글자가 없습니다.")
        gname = cmap[ord(ch)]
        glyphs[gname].draw(TransformPen(rec, Transform(1, 0, 0, -1, x, 0)))
        x += hmtx[gname][0] + track

    bounds = BoundsPen(None)
    rec.replay(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds

    # 잉크 경계로 크롭 — 기호 SVG들과 같은 방식(박스를 꽉 채우게).
    # 좌표는 정수로 반올림: upem 1000짜리 1유닛은 16px 표시에서 0.016px라 안 보이는데
    # 소수점을 살리면 패스만 길어진다.
    sp = SVGPathPen(glyphs, ntos=lambda n: str(round(n)))
    rec.replay(TransformPen(sp, Transform(1, 0, 0, 1, -x_min, -y_min)))

    w, h = x_max - x_min, y_max - y_min
    # CSS가 알아야 하는 두 숫자: 가로세로비, 그리고 밑선이 잉크 아래끝에서 얼마나 위인지.
    print(f"<!-- 비율 {w / h:.3f}:1 · 밑선 보정 = 높이 × {y_max / h:.4f} -->", file=sys.stderr)
    return (
        f'<svg id="brandWord" xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="{TEXT}">'
        f'<path fill="currentColor" d="{sp.getCommands()}"/></svg>'
    )


if __name__ == "__main__":
    print(build())
