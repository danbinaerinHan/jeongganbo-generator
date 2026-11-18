# 셀마다 '항목'(율명·기호)을 모은다: 텍스트 층(벡터 쪽) + 남은 잉크 덩어리(기호·그림 쪽)
import numpy as np, sys, pickle, unicodedata
import fitz
from scipy import ndimage as ndi
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); S=sys.argv[1]
from pstruct import structure
PDF='references/정악보/국악원교육표준악보.pdf'
K=300/72
doc=fitz.open(PDF)
def text_chars(n):
    p=doc[n-1]; W=p.rect.width/2; out=[]
    for b in p.get_text('rawdict')['blocks']:
        for l in b.get('lines',[]):
            for s in l['spans']:
                for ch in s['chars']:
                    c=unicodedata.normalize('NFC',ch['c'])
                    if c.strip()=='' : continue
                    x0,y0,x1,y1=ch['bbox']
                    if x0>=W: continue
                    out.append(dict(c=c,x0=x0*K,y0=y0*K,x1=x1*K,y1=y1*K,size=s['size'],font=s['font']))
    # ◯ 와 ∣ 를 한 자리에 겹쳐 덩(⦶)을 만든 경우
    circ=[t for t in out if t['c'] in '○◯']
    for c in circ:
        for b in [t for t in out if t['c'] in '∣｜' and abs(t['x0']-c['x0'])<3 and abs(t['y0']-c['y0'])<3]:
            out.remove(b); c['c']='⦶'
    return out
def comps(clean, box, m):
    x0,y0,x1,y1=box
    sub=clean[y0+m:y1-m, x0+m:x1-m]
    lab,k=ndi.label(sub, structure=np.ones((3,3)))
    res=[]
    for i,sl in enumerate(ndi.find_objects(lab)):
        res.append(dict(x0=x0+m+sl[1].start,x1=x0+m+sl[1].stop,y0=y0+m+sl[0].start,y1=y0+m+sl[0].stop,
                         mask=(lab[sl]==i+1)))
    return res
def inside(c,t,shrink=0.12):
    cx=(c['x0']+c['x1'])/2; cy=(c['y0']+c['y1'])/2
    w=t['x1']-t['x0']; h=t['y1']-t['y0']
    return t['x0']-2<=cx<=t['x1']+2 and t['y0']+h*shrink-2<=cy<=t['y1']-h*shrink+2
def group_marks(cs, gap=7):
    # 가까운 덩어리끼리 묶기(같은 기호의 조각)
    groups=[]
    for c in sorted(cs,key=lambda c:(c['y0'],c['x0'])):
        for g in groups:
            if c['x0']<=g['x1']+gap and c['x1']>=g['x0']-gap and c['y0']<=g['y1']+gap and c['y1']>=g['y0']-gap:
                g['parts'].append(c); g['x0']=min(g['x0'],c['x0']); g['x1']=max(g['x1'],c['x1']); g['y0']=min(g['y0'],c['y0']); g['y1']=max(g['y1'],c['y1']); break
        else: groups.append(dict(x0=c['x0'],x1=c['x1'],y0=c['y0'],y1=c['y1'],parts=[c]))
    # 두 번 돌려 연쇄 병합
    changed=True
    while changed:
        changed=False
        for i in range(len(groups)):
            for j in range(i+1,len(groups)):
                a,b=groups[i],groups[j]
                if b['x0']<=a['x1']+gap and b['x1']>=a['x0']-gap and b['y0']<=a['y1']+gap and b['y1']>=a['y0']-gap:
                    a['parts']+=b['parts']; a['x0']=min(a['x0'],b['x0']); a['x1']=max(a['x1'],b['x1']); a['y0']=min(a['y0'],b['y0']); a['y1']=max(a['y1'],b['y1'])
                    groups.pop(j); changed=True; break
            if changed: break
    for g in groups:
        h=g['y1']-g['y0']; w=g['x1']-g['x0']; m=np.zeros((h,w),bool)
        for c in g['parts']:
            m[c['y0']-g['y0']:c['y1']-g['y0'], c['x0']-g['x0']:c['x1']-g['x0']] |= c['mask']
        g['mask']=m; del g['parts']
    return groups
BARS={'∣','｜','|'}; DASHES={'-','－','—','‐'}
def exp_type(c):
    return 'bar' if c in BARS else ('dash' if c in DASHES else 'char')
def ink_type(clean,t):
    h=t['y1']-t['y0']; w=t['x1']-t['x0']
    y0=int(t['y0']+h*0.18); y1=int(t['y1']-h*0.18); x0=int(t['x0']+w*0.05); x1=int(t['x1']-w*0.05)
    sub=clean[y0:y1,x0:x1]
    ys,xs=np.where(sub)
    if len(ys)<8: return 'empty'
    ih=ys.max()-ys.min()+1; iw=xs.max()-xs.min()+1
    if iw<0.35*ih: return 'bar'
    if ih<0.35*iw: return 'dash'
    return 'char'
def verify(clean,ts):
    for t in ts: t['ink']=ink_type(clean,t); t['ok']=(t['ink']==exp_type(t['c']))
    keep=[]
    for t in ts:
        if t['ok']: keep.append(t); continue
        # 겹친 짝 중 맞는 것이 있으면 이것은 버린다; 없으면(혼자) 잉크가 있을 때만 남긴다
        over=[u for u in ts if u is not t and u['ok'] and not (u['x1']<=t['x0'] or u['x0']>=t['x1']) and abs((u['y0']+u['y1'])/2-(t['y0']+t['y1'])/2)<0.5*(t['y1']-t['y0'])]
        if over or t['ink']=='empty': continue
        keep.append(t)
    # 같은 자리에 겹친 글자(둘 다 'char')는 잉크와 더 닮은 하나만
    out=[]
    for t in keep:
        dup=[u for u in out if abs((u['x0']+u['x1'])/2-(t['x0']+t['x1'])/2)<0.4*(t['x1']-t['x0']) and abs((u['y0']+u['y1'])/2-(t['y0']+t['y1'])/2)<0.4*(t['y1']-t['y0'])]
        if not dup: out.append(t); continue
        u=dup[0]
        if PROTO and inkdist(clean,t)<inkdist(clean,u): out[out.index(u)]=t
    return out
import os, pickle as _pk
PROTO=_pk.load(open(os.path.join(S,'proto.pkl'),'rb')) if os.path.exists(os.path.join(S,'proto.pkl')) else None
from PIL import Image as _Im
def featm(m):
    h,w=m.shape; s_=max(h,w); pad=np.zeros((s_,s_),np.uint8); pad[(s_-h)//2:(s_-h)//2+h,(s_-w)//2:(s_-w)//2+w]=m
    v=np.asarray(_Im.fromarray(pad*255).resize((28,28),_Im.BILINEAR),float)/255
    return ndi.gaussian_filter(v,1.0)
def inkcrop(clean,t):
    h=t['y1']-t['y0']; sub=clean[int(t['y0']+h*0.08):int(t['y1']-h*0.08), int(t['x0']):int(t['x1'])]
    ys,xs=np.where(sub)
    if len(ys)<8: return None
    return sub[ys.min():ys.max()+1, xs.min():xs.max()+1]
def inkdist(clean,t):
    m=inkcrop(clean,t)
    if m is None or t['c'] not in PROTO: return 9
    return float(np.abs(featm(m)-PROTO[t['c']]).mean())
def page_items(n):
    T=structure(n); tc=text_chars(n)
    clean=T['clean']
    cols=sorted(T['cols'],key=lambda c:(c['y0']//60,-c['cx']))
    def collect(box, m, gap):
        ts=[t for t in tc if box[0]<=(t['x0']+t['x1'])/2<=box[2] and box[1]<=(t['y0']+t['y1'])/2<=box[3]]
        ts=verify(clean,ts)
        cs=comps(clean, box, m)
        rest=[c for c in cs if not any(inside(c,t) for t in ts)]
        rest=[c for c in rest if c['mask'].sum()>=6]
        marks=group_marks(rest,gap)
        return ts,marks
    for c in cols:
        for cl in c['cells']:
            cl['text'],cl['marks']=collect((cl['x0'],cl['y0'],cl['x1'],cl['y1']),6,7)
    for r in T['ly']:
        r['text'],r['marks']=collect((r['x0'],r['y0'],r['x1'],r['y1']),3,4)
    return dict(n=n,cols=cols,ly=T['ly'],frame=T['frame'],Wm=T['Wm'],Wl=T['Wl'],ntext=len(tc))
if __name__=='__main__':
    pages=list(range(161,186))+list(range(187,204))
    OUT={}
    for n in pages:
        P=page_items(n)
        for c in P['cols']: c.pop('boxes',None)
        OUT[n]=P
        nt=sum(len(cl['text']) for c in P['cols'] for cl in c['cells']); nm=sum(len(cl['marks']) for c in P['cols'] for cl in c['cells'])
        print(n,'text',nt,'marks',nm,flush=True)
    pickle.dump(OUT,open(f'{S}/items.pkl','wb'))
