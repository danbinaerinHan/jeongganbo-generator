#!/bin/sh
# 국립국악원 『교과서 표준악보집』(2022)의 단소·소금 정간보 42곡 → 우물사이 악보(.jgb.json)
#
#   sh tools/edu-standard/run.sh            (리포 루트에서 — 원본 PDF가 references/정악보/에 있어야 한다)
#
# 결과: 교과서표준악보집/_우물사이/*.jgb.json   (gitignore — 서버에 올리는 것은 tools/publish-edu-standard.mjs)
#       교과서표준악보집/_작업/                    (중간 산출물: 쪽 그림·글자 상자·기호 견본)
#
# ── 어떻게 읽나 (OCR이 아니라 '지면 구조 + 텍스트 층')
#  ① pages.py     악보 쪽을 300dpi로 뜬다.
#  ② seg/pstruct  선(잉크<190이 90px 넘게 이어진 것)으로 칸을 가르고, 점선(회색)으로 정간을 나눈다.
#                 세로 한 줄 = 한 각, 그 오른쪽 좁은 열 = 곁줄(가사), 오른쪽 위 = 장구 열.
#  ③ items.py     벡터 쪽 35곡은 율명·가사가 **텍스트 층**(HCRBatang)으로 들어 있어 그대로 쓴다.
#                 다만 편집 흔적인 '안 보이는 글자'가 섞여 있어(같은 자리에 겹친 －·소 따위) 글자마다
#                 실제 잉크 꼴(막대·줄표·글자·빈칸)과 견본 모양을 대조해 거른다. 텍스트가 아닌 잉크
#                 (장구 기호·시김새 부호·그림 쪽의 율명)는 '기호'로 따로 모은다.
#  ④ lyocr.py     그림으로만 된 7쪽(161~164·187·195·198)의 가사는 음절 상자를 가로로 이어 붙여
#                 macOS Vision OCR로 읽는다(ocr.swift).
#  ⑤ mcl/classify 기호를 모양으로 묶고 견본(marks_bank.pkl)과 맞대 이름을 붙인다. 그림 쪽 율명은
#                 벡터 쪽 텍스트 글자를 견본으로 삼되 그 곡 해설의 '사용하는 율명'으로 후보를 좁힌다.
#  ⑥ assemble.py  정간 안 항목을 행(분박)·열(좌우)로 짜 우물사이 문법으로: 汰→청태, -→이음, △→쉼,
#                 시김새 부호는 책 13쪽식 '장식음과 부호' 표대로(∧ 니레·≷ 나니나·∽ 노니로·I 느니르는
#                 붙임, И 니나·ㄴ 니·ㄱ 노·ㅌ 리·ㅏ 노라는 제 분박). 2중주는 파트 둘(총보).
#  ⑦ build.py     곡 목록 표(160·186쪽)에서 제목·장단·난이도를 읽어 문서를 짓는다.
#
# 검증: render.mjs가 헤드리스 크롬으로 편집기에 각 문서를 열어 PNG(+공유마당 미리보기)를 뜬다 —
#   원본 쪽과 나란히 놓고 대조할 것(2026-11-18에 42곡 중 대표 곡들을 이 방법으로 맞춰 봤다).
# 필요한 것: python3 + venv(pymupdf·numpy·scipy·pillow — 처음 한 번 저절로 깐다), Xcode swiftc, Chrome.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd); cd "$ROOT"
CODE="$ROOT/tools/edu-standard"; W="$ROOT/교과서표준악보집/_작업"; OUT="$ROOT/교과서표준악보집/_우물사이"
mkdir -p "$W"
[ -x "$W/venv/bin/python" ] || { python3 -m venv "$W/venv"; "$W/venv/bin/pip" -q install pymupdf numpy scipy pillow; }
[ -x "$W/ocr" ] || swiftc -O "$CODE/ocr.swift" -o "$W/ocr"
V="$W/venv/bin/python"
"$V" "$CODE/pages.py" "$W"
"$V" "$CODE/items.py" "$W" > /dev/null
[ -f "$W/proto.pkl" ] || { "$V" "$CODE/proto.py" "$W"; "$V" "$CODE/items.py" "$W" > /dev/null; }
"$V" "$CODE/lyocr.py" "$W" 161 162 163 164 187 195 198 > "$W/lyocr.log"
"$V" "$CODE/mcl.py" "$W" > /dev/null
"$V" "$CODE/classify.py" "$W" > "$W/classify.log"
"$V" "$CODE/assemble.py" "$W" > "$W/assemble.log"
rm -rf "$OUT"; "$V" "$CODE/build.py" "$W" "$OUT" > /dev/null
echo "끝 — $(ls "$OUT" | wc -l | tr -d ' ')곡 → $OUT"
