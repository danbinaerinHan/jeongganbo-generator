# 타악 정간보 음원 → js/perc-audio.js 생성기 (리포 루트에서 `python3 tools/gen-perc-audio.py`, ffmpeg·numpy 필요)
#
# 원본은 `타악단음/<악기>/<구음>_<세기>.wav` (장구·꽹과리·징). 장구 음원 생성기(gen-janggu-audio.py)와
# 같은 손질을 한다 — 앞뒤 무음을 떼고(앞에 0.2초 무음이 붙어 있어 그대로 울리면 박보다 늦다)
# 모노 96k mp3로 줄여 데이터 URL로 담는다. 편집기의 js/janggu-audio.js와는 따로 둔다: 저쪽은 정악
# 반주 장구 일곱 소리만, 이쪽은 타악 정간보가 쓰는 세 악기의 모든 세기를 담는다.
#
# 겹소리는 박 자리(onset)를 재서 함께 적는다 — js/percussion.js의 GRACE 표와 짝이다.
#   · 지갱·기덕: 앞소리(지·기)는 꾸밈이고 박은 뒷소리(갱·덕)에 있다. 뒷소리가 시작하는 시각을
#     `lead`(초)로 적어 두면 재생이 그만큼 당겨 뒷소리를 박에 놓는다. 지갱 녹음은 지와 갱 사이가
#     0.8초 넘게 벌어져 있어(실측) 재생 쪽에서 둘을 갈라 지를 박 바로 앞에 붙인다.
#   · 그랑·그라갱: 박이 '그'에 있다(사용자 확정, 2026-11-12) — lead 0.
# 그랑은 따로 친 녹음이 없고 연속연주(그랑을 0.5초 간격으로 되풀이)뿐이라 첫 한 번만 잘라 쓴다.
import base64
import json
import os
import subprocess
import tempfile
import unicodedata

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "타악단음")
OUT = os.path.join(ROOT, "js", "perc-audio.js")
INSTS = {"janggu": "장구", "kkwaenggwari": "꽹과리", "buk": "북", "jing": "징"}  # 북 = 좌고 녹음
GRACE = {"지갱", "기덕"}            # 뒷소리가 박인 겹소리 — lead를 잰다
MAX_SEC = {"jing": 7.0}             # 징은 14초를 울린다 — 7초에서 끊고 끝을 흐린다
SR = 44100
# 원본 녹음이 대부분 0dBFS를 넘는다(봉우리 +2.7dB 안팎, 2026-11-12 실측) — 그대로 mp3로 옮기면
# 거기서 잘리고 재생에서도 넘친다. 모든 파일을 **같은 양**만큼 내려 악기끼리의 크기 비례는 지킨다.
GAIN_DB = -4.0
# 악기별 덧손질(dB) — 징은 울림이 길고 굵어(앞 0.3초 RMS가 다른 악기보다 7dB가량 크다, 실측)
# 합주에서 다른 소리를 덮었다(2026-11-12 사용자 확인). 재생 쪽 '악기별 음량'의 기본값으로
# 맞추지 않고 여기서 깎는 까닭: 슬라이더 100%가 곧 '알맞은 크기'여야 해서.
INST_DB = {"jing": -6.0}

TRIM = ",".join([
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0:detection=peak",
    "areverse",
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02:detection=peak",
    "areverse",
])


def nfc(s):
    return unicodedata.normalize("NFC", s)


def decode(path, extra="", db=GAIN_DB):
    af = TRIM + f",volume={db}dB" + ("," + extra if extra else "")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", af, "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def onsets(x):
    """세게 치솟는 자리(15ms 안에 9dB 넘게 오름)를 찾는다. 맨 앞 타는 0으로 친다."""
    hop, win = int(SR * 0.003), int(SR * 0.006)
    env = np.array([np.sqrt(np.mean(x[i:i + win] ** 2)) for i in range(0, len(x) - win, hop)])
    db = 20 * np.log10(env + 1e-9)
    pk = db.max()
    out, last = [], -10 ** 9
    for i in range(5, len(db)):
        if db[i] > pk - 30 and db[i] - db[i - 5] >= 9 and i - last > int(0.04 / 0.003):
            out.append(i * hop / SR)
            last = i
    return out


def to_mp3(path, extra="", db=GAIN_DB):
    with tempfile.TemporaryDirectory() as tmp:
        dst = os.path.join(tmp, "a.mp3")
        af = TRIM + f",volume={db}dB" + ("," + extra if extra else "")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path, "-af", af,
                        "-ac", "1", "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", "96k", dst], check=True)
        return open(dst, "rb").read()


data, total, log = {}, 0, []
for key, folder in INSTS.items():
    d = os.path.join(SRC, folder)
    data[key] = {}
    for f in sorted(os.listdir(d)):
        if not f.endswith(".wav"):
            continue
        stem = nfc(f[:-4])                      # 예: 지갱_중
        name = stem.rsplit("_", 1)[0]
        path = os.path.join(d, f)
        extra = ""
        if key in MAX_SEC:
            m = MAX_SEC[key]
            extra = f"atrim=0:{m},afade=t=out:st={m - 1.5}:d=1.5"
        if stem == "그랑_연속연주":
            # 첫 한 번만: 둘째 '그랑'의 '그'(둘째 큰 타 0.05초 앞)에서 끊는다
            on = onsets(decode(path))
            cut = on[1] - 0.06
            extra = f"atrim=0:{cut:.3f},afade=t=out:st={cut - 0.03:.3f}:d=0.03"
            stem = "그랑_중"
            log.append(f"  그랑: 연속연주에서 첫 한 번만 {cut:.3f}초")
        lead = 0.0
        if name in GRACE:
            on = onsets(decode(path))
            lead = round(on[0], 3) if on else 0.0
            log.append(f"  {key}/{stem}: 뒷소리 {lead:.3f}초")
        raw = to_mp3(path, extra, GAIN_DB + INST_DB.get(key, 0.0))
        total += len(raw)
        data[key][stem] = {"url": "data:audio/mpeg;base64," + base64.b64encode(raw).decode(), "lead": lead}

body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
with open(OUT, "w", encoding="utf-8") as fp:
    fp.write("// 자동 생성 — 타악 정간보 음원(타악단음/<악기>/*.wav)의 앞뒤 무음을 떼고 모노 mp3로 줄여 내장.\n"
             "// 직접 편집 금지. 다시 만들려면 리포 루트에서 `python3 tools/gen-perc-audio.py`.\n"
             "// 꼴: PERC_AUDIO[악기][구음_세기] = { url, lead } — lead = 박이 될 뒷소리가 시작하는 시각(초, 겹소리만).\n"
             "// percussion.html이 미리 싣지 않고 첫 재생 때 js/percussion.js가 붙인다.\n"
             "window.PERC_AUDIO = " + body + ";\n")
print("\n".join(log))
print("✓ %s — %d개, 음원 %.0fKB (파일 %.0fKB)" % (OUT, sum(len(v) for v in data.values()), total / 1024,
                                                 os.path.getsize(OUT) / 1024))
