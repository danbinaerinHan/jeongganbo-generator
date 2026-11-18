# 악보 쪽(왼쪽 반)을 300dpi 회색조 PNG로 뜬다 → <작업>/pg/<쪽>.png
# 단소 25곡 = PDF 161~185쪽, 소금 17곡 = 187~203쪽(160·186쪽은 곡 목록 표).
import sys, os, fitz
S=sys.argv[1]; os.makedirs(f'{S}/pg',exist_ok=True)
d=fitz.open('references/정악보/국악원교육표준악보.pdf')
for n in list(range(161,186))+list(range(187,204)):
    if os.path.exists(f'{S}/pg/{n}.png'): continue
    p=d[n-1]
    p.get_pixmap(dpi=300,clip=fitz.Rect(0,0,p.rect.width/2,p.rect.height),colorspace=fitz.csGRAY).save(f'{S}/pg/{n}.png')
