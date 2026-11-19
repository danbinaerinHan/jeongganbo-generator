#!/usr/bin/env python3
"""대조표에서 고른 안을 실제 기호 파일에 옮긴다.

  python3 tools/sigimsae-refine/apply.py choices.json     (리포 루트에서)
  python3 tools/sigimsae-refine/apply.py -                 (표준 입력으로 JSON)

choices.json = docs/시김새-다듬기-대조.html의 [결과 복사]가 주는 JSON
  {"<stem>": {"opt": "O"|"A"|"B"|"B3"|"C"…, "targets": [...], "memo"?: "…"}, ...}
메모만 있고 opt가 O(원본 유지)인 항목은 파일을 건드리지 않는다.
후보 assets/symbol_svgs/_다듬기/<opt>/<stem>.svg 를 targets 자리에 덮어쓰고
node tools/gen-symbols-data.mjs 로 js/symbols-data.js를 다시 만든다.
덮기 전 원본은 git에 있으므로 되돌리기는 `git checkout -- assets/symbol_svgs js/symbols-data.js`.
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SYM = os.path.join(ROOT, "assets", "symbol_svgs")

src = sys.stdin.read() if sys.argv[1:] == ["-"] else open(sys.argv[1], encoding="utf-8").read()
choices = json.loads(src)
n = 0
memos = []
for stem, c in choices.items():
    if c.get("memo"):
        memos.append(f"  {stem}: {c['memo']}")
    if c.get("opt", "O") == "O":
        continue
    cand = os.path.join(SYM, "_다듬기", c["opt"], stem + ".svg")
    if not os.path.exists(cand):
        sys.exit(f"후보 없음: {cand}")
    for t in c["targets"]:
        dst = os.path.join(SYM, t + ".svg")
        if not os.path.exists(dst):
            sys.exit(f"대상 없음: {dst}")
        shutil.copyfile(cand, dst)
        n += 1
        print(f"  {c['opt']}  {t}.svg")
print(f"{n}개 파일을 바꿨습니다. symbols-data.js 재생성…")
subprocess.run(["node", "tools/gen-symbols-data.mjs"], cwd=ROOT, check=True)
if memos:
    print("메모(적용과 별개 — 후보를 다시 손볼 거리):\n" + "\n".join(memos))
