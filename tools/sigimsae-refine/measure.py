import sys,json,numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize
rd=sys.argv[1]
for stem in sys.argv[2:]:
    m=json.load(open(f"{rd}/{stem}.json")); a=np.array(Image.open(f"{rd}/{stem}.png").convert("L"))<128
    ys,xs=np.nonzero(a); pad=m["pad"]; s=m["s"]; vb=m["vb"]
    # ink bbox in viewBox units
    bb=[(xs.min()-pad)/s+vb[0],(ys.min()-pad)/s+vb[1],(xs.max()+1-pad)/s+vb[0],(ys.max()+1-pad)/s+vb[1]]
    d=ndimage.distance_transform_edt(a); sk=skeletonize(a)
    w=2*d[sk]/s
    print(f"{stem:14s} vb={[round(v,2) for v in vb]} ink={[round(v,1) for v in bb]} stroke med={np.median(w):.1f} p25={np.percentile(w,25):.1f} p75={np.percentile(w,75):.1f}")
