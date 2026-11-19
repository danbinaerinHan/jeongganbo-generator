from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
import time,sys
t0=time.time()
f=TTFont(sys.argv[1],lazy=True); cm=f.getBestCmap(); gs=f.getGlyphSet()
print("load",time.time()-t0, f["head"].unitsPerEm)
M={"01":"一","02":"二","03":"三","04":"四","05":"五","06":"六","07":"七","08":"八","10":"十","11":"文","12":"子","13":"大","14":"上","15":"中","16":"下","17":"小","18":"左"}
for k,ch in M.items():
    g=cm[ord(ch)]; bp=BoundsPen(gs); gs[g].draw(bp); x0,y0,x1,y1=bp.bounds
    pp=SVGPathPen(gs); gs[g].draw(pp)
    w,h=x1-x0,y1-y0; m=0.03*max(w,h)
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0-m:.1f} {-y1-m:.1f} {w+2*m:.1f} {h+2*m:.1f}"><path transform="scale(1,-1)" d="{pp.getCommands()}" fill="#000"/></svg>'
    open(f"{sys.argv[2]}/sigimsae-{k}.svg","w").write(svg)
print("done",time.time()-t0)
