(function(){
  'use strict';
  const $=id=>document.getElementById(id), base=window.UmulsaiBirdModel;
  let controller, model, lastUpdate=0, snapshot, previewMode='visit';
  function clock(t){return `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,'0')}`;}
  function update(s){
    snapshot=s;lastUpdate=performance.now();
    $('play').disabled=$('replay').disabled=!s.ready;
    $('play').textContent=s.playing?'일시정지':'재생';$('play').setAttribute('aria-pressed',String(s.playing));
    $('phase').textContent=s.error||(!s.ready?'까치 그림 준비 중':s.timeline?s.timeline.phase:'등장 전');
    $('scrub').value=s.time;
    $('progress').textContent=`${clock(s.time)} / ${clock(model.duration)}`;
    $('note').textContent=s.reducedMotion?'기기의 동작 줄이기 설정에 따라 정지 자세로 표시합니다.':previewMode==='visit'?`${model.startMode==='wake'?'졸던 까치가 천천히 깨어나며':model.arrival?'날아와 자리에 앉은 뒤':'앉아 있는 상태로 시작해'} 3분간 머뭅니다. 빠르게 보려면 10×를 선택하세요.`:previewMode==='review'?'각 행동 사이에 정지 자세를 넣어 크기와 연결을 비교합니다. 졸기에는 깨어나는 과정도 포함됩니다.':'선택한 행동을 바로 재생합니다. 전체 방문에서는 자연스러운 간격으로 등장합니다.';
  }
  function start(next,at=0){
    if(controller)controller.destroy();
    model=next;$('scrub').max=model.duration;
    controller=window.UmulsaiMagpie.mount($('scene'),{model,assetBase:'../../../',autoplay:true,preloadAll:true,onUpdate:update});
    controller.setSpeed(Number($('speed').value));controller.setLoop($('loop').checked);
    if(at&&!controller.getState().reducedMotion)controller.seek(at);
  }
  for(const event of base.eventCatalog){
    const button=document.createElement('button');button.type='button';button.textContent=event.label;button.dataset.event=event.id;
    button.addEventListener('click',()=>{previewMode=event.id;for(const b of document.querySelectorAll('[data-event]'))b.setAttribute('aria-pressed',String(b===button));start(base.createDemo(event.id),7);});
    $('events').appendChild(button);
  }
  $('visit').addEventListener('click',()=>{previewMode='visit';for(const b of document.querySelectorAll('[data-event]'))b.setAttribute('aria-pressed','false');start(base.createVisit(1409,{arrival:true}));});
  $('seated').addEventListener('click',()=>{previewMode='visit';start(base.createVisit(1409,{arrival:false}));});
  $('waking').addEventListener('click',()=>{previewMode='visit';start(base.createVisit(1409,{startMode:'wake'}));});
  $('review').addEventListener('click',()=>{
    previewMode='review';let time=7;
    const events=base.eventCatalog.filter(e=>e.id!=='wake').map(e=>{const entry={id:e.id,start:time};time+=e.duration+1.5;return entry;});
    for(const b of document.querySelectorAll('[data-event]'))b.setAttribute('aria-pressed','false');
    start(base.createVisit(1409,{arrival:true,events,departure:time}));
  });
  $('landing').addEventListener('click',()=>{previewMode='landing';start(base.createVisit(1409,{arrival:true}),base.arrivalTiming.brakingStart-.1);});
  $('depart').addEventListener('click',()=>controller.seek(model.departure));
  $('hello').addEventListener('click',()=>{if(controller.react())controller.play();});
  $('play').addEventListener('click',()=>controller.getState().playing?controller.pause():controller.play());
  $('replay').addEventListener('click',()=>{controller.seek(previewMode==='landing'?base.arrivalTiming.brakingStart-.1:previewMode==='visit'||previewMode==='review'?0:7);controller.play();});
  $('scrub').addEventListener('input',()=>{controller.pause();controller.seek(Number($('scrub').value));});
  $('speed').addEventListener('change',()=>controller.setSpeed(Number($('speed').value)));
  $('loop').addEventListener('change',()=>controller.setLoop($('loop').checked));
  $('theme').addEventListener('change',e=>document.documentElement.dataset.theme=e.target.value);
  // Only the study's numeric readout ticks while the bird itself sleeps.
  const readout=setInterval(()=>{if(snapshot&&snapshot.playing){const t=Math.min(model.duration,snapshot.time+(performance.now()-lastUpdate)/1000*snapshot.speed);$('progress').textContent=`${clock(t)} / ${clock(model.duration)}`;$('scrub').value=t;}},1000);
  window.addEventListener('pagehide',()=>clearInterval(readout),{once:true});
  start(base.createVisit(1409,{arrival:true}));
})();
