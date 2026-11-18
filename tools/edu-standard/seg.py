import numpy as np, sys, json
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
S=sys.argv[1]
def runmask(b, L, axis):
    # pixels belonging to runs of length>=L along axis
    if axis==1: return runmask(b.T,L,0).T
    H,W=b.shape; out=np.zeros_like(b)
    d=np.diff(np.vstack([np.zeros((1,W),bool),b,np.zeros((1,W),bool)]).astype(np.int8),axis=0)
    for x in range(W):
        st=np.where(d[:,x]==1)[0]; en=np.where(d[:,x]==-1)[0]
        for s,e in zip(st,en):
            if e-s>=L: out[s:e,x]=True
    return out
def page(n):
    a=np.array(Image.open(f'{S}/pg/{n}.png')).astype(np.uint8)
    ink=a<150
    lk=a<190
    lines=runmask(lk,90,0)|runmask(lk,90,1)
    lines=ndi.binary_dilation(lines,iterations=2)
    # frame bbox from long lines
    ys,xs=np.where(lines)
    # exclude page edge line at far right (x>=2140)
    m=xs<2140; ys,xs=ys[m],xs[m]
    X0,X1,Y0,Y1=xs.min(),xs.max(),ys.min(),ys.max()
    free=~lines; free[:,:X0]=False; free[:,X1:]=False; free[:Y0]=False; free[Y1:]=False
    lab,k=ndi.label(free)
    regs=[]
    for i,sl in enumerate(ndi.find_objects(lab)):
        y0,y1=sl[0].start,sl[0].stop; x0,x1=sl[1].start,sl[1].stop
        if (x1-x0)<25 or (y1-y0)<25: continue
        regs.append(dict(x0=int(x0),x1=int(x1),y0=int(y0),y1=int(y1),id=i+1))
    return a,ink,lines,lab,regs,(int(X0),int(X1),int(Y0),int(Y1))
if __name__=='__main__':
    n=int(sys.argv[2]); a,ink,lines,lab,regs,fr=page(n)
    im=Image.fromarray(a).convert('RGB'); dr=ImageDraw.Draw(im)
    for r in regs: dr.rectangle([r['x0'],r['y0'],r['x1'],r['y1']],outline=(255,0,0),width=3)
    im.resize((im.width//3,im.height//3)).save(f'{S}/ov{n}.png')
    print(fr,len(regs)); 
    for r in sorted(regs,key=lambda r:(r['y0'],-r['x0']))[:40]: print(r)
