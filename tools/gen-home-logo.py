# 첫 화면(home.html) 가운데 문패용 **전체 로고**(井 전체 + 까치) 가공본.
# 상단바 로고(regen-top-logo.py)는 작게 그리려고 위쪽만 잘라 쓰지만, 첫 화면은 크게 그리므로
# 원본 꼴 그대로 쓴다. 원본(2048px·3.8MB)을 그대로 실을 수 없어 이렇게 줄인다:
#   ① 잉크 경계로 크롭(원본 오른쪽 아래의 옅은 반짝이 무늬는 문턱 밑이라 저절로 빠진다)
#   ② 흰 바탕을 알파로 — 밝기에서 알파를 뽑아 잉크만 남긴다(다크모드는 CSS invert)
#   ③ 높이 OUT_H px로 줄이고 알파 16단계로 양자화해 PNG 팔레트로 (수 KB)
# 출력은 assets/brand/umulsai-full-280.png — base64로 home.html의 데이터 URL에 넣는다.
import os, base64, io
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "Gemini_Generated_Logo.png")
OUT_H = 280                      # 표시 140px의 2배(dpr 2에서 1:1)
OUT = os.path.join(ROOT, "assets", "brand", f"umulsai-full-{OUT_H}.png")

g = np.asarray(Image.open(SRC).convert("L")).astype(float)
ys, xs = np.where(g < 128)
pad = 12
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, g.shape[0])
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, g.shape[1])
g = g[y0:y1, x0:x1]

# 밝기 → 알파. 잉크 가운데(≈60)는 불투명, 종이(≈250)는 투명, 사이는 부드럽게.
a = np.clip((235 - g) / (235 - 90), 0, 1)
img = np.zeros(g.shape + (4,), np.uint8)
img[..., :3] = (46, 42, 38)      # 상단바 로고와 같은 잉크색
img[..., 3] = (a * 255).astype(np.uint8)
im = Image.fromarray(img, "RGBA")
w = round(im.width * OUT_H / im.height)
im = im.resize((w, OUT_H), Image.LANCZOS)

arr = np.asarray(im).copy()
arr[..., 3] = (np.round(arr[..., 3] / 17) * 17).astype(np.uint8)   # 알파 16단계
arr[..., :3] = (46, 42, 38)
im = Image.fromarray(arr, "RGBA").quantize(colors=16, method=Image.FASTOCTREE)
im.save(OUT, optimize=True)
b = open(OUT, "rb").read()
print(OUT, im.size, len(b), "bytes")
print("data URL 길이:", len("data:image/png;base64," + base64.b64encode(b).decode()))
