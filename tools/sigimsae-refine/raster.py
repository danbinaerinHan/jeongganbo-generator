# raster.py outdir LONG PADFRAC file.svg...  -> outdir/<stem>.png (grayscale) + outdir/<stem>.json (viewBox, scale, pad)
# 원본 viewBox를 긴 변 LONG px로 키우고 둘레에 PADFRAC*LONG 여백을 둔다.
import sys,os,re,json,base64,subprocess
out,LONG,PADF=sys.argv[1],int(sys.argv[2]),float(sys.argv[3]); files=sys.argv[4:]
os.makedirs(out,exist_ok=True)
jobs=[]
for f in files:
    t=open(f,encoding="utf-8").read()
    vb=[float(x) for x in re.search(r'viewBox="([^"]+)"',t).group(1).split()]
    s=LONG/max(vb[2],vb[3]); pad=round(PADF*LONG)
    W=round(vb[2]*s)+2*pad; H=round(vb[3]*s)+2*pad
    stem=os.path.splitext(os.path.basename(f))[0]
    jobs.append(dict(stem=stem,src="data:image/svg+xml;base64,"+base64.b64encode(t.encode()).decode(),W=W,H=H,pad=pad,s=s,vb=vb))
js=json.dumps(jobs)
html="""<html><body><pre id=o></pre><script>
const J=%s;let res={};let n=0;
J.forEach(j=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=j.W;c.height=j.H;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,j.W,j.H);x.drawImage(im,j.pad,j.pad,j.W-2*j.pad,j.H-2*j.pad);res[j.stem]=c.toDataURL('image/png');if(++n==J.length)document.getElementById('o').textContent=JSON.stringify(res);};im.src=j.src;});
</script></body></html>"""%js
hp=os.path.join(out,"_r.html"); open(hp,"w").write(html)
r=subprocess.run(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome","--headless=new","--disable-gpu","--virtual-time-budget=20000","--dump-dom","file://"+hp],capture_output=True,text=True)
m=re.search(r'<pre id="o">(.*?)</pre>',r.stdout,re.S)
res=json.loads(m.group(1).replace("&quot;",'"').replace("&amp;","&"))
for j in jobs:
    open(os.path.join(out,j["stem"]+".png"),"wb").write(base64.b64decode(res[j["stem"]].split(",")[1]))
    json.dump({k:j[k] for k in("W","H","pad","s","vb")},open(os.path.join(out,j["stem"]+".json"),"w"))
print(len(jobs),"rendered")
