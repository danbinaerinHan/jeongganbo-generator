# 글자마다 견본 모양(겹치지 않은 것들의 평균)
import pickle,sys,numpy as np
from PIL import Image
import os; S=sys.argv[1]; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import items as IT
I=pickle.load(open(f'{S}/items.pkl','rb'))
acc={}
for n,P in I.items():
    clean=np.array(Image.open(f'{S}/pg/{n}.png'))<150
    boxes=[t for c in P['cols'] for cl in c['cells'] for t in cl['text']]+[t for r in P['ly'] for t in r['text']]
    for t in boxes:
        m=IT.inkcrop(clean,t)
        if m is None: continue
        acc.setdefault(t['c'],[]).append(IT.featm(m))
PROTO={c:np.median(np.array(v),axis=0) for c,v in acc.items() if len(v)>=2}
pickle.dump(PROTO,open(f'{S}/proto.pkl','wb')); print(len(PROTO))
