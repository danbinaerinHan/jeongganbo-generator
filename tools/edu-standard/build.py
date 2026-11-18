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
LY_OVERRIDE={195:{8:'아 | 리 랑 | '}}
LAYOUT=dict(lyricsLane=True,paperSize="A4",orientation="portrait",stackAuto=True,stackCount="2",cellSize="11",gakGap="7",bandGap="10",pageFill="50")
for k,P in D.items():
    n=int(k); inst='단소' if n<186 else '소금'; num=n-160 if n<186 else n-186
    M=T[inst][num]
    title=M['title'].replace('구조아리랑','구아리랑')
    if title=='도라지': title='도라지타령'
    title=title.replace('중 타령(','중 타령 초장(')
    base=title
    title=f'{title} ({inst})'   # 단소·소금에 같은 곡명이 많아 공유마당 카드에서 가르려고
    sub=' // '.join(x for x in [f"{inst} · {M['lv']}", M['jd'] if M['jd'] else None, "출처: 국립국악원 『교과서 표준악보집』(2022)"] if x)
    for gi,line in LY_OVERRIDE.get(n,{}).items():
        ls=P['parts'][0]['lyrics'].split('\n'); ls[gi]=line; P['parts'][0]['lyrics']='\n'.join(ls)
    nparts=len(P['parts'])
    names=[inst] if nparts==1 else [f'{inst}1',f'{inst}2']
    parts=[dict(id=i+1,name=names[i],abbr='',instrument='all',muted=False,melody=p['melody'],lyrics=p['lyrics'],cellStyles=p['cellStyles']) for i,p in enumerate(P['parts'])]
    score=nparts>1
    hasJd=bool(P['jangdan'].replace('|','').strip())
    # 총보: 원본처럼 한 줄 N각(제목 칸이 한 자리를 먹어 +1). 파트보는 기본 10각
    lay=dict(LAYOUT, gakPerRow=str(P['perBlock']+1) if score else '10')
    hasLy=any(p['lyrics'].replace('|','').strip() for p in P['parts'])
    d=dict(v=2,controls=dict(beats=str(P['beats']),gakBeats=P['gakBeats'],gakCount=str(P['gakCount']),title=title,subtitle=sub,
            hwangPitch="63",scoreView=score,daegang=P['daegang'],wantJangdan=bool(P['jangdan'].replace('|','').strip()),wantTempo=False,
            titleLayout="side",**lay),
           viewLayouts=dict(part=dict(LAYOUT,gakPerRow="10"),score=None) if score else dict(part=None,score=None),
           jangdan=P['jangdan'],parts=parts,activePart=0,gakUserSet=True,daegangAuto=P['daegang'],customTexts=[],gakNames={},gakNameOffs={})
    fn=f"{inst} {num:02d} {base}.jgb.json"   # 파일 이름은 게시 열쇠 파일이 기억하는 이름이라 바꾸지 않는다
    json.dump(d,open(os.path.join(OUT,fn),'w'),ensure_ascii=False,separators=(',',':'))
    print(fn, M)
