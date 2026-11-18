import numpy as np, sys, json, pickle
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import os; S=sys.argv[1]; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from seg import page
def mode(vals,tol):
    best=None;bc=0
    for v in vals:
        c=sum(1 for u in vals if abs(u-v)<=tol)
        if c>bc: bc=c;best=v
    return best
def split_box(ink, r):
    # find dotted/solid separators inside a box
    m=6
    sub=ink[r['y0']:r['y1'], r['x0']+m:r['x1']-m]
    frac=sub.mean(1); W=sub.shape[1]
    span=np.array([ (np.where(row)[0][-1]-np.where(row)[0][0]) if row.any() else 0 for row in sub])
    cand=np.where((frac>0.25)&(span>W-14))[0]
    def quiet(y):
        a_=max(0,y-6); b_=min(len(frac),y+7)
        return frac[a_] < 0.15 and frac[b_-1] < 0.15
    cuts=[]
    for y in cand:
        if y<8 or y>sub.shape[0]-8: continue
        if cuts and y-cuts[-1][-1]<=3: cuts[-1].append(y); continue
        if not quiet(y): continue
        if False: pass
        else: cuts.append([y])
    ys=[r['y0']]+[r['y0']+int(np.mean(c)) for c in cuts]+[r['y1']]
    return [(ys[i],ys[i+1]) for i in range(len(ys)-1) if ys[i+1]-ys[i]>20]
def structure(n):
    a,ink,lines,lab,regs,fr=page(n)
    for r in regs: r['w']=r['x1']-r['x0']; r['h']=r['y1']-r['y0']
    Wm=mode([r['w'] for r in regs if r['w']>=100],8)
    narrow=[r['w'] for r in regs if 30<=r['w']<Wm*0.75 and r['h']>100]
    Wl=mode(narrow,8) if narrow else 0
    mel=[r for r in regs if abs(r['w']-Wm)<=0.12*Wm]
    ly=[r for r in regs if Wl and abs(r['w']-Wl)<=0.25*Wl and r['h']>Wl*1.5]
    # column runs
    cols=[]
    for r in sorted(mel,key=lambda r:(r['y0'],r['x0'])):
        cx=(r['x0']+r['x1'])/2
        for c in cols:
            if abs(c['cx']-cx)<15 and 0<=r['y0']-c['boxes'][-1]['y1']<25:
                c['boxes'].append(r); break
        else: cols.append(dict(cx=cx,boxes=[r]))
    # 장구 열 후보: 선율 열보다 오른쪽, 첫 블록 높이 안, 폭이 선율 열의 0.45~1.3배
    if cols:
        mx=max(c['boxes'][0]['x1'] for c in cols); top=min(c['boxes'][0]['y0'] for c in cols)
        b1=[c for c in cols if abs(c['boxes'][0]['y0']-top)<60]; ybot=max(c['boxes'][-1]['y1'] for c in b1)
        used={id(b) for c in cols for b in c['boxes']}|{id(r) for r in ly}
        cand=[r for r in regs if id(r) not in used and r['x0']>=mx-5 and 0.45*Wm<=r['w']<=1.3*Wm and r['y0']>=top-10 and r['y1']<=ybot+15]
        if cand:
            cx=min(cand,key=lambda r:r['x0'])
            same=sorted([r for r in cand if abs(r['x0']-cx['x0'])<15],key=lambda r:r['y0'])
            cols.append(dict(cx=(same[0]['x0']+same[0]['x1'])/2,boxes=same,extra=True))
    clean=ink&~lines
    for c in cols:
        c['x0']=min(b['x0'] for b in c['boxes']); c['x1']=max(b['x1'] for b in c['boxes'])
        c['y0']=c['boxes'][0]['y0']; c['y1']=c['boxes'][-1]['y1']
        c['cells']=[]; c['dg']=[]
        for b in c['boxes']:
            sp=split_box(a<215,b); c['dg'].append(len(sp))
            for y0,y1 in sp: c['cells'].append(dict(y0=y0,y1=y1,x0=b['x0'],x1=b['x1']))
    return dict(n=n,a=a,ink=ink,clean=clean,cols=cols,ly=ly,frame=fr,Wm=Wm,Wl=Wl)
if __name__=='__main__':
    pages=[int(x) for x in sys.argv[2:]] or (list(range(161,186))+list(range(187,204)))
    out={}
    for n in pages:
        T=structure(n)
        im=Image.fromarray(T['a']).convert('RGB'); dr=ImageDraw.Draw(im)
        for i,c in enumerate(sorted(T['cols'],key=lambda c:(c['y0']//60,-c['cx']))):
            for cl in c['cells']: dr.rectangle([cl['x0']+3,cl['y0']+3,cl['x1']-3,cl['y1']-3],outline=(255,0,0),width=4)
            dr.text((c['x0']+8,c['y0']+8),str(i),fill=(0,0,255))
        for r in T['ly']: dr.rectangle([r['x0']+3,r['y0']+3,r['x1']-3,r['y1']-3],outline=(0,170,0),width=4)
        im.resize((im.width//4,im.height//4)).save(f'{S}/ov{n}.png')
        print(n,'cols',len(T['cols']),[ (len(c['cells']),c['dg']) for c in sorted(T['cols'],key=lambda c:(c['y0']//60,-c['cx']))][:12])
