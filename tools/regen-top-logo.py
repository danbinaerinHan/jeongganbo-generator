# 상단바 로고(까치+맨 윗 가로획) 고해상 재가공.
# 기존 137×64와 같은 프레이밍을 찾기 위해, 원본에서 크롭 후보를 탐색해
# 기존 이미지와의 MSE가 최소인 크롭 박스를 고른 뒤 128px 높이로 다시 뽑는다.
# 경로는 이 파일(tools/) 기준 상대 경로 — 어느 컴퓨터에서 리포를 클론해도 그대로 돌아간다.
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "Gemini_Generated_Logo.png")
REF = os.path.join(ROOT, "assets", "brand", "umulsai-top-128.png")  # 프레이밍 기준(현행 가공본)
OUT = os.path.join(ROOT, "assets", "brand", "umulsai-top-128.png")
CMP = os.path.join(ROOT, "assets", "brand", "_logo-compare.png")   # 눈으로 비교만 하는 임시 파일(gitignore의 *.png 대상)

src = Image.open(SRC).convert("RGB")
W, H = src.size
ref = Image.open(REF).convert("RGBA")
rw, rh = ref.size            # 137, 64
aspect = rw / rh

# 기존 가공본의 잉크 색(가장 어두운 픽셀들 평균)과, 알파를 luminance로 근사
ra = np.asarray(ref).astype(float)
ink_px = ra[ra[..., 3] > 200][:, :3]
ink_color = tuple(int(v) for v in ink_px.mean(axis=0)) if len(ink_px) else (46, 42, 38)
print("기존 잉크색:", ink_color)

# 비교용: RGBA → 흰 배경에 합성한 그레이스케일
def to_gray_on_white(img_rgba):
    a = np.asarray(img_rgba.convert("RGBA")).astype(float)
    alpha = a[..., 3:4] / 255.0
    rgb = a[..., :3] * alpha + 255.0 * (1 - alpha)
    return rgb.mean(axis=2)

ref_gray = to_gray_on_white(ref)

src_gray_img = src.convert("L")

def crop_mse(x0, y0, w):
    h = int(round(w / aspect))
    if x0 < 0 or y0 < 0 or x0 + w > W or y0 + h > H:
        return None
    c = src_gray_img.crop((x0, y0, x0 + w, y0 + h)).resize((rw, rh), Image.LANCZOS)
    return float(((np.asarray(c).astype(float) - ref_gray) ** 2).mean())

# 거친 탐색 → 미세 조정
best = (1e18, None)
for w in range(1100, 1900, 100):
    for x0 in range(100, 900, 60):
        for y0 in range(150, 750, 60):
            m = crop_mse(x0, y0, w)
            if m is not None and m < best[0]:
                best = (m, (x0, y0, w))
print("coarse:", best)
for _ in range(3):
    m0, (bx, by, bw) = best
    for w in range(bw - 60, bw + 61, 15):
        for x0 in range(bx - 45, bx + 46, 10):
            for y0 in range(by - 45, by + 46, 10):
                m = crop_mse(x0, y0, w)
                if m is not None and m < best[0]:
                    best = (m, (x0, y0, w))
    for w in range(best[1][2] - 12, best[1][2] + 13, 3):
        for x0 in range(best[1][0] - 9, best[1][0] + 10, 2):
            for y0 in range(best[1][1] - 9, best[1][1] + 10, 2):
                m = crop_mse(x0, y0, w)
                if m is not None and m < best[0]:
                    best = (m, (x0, y0, w))
print("fine:", best)

mse, (x0, y0, w) = best
h = int(round(w / aspect))

# 고해상 출력: 크롭 → 투명화(luminance→alpha, 잉크색 고정) → 128px 높이
out_h = 128
out_w = int(round(out_h * aspect))
crop = src.crop((x0, y0, x0 + w, y0 + h)).resize((out_w, out_h), Image.LANCZOS)
g = np.asarray(crop.convert("L")).astype(float)
# 원본 배경은 순백이 아닐 수 있어 상·하위 기준점으로 정규화
white = np.percentile(g, 99)
black = np.percentile(g, 1)
alpha = np.clip((white - g) / max(white - black, 1) * 255.0, 0, 255).astype(np.uint8)
rgba = np.zeros((out_h, out_w, 4), dtype=np.uint8)
rgba[..., 0], rgba[..., 1], rgba[..., 2] = ink_color
rgba[..., 3] = alpha
out_img = Image.fromarray(rgba)
# 알파 16단계 + 팔레트 64색 양자화 — 화질 차이 없이(표시 32px) 16.5KB → 1.9KB
arr = np.asarray(out_img).copy()
arr[..., 3] = (arr[..., 3] // 16) * 17
Image.fromarray(arr).quantize(colors=64, method=Image.FASTOCTREE).save(OUT, optimize=True)
print("saved:", OUT, f"{out_w}x{out_h}")

# 눈 비교용: 이번에 고른 크롭(REF, 재실행 시 직전 결과)과 새로 뽑은 결과(OUT)를
# 같은 높이 256으로 확대해 나란히. new는 방금 막 quantize()로 palette 모드(P)가 됐으므로
# RGBA로 변환해야 알파 있는 이미지로 합성된다(안 하면 "bad transparency mask"로 죽는다).
def upscale(img, hh):
    ww = int(round(img.width * hh / img.height))
    return img.resize((ww, hh), Image.NEAREST)
new = Image.open(OUT).convert("RGBA")
a_img = upscale(ref, 256); b_img = upscale(new, 256)
cmp_img = Image.new("RGBA", (a_img.width + b_img.width + 20, 256 + 40), (255, 255, 255, 255))
cmp_img.paste(a_img, (0, 30), a_img); cmp_img.paste(b_img, (a_img.width + 20, 30), b_img)
cmp_img.save(CMP)
print("compare:", CMP)
