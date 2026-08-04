# 장구 구음 음원 → js/janggu-audio.js 생성기 (리포 루트에서 `python3 tools/gen-janggu-audio.py`, ffmpeg 필요)
#
# 원본은 `장구단음/<구음>_<세기>.wav` (44.1kHz 스테레오, 한 파일 4초). 그대로 못 쓰는 이유가 둘이다:
#   1) 앞에 무음이 0.2초 붙어 있다 — 그 상태로 박에 맞춰 울리면 소리가 0.2초씩 늦게 난다.
#   2) 뒤가 3초 넘게 비어 있고 전부 합치면 12MB다 — 앞뒤 무음을 떼고 모노 mp3로 줄이면
#      다 합쳐도 100KB 아래로 내려간다.
# 결과는 base64 데이터 URL로 js/janggu-audio.js에 담는다(그림 데이터와 같은 방식) — 그래야
# 파일 경로·CORS 걱정 없이 <script> 하나로 어디서든 읽힌다.
#
# 키는 장단 줄에 적히는 구음 이름(JANGGU_DATA·symbols-registry.js와 같은 이름). 이름이 그대로
# 맞아떨어지지 않는 게 둘 있어 여기서 이어 준다:
#   · 궁 = 쿵 — 같은 북편 소리의 다른 적기.
#   · 작은덩 — 따로 녹음된 음원이 없어 덩의 '약'(여린 세기)을 쓴다. 작은덩이 덩을 여리게 친
#     것이므로 세기 단계가 곧 그 차이다.
# 나머지는 '중'(보통 세기)만 쓴다 — 악보의 구음 기호는 세기를 적지 않으므로.
import base64
import json
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "장구단음")
OUT = os.path.join(ROOT, "js", "janggu-audio.js")

MAP = [
    ("덩", "덩_중"),
    ("작은덩", "덩_약"),
    ("기덕", "기덕_중"),
    ("궁", "쿵_중"),
    ("덕", "덕_중"),
    ("다", "다_중"),
    ("더러러러", "더러러러_중"),
]

# 앞뒤 무음 제거(-50dB 아래를 무음으로 봄, 뒤끝은 0.02초 남겨 뚝 끊기지 않게) → 모노 96kbps mp3
FILTER = ",".join([
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0:detection=peak",
    "areverse",
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02:detection=peak",
    "areverse",
])

entries = []
total = 0
with tempfile.TemporaryDirectory() as tmp:
    for key, stem in MAP:
        src = os.path.join(SRC_DIR, stem + ".wav")
        if not os.path.exists(src):
            raise SystemExit("✗ 원본 없음: " + src)
        dst = os.path.join(tmp, stem + ".mp3")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src,
                        "-af", FILTER, "-ac", "1", "-ar", "44100",
                        "-c:a", "libmp3lame", "-b:a", "96k", dst], check=True)
        raw = open(dst, "rb").read()
        total += len(raw)
        entries.append((key, "data:audio/mpeg;base64," + base64.b64encode(raw).decode()))
        print("  %-5s ← %s.wav  %.1fKB" % (key, stem, len(raw) / 1024))

body = ",\n".join("  %s: %s" % (json.dumps(k, ensure_ascii=False), json.dumps(v)) for k, v in entries)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(
        "// 자동 생성 — 장구 구음 음원(장구단음/*.wav)의 앞뒤 무음을 떼고 모노 mp3로 줄여 내장.\n"
        "// 직접 편집 금지. 다시 만들려면 리포 루트에서 `python3 tools/gen-janggu-audio.py`.\n"
        "// 키 = 장단 줄에 적히는 구음 이름(JANGGU_DATA와 같음). 궁←쿵, 작은덩←덩_약 대응은 생성기 주석 참고.\n"
        "// 이 파일은 index.html이 아니라 app.js가 첫 재생 때 불러온다(loadJangguAudio) — 소리는\n"
        "// 재생을 눌러야 쓰이므로 페이지를 열 때부터 지고 있을 필요가 없다.\n"
        "window.JANGGU_AUDIO = {\n" + body + "\n};\n")

print("✓ %s — %d개, 음원 %.1fKB (파일 %.1fKB)" % (OUT, len(entries), total / 1024, os.path.getsize(OUT) / 1024))
