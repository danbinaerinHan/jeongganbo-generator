import numpy as np, pickle, sys
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
S=sys.argv[1]; TH=0.085
I=pickle.load(open(f'{S}/items.pkl','rb'))
def feat(m):
    h,w=m.shape; s=max(h,w); pad=np.zeros((s,s),np.uint8); pad[(s-h)//2:(s-h)//2+h,(s-w)//2:(s-w)//2+w]=m
    v=np.asarray(Image.fromarray(pad*255).resize((28,28),Image.BILINEAR),float)/255
    return ndi.gaussian_filter(v,0.9)
items=[]
for n,P in I.items():
    for ci,c in enumerate(P['cols']):
        for ki,cl in enumerate(c['cells']):
            for mi,g in enumerate(cl['marks']):
                items.append(dict(key=('c',n,ci,ki,mi),v=feat(g['mask']),h=g['mask'].shape[0],w=g['mask'].shape[1],m=g['mask']))
    for ri,r in enumerate(P['ly']):
        for mi,g in enumerate(r['marks']):
            items.append(dict(key=('l',n,ri,0,mi),v=feat(g['mask']),h=g['mask'].shape[0],w=g['mask'].shape[1],m=g['mask']))
cents=[];members=[]
for i,it in enumerate(items):
    best=None;bd=9
    for c,(cv,ch,cw) in enumerate(cents):
        if abs(np.log((it['h']+4)/(ch+4)))>0.3 or abs(np.log((it['w']+4)/(cw+4)))>0.3: continue
        d=np.abs(it['v']-cv).mean()
        if d<bd: bd=d;best=c
    if best is not None and bd<TH: members[best].append(i)
    else: cents.append((it['v'],it['h'],it['w'])); members.append([i])
order=sorted(range(len(cents)),key=lambda c:-len(members[c]))
members=[members[c] for c in order]
pickle.dump(dict(keys=[it['key'] for it in items],members=members,feats=[(it['v'],it['h'],it['w']) for it in items]),open(f'{S}/mcl.pkl','wb'))
print(len(items),'clusters',len(members))
cell=70; per=14
rows=(len(members)+per-1)//per
im=Image.new('L',(per*cell,rows*cell),255); dr=ImageDraw.Draw(im)
for k,mem in enumerate(members):
    it=items[mem[0]]; b=Image.fromarray(((1-it['m'])*255).astype(np.uint8))
    sc=min(1,52/max(it['h'],it['w'])); b=b.resize((max(1,int(it['w']*sc)),max(1,int(it['h']*sc))))
    x=(k%per)*cell; y=(k//per)*cell
    im.paste(b,(x+8,y+2)); dr.text((x+2,y+57),f'{k}:{len(mem)} {it["key"][0]}{it["key"][1]}',fill=0)
    dr.rectangle([x,y,x+cell-1,y+cell-1],outline=200)
im.save(f'{S}/mcl.png'); print(im.size)
