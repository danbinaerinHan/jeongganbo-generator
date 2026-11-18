import numpy as np, pickle, sys, fitz, re, os
from PIL import Image
from scipy import ndimage as ndi
S=sys.argv[1]
I=pickle.load(open(f'{S}/items.pkl','rb')); M=pickle.load(open(f'{S}/mcl.pkl','rb'))
RASTER={161,162,163,164,187,195,198}
MAN={2:'dot',7:'dot',12:'dot',17:'dot',21:'dot',33:'dot',125:'dot',192:'dot',220:'dot',
     3:'○',15:'○',4:'|',6:'|',74:'|',5:'⦶',19:'⦶',160:'⦶',88:'⦶',89:'⦶',
     10:'^',51:'^',22:'И',59:'И',63:'∽',146:'ㄴ',147:'ㄱ',187:'≷',188:'ㅌ',189:'ㅏ',223:'I',
     39:'△',13:'-',
     8:'x',11:'x',14:'x',20:'x',28:'x',37:'x',62:'x',194:'x',143:'x',144:'x',221:'x',222:'x'}
def feat(m):
    h,w=m.shape; s=max(h,w); pad=np.zeros((s,s),np.uint8); pad[(s-h)//2:(s-h)//2+h,(s-w)//2:(s-w)//2+w]=m
    v=np.asarray(Image.fromarray(pad*255).resize((28,28),Image.BILINEAR),float)/255
    return ndi.gaussian_filter(v,1.0)
# 율명 쓰는 목록(해설 쪽 '사용하는 율명은 …')
doc=fitz.open('references/정악보/국악원교육표준악보.pdf')
YULSET={}
for n in RASTER:
    p=doc[n-1]; W=p.rect.width/2
    import unicodedata; t=unicodedata.normalize("NFC",p.get_text(clip=fitz.Rect(W,0,2*W,p.rect.height)))
    m=re.search(r'율명은\s*([^이]+?)이',t.replace('\n',''))
    YULSET[n]=set(re.findall(r'[㐀-鿿]',m.group(1))) if m else None
print(YULSET)
# 한자 견본: 벡터 쪽의 텍스트 글자 → 그 상자 안 잉크
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
bank=[]
from items import comps
cnt={}
for n,P in I.items():
    if n in RASTER: continue
    a=np.array(Image.open(f'{S}/pg/{n}.png'))<150
    for c in P['cols']:
        for cl in c['cells']:
            for t in cl['text']:
                ch=t['c']
                if not ('㐀'<=ch<='鿿' or ch=='△'): continue
                if cnt.get(ch,0)>=40: continue
                x0,y0,x1,y1=int(t['x0']),int(t['y0']),int(t['x1']),int(t['y1'])
                sub=a[y0:y1,x0:x1]
                ys,xs=np.where(sub)
                if len(ys)<20: continue
                m=sub[ys.min():ys.max()+1, xs.min():xs.max()+1]
                bank.append((ch,feat(m),m.shape)); cnt[ch]=cnt.get(ch,0)+1
import os
for lab,v,hw in (pickle.load(open(f'{S}/marks_bank.pkl','rb')) if os.path.exists(f'{S}/marks_bank.pkl') else []): bank.append((lab,v,hw))
for cid,lab in ({} if os.path.exists(f'{S}/marks_bank.pkl') else MAN).items():
    for j in M['members'][cid][:30]:
        v,h,w=M['feats'][j]; bank.append((lab,v,(h,w)))
print('bank',len(bank),sorted(cnt.items()))
# 분류
res={}
for j,key in enumerate(M['keys']):
    cid=[i for i,mm in enumerate(M['members']) if j in mm][0] if False else None
cl_of={}
for i,mm in enumerate(M['members']):
    for j in mm: cl_of[j]=i
for j,key in enumerate(M['keys']):
    cid=cl_of[j]
    pass
    v,h,w=M['feats'][j]; n=key[1]
    best=None;bd=9
    for lab,bv,(bh,bw) in bank:
        if n in RASTER and YULSET.get(n) and '㐀'<=lab<='鿿' and lab not in YULSET[n]: continue
        if abs(np.log((h+4)/(bh+4)))>0.6 or abs(np.log((w+4)/(bw+4)))>0.6: continue
        d=np.abs(v-bv).mean()
        if d<bd: bd=d;best=lab
    res[key]=(best,bd)
pickle.dump(res,open(f'{S}/mlabels.pkl','wb'))
import collections
print(collections.Counter(l for (l,d) in res.values()))
bad=[(k,l,round(d,3)) for k,(l,d) in res.items() if k[0]=='c' and d>0.09]
print('uncertain',len(bad)); print(bad[:40])
# ⦶ / ○ 가르기: 원 안 가운데 세로줄이 있는가
def mark_mask(key):
    t,n,a,b,mi=key
    box=I[n]['cols'][a]['cells'][b] if t=='c' else I[n]['ly'][a]
    return box['marks'][mi]['mask']
fix=0
for key,(lab,d) in list(res.items()):
    if lab in ('⦶','○'):
        m=mark_mask(key); h,w=m.shape
        mid=m[int(h*.3):int(h*.7), int(w*.42):int(w*.58)]
        new='⦶' if mid.any(1).mean()>0.8 else '○'
        if new!=lab: res[key]=(new,d); fix+=1
pickle.dump(res,open(f'{S}/mlabels.pkl','wb'))
print('circle fixes',fix)
