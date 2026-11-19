import json, sys, os, re, unicodedata, fitz
S=sys.argv[1]; OUT=sys.argv[2]
os.makedirs(OUT,exist_ok=True)
D=json.load(open(f'{S}/draft.json'))
doc=fitz.open('references/정악보/국악원교육표준악보.pdf')
def table(n):
    p=doc[n-1]; W=p.rect.width/2; rows={}
    for w in p.get_text('words',clip=fitz.Rect(W,0,2*W,p.rect.height)):
        rows.setdefault(round((w[1]+w[3])/2/4),[]).append(w)
    out={}
    for y in sorted(rows):
        ws=sorted(rows[y],key=lambda w:w[0]); t=[(unicodedata.normalize('NFC',w[4]),w[0]) for w in ws]
        if not t[0][0].isdigit() or t[0][1]>600: continue
        num=int(t[0][0])
        title=' '.join(s for s,x in t[1:] if x<700 and not re.search(r'[㐀-鿿]',s))
        jd=' '.join(s for s,x in t if 860<=x<940).strip('　 ')
        lv=[s for s,x in t if x>=940]
        if not lv: continue
        lv=lv[0]
        out[num]=dict(title=title,jd=jd,lv=lv)
    return out
T={'단소':table(160),'소금':table(186)}
# 그림 쪽 가사 OCR이 놓친 줄 — 원본을 보고 손으로(각 번호는 0부터)
LAYOUT_PICK=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'layout.json'))) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)),'layout.json')) else {}
LY_OVERRIDE={195:{8:'아 | 리 랑 | '}}
LAYOUT=dict(lyricsLane=True,paperSize="A4",orientation="portrait",stackAuto=True,stackCount="2",cellSize="11",gakGap="7",bandGap="10",pageFill="50")
for k,P in D.items():
    n=int(k); inst='단소' if n<186 else '소금'; num=n-160 if n<186 else n-186
    M=T[inst][num]
    title=M['title'].replace('구조아리랑','구아리랑')
    if title=='도라지': title='도라지타령'
    title=title.replace('중 타령(','중 타령 초장(')
    base=title
    # 단소·소금에 같은 곡명이 많아 공유마당 카드에서 가르려고 악기를 붙인다. 이미 (초급) 같은 괄호가
    # 있으면 하나로 합친다 — 괄호 둘이면 세로 제목이 칸을 다 먹어 부제가 밀려난다.
    import re as _re
    mlv=_re.search(r'\((초급|중급|고급)\)$', title)
    title=f"{title[:mlv.start()].rstrip()} ({inst} {mlv.group(1)})" if mlv else f'{title} ({inst})'
    tsize='6' if len(title)>14 else '7'
    # 부제는 짧게 — 세로 칸 높이를 넘으면 앱(vertFit)이 글자를 줄여 깨알이 된다. 악기는 제목 꼬리에 있다.
    sub=' // '.join(x for x in [' · '.join(y for y in [M['lv'], M['jd']] if y), "교과서 표준악보집(2022)"] if x)
    for gi,line in LY_OVERRIDE.get(n,{}).items():
        ls=P['parts'][0]['lyrics'].split('\n'); ls[gi]=line; P['parts'][0]['lyrics']='\n'.join(ls)
    nparts=len(P['parts'])
    names=[inst] if nparts==1 else [f'{inst}1',f'{inst}2']
    parts=[dict(id=i+1,name=names[i],abbr='',instrument='all',muted=False,melody=p['melody'],lyrics=p['lyrics'],cellStyles=p['cellStyles']) for i,p in enumerate(P['parts'])]
    score=nparts>1
    hasJd=bool(P['jangdan'].replace('|','').strip())
    # 총보: 원본처럼 한 줄 N각(제목 칸이 한 자리를 먹어 +1). 파트보는 기본 10각
    # 10각 한 줄에 다 들어가는 짧은 곡은 띠가 하나라 세로 제목 칸이 낮아져 부제가 깨알이 된다 —
    # 두 줄로 나눠 세운다(+1은 제목 칸이 먹는 자리). 총보는 원본처럼 한 줄 N각.
    gc=int(P['gakCount'])
    if score: gpr=P['perBlock']+1
    elif gc<=10 and (int(P['beats'])<=6 or len(title)>14): gpr=(gc+1)//2+1
    else: gpr=10
    lay=dict(LAYOUT, gakPerRow=str(gpr))
    hasLy=any(p['lyrics'].replace('|','').strip() for p in P['parts'])
    d=dict(v=2,controls=dict(beats=str(P['beats']),gakBeats=P['gakBeats'],gakCount=str(P['gakCount']),title=title,subtitle=sub,
            hwangPitch="63",scoreView=score,daegang=P['daegang'],wantJangdan=bool(P['jangdan'].replace('|','').strip()),wantTempo=False,
            titleLayout="side",titleSize=tsize,subSize="5.5",**lay),
           viewLayouts=dict(part=dict(LAYOUT,gakPerRow="10"),score=None) if score else dict(part=None,score=None),
           jangdan=P['jangdan'],parts=parts,activePart=0,gakUserSet=True,daegangAuto=P['daegang'],customTexts=[],gakNames={},gakNameOffs={})
    fn=f"{inst} {num:02d} {base}.jgb.json"   # 파일 이름은 게시 열쇠 파일이 기억하는 이름이라 바꾸지 않는다
    # 곡마다 고른 배치(probe.mjs가 편집기에서 재어 고른 값 — 고아 줄 없이·1쪽에·정간 크게)
    lp=LAYOUT_PICK.get(fn[:-len('.jgb.json')])
    if lp: d['controls'].update(lp)
    json.dump(d,open(os.path.join(OUT,fn),'w'),ensure_ascii=False,separators=(',',':'))
    print(fn, M)
