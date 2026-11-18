# 그림 쪽 가사: 가사 열을 음절 상자로 잘라 가로 한 줄로 이어 붙이고 Vision OCR
import numpy as np, pickle, sys, subprocess, json
from PIL import Image
S=sys.argv[1]; pages=[int(x) for x in sys.argv[2:]]
I=pickle.load(open(f'{S}/items.pkl','rb'))
import re
def segment(sub, split):
    prof=sub.sum(1); idx=np.where(prof>0)[0]
    segs=[]
    for i in idx:
        if segs and i-segs[-1][1]<=9: segs[-1][1]=i
        else: segs.append([i,i])
    if not split: return segs
    sp=[]
    for y0,y1 in segs:
        wid=[(np.where(sub[y])[0][-1]-np.where(sub[y])[0][0]+1) if sub[y].any() else 0 for y in range(y0,y1+1)]
        narrow=[w<=9 for w in wid]
        cur=y0; i=0; Ln=len(wid)
        while i<Ln:
            if narrow[i]:
                j=i
                while j<Ln and narrow[j]: j+=1
                xc=[np.where(sub[y0+k])[0].mean() for k in range(i,j) if sub[y0+k].any()]
                centred=bool(xc) and abs(np.mean(xc)-sub.shape[1]/2)<7
                if j-i>=32 and (i>0 or j<Ln) and centred:
                    if i>0: sp.append([cur,y0+i-1])
                    sp.append([y0+i,y0+j-1]); cur=y0+j
                i=j
            else: i+=1
        if cur<=y1: sp.append([cur,y1])
    sp=[[a_,b_] for a_,b_ in sp if sub[a_:b_+1].any()]
    return [[a_+np.where(sub[a_:b_+1].any(1))[0][0], a_+np.where(sub[a_:b_+1].any(1))[0][-1]] for a_,b_ in sp]
def attempt(a,sub,r,split):
    boxes=[]
    for y0,y1 in segment(sub,split):
        h=y1-y0+1; xs=np.where(sub[y0:y1+1].any(0))[0]; w=xs[-1]-xs[0]+1
        kind='bar' if w<0.35*h else ('dash' if h<0.35*w else ('tiny' if h*w<150 else 'syl'))
        if r['y0']+3+y1 > r['y1']-34 and h<45: continue
        boxes.append(dict(y0=r['y0']+3+y0,y1=r['y0']+3+y1+1,x0=r['x0']+3+xs[0],x1=r['x0']+3+xs[-1]+1,kind=kind))
    syl=[b for b in boxes if b['kind']=='syl']
    got=''
    if syl:
        H=max(b['y1']-b['y0'] for b in syl)+20; W=sum(b['x1']-b['x0']+30 for b in syl)+40
        strip=Image.new('L',(W,H),255); x=20
        for b in syl:
            strip.paste(Image.fromarray(a[b['y0']:b['y1'],b['x0']:b['x1']]),(x,10)); x+=b['x1']-b['x0']+30
        strip=strip.resize((strip.width*2,strip.height*2)); p=f'{S}/strip.png'; strip.save(p)
        txt=subprocess.run([f'{S}/ocr',p,'ko-KR'],capture_output=True,text=True).stdout
        got=''.join(l.split('\t')[-1] for l in txt.strip().split('\n') if l).replace(' ','')
    return boxes,syl,got
res={}
for n in pages:
    a=np.array(Image.open(f'{S}/pg/{n}.png')); ink=a<150
    out=[]
    for ri,r in enumerate(I[n]['ly']):
        sub=ink[r['y0']+3:r['y1']-3, r['x0']+3:r['x1']-3]
        boxes,syl,got=attempt(a,sub,r,True)
        if len(re.sub(r'[^가-힣]','',got))!=len(syl):
            b2,s2,g2=attempt(a,sub,r,False)
            if len(re.sub(r'[^가-힣]','',g2))==len(s2): boxes,syl,got=b2,s2,g2
        out.append(dict(ri=ri,boxes=boxes,syl=len(syl),ocr=got))
        print(n,ri,len(syl),got)
    res[n]=out
# ── 칸에 붙일 글자 항목으로 바꿔 items.pkl의 가사 열에 넣는다
import re
K=300/72
def ocr1(crop):
    im=Image.new('L',(crop.width+80,crop.height+60),255); im.paste(crop,(40,30)); im=im.resize((im.width*3,im.height*3))
    p=f'{S}/one.png'; im.save(p)
    t=subprocess.run([f'{S}/ocr',p,'ko-KR'],capture_output=True,text=True).stdout
    h=re.sub(r'[^가-힣]','',''.join(l.split('\t')[-1] for l in t.strip().split('\n') if l))
    return h[:1] or '?'
for n,out in res.items():
    a=np.array(Image.open(f'{S}/pg/{n}.png'))
    for o in out:
        r=I[n]['ly'][o['ri']]
        syl=[b for b in o['boxes'] if b['kind']=='syl']
        h=re.sub(r'[^가-힣]','',o['ocr'])
        if len(h)!=len(syl):
            h=''.join(ocr1(Image.fromarray(a[b['y0']:b['y1'],b['x0']:b['x1']])) for b in syl)
            print('per-syl',n,o['ri'],h)
        it=iter(h); txt=[]
        for b in o['boxes']:
            if b['kind']=='syl': c=next(it)
            elif b['kind']=='bar': c='∣'
            else: continue
            txt.append(dict(c=c,x0=b['x0'],x1=b['x1'],y0=b['y0'],y1=b['y1'],size=(b['y1']-b['y0'])/K/0.85,font='ocr'))
        r['text']=txt; r['marks']=[]
pickle.dump(I,open(f'{S}/items.pkl','wb'))
