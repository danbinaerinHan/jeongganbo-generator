/* Shared whole-drawing renderer: homepage and animation study.
 * Idle waits on the next event deadline; only visible action frames run at 24 fps. */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let serial = 0;
  function mount(container, options) {
    const opt = options || {}, model = opt.model || global.UmulsaiBirdModel;
    if (!container || !model) return null;
    const doc = container.ownerDocument || document;
    const media = global.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerMedia = global.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const id = 'hmBird' + (++serial), images = new Map(), loadedImages = new Set(), removers = [];
    const settled = Number.isFinite(model.settled) ? model.settled : 5.8;
    const staticTime = Number.isFinite(model.staticTime) ? model.staticTime : settled + .7;
    const arrivalSheets = ['flight','braking','brakingBridge','landing','settle','walk'].filter(name=>model.sheets[name]);
    const restSheets = [...new Set(model.timeline(staticTime).poses.map(pose=>pose.sheet))];
    const startupSheets = media.matches ? [] : [...new Set(model.timeline(0).poses.map(pose=>pose.sheet))];
    let current = media.matches ? staticTime : 0, speed = 1, loop = false;
    let wanted = opt.autoplay !== false, ready = false, dead = false, failure = null;
    let inView = true, pageAway = false, timer = 0, lastClock = null, reaction = null;
    let reactionRequest = 0, reactionPending = false, extraStarted = false, lastState = null;
    let reactionHistory = [];
    let lastDrawnPose = null;
    let pointer = null, lookIndex = 0, lookTarget = 0, lookNext = 0, lookLoading = false;
    const fallback = container.querySelector('.hm-logo');
    function node(tag, attrs, parent) {
      const n = doc.createElementNS(NS, tag);
      for (const key in attrs) n.setAttribute(key, attrs[key]);
      if (parent) parent.appendChild(n);
      return n;
    }
    function attr(n, key, value) {
      const str = String(value);
      if (n.getAttribute(key) !== str) n.setAttribute(key, str);
    }
    const svg = node('svg', {class:'hm-magpie-scene',viewBox:opt.home?'230 104 184 198':'0 0 640 360',
      'aria-hidden':'true',focusable:'false'}, container);
    svg.style.visibility = 'hidden';
    const defs = node('defs', {}, svg);
    const filter = node('filter', {id:id+'Ink',x:'0',y:'0',width:'100%',height:'100%',
      'color-interpolation-filters':'sRGB'}, defs);
    node('feColorMatrix', {in:'SourceGraphic',type:'matrix',values:'0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.5 -.5 -.5 0 1.35',result:'inkAlpha'},filter);
    node('feComposite', {in:'inkAlpha',in2:'SourceGraphic',operator:'in',result:'cutout'},filter);
    // Generated ink interiors have slight alpha variation. Match solid contour
    // repairs while retaining transparent paper and soft outer edge pixels.
    const solidInk=node('feComponentTransfer',{in:'cutout',result:'solidInk'},filter);
    node('feFuncA',{type:'table',tableValues:'0 .05 .1 .15 .2 .25 .3 .35 .4 .45 .5 .55 .6 .65 .7 .75 .8 .85 .9 1 1'},solidInk);
    node('feFlood', {'flood-color':'var(--ink, #2e2a26)',result:'inkColor'},filter);
    node('feComposite', {in:'inkColor',in2:'solidInk',operator:'in'},filter);
    const asset = src => (opt.assetBase || '') + src;
    const well = node('image', {x:210,y:98,width:220,height:220,filter:'url(#'+id+'Ink)',
      href:asset(model.sheets.well.src)},svg);
    const bird = node('g',{},svg);
    function layer(parent, n) {
      const clip = node('clipPath',{id:id+'Clip'+n,clipPathUnits:'userSpaceOnUse'},defs);
      const rect = node('rect',{},clip), outer = node('g',{},parent);
      const inner = node('g',{'clip-path':'url(#'+id+'Clip'+n+')'},outer);
      // The redrawn sprites contain their own belly contour. Tint only: adding
      // a synthetic stroke here changes the character's small-scale expression.
      const image = node('image',{filter:'url(#'+id+'Ink)'},inner);
      return {outer,rect,image};
    }
    // Refill source eye holes, then cut a common aperture through the entire
    // drawing. This can enlarge small source eyes and stays transparent in every theme.
    const eyeMask = node('mask',{id:id+'Eyes','data-magpie-eye':'aperture-mask',maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:-60,y:-120,width:140,height:140,style:'mask-type:luminance'},defs);
    node('rect',{x:-60,y:-120,width:140,height:140,fill:'white'},eyeMask);
    const eyeAperture = node('path',{'data-magpie-eye':'aperture',fill:'black',display:'none'},eyeMask);
    const drawing = node('g',{mask:'url(#'+id+'Eyes)'},bird);
    const profileMask = node('mask',{id:id+'Profile','data-magpie-profile':'mask',maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:-60,y:-120,width:140,height:140,style:'mask-type:luminance'},defs);
    node('rect',{x:-60,y:-120,width:140,height:140,fill:'white'},profileMask);
    const profileClear = node('rect',{'data-magpie-profile':'clear',fill:'black',display:'none'},profileMask);
    const originals = node('g',{mask:'url(#'+id+'Profile)'},drawing);
    const birds = [layer(originals,0),layer(originals,1)];
    const profileGroup = node('path',{'data-magpie-profile':'canonical',fill:'var(--ink, #2e2a26)',display:'none'},drawing);
    const eyeTrim = node('path',{'data-magpie-eye':'trim',fill:'var(--ink, #2e2a26)',display:'none'},drawing);
    // A blink changes only the canonical eye; the body stays pixel-identical.
    const eyelid = node('circle',{fill:'var(--ink, #2e2a26)',opacity:0},bird);
    if(model.eye){attr(eyelid,'cx',model.eye.x);attr(eyelid,'cy',model.eye.y);attr(eyelid,'r',model.eye.radius);}
    const critters = [layer(svg,2),layer(svg,3)];
    let hello = null, motionToggle = null;
    if (opt.home) {
      container.classList.add('hm-magpie');
      hello = doc.createElement('button');
      hello.className = 'hm-magpie-hello'; hello.type = 'button'; hello.hidden = true;
      hello.setAttribute('aria-label','까치와 놀기');
      hello.title = '누르면 까치가 무작위 행동을 해요';
      container.appendChild(hello);
      motionToggle = doc.createElement('button');
      motionToggle.className = 'hm-magpie-toggle'; motionToggle.type = 'button'; motionToggle.hidden = true;
      container.appendChild(motionToggle);
    }
    const listening = (target,name,fn) => {
      target.addEventListener(name,fn); removers.push(()=>target.removeEventListener(name,fn));
    };
    function running() { return ready && !dead && !failure && wanted && !media.matches && !doc.hidden && inView && !pageAway; }
    function getState() {
      return {time:current,playing:running(),ready,reducedMotion:media.matches,error:failure,
        timeline:lastState,speed};
    }
    function notify() {
      if (motionToggle) {
        motionToggle.hidden = !ready || !!failure || media.matches;
        const action = current >= model.duration ? '까치 다시 보기' : wanted ? '까치 애니메이션 멈추기' : '까치 애니메이션 재생';
        const symbol = wanted && current < model.duration ? 'Ⅱ' : '▶';
        if (motionToggle.textContent !== symbol) motionToggle.textContent = symbol;
        motionToggle.title = action;
        attr(motionToggle,'aria-label',action);
        attr(motionToggle,'aria-pressed',String(!wanted));
      }
      if (opt.onUpdate) opt.onUpdate(getState());
    }
    function showLayer(n, pose, px, py, extraScale) {
      attr(n.outer,'display',pose?'inline':'none');
      if (!pose) return;
      const sheet = model.sheets[pose.sheet], g = model.geometry(pose);
      if (!sheet || !g) {attr(n.outer,'display','none');return;}
      const multiplier = extraScale || 1;
      attr(n.outer,'transform','translate('+((px||0)+g.x*multiplier)+' '+((py||0)+g.y*multiplier)+') scale('+((g.scaleX||g.scale)*multiplier)+' '+(g.scale*multiplier)+')');
      attr(n.outer,'opacity',pose.weight == null ? (pose.opacity == null ? 1 : pose.opacity) : pose.weight);
      ['x','y','width','height'].forEach((key,k)=>attr(n.rect,key,g.cell[k]));
      attr(n.image,'width',sheet.width); attr(n.image,'height',sheet.height);
      attr(n.image,'href',asset(sheet.src));
    }
    function resetLook() {pointer=null;lookIndex=lookTarget=0;lookNext=current;}
    function updateLook() {
      const idle=ready&&!media.matches&&!reactionPending&&!lastState.activeEvent&&current>=Math.max(settled,model.introDuration||0)&&current<model.departure;
      if(!idle){lookIndex=lookTarget=0;lookNext=current+.11;return;}
      const loaded=['lookUp','lookBetween'].every(name=>loadedImages.has(model.sheets[name].src));
      const target=loaded?model.gazeTarget(pointer,lookTarget):0;
      if(target!==lookTarget&&lookIndex===lookTarget)lookNext=current+.11;
      lookTarget=target;
      if(lookIndex!==lookTarget&&current+1e-8>=lookNext){lookIndex+=Math.sign(lookTarget-lookIndex);lookNext=current+.11;}
      if(lookIndex>0){lastState.poses=[model.gazePose(lookIndex)];lastState.phase='마우스를 바라보는 중';}
      lastState.gazeIndex=lookIndex;
      if(lookIndex!==lookTarget)lastState.moving=true;
    }
    function clearPointer() {
      if(!pointer&&lookIndex===0)return;
      pointer=null;
      if(running()){account();draw();schedule();}
    }
    function pointerMove(event) {
      if(event.pointerType&&event.pointerType!=='mouse'){clearPointer();return;}
      if(!pointerMedia.matches||!running()||!svg.getBoundingClientRect)return;
      const rect=svg.getBoundingClientRect(),view=opt.home?[230,104,184,198]:[0,0,640,360];
      const scale=Math.min(rect.width/view[2],rect.height/view[3]);if(!(scale>0))return;
      const point={x:view[0]+(event.clientX-rect.left-(rect.width-view[2]*scale)/2)/scale,y:view[1]+(event.clientY-rect.top-(rect.height-view[3]*scale)/2)/scale};
      const target=model.gazeTarget(point,lookTarget);
      pointer=target?point:null;
      if(target&&!lookLoading&&!['lookUp','lookBetween'].every(name=>loadedImages.has(model.sheets[name].src))){
        lookLoading=true;
        Promise.all(['lookUp','lookBetween'].map(name=>load(model.sheets[name].src))).then(()=>{
          lookLoading=false;if(running()&&pointer){account();draw();schedule();}
        },fail);
      }
      if(lastState&&lastState.activeEvent)return;
      if(target===lookTarget)return;
      account();draw();schedule();
    }
    function draw() {
      if (dead) return;
      lastState = model.timeline(current,{reaction});
      updateLook();
      attr(bird,'transform','translate('+lastState.x+' '+lastState.y+')');
      attr(bird,'opacity',lastState.opacity);
      birds.forEach((n,i)=>showLayer(n,lastState.poses[i]));
      const poseKey=lastState.poses[0].sheet+'/'+lastState.poses[0].index;
      // Head/eye paths are static within a cel; only position and blink change per tick.
      if(poseKey!==lastDrawnPose){
        lastDrawnPose=poseKey;
        const profile=model.poseProfile?model.poseProfile(lastState.poses[0]):null;
        attr(profileClear,'display',profile?'inline':'none');attr(profileGroup,'display',profile?'inline':'none');
        if(profile){
          ['x','y','width','height'].forEach((key,k)=>attr(profileClear,key,profile.clear[k]+(k===0?profile.x:k===1?profile.y:0)));
          const points=profile.contour,join=profile.x+profile.joinX;
          let outline='M '+join+' '+(profile.y+points[0][1])+' L '+(profile.x+points[0][0])+' '+(profile.y+points[0][1]);
          for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];outline+=' Q '+(profile.x+a[0])+' '+(profile.y+a[1])+' '+(profile.x+(a[0]+b[0])/2)+' '+(profile.y+(a[1]+b[1])/2);}
          const last=points[points.length-1];
          attr(profileGroup,'d',outline+' L '+(profile.x+last[0])+' '+(profile.y+last[1])+' L '+join+' '+(profile.y+last[1])+' Z');
        }
        const eyes = model.poseEyes ? model.poseEyes(lastState.poses[0]) : [];
        attr(eyeTrim,'display',eyes.length?'inline':'none');
        attr(eyeAperture,'display',eyes.length?'inline':'none');
        const ellipse = (eye,rx,ry) => 'M '+(eye.x-rx)+' '+eye.y+' a '+rx+' '+ry+' 0 1 0 '+(2*rx)+' 0 a '+rx+' '+ry+' 0 1 0 '+(-2*rx)+' 0 Z';
        if (eyes.length) {
          attr(eyeTrim,'d',eyes.map(e=>ellipse(e,e.coverRadius,e.coverRadius)).join(' '));
          attr(eyeAperture,'d',eyes.map(e=>ellipse(e,e.radius,e.radiusY)).join(' '));
        }
        if(eyes.length){attr(eyelid,'cx',eyes[0].x);attr(eyelid,'cy',eyes[0].y);}
      }
      attr(eyelid,'opacity',lastState.blink||0);
      critters.forEach((n,i)=>{
        const c=(lastState.critters||[])[i];
        showLayer(n,c,c&&c.x,c&&c.y,c&&c.scale);
      });
      if (hello) hello.hidden = !ready || !!failure || media.matches || current < settled || current >= (model.departure == null ? settled+180 : model.departure);
      notify();
    }
    function account() {
      if (lastClock !== null) current = Math.min(model.duration,current+(global.performance.now()-lastClock)*speed/1000);
      lastClock = null;
    }
    function cancel() { global.clearTimeout(timer); timer = 0; }
    function fail(error) {
      if (dead) return;
      account();cancel();failure = '까치 그림을 불러오지 못했습니다.';wanted = false;
      svg.style.visibility = 'hidden';
      if (fallback) { fallback.style.visibility = ''; fallback.removeAttribute('aria-hidden'); }
      if (hello) hello.hidden = true;
      notify();
    }
    function load(src) {
      if (images.has(src)) return images.get(src);
      const promise = new Promise((resolve,reject)=>{
        const img = new global.Image();
        img.onload = () => {
          (img.decode ? img.decode() : Promise.resolve()).then(()=>{loadedImages.add(src);resolve(img);},reject);
        };
        img.onerror = reject; img.src = asset(src);
      });
      images.set(src,promise); return promise;
    }
    function preloadExtra() {
      if (extraStarted || !ready || current < settled || media.matches) return;
      extraStarted = true;
      // One file at a time during the long rest; arrival never waits on event artwork.
      const upcoming=(model.events||[]).flatMap(event=>model.reactionSheets(event.id));
      const restFirst=[...new Set(['neutral',...(pointerMedia.matches?['lookUp','lookBetween']:[]),...upcoming,'takeoff','flight','well'])];
      // Touch-only visits need no hover atlases or unused landing sequences.
      // Click-selected artwork still loads on demand before that action starts.
      restFirst.filter(name=>model.sheets[name]).reduce((chain,name)=>chain.then(()=>dead?null:load(model.sheets[name].src)),Promise.resolve()).catch(fail);
    }
    function schedule() {
      cancel();
      if (!running()) return;
      lastClock = global.performance.now();
      let deadline = model.nextChange(current,{reaction});
      if (lastState && lastState.moving) deadline = Math.min(deadline,current+1/24);
      if (!Number.isFinite(deadline)) deadline = model.duration;
      if (current >= model.duration) return;
      timer = global.setTimeout(tick,Math.max(1000/24,1000*(deadline-current)/speed));
    }
    function tick() {
      if (!running()) {lastClock=null;return;}
      account();
      if (current >= model.duration) {
        if (loop) {current=0;resetReaction();} else wanted=false;
      }
      draw();preloadExtra();schedule();
    }
    function pause() {account();wanted=false;cancel();notify();}
    function play() {
      if (dead || failure) return;
      account();
      if (current >= model.duration) {current=0;resetReaction();}
      wanted=true;draw();preloadExtra();schedule();
    }
    function seek(value) {
      account();
      const next = Math.max(0,Math.min(model.duration,Number(value)||0));
      current=next;resetReaction();
      draw();preloadExtra();schedule();
    }
    function setSpeed(value) {
      account();speed=Math.max(.1,Math.min(20,Number(value)||1));schedule();notify();
    }
    function resetReaction() {reaction=null;reactionPending=false;reactionRequest++;resetLook();}
    function react() {
      account();
      // Never restart or replace an automatic action, a click action, or a pending load.
      if (!ready || dead || failure || media.matches || reactionPending || model.timeline(current,{reaction}).activeEvent) {schedule();return false;}
      const chosen=model.chooseReaction(current,Math.random(),reactionHistory);
      if(!chosen){schedule();return false;}
      const request=++reactionRequest;
      const sources=model.reactionSheets(chosen.id).map(name=>model.sheets[name].src);
      const begin=()=>{
        if(dead||request!==reactionRequest)return;
        account();reactionPending=false;
        // Loading may have reached another action or departure; do not interrupt it.
        if(!failure&&!media.matches&&model.canReact(current,chosen.id)&&!model.timeline(current,{reaction}).activeEvent){
          // Only an action that actually starts consumes its place in this cycle.
          if(chosen.resetCycle)reactionHistory=[];
          reactionHistory.push(chosen.id);
          reaction={id:chosen.id,start:current};draw();
        }
        schedule();
      };
      if(sources.every(src=>loadedImages.has(src)))begin();
      else{reactionPending=true;Promise.all(sources.map(load)).then(begin,fail);schedule();}
      return true;
    }
    function visibility() {account();cancel();if (running()) {draw();preloadExtra();schedule();} else notify();}
    listening(doc,'pointermove',pointerMove);
    listening(doc,'pointerleave',clearPointer);
    listening(global,'blur',clearPointer);
    listening(global,'scroll',clearPointer);
    listening(global,'resize',clearPointer);
    listening(doc,'visibilitychange',()=>{if(doc.hidden)clearPointer();visibility();});
    listening(global,'pagehide',()=>{account();pageAway=true;cancel();});
    listening(global,'pageshow',()=>{pageAway=false;visibility();});
    listening(media,'change',()=>{
      account();cancel();resetReaction();
      if (media.matches) {current=staticTime;}
      else if (ready && model.arrival !== false && arrivalSheets.some(name=>!images.has(model.sheets[name].src))) {
        // A visitor can change the OS preference without reloading the page.
        ready=false;
        Promise.all(arrivalSheets.map(name=>load(model.sheets[name].src))).then(()=>{
          if(dead || failure)return;
          ready=true;draw();preloadExtra();schedule();
        }).catch(fail);
      }
      draw();preloadExtra();schedule();
    });
    if (hello) {
      listening(hello,'click',react);
      listening(motionToggle,'click',()=>{wanted && current < model.duration ? pause() : play();});
    }
    let observer;
    if (global.IntersectionObserver) {
      observer = new global.IntersectionObserver(entries=>{
        account();inView=entries.some(e=>e.isIntersecting);cancel();
        if (running()) {draw();preloadExtra();schedule();} else notify();
      },{threshold:0});
      observer.observe(container);
    }
    // A seated arrival and the static setting need only the resting drawing.
    const initial = [...new Set([...(media.matches || model.arrival === false ? [] : arrivalSheets),...restSheets,...startupSheets])].filter(name=>model.sheets[name]);
    const initialSources = opt.preloadAll ? Object.values(model.sheets).map(sheet=>sheet.src) : initial.map(name=>model.sheets[name].src);
    Promise.all([model.sheets.well.src,...initialSources].map(load)).then(()=>{
      if (dead || failure) return;
      ready=true;draw();svg.style.visibility='';
      if (fallback) {fallback.style.visibility='hidden';fallback.setAttribute('aria-hidden','true');}
      preloadExtra();schedule();
    }).catch(fail);
    function destroy() {
      account();dead=true;cancel();removers.forEach(fn=>fn());
      if (observer) observer.disconnect();svg.remove();if(hello)hello.remove();if(motionToggle)motionToggle.remove();
      if(fallback){fallback.style.visibility='';fallback.removeAttribute('aria-hidden');}
    }
    return {play,pause,seek,react,getState,setSpeed,setLoop(value){loop=!!value;},destroy};
  }
  global.UmulsaiMagpie = {mount};
  if (typeof module !== 'undefined' && module.exports) module.exports = {mount};
  if (typeof document === 'undefined' || !global.UmulsaiBirdModel) return;
  const logo = document.querySelector('body.home .hm-logo');
  if (logo) {
    const host=document.createElement('div');host.className='hm-magpie';
    host.setAttribute('role','group');host.setAttribute('aria-label','우물사이 로고');
    logo.parentNode.insertBefore(host,logo);host.appendChild(logo);
    const model=global.UmulsaiBirdModel.createVisit(Date.now());
    mount(host,{model,home:true});
  }
})(typeof window !== 'undefined' ? window : globalThis);
