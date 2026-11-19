# smooth.py rdir stem out.svg SIGMA_FRAC [ITER] [ALPHAMAX] [OPTTOL] [CLOSE_FRAC]
# 흐림+문턱(ITER번 되풀이 = 곡률 흐름)으로 가장자리 잔물결을 걷고 potrace로 다시 딴다.
# 결과 viewBox는 원본 viewBox 자리 그대로(종횡비·자리 불변).
import sys,json,subprocess,re,os
from PIL import Image,ImageFilter
rd,stem,out,sf=sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4])
it=int(sys.argv[5]) if len(sys.argv)>5 else 1
am=sys.argv[6] if len(sys.argv)>6 else "1.0"
ot=sys.argv[7] if len(sys.argv)>7 else "0.4"
cf=float(sys.argv[8]) if len(sys.argv)>8 else 0
m=json.load(open(f"{rd}/{stem}.json"))
im=Image.open(f"{rd}/{stem}.png").convert("L")
L=max(m["W"],m["H"])-2*m["pad"]
if cf>0:  # 닫기(작은 틈 메우기): 최소필터=검정 팽창 → 최대필터
    k=max(3,int(cf*L)|1); im=im.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
for _ in range(it):
    if sf>0: im=im.filter(ImageFilter.GaussianBlur(sf*L))
    im=im.point(lambda v:0 if v<128 else 255)
bmp=out+".bmp"; im.convert("1").save(bmp)
subprocess.run(["potrace","-s","-a",am,"-O",ot,"-t","20","-u","10","-o",out,bmp],check=True); os.remove(bmp)
t=open(out).read()
pad=m["pad"]; w=m["W"]-2*pad; h=m["H"]-2*pad
g=re.search(r"<g transform.*</g>",t,re.S).group(0)
g=re.sub(r'\s+',' ',g).replace('fill="#000000" stroke="none"','fill="#000000" stroke="none"')
open(out,"w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{pad} {pad} {w} {h}">\n{g}\n</svg>\n')
