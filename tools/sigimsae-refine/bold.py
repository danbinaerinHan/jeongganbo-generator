# bold.py rdir stem out.svg TARGET  — 획 굵기(잉크 긴 변 대비)를 TARGET으로 맞춰 굵히고 다시 딴다.
# viewBox는 새 잉크 경계 + 긴 변의 3% 여백.
import sys,json,subprocess,re,os,numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize
rd,stem,out,T=sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4])
m=json.load(open(f"{rd}/{stem}.json")); a=np.array(Image.open(f"{rd}/{stem}.png").convert("L"))<128
ys,xs=np.nonzero(a); L=max(xs.ptp(),ys.ptp())
cur=np.median(2*ndimage.distance_transform_edt(a)[skeletonize(a)])/L
r=max(0,(T-cur)*L/2)
b=ndimage.distance_transform_edt(~a)<=r if r>0 else a
img=Image.fromarray(np.where(b,0,255).astype(np.uint8))
bmp=out+".bmp"; img.convert("1").save(bmp)
subprocess.run(["potrace","-s","-a","1.0","-O","0.3","-t","20","-u","10","-o",out,bmp],check=True); os.remove(bmp)
ys,xs=np.nonzero(b); x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
mg=0.03*max(x1-x0,y1-y0)
t=open(out).read(); g=re.sub(r"\s+"," ",re.search(r"<g transform.*</g>",t,re.S).group(0))
open(out,"w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0-mg:.2f} {y0-mg:.2f} {x1-x0+2*mg:.2f} {y1-y0+2*mg:.2f}">\n{g}\n</svg>\n')
print(stem,f"{cur:.3f}->{T} r={r:.1f}px")
