import numpy as np, pickle, sys, json, collections
from PIL import Image
S=sys.argv[1]
I=pickle.load(open(f'{S}/items.pkl','rb')); L=pickle.load(open(f'{S}/mlabels.pkl','rb'))
K=300/72
YUL={'仲':'중','林':'임','南':'남','無':'무','汰':'청태','㳞':'청중','淋':'청임','湳':'청남','潕':'청무',
     '潢':'청황','㴌':'청고','㶂':'중청황','㳲':'중청태','㵈':'중청고'}
DASH={'-','－','—','‐'}
ATT={'^':'{니레}','≷':'{나니나}','∽':'{노니로}','I':'{느니르}'}
CELLSYM={'И':'{니나}','ㄴ':'{니}','ㄱ':'{노}','ㅌ':'{리}','ㅏ':'{노라}'}
JD_OVERRIDE={198:'덩 | 덕 덕 | 궁 덕 | 궁'}   # 옹헤야: 그림 쪽이라 장구 열이 제목 칸과 붙어 못 잡힘 — 원본 그대로 손으로
JANG={'⦶':'덩','◯':'궁','○':'궁','◯':'궁','|':'덕','｜':'덕','∣':'덕','dot':'다','ⅰ':'기덕','┊':'더러러러'}
def items_of(box, kind, n, idx):
    out=[]
    for t in box['text']:
        c=t['c']; h=t['size']*K
        yc=(t['y0']+t['y1'])/2
        out.append(dict(lab=c,x0=t['x0'],x1=t['x1'],yc=yc,h=h*0.85,src='t'))
    for mi,g in enumerate(box['marks']):
        lab,d=L.get(idx+(mi,),(None,9))
        if lab in (None,'x'): continue
        out.append(dict(lab=lab,x0=g['x0'],x1=g['x1'],yc=(g['y0']+g['y1'])/2,h=g['y1']-g['y0'],src='m',d=d))
    return out
def rows_of(items):
    items=sorted(items,key=lambda i:i['yc'])
    rows=[]
    for it in items:
        if rows:
            r=rows[-1]; ref=np.mean([i['yc'] for i in r]); hh=max(max(i['h'] for i in r if i['lab'] not in DASH|{'dot'} ) if any(i['lab'] not in DASH|{'dot'} for i in r) else 20, 20)
            if abs(it['yc']-ref) < 0.42*max(hh, it['h'] if it['lab'] not in DASH else 20):
                r.append(it); continue
        rows.append([it])
    return [sorted(r,key=lambda i:i['x0']) for r in rows]
def mel_cell(items, warn):
    toks=[]
    for r in rows_of(items):
        s=''
        for it in r:
            l=it['lab']
            if l in YUL: s+=YUL[l]
            elif l in DASH: s+='-'
            elif l=='△': s+='쉼'
            elif l in ATT: s+=ATT[l]
            elif l in CELLSYM: s+=CELLSYM[l]
            else: warn.append('mel? '+l)
        if s: toks.append(s)
    return ' '.join(toks)
def jang_cell(items, warn):
    rows=rows_of(items); labs=[[i['lab'] for i in r] for r in rows]
    flat=[x for r in labs for x in r]
    if flat and all(x=='dot' for x in flat) and len(flat)>=3: return '더러러러'
    toks=[]; i=0
    while i<len(labs):
        r=labs[i]
        if r==['dot'] and i+1<len(labs) and labs[i+1] in (['|'],['｜'],['∣']):
            toks.append('기덕'); i+=2; continue
        if len(r)==2 and set(r)<= {'⦶','○'}: r=['⦶']
        for x in r:
            if x in JANG: toks.append(JANG[x])
            elif x in DASH: toks.append('-')
            else: warn.append('jang? '+x)
        i+=1
    return ' '.join(toks)
def is_hangul(c): return '가'<=c<='힣'
def lyric_cells(ly, cells, warn):
    # ly: lyric region items; cells: melody cells of paired column -> list of strings
    out=[]
    its=[]
    for t in ly['text']:
        its.append(dict(lab=t['c'],yc=(t['y0']+t['y1'])/2,x0=t['x0'],h=t['size']*K*0.85))
    for c in cells:
        inc=[i for i in its if c['y0']<=i['yc']<c['y1']]
        rows=rows_of(inc)
        toks=[]
        for r in rows:
            s=''.join(i['lab'] for i in r if is_hangul(i['lab']))
            bars=any(i['lab'] in ('｜','∣','|') for i in r)
            toks.append(s if s else ('|' if bars else ''))
        while toks and toks[-1] in ('|',''): toks.pop()
        toks=['-' if t=='|' else t for t in toks]
        out.append(' '.join(t for t in toks if t))
    return out
def gray_of(a, c):
    sub=a[int(c['y0'])+8:int(c['y1'])-8, int(c['x0'])+8:int(c['x1'])-8]
    bg=sub[sub>150]
    return bg.size and np.median(bg)<240
def page_doc(n):
    P=I[n]; warn=[]
    a=np.array(Image.open(f'{S}/pg/{n}.png'))
    cols=P['cols']
    for ci,c in enumerate(cols):
        c['ci']=ci
        c['its']=[items_of(cl,'c',n,('c',n,ci,ki)) for ki,cl in enumerate(c['cells'])]
        labs=[i['lab'] for its in c['its'] for i in its]
        hz=sum(1 for l in labs if len(l)==1 and is_hangul(l))
        hj=sum(1 for l in labs if l in YUL)
        jg=sum(1 for l in labs if l in JANG)
        c['kind']='title' if hz>hj and hz>0 else ('jang' if jg>hj and jg>0 else 'mel')
    mel=[c for c in cols if c['kind']=='mel']
    # 끝 표시(겹줄) 아래 남은 커다란 빈 칸은 정간이 아니다
    hs=sorted(cl['y1']-cl['y0'] for c in mel for cl in c['cells']); med=hs[len(hs)//2] if hs else 0
    for c in mel:
        while len(c['cells'])>1 and not c['its'][-1] and (c['cells'][-1]['y1']-c['cells'][-1]['y0'])>1.6*med:
            c['cells'].pop(); c['its'].pop()
    jang=[c for c in cols if c['kind']=='jang']
    # blocks
    blocks=[]
    for c in sorted(mel,key=lambda c:c['y0']):
        for b in blocks:
            if abs(b[0]['y0']-c['y0'])<60: b.append(c); break
        else: blocks.append([c])
    for b in blocks: b.sort(key=lambda c:-c['cx'])
    # pairs (2-part): column whose right neighbour is a mel column with tiny gap
    gaks=[]
    for b in blocks:
        i=0
        while i<len(b):
            c=b[i]
            if i+1<len(b) and 0<=c['x0']-b[i+1]['x1']<25:
                gaks.append([c,b[i+1]]); i+=2
            else: gaks.append([c]); i+=1
    perBlock=max(len([1 for c in b if True]) for b in blocks)
    nparts=max(len(g) for g in gaks)
    perBlock=perBlock//nparts
    # lyrics: region whose x0 ~ right edge of first column of gak
    lyr=P['ly']
    for gi,g in enumerate(gaks):
        right=g[0]
        cand=[r for r in lyr if abs(r['x0']-right['x1'])<25 and r['y0']<right['y1'] and r['y1']>right['y0']]
        g_ly=cand[0] if cand else None
        gaks[gi]=dict(cols=g,ly=g_ly)
    counts=[len(g['cols'][0]['cells']) for g in gaks]
    beats=collections.Counter(counts).most_common(1)[0][0]
    dgs=collections.Counter(tuple(g['cols'][0]['dg']) for g in gaks if len(g['cols'][0]['cells'])==beats).most_common(1)[0][0]
    daegang=' '.join(map(str,dgs)) if len(dgs)>1 and max(dgs)>1 else ''
    gakBeats=', '.join(f'{i+1}:{c}' for i,c in enumerate(counts) if c!=beats)
    parts=[]
    for p in range(nparts):
        lines=[];lylines=[];styles={}
        for gi,g in enumerate(gaks):
            if p>=len(g['cols']): lines.append(' | '.join(['']*counts[gi])); lylines.append(''); continue
            c=g['cols'][p]
            cells=[mel_cell(its,warn) for its in c['its']]
            lines.append(' | '.join(cells))
            for ki,cl in enumerate(c['cells']):
                if gray_of(a,cl): styles.setdefault(str(gi),{})[str(ki)]={'fill':'#e6e6e6'}
            if p==0 and g['ly'] is not None:
                lylines.append(' | '.join(lyric_cells(g['ly'],c['cells'],warn)))
            else: lylines.append(' | '.join(['']*len(c['cells'])))
        parts.append(dict(melody='\n'.join(lines),lyrics='\n'.join(lylines),cellStyles=styles))
    jd=''
    if n in JD_OVERRIDE: jd=JD_OVERRIDE[n]
    elif jang:
        J=sorted(jang,key=lambda c:(c['y0'],-c['cx']))[0]
        jd=' | '.join(jang_cell(its,warn) for its in J['its'])
    return dict(n=n,beats=beats,daegang=daegang,gakBeats=gakBeats,gakCount=len(gaks),parts=parts,jangdan=jd,
                warn=collections.Counter(warn),njang=len(jang),ntitle=sum(1 for c in cols if c['kind']=='title'),
                counts=counts,perBlock=perBlock)
if __name__=='__main__':
    pages=[int(x) for x in sys.argv[2:]] or (list(range(161,186))+list(range(187,204)))
    R={}
    for n in pages:
        D=page_doc(n); R[n]=D
        print(f"== {n} beats={D['beats']} dg='{D['daegang']}' gak={D['gakCount']} gb='{D['gakBeats']}' parts={len(D['parts'])} jang={D['njang']} warn={dict(D['warn'])}")
        print('  JD:',D['jangdan'])
        for p in D['parts']:
            for l in p['melody'].split('\n')[:2]: print('  M:',l)
            for l in p['lyrics'].split('\n')[:2]: print('  L:',l)
    json.dump({str(k):{kk:(vv if kk!='warn' else dict(vv)) for kk,vv in v.items()} for k,v in R.items()},open(f'{S}/draft.json','w'),ensure_ascii=False,indent=1)
