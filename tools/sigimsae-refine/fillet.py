# fillet.py rdir stem out.svg R_FRAC — 닫기(팽창 후 침식)로 맞닿은 자리의 오목한 모서리를 둥글게 메운다(허리).
# R_FRAC = 메우는 반지름(잉크 긴 변 대비). viewBox는 원본 자리 그대로.
import sys,json,subprocess,re,os,numpy as np
from PIL import Image
from scipy import ndimage
rd,stem,out,rf=sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4])
m=json.load(open(f"{rd}/{stem}.json")); a=np.array(Image.open(f"{rd}/{stem}.png").convert("L"))<128
L=max(m["W"],m["H"])-2*m["pad"]; r=rf*L
d=ndimage.distance_transform_edt(~a)<=r          # 팽창
b=~(ndimage.distance_transform_edt(d)<=r)        # 침식 → ~b가 아니라 b가 잉크
b=ndimage.distance_transform_edt(d)>r
Image.fromarray(np.where(b,0,255).astype(np.uint8)).convert("1").save(out+".bmp")
subprocess.run(["potrace","-s","-a","1.0","-O","0.2","-t","20","-u","10","-o",out,out+".bmp"],check=True); os.remove(out+".bmp")
pad=m["pad"]; w=m["W"]-2*pad; h=m["H"]-2*pad
g=re.sub(r"\s+"," ",re.search(r"<g transform.*</g>",open(out).read(),re.S).group(0))
open(out,"w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{pad} {pad} {w} {h}">\n{g}\n</svg>\n')
