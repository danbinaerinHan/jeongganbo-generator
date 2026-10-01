const fs=require('fs'),vm=require('vm'),assert=require('assert');
// Run from the repository root: node tools/check-home-magpie.cjs
const path=require('node:path');
const model=require(path.resolve('assets/brand/animation-v3/model.js'));
const measured=JSON.parse(fs.readFileSync('assets/brand/animation-v6/body-measurements.json','utf8'));
const landingMeasured=JSON.parse(fs.readFileSync('assets/brand/animation-v8/body-measurements.json','utf8')).landing;
const lookUpMeasured=model.sheets.lookUp?JSON.parse(fs.readFileSync('assets/brand/animation-v10/body-measurements.json','utf8')):{};
const betweenMeasured=JSON.parse(fs.readFileSync('assets/brand/animation-v11/body-measurements.json','utf8'));
const brakingMeasured=JSON.parse(fs.readFileSync('assets/brand/animation-v12/body-measurements.json','utf8'));
const settleMeasured=JSON.parse(fs.readFileSync('assets/brand/animation-v13/body-measurements.json','utf8'));
const hopMeasured=JSON.parse(fs.readFileSync('assets/brand/animation-v14/body-measurements.json','utf8'));
const measurementFor=sheet=>sheet==='landing'?landingMeasured:sheet==='neutral'?measured.walk:measured[sheet]||lookUpMeasured[sheet]||betweenMeasured[sheet]||brakingMeasured[sheet]||settleMeasured[sheet]||hopMeasured[sheet];
const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-10,message);
const canonical=model.geometry({sheet:'neutral',index:0});
const reference=measured.walk.frames[0];
const bodyArea=reference.bodyArea*canonical.scale**2;
const headWidth=(reference.head[0]+reference.head[1])*canonical.scale;
for(const [sheet,ref] of Object.entries({gaze:0,bow:0,preen:0,stretch:0,wake:8,walk:0,flight:0,takeoff:0})){
 const g=model.geometry({sheet,index:ref}),source=measured[sheet].frames[ref];
 for(const f of model.frames[sheet]){
  assert.equal(f.scale,f.scaleX,`${sheet}: do not stretch character proportions`);
  assert.equal(f.scale,g.scale,`${sheet}: no whole-bird zoom between poses`);
 }
 const ratio=(source.head[0]+source.head[1])*g.scale/headWidth;
 assert(ratio>=.95&&ratio<=1.101,`${sheet}: head must retain the canonical character size`);
 // The airborne silhouette is streamlined and partly occluded by its wings.
 if(sheet!=='flight')assert(Math.abs(source.bodyArea*g.scale**2/bodyArea-1)<.03,`${sheet}: resting torso volume must match`);
}
assert.equal(model.sheets.flight.src,'assets/brand/animation-v6/art/flight.webp');
assert(!model.flightWings&&!model.sheets.flightWings&&!model.frames.flightWings,'Flight uses complete bird drawings without a separate wing rig');
assert.equal(model.frames.flight.length,9);
assert.equal(new Set(model.frames.flight.map(f=>JSON.stringify(f.cell))).size,9,'Nine wingbeats must select nine distinct whole-bird drawings');
assert.equal(model.sheets.landing.src,'assets/brand/animation-v8/art/landing.webp');
const landingScale=model.geometry({sheet:'landing',index:8}).scale;
assert(Math.abs(landingMeasured.frames[8].bodyArea*landingScale**2/bodyArea-1)<.03,'Folded landing torso retains the neutral body volume');
for(const sheet of ['walk','landing'])for(let index=0;index<model.frames[sheet].length;index++){
 const g=model.geometry({sheet,index}),eye=(sheet==='landing'?landingMeasured:measured.walk).frames[index].eyes[0];
 assert.equal(g.scale,g.scaleX,`${sheet}: preserve character proportions`);
 assert.equal(g.scale,model.frames[sheet][0].scale,`${sheet}: do not zoom between source poses`);
 assert(Math.abs(g.x+eye[0]*g.scaleX-model.eye.x)<1e-8,`${sheet} ${index}: moving toes must not make the whole bird jump sideways`);
}
for(const [name,frames] of Object.entries(model.frames)){
 const sheet=model.sheets[name];
 for(const f of frames){const [x,y,w,h]=f.cell;assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=sheet.width&&y+h<=sheet.height,`${name}: complete source cell stays inside its atlas`);}
}
// Independent source measurements reproduce the reported pre-landing eye jump.
const sourceEyeDiameter=(sheet,index)=>{
 const data=(sheet==='landing'?landingMeasured:measured[sheet]).frames[index];
 return 2*Math.sqrt(data.eyes[0][2]/Math.PI)*model.frames[sheet][index].scale;
};
assert(sourceEyeDiameter('landing',1)>sourceEyeDiameter('flight',0)*1.1);
assert(sourceEyeDiameter('landing',1)>sourceEyeDiameter('walk',1)*1.35);
for(const sheet of ['flight','landing','walk','neutral'])for(let index=0;index<model.frames[sheet].length;index++){
 const g=model.geometry({sheet,index});
 const data=(sheet==='landing'?landingMeasured:measured[sheet==='neutral'?'walk':sheet]).frames[index];
 const e=model.poseEye({sheet,index});
 close(e.radius,1.15,'Open eyes are 15% larger through approach, landing and walking');
 assert(Math.abs(e.x-(data.eyes[0][0]-g.anchor[0])*g.scaleX)<1e-8);
 assert(Math.abs(e.y-(data.eyes[0][1]-g.anchor[1])*g.scale)<1e-8,'Eye correction follows each drawn head');
}
// Audit open, frontal, closed and waking eye states across every action atlas.
for(const sheet of Object.keys(model.frames).filter(name=>name!=='critters'))for(let index=0;index<model.frames[sheet].length;index++){
 const pose={sheet,index},g=model.geometry(pose),eyes=model.poseEyes(pose);
 const closed=(sheet==='wake'&&index<=4)||(sheet==='preen'&&index===4);
 const source=measurementFor(sheet).frames[index];
 if(closed){assert.deepEqual(eyes,[],'Closed source eyelids must remain intact');continue;}
 assert.equal(eyes.length,source.eyes.length,'Both frontal eyes are handled');
 eyes.forEach((e,i)=>{
  close(e.radius,(eyes.length===2?.85:1)*1.15,'Every open eye grows by 15%, including both frontal eyes');
  close(e.radiusY,sheet==='wake'&&index===5?.45*1.15:sheet==='wake'&&index===6?.75*1.15:e.radius,'Half-open waking eyes retain their eyelid proportions');
  assert(Math.abs(e.x-(source.eyes[i][0]-g.anchor[0])*g.scaleX)<1e-8);
  assert(Math.abs(e.y-(source.eyes[i][1]-g.anchor[1])*g.scale)<1e-8);
 });
}
// Stretch keeps the SAME front toe planted instead of centering a one-foot pose.
const toeTarget=(146-model.frames.neutral[0].anchor[0])*model.frames.neutral[0].scale;
for(const [index,xy]of Object.entries({1:[553,374],2:[966,375],3:[138,778],5:[969,778],6:[139,1153],7:[548.5,1153]})){
 const g=model.geometry({sheet:'stretch',index:Number(index)});
 assert(Math.abs(g.x+xy[0]*g.scaleX-toeTarget)<1e-8,'Stretch must not translate the body when a foot lifts');
 if(Number(index)!==7)assert(Math.abs(g.y+xy[1]*g.scale)<1e-8,'Single supporting toe stays at ground height');
 assert.equal(g.scale,.2245974,'Correct anchor drift without resizing the bird');
}
// Butterfly poses must follow the visible insect, including above the head,
// while the same belly center and supporting sole remain registered.
const butterfly=model.createDemo('butterfly'),seenLooks=[];
for(let u=0;u<6.6;u+=1/24){
 const s=butterfly.timeline(7+u),p=s.poses[0],eye=butterfly.poseEye(p),c=s.critters[0];
 assert(['neutral','lookUp','lookBetween'].includes(p.sheet),'Butterfly never plays the unrelated look-behind sequence');
 close(s.x,model.perchX,'Watching does not move the planted bird');close(s.y,model.ground,'Watching stays grounded');
 const index=p.sheet==='neutral'?0:p.sheet==='lookBetween'?p.index*2-1:p.index*2;
 if(seenLooks.at(-1)!==index)seenLooks.push(index);
 if(u>.3&&c.opacity>.1){
  const angle=Math.atan2(s.y+eye.y-c.y,c.x-s.x-eye.x),direction=[180,167.5,155,140,125,107.5,90,72.5,55,40,25][index]*Math.PI/180;
  const delta=Math.abs(Math.atan2(Math.sin(angle-direction),Math.cos(angle-direction)))*180/Math.PI;
  assert(delta<18,'Drawn gaze follows the actual butterfly within a pose step and reaction delay');
 }
 if(c.x<300)assert(index<=5,'Do not look behind while butterfly is approaching from the left');
}
assert.deepEqual(seenLooks,[0,1,2,3,4,5,6,7,8,9,10],'Gaze crosses upward in order without flickering or skipping poses');
assert.equal(butterfly.timeline(10.4).poses[0].index,3,'Look up as butterfly crosses overhead');
assert.equal(butterfly.timeline(15.2).poses[0].sheet,'neutral','Return to the same resting drawing after the butterfly leaves');
const restingBelly=reference.patches.at(-1),restingBellyX=(restingBelly.bbox[0]+restingBelly.bbox[2])/2;
for(let index=1;index<6;index++){
 const g=model.geometry({sheet:'lookUp',index}),source=lookUpMeasured.lookUp.frames[index],belly=source.patches.at(-1);
 close(g.scale,.193,'One uniform scale across upward poses');close(g.scaleX,g.scale,'No proportion stretching');
 close(g.y+source.foot[2]*g.scale,0,'Drawn sole contacts the ground');
 close(g.x+(belly.bbox[0]+belly.bbox[2])/2*g.scale,canonical.x+restingBellyX*canonical.scale,'Torso center stays planted as head turns');
 assert(Math.abs(belly.area*g.scale**2/(restingBelly.area*canonical.scale**2)-1)<.025,'Visible belly size stays within 2.5% of resting artwork');
}
// Return uses the same complete poses in reverse; the 24fps player sees each intermediate.
const returnLooks=[];
for(let u=6.85;u<8.4;u+=1/24){const p=butterfly.timeline(7+u).poses[0],i=p.sheet==='neutral'?0:p.sheet==='lookBetween'?p.index*2-1:p.index*2;if(returnLooks.at(-1)!==i)returnLooks.push(i);}
assert.deepEqual(returnLooks,[10,9,8,7,6,5,4,3,2,1,0],'Return cannot skip an intermediate at playback frame rate');
for(let index=1;index<6;index++){
 const g=model.geometry({sheet:'lookBetween',index}),source=betweenMeasured.lookBetween.frames[index],belly=source.patches.at(-1);
 close(g.scale,.1902,'Intermediate drawings share one scale');close(g.scaleX,g.scale,'Intermediate proportions remain uniform');
 close(g.y+source.foot[2]*g.scale,0,'Intermediate sole stays grounded');
 close(g.x+(belly.bbox[0]+belly.bbox[2])/2*g.scale,canonical.x+restingBellyX*canonical.scale,'Intermediate torso stays registered');
 assert(Math.abs(Math.sqrt(belly.area*g.scale**2/(restingBelly.area*canonical.scale**2))-1)<.022,'Intermediate belly linear size remains within2.2% of rest');
 const eye=model.poseEye({sheet:'lookBetween',index}),a=model.poseEye(index===1?{sheet:'neutral',index:0}:{sheet:'lookUp',index:index-1}),b=model.poseEye({sheet:'lookUp',index});
 assert(eye.y>=Math.min(a.y,b.y)-1.5&&eye.y<=Math.max(a.y,b.y)+1.5,'Inserted head must not stretch its neck far outside the neighboring poses');
}
// Ambient blinks are frequent resting behavior, not scheduled character events.
for(const startMode of ['fly','perched','wake']){
 const idle=model.createVisit(24,{startMode,events:[]});
 assert(idle.ambientBlinks.length>23,'Three-minute rest includes frequent background blinking');
 let last=Math.max(idle.settled,idle.introDuration);
 for(const start of idle.ambientBlinks){
  assert(start-last>=4&&start-last<=7,'Resting blinks vary between4 and7 seconds');
  const s=idle.timeline(start+.1);assert.equal(s.activeEvent,null);assert(s.blink>.99&&s.moving);
  assert.deepEqual(s.poses,[{sheet:'neutral',index:0,weight:1}],'Background blink leaves the resting drawing unchanged');
  close(idle.nextChange(start-.1),start,'Idle renderer wakes exactly for the next blink');
  assert.equal(idle.timeline(start+.4).blink,0);last=start;
 }
}
const busy=model.createVisit(24);
assert(!busy.events.some(e=>e.id==='blink'),'Background blinks do not consume event slots');
for(const start of busy.ambientBlinks)assert(busy.events.every(e=>start+.38<e.start||start>e.start+e.duration+.3),'Do not blink over another action');
const blinking=model.createDemo('blink');
for(let t=7;t<7.38;t+=.01){
 const s=blinking.timeline(t);assert.deepEqual(s.poses,[{sheet:'neutral',index:0,weight:1}],'Blink must leave every body pixel unchanged');
}
assert(blinking.timeline(7.1).blink>.99);
let arrivals=0;const modes={fly:0,perched:0,wake:0};
for(let seed=0;seed<1000;seed++){
 const visit=model.createVisit(seed);arrivals+=Number(visit.arrival);modes[visit.startMode]++;
 assert.equal(visit.stay,180);
 assert.equal(visit.events.filter(e=>e.id==='worm'||e.id==='butterfly').length,1);
 const first=visit.events[0],firstWait=first.start-Math.max(visit.settled,visit.introDuration);
 const insectIndex=visit.events.findIndex(e=>e.id==='worm'||e.id==='butterfly');
 assert(insectIndex===1||insectIndex===2,'Insect encounter must be the second or third automatic action');
 assert(firstWait>=7&&firstWait<=9,'First action starts 7–9 seconds after landing or waking finishes');
 for(let i=1;i<visit.events.length;i++)assert(visit.events[i-1].start+visit.events[i-1].duration<=visit.events[i].start,'Events must not overlap');
 for(const e of visit.events){assert(e.start>=visit.settled);assert(e.start+e.duration<visit.departure);}
 for(let t=0;t<visit.duration;t+=.251){
  const state=visit.timeline(t);assert(Number.isFinite(state.x+state.y+state.opacity));assert(visit.nextChange(t)>t);
  assert.equal(state.poses.length,1,'Overlapping full birds must not inflate transition silhouettes');
  for(const p of [...state.poses,...state.critters]){const f=visit.geometry(p),sheet=visit.sheets[p.sheet];assert(f.cell[0]>=0&&f.cell[1]>=0&&f.cell[0]+f.cell[2]<=sheet.width&&f.cell[1]+f.cell[3]<=sheet.height);}
 }
}
assert(arrivals>450&&arrivals<550,'Seeded flying arrival should be about half');
assert(modes.perched>200&&modes.perched<300&&modes.wake>200&&modes.wake<300);
const fly=model.createVisit(1,{startMode:'fly'});
const contact=.4+3.1/1.45,walkStart=contact+1.55/1.35,walkEnd=walkStart+2.6;
const arrivalTime=t=>t<=.4?t:t<=3.5?.4+(t-.4)/1.45:t<=5.05?contact+(t-3.5)/1.35:walkStart+t-5.05;
close(fly.settled,walkEnd+.15,'Two walk cycles finish before the resting interval');
close(fly.arrivalTiming.touchdown,contact,'Approach uses the faster flight timing');
close(fly.arrivalTiming.walkStart,walkStart,'Standing recovery also runs faster');
for(const t of [...[5.01,5.05,5.15].map(arrivalTime),walkEnd,fly.settled,fly.departure])assert.equal(fly.timeline(t).poses[0].sheet,'neutral','Phase boundaries share the exact neutral drawing');
// Compare the actual displayed transition, not just unrelated torso areas.
assert.equal(model.sheets.neutral.src,model.sheets.walk.src);
assert.deepEqual(model.frames.neutral[0],model.frames.walk[0]);
for(const t of [...[5.01,5.05,5.15].map(arrivalTime),walkEnd,fly.settled]){
 const pose=fly.timeline(t).poses[0];
 assert.deepEqual(fly.geometry(pose),canonical,'Folded arrival, first step and final rest must share the exact size and drawing');
 assert.equal(fly.sheets[pose.sheet].src,model.sheets.neutral.src);
}
// Extra distance uses another full gait cycle, without accelerating the steps.
for(let i=0;i<12;i++){
 const s=fly.timeline(walkStart+.101+i*.2),expected=i%6;
 assert.equal(s.poses[0].sheet,expected===0?'neutral':'walk');assert.equal(s.poses[0].index,expected);
 close(s.y,fly.ground,'Walking stays on the well');
}
close(fly.timeline(contact).x,350,'Land farther right to make room for the extra steps');
close(fly.timeline(walkEnd).x,fly.perchX,'Walking arrives at the original center');
close((350-fly.perchX)/(walkEnd-walkStart),10/1.3,'Extra walking preserves average travel speed');
for(let t=walkStart+.01;t<walkEnd;t+=.04){const a=fly.timeline(t),b=fly.timeline(t+.01);assert(b.x<=a.x,'Walking moves continuously toward the center');}
for(let i=1;i<6;i++){
 const source=measured.walk.frames[i],g=model.geometry({sheet:'walk',index:i});
 assert(Math.abs((source.head[0]+source.head[1])*g.scale/headWidth-1)<.02,'Walking must retain standing head size');
 assert(Math.abs(source.bodyArea*g.scale**2/bodyArea-1)<.01,'Walking must retain standing torso size');
}
// Hopping is articulated whole-bird motion: planted crouch, toe spring, tucked
// airborne feet, reach, and bent-knee landing. Never scale or drift sideways.
const hopping=model.createDemo('hop'),hopSeen=new Set();let airborneRuns=0,wasAirborne=false;
for(let u=0;u<4.4;u+=1/240){
 const s=hopping.timeline(7+u),p=s.poses[0],g=hopping.geometry(p);
 close(s.x,model.perchX,'Both hops stay in place');
 if(p.sheet==='hop'){
  hopSeen.add(p.index);close(g.scale,.224,'All hop drawings share a fixed scale');close(g.scaleX,g.scale,'No squash or stretch transforms');
  const toe=hopMeasured.hop.frames[p.index].foot[2],sole=s.y+g.y+toe*g.scale;
  assert(sole<=model.ground+1e-8,'Hopping feet never penetrate the well');
  const local=u<2.1?u:u-2.1;
  if(local<1||local>=1.56)close(sole,model.ground,'Visible toes stay planted during crouch, push-off and recovery');
 }
 const inAir=s.y<model.ground-1e-6;if(inAir&&!wasAirborne)airborneRuns++;wasAirborne=inAir;
}
assert.equal(hopSeen.size,9,'Every new complete pose is used');assert.equal(airborneRuns,2,'Exactly two distinct hops');
for(const start of [0,2.1]){
 const samples=[];for(let u=1;u<1.56;u+=.001){const s=hopping.timeline(7+start+u),e=model.poseEye(s.poses[0]);samples.push(s.y+e.y);}
 for(let i=1;i<samples.length;i++)assert(Math.abs(samples[i]-samples[i-1])<.15,'Changing airborne leg pose does not teleport the head');
 const a=hopping.timeline(7+start+1-1e-6),b=hopping.timeline(7+start+1+1e-6);
 assert(Math.abs(a.y+model.poseEye(a.poses[0]).y-b.y-model.poseEye(b.poses[0]).y)<.001,'Toe-off keeps the head continuous');
 const c=hopping.timeline(7+start+1.56-1e-6),d=hopping.timeline(7+start+1.56+1e-6);
 assert(Math.abs(c.y+model.poseEye(c.poses[0]).y-d.y-model.poseEye(d.poses[0]).y)<.001,'Landing keeps the head continuous');
 const shown=new Set();for(let u=start;u<start+2.1;u+=1/24){const p=hopping.timeline(7+u).poses[0];if(p.sheet==='hop')shown.add(p.index);}
 assert.equal(shown.size,9,'24fps playback displays every drawn intermediate in each hop');
}
assert(hopping.reactionSheets('hop').includes('hop'),'Clicks preload the hop atlas');
for(let seed=0;seed<100;seed++){
 const v=model.createVisit(seed);assert.equal(v.events.length,8,'Adding hopping preserves automatic event frequency');assert(v.events.some(e=>e.id==='hop'),'Hopping is also an automatic behavior');
}
// The reported braking jump is checked on the ACTUAL sequence, including both endpoints.
const brakingTimes=[2.7,2.7601,2.8451,2.9301,3.0151,3.1001,3.1851,3.2701,3.3551,3.4501];
const brakingExpected=['flight/0','braking/1','braking/2','braking/3','braking/4','braking/5','brakingBridge/0','braking/7','braking/8','landing/2'];
const actualBraking=[];for(let t=arrivalTime(2.7);t<arrivalTime(3.5);t+=1/24){const p=fly.timeline(t).poses[0],key=p.sheet+'/'+p.index;if(actualBraking.at(-1)!==key)actualBraking.push(key);}
assert.deepEqual(actualBraking,brakingExpected,'24fps player must display all8 added poses without skipping');
let prior=null;
for(let i=0;i<brakingTimes.length;i++){
 const p=fly.timeline(arrivalTime(brakingTimes[i])).poses[0],g=model.geometry(p),source=measurementFor(p.sheet).frames[p.index],eye=model.poseEye(p),belly=source.patches.at(-1);
 assert.equal(p.sheet+'/'+p.index,brakingExpected[i]);
 if(p.sheet.startsWith('braking')){close(g.scale,.24,'Every braking intermediate uses one fixed scale');close(g.scaleX,g.scale,'Do not stretch braking proportions');}
 const width=(source.head[0]+source.head[1])*g.scale,area=belly.area*g.scale**2;
 assert(Math.abs(width-14.4187188)<1,'Head width remains within1 scene pixel of the incoming bird');
 if(prior){assert(Math.abs(eye.y-prior.eye.y)<.5,'Eye registration cannot jump down2.84px at leg extension');assert(Math.abs(eye.x-prior.eye.x)<.0001,'Braking head stays registered horizontally');assert(Math.abs(width-prior.width)<.75,'Neighboring head scanline widths differ by less than0.75 scene pixels');assert(Math.abs(Math.sqrt(area/prior.area)-1)<.04,'Neighboring belly linear size changes stay below4%');}
 prior={eye,width,area};
}
assert.equal(fly.timeline(arrivalTime(3.12)).poses[0].sheet,'braking','Leg extension no longer freezes for540ms');
const contactBefore=fly.timeline(arrivalTime(3.5)-1e-5),contactAfter=fly.timeline(arrivalTime(3.5)+1e-5);
assert.deepEqual(contactBefore.poses,contactAfter.poses,'Touchdown keeps the same drawing through first toe contact');
assert.equal(contactAfter.poses[0].sheet,'landing');assert.equal(contactAfter.poses[0].index,2);
assert(Math.hypot(contactAfter.x-contactBefore.x,contactAfter.y-contactBefore.y)<1e-6,'Approach path meets the planted root without jumping');
for(let t=arrivalTime(3.5);t<arrivalTime(3.66);t+=.01)assert.equal(fly.timeline(t).poses[0].index,2,'Hold the contacting toes before shifting weight');
for(let t=arrivalTime(3.5);t<arrivalTime(5.01);t+=.017){
 const state=fly.timeline(t),pose=state.poses[0],g=fly.geometry(pose);
 assert(['landing','settle'].includes(pose.sheet));assert(g.grounded);
 const toe=measurementFor(pose.sheet).frames[pose.index].foot[2];
 assert(Math.abs(state.y+g.y+toe*g.scale-fly.ground)<1e-8,'Visible landing toes remain on the well while folding wings');
}
// Landing recovery uses six complete poses at one fixed scale, before walking.
const recovery=[];
for(let t=arrivalTime(4.17);t<arrivalTime(5.1);t+=1/24){const p=fly.timeline(t).poses[0],key=p.sheet+'/'+p.index;if(recovery.at(-1)!==key)recovery.push(key);}
assert.deepEqual(recovery,['settle/0','settle/1','settle/2','settle/3','settle/4','settle/5','neutral/0']);
for(let index=0;index<6;index++){
 const p={sheet:'settle',index},g=model.geometry(p),eye=model.poseEye(p);
 close(g.scale,canonical.scale,'Standing recovery never changes the scale of the bird');close(g.scaleX,g.scale,'Recovery must preserve drawn proportions');
 close(eye.x,model.eye.x,'Recovery head stays aligned before walking');
 const next=model.poseEye(index<5?{sheet:'settle',index:index+1}:{sheet:'neutral',index:0});
 assert(Math.abs(next.y-eye.y)<2.5,'Recovery avoids a sudden rise at the standing boundary');
}
// Beak tip and central profile match the original resting bird relative to its eye.
const canonicalProfile=model.poseProfile({sheet:'neutral',index:0});
for(const sheet of ['hop','flight','braking','brakingBridge','landing','settle','walk','neutral'])for(let index=0;index<model.frames[sheet].length;index++){
 const p={sheet,index},profile=model.poseProfile(p),eye=model.poseEye(p);
 close(profile.x,eye.x,'Beak follows the actual drawn eye');close(profile.y,eye.y,'Beak follows the actual drawn eye');
 profile.contour.forEach(([x,y],i)=>{if(y>=-1&&y<=3.5)close(x,canonicalProfile.contour[i][0],'Beak core must not change shape or length at pose swaps');});
 assert(profile.joinX>profile.clear[0]+profile.clear[2],'Contour overlaps the retained head to avoid a vertical seam');
 assert(profile.contour[0][1]<profile.clear[1]&&profile.contour.at(-1)[1]>profile.clear[1]+profile.clear[3],'Contour overlaps the mask at both ends');
}
for(const p of [{sheet:'gaze',index:4},{sheet:'wake',index:0},{sheet:'lookUp',index:3}])assert.equal(model.poseProfile(p),null,'Do not replace turned or closed-eye heads with a horizontal profile');
for(const event of model.eventCatalog){if(event.id==='wake')continue;const demo=model.createDemo(event.id);assert.equal(demo.timeline(7).poses[0].sheet,'neutral');assert.equal(demo.timeline(7+event.duration-.001).poses[0].sheet,'neutral');}
for(const sheet of Object.values(model.sheets)){
 const data=fs.readFileSync(sheet.src);
 if(sheet.src.endsWith('.webp')){
  assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');
  assert.equal(data.toString('ascii',12,16),'VP8L','New atlas must use lossless WebP');assert.equal(data[20],0x2f);
  const dimensions=data.readUInt32LE(21);assert.equal((dimensions&0x3fff)+1,sheet.width);assert.equal(((dimensions>>>14)&0x3fff)+1,sheet.height);
 }else{assert.equal(data.readUInt32BE(16),sheet.width);assert.equal(data.readUInt32BE(20),sheet.height);}
}
for(const id of model.eventCatalog.map(e=>e.id)){const demo=model.createDemo(id);for(let t=7;t<7+demo.events[0].duration;t+=.04){const s=demo.timeline(t);assert.equal(s.activeEvent.id,id);for(const p of [...s.poses,...s.critters])demo.geometry(p);}}
class Target {constructor(){this.listeners={};}addEventListener(k,f){(this.listeners[k]??=[]).push(f)}removeEventListener(k,f){this.listeners[k]=(this.listeners[k]||[]).filter(x=>x!==f)}emit(k,e={}){(this.listeners[k]||[]).forEach(f=>f(e))}}
class El extends Target {constructor(tag){super();this.tag=tag;this.attrs={};this.children=[];this.style={};this.classList={add(){}}}setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]??null}removeAttribute(k){delete this.attrs[k]}appendChild(n){this.children.push(n);n.parentNode=this;return n}querySelector(){return null}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this)}}
const descendants=root=>[root,...root.children.flatMap(descendants)];
const imageHrefs=root=>descendants(root).filter(n=>n.tag==='image').map(n=>n.getAttribute('href')).filter(Boolean);
function verifyWholeFlight(host,index){
 const nodes=descendants(host),image=nodes.find(n=>n.tag==='image'&&n.getAttribute('href')===model.sheets.flight.src);
 assert(image,'Active flight renders the original complete bird atlas');
 assert(nodes.filter(n=>n.tag==='mask').every(n=>n.getAttribute('data-magpie-eye')==='aperture-mask'||n.getAttribute('data-magpie-profile')==='mask'),'Whole flight allows eye and beak corrections, never a separate wing rig');
 const g=model.geometry({sheet:'flight',index}),clipId=image.parentNode.getAttribute('clip-path').slice(5,-1);
 const clip=nodes.find(n=>n.getAttribute('id')===clipId),rect=clip.children.find(n=>n.tag==='rect');
 assert.deepEqual(['x','y','width','height'].map(k=>Number(rect.getAttribute(k))),g.cell,'Renderer selects the matching complete flight cel');
 assert.equal(image.parentNode.parentNode.getAttribute('transform'),`translate(${g.x} ${g.y}) scale(${g.scaleX} ${g.scale})`);
}
function verifyProfile(host,pose){
 const nodes=descendants(host),profile=model.poseProfile(pose),path=nodes.find(n=>n.getAttribute('data-magpie-profile')==='canonical'),clear=nodes.find(n=>n.getAttribute('data-magpie-profile')==='clear');
 assert.equal(path.getAttribute('display'),profile?'inline':'none');assert.equal(clear.getAttribute('display'),profile?'inline':'none');
 if(!profile)return;
 assert.equal(path.getAttribute('fill'),nodes.find(n=>n.tag==='feFlood').getAttribute('flood-color'),'Beak uses theme ink');
 assert.deepEqual(['x','y','width','height'].map(k=>Number(clear.getAttribute(k))),profile.clear.map((v,i)=>v+(i===0?profile.x:i===1?profile.y:0)));
 const transfer=nodes.find(n=>n.tag==='feComponentTransfer');assert.equal(transfer.getAttribute('in'),'cutout');
 const alpha=transfer.children.find(n=>n.tag==='feFuncA').getAttribute('tableValues').split(' ').map(Number);
 assert.equal(alpha.length,21);close(alpha[18],.9,'Preserve soft edge alpha');close(alpha[19],1,'Solid ink must match the opaque beak');close(alpha[20],1,'Solid ink remains opaque');
 assert(nodes.some(n=>n.tag==='feComposite'&&n.getAttribute('in2')==='solidInk'),'Renderer uses corrected ink alpha');
}
function verifyEyeApertures(host,eyes){
 const nodes=descendants(host),trim=nodes.find(n=>n.getAttribute('data-magpie-eye')==='trim');
 const mask=nodes.find(n=>n.getAttribute('data-magpie-eye')==='aperture-mask');
 const aperture=nodes.find(n=>n.getAttribute('data-magpie-eye')==='aperture');
 assert(mask&&mask.tag==='mask'&&aperture,'Eyes require a real aperture mask so larger holes can cut through the original source pixels');
 assert(mask.getAttribute('mask-type')==='luminance'||/mask-type\s*:\s*luminance/.test(mask.getAttribute('style')||''),'Aperture uses black/white luminance, not alpha');
 assert.equal(mask.getAttribute('maskUnits'),'userSpaceOnUse');assert.equal(mask.getAttribute('maskContentUnits'),'userSpaceOnUse');
 assert.equal(aperture.parentNode,mask);assert.equal(aperture.getAttribute('fill'),'black');
 assert(mask.children.some(n=>n.tag==='rect'&&n.getAttribute('fill')==='white'),'Body remains visible outside the eye aperture');
 assert.equal(trim.getAttribute('display'),eyes.length?'inline':'none','Closed source eyelids are not covered');
 const maskedGroup=nodes.find(n=>n.getAttribute('mask')===`url(#${mask.getAttribute('id')})`);
 assert(maskedGroup&&descendants(maskedGroup).includes(trim),'The trim disk and sprite must share one aperture mask');
 assert(descendants(maskedGroup).some(n=>n.tag==='image'),'Aperture cuts the underlying bird pixels, not only the trim disk');
 if(!eyes.length){assert(aperture.getAttribute('display')==='none'||!aperture.getAttribute('d'),'Closed eyelids must not get holes cut through them');return;}
 const flood=nodes.find(n=>n.tag==='feFlood');
 assert.equal(trim.getAttribute('fill'),flood.getAttribute('flood-color'),'Cover disk matches the head ink in either theme');
 const arcs=n=>[...n.getAttribute('d').matchAll(/a ([\d.e+-]+) ([\d.e+-]+) /gi)].map(m=>[Number(m[1]),Number(m[2])]);
 const starts=n=>[...n.getAttribute('d').matchAll(/M ([\d.e+-]+) ([\d.e+-]+) /gi)].map(m=>[Number(m[1]),Number(m[2])]);
 const coverArcs=arcs(trim),holeArcs=arcs(aperture);
 const coverStarts=starts(trim),holeStarts=starts(aperture);
 assert.equal(coverArcs.length,eyes.length*2,'Each old eye is covered by one solid disk');
 assert.equal(holeArcs.length,eyes.length*2,'Each enlarged eye uses one real elliptical aperture');
 eyes.forEach((eye,i)=>{
  close(coverStarts[i][0],eye.x-eye.coverRadius,'Disk stays centered on the drawn eye');close(coverStarts[i][1],eye.y,'Disk follows the drawn head vertically');
  close(holeStarts[i][0],eye.x-eye.radius,'Enlarged opening stays centered on the same eye');close(holeStarts[i][1],eye.y,'Aperture follows the drawn head vertically');
  for(const part of [0,1]){
  const k=i*2+part;close(coverArcs[k][0],eye.coverRadius,'Disk covers the source eye');close(coverArcs[k][1],eye.coverRadius,'Disk remains round');
  close(holeArcs[k][0],eye.radius,'Mask uses the enlarged horizontal radius');close(holeArcs[k][1],eye.radiusY,'Mask preserves open or half-open eye height');
 }});
 const eyelid=nodes.find(n=>n.tag==='circle');
 assert(eyelid&&!descendants(maskedGroup).includes(eyelid),'Blink eyelid must paint over the hole outside its mask');
}
async function setup(reduced=false,arrival=true,startMode,customModel,deferSource,touchOnly=false){
 const deferredLoads=[];
 let now=0,serial=0,ticks=0,requests=[],timers=new Map();const win=new Target(),doc=new Target(),media=new Target();doc.hidden=false;media.matches=reduced;
 doc.createElementNS=(_,tag)=>new El(tag);doc.createElement=tag=>new El(tag);doc.querySelector=()=>null;
 win.performance={now:()=>now};win.matchMedia=query=>query.includes('prefers-reduced-motion')?media:{matches:!touchOnly};win.setTimeout=(fn,ms)=>{let id=++serial;timers.set(id,{fn,at:now+ms});return id};win.clearTimeout=id=>timers.delete(id);
 win.Image=class{set src(s){requests.push(s);if(s===deferSource)deferredLoads.push(()=>this.onload());else queueMicrotask(()=>this.onload())}decode(){return Promise.resolve()}};
 const ctx={window:win,document:doc,module:{exports:{}},Map,Promise};vm.runInNewContext(fs.readFileSync('js/home-magpie.js','utf8'),ctx);
 const host=new El('div');host.ownerDocument=doc;const visit=customModel||model.createVisit(1409,{arrival,...(startMode?{startMode}:{})});let firstReady;const api=ctx.module.exports.mount(host,{model:visit,home:true,onUpdate:s=>{if(s.ready&&!firstReady)firstReady=[...requests]}});
 async function flush(){for(let i=0;i<50;i++)await Promise.resolve()}
 await flush();
 function advance(ms){const end=now+ms;for(;;){const item=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!item||item[1].at>end)break;now=item[1].at;timers.delete(item[0]);item[1].fn();ticks++;if(ticks>20000)throw Error('loop');}now=end;}
 return {api,doc,media,win,host,requests,timers,advance,flush,visit,firstReady,resolveLoads:()=>deferredLoads.splice(0).forEach(fn=>fn()),get ticks(){return ticks}};
}
(async()=>{
 const h=await setup(false,false);
 assert(h.api.getState().ready);assert.equal(h.api.getState().time,0);assert.equal(h.api.getState().timeline.x,model.perchX);assert.equal(h.api.getState().timeline.opacity,1);
 assert(h.firstReady.includes(model.sheets.neutral.src));assert(!h.firstReady.some(p=>/flight|wings|landing/.test(p)),'seated first display loads only its canonical standing atlas');
 assert(!imageHrefs(h.host).some(p=>/flight|wings/.test(p)),'Inactive flight layers must not trigger eager SVG image loads');
 const late=Array.from({length:50},(_,i)=>60+i).find(t=>h.visit.canReact(t));
 h.api.pause();h.api.seek(late);assert(h.api.react());h.api.seek(2);assert(h.api.react(),'backward seek clears click action');
 h.api.seek(late);assert(h.api.react());h.api.seek(h.visit.duration);h.api.play();h.advance(2100);assert(h.api.react(),'replay clears click action');
 h.api.seek(late);assert(h.api.react());h.api.setLoop(true);h.api.seek(h.visit.duration-.01);h.advance(2150);assert(h.api.react(),'loop clears click action');h.api.destroy();
 // Random click actions reserve their entire duration and cannot be restarted.
 const clickBase=model.createVisit(24,{startMode:'perched',events:[]});
 const clickIds=new Set(Array.from({length:80},(_,i)=>clickBase.chooseReaction(2,(i+.5)/80).id));
 assert.equal(clickIds.size,9,'All nine click actions can be selected, including hopping');
 assert(!clickIds.has('blink')&&!clickIds.has('wake'),'Do not choose a blink or the startup-only waking sequence');
 for(const id of clickIds){
  const candidate=clickBase.eventCatalog.find(e=>e.id===id);
  const clickModel={...clickBase,chooseReaction:t=>clickBase.canReact(t,id)?candidate:null};
  const c=await setup(false,false,'perched',clickModel);
  c.api.seek(2);assert(c.api.react());assert(!c.api.react(),'Rapid second click must not restart the action');await c.flush();
  const start=c.api.getState().timeline.activeEvent.start;
  assert.equal(c.api.getState().timeline.activeEvent.id,id);
  c.advance((candidate.duration-.1)*1000);
  assert(!c.api.react(),'Even long8.4-second actions remain locked until completion');
  assert.equal(c.api.getState().timeline.activeEvent.start,start,'Repeated click preserves the original start time');
  c.advance(250);assert(c.api.react(),'A completed action may be followed by a new click');
  c.api.destroy();
 }
 const auto=model.createVisit(24,{startMode:'perched',events:[{id:'doze',start:3}]});
 const autoHost=await setup(false,false,'perched',auto);autoHost.api.seek(4);
 assert(!autoHost.api.react(),'Clicks cannot interrupt an automatic event');
 assert.equal(autoHost.api.getState().timeline.activeEvent.id,'doze');autoHost.api.destroy();
 const near=clickBase.departure-3;
 for(let i=0;i<20;i++){const e=clickBase.chooseReaction(near,i/20);assert(!e||near+e.duration+.2<clickBase.departure,'Chosen event must finish before departure');}
 const closeEvent=model.createVisit(24,{startMode:'perched',events:[{id:'preen',start:6}]});
 for(let i=0;i<20;i++){const e=closeEvent.chooseReaction(2,i/20);assert(!e||2+e.duration+.2<6,'Chosen event must fit before the next automatic event');}
 // Every action is seen once per click cycle, including across a cycle boundary.
 const cycling=await setup(false,false,'perched',clickBase),clicked=[];
 cycling.api.seek(2);
 for(let i=0;i<27;i++){
  assert(cycling.api.react(),'Next distinct action is available');
  assert(!cycling.api.react(),'Rejected extra click must not consume another action');
  await cycling.flush();const active=cycling.api.getState().timeline.activeEvent;
  assert(active);clicked.push(active.id);
  if(i>0)assert.notEqual(clicked[i],clicked[i-1],'Last action of a cycle cannot immediately repeat');
  cycling.advance((active.duration+.25)*1000);
 }
 for(let i=0;i<3;i++)assert.equal(new Set(clicked.slice(i*9,i*9+9)).size,9,'Each complete click cycle includes all nine actions exactly once');
 cycling.api.destroy();
 const onlyDoze=[...clickIds].filter(id=>id!=='doze');
 assert.equal(closeEvent.chooseReaction(2,.1,onlyDoze),null,'When the remaining unseen action will not fit, wait instead of repeating a seen action');
 const allSeen=[...clickIds];
 for(let i=0;i<20;i++){
  const next=clickBase.chooseReaction(2,i/20,allSeen);assert(next.resetCycle);assert.notEqual(next.id,allSeen.at(-1),'Refill excludes the immediately previous action');
 }
 // Pointer following reuses every butterfly intermediate, outside the small SVG too.
 const watcher=await setup(false,false,'perched',clickBase);
 const watchSvg=descendants(watcher.host).find(n=>n.tag==='svg');
 watchSvg.getBoundingClientRect=()=>({left:100,top:200,width:368,height:396});
 const eyeWorld={x:clickBase.perchX+clickBase.eye.x,y:clickBase.ground+clickBase.eye.y};
 const move=(h,dx,dy,type='mouse')=>h.doc.emit('pointermove',{pointerType:type,clientX:100+(eyeWorld.x+dx-230)*2,clientY:200+(eyeWorld.y+dy-104)*2});
 watcher.api.seek(2);move(watcher,60,-30);
 const seen=[watcher.api.getState().timeline.gazeIndex||0];
 for(let i=0;i<35;i++){watcher.advance(45);const index=watcher.api.getState().timeline.gazeIndex||0;if(seen.at(-1)!==index)seen.push(index);}
 assert.deepEqual(seen,[0,1,2,3,4,5,6,7,8,9,10],'Turn follows all intermediate drawings, without jumping to the target');
 assert.equal(watcher.api.getState().timeline.activeEvent,null,'Pointer looking does not become an automatic event');
 assert.equal(watcher.api.getState().timeline.critters.length,0,'Mouse following does not create a butterfly');
 const heldTicks=watcher.ticks;watcher.advance(100);assert.equal(watcher.ticks,heldTicks,'A held gaze sleeps between normal deadlines');
 const sourceEye=model.poseEye(watcher.api.getState().timeline.poses[0]),watchLid=descendants(watcher.host).find(n=>n.tag==='circle');
 close(Number(watchLid.getAttribute('cx')),sourceEye.x,'Blink eyelid follows the turned eye horizontally');close(Number(watchLid.getAttribute('cy')),sourceEye.y,'Blink eyelid follows the turned eye vertically');
 watcher.doc.emit('pointerleave');const returning=[];
 for(let i=0;i<35;i++){watcher.advance(45);const index=watcher.api.getState().timeline.gazeIndex||0;if(returning.at(-1)!==index)returning.push(index);}
 assert.deepEqual(returning,[10,9,8,7,6,5,4,3,2,1,0],'Leaving smoothly returns through the same drawings');
 watcher.api.seek(2);move(watcher,0,-70,'touch');watcher.advance(300);assert.equal(watcher.api.getState().timeline.gazeIndex||0,0,'Touch movement does not trigger mouse following');
 move(watcher,0,20);watcher.advance(300);assert.equal(watcher.api.getState().timeline.gazeIndex||0,0,'Below the bird is outside the gaze region');
 move(watcher,180,-60);watcher.advance(300);assert.equal(watcher.api.getState().timeline.gazeIndex||0,0,'Distant mouse does not distract the bird');
 move(watcher,0,-70);watcher.advance(900);assert.equal(watcher.api.getState().timeline.gazeIndex,6,'Above the head uses the actual upward-looking pose');
 assert(watcher.api.react(),'Looking at the mouse does not block a click action');await watcher.flush();assert(watcher.api.getState().timeline.activeEvent);assert.equal(watcher.api.getState().timeline.gazeIndex||0,0,'Click action takes priority over pointer looking');watcher.api.destroy();
 const watchedAuto=await setup(false,false,'perched',auto);
 descendants(watchedAuto.host).find(n=>n.tag==='svg').getBoundingClientRect=watchSvg.getBoundingClientRect;
 watchedAuto.api.seek(4);move(watchedAuto,60,-30);watchedAuto.advance(300);
 assert.equal(watchedAuto.api.getState().timeline.activeEvent.id,'doze');assert.equal(watchedAuto.api.getState().timeline.gazeIndex||0,0,'Mouse never overrides an automatic action');watchedAuto.api.destroy();
 const waitingModel={...clickBase,chooseReaction:t=>clickBase.canReact(t,'look')?clickBase.eventCatalog.find(e=>e.id==='look'):null};
 const waiting=await setup(false,false,'perched',waitingModel,model.sheets.gaze.src);
 waiting.api.seek(2);const button=waiting.host.children.find(n=>n.className==='hm-magpie-hello');
 button.emit('pointerenter',{pointerType:'mouse'});button.emit('focus');assert.equal(waiting.api.getState().timeline.activeEvent,null,'Hover and focus alone do not start actions');
 button.emit('click');assert(!waiting.api.react(),'Loading request also locks repeated clicks');
 waiting.advance(200);assert.equal(waiting.api.getState().timeline.activeEvent,null,'Keep resting until required pictures have loaded');
 waiting.resolveLoads();await waiting.flush();assert.equal(waiting.api.getState().timeline.activeEvent.id,'look');waiting.api.destroy();
 const cancelled=await setup(false,false,'perched',waitingModel,model.sheets.gaze.src);
 cancelled.api.seek(2);assert(cancelled.api.react());cancelled.api.seek(.5);cancelled.resolveLoads();await cancelled.flush();
 assert.equal(cancelled.api.getState().timeline.activeEvent,null,'Seeking cancels an obsolete loading request');cancelled.api.destroy();
 const idleModel=model.createVisit(24,{startMode:'perched',events:[]}),ambient=await setup(false,false,'perched',idleModel);
 const firstBlink=idleModel.ambientBlinks[0];
 ambient.advance((firstBlink+.11)*1000);
 const lid=descendants(ambient.host).find(n=>n.tag==='circle');
 assert(Number(lid.getAttribute('opacity'))>.99,'Idle timer renders a real closed eyelid without an event');
 assert.equal(ambient.api.getState().timeline.activeEvent,null);
 ambient.advance(400);assert.equal(Number(lid.getAttribute('opacity')),0,'Background blink reopens its eye');
 const sleepingTicks=ambient.ticks;ambient.advance(1000);assert.equal(ambient.ticks,sleepingTicks,'Between blinks the renderer continues sleeping');
 ambient.api.destroy();
 // Touch-only visits skip unused hover and arrival artwork, while taps still work.
 const mobileBase=model.createVisit(24,{startMode:'perched',events:[{id:'worm',start:20}]});
 const mobileModel={...mobileBase,chooseReaction:t=>mobileBase.canReact(t,'stretch')?mobileBase.eventCatalog.find(e=>e.id==='stretch'):null};
 const mobile=await setup(false,false,'perched',mobileModel,undefined,true);await mobile.flush();
 for(const sheet of ['lookUp','lookBetween','braking','brakingBridge','landing','settle'])assert(!mobile.requests.includes(model.sheets[sheet].src),'Touch-only visit skips unused '+sheet+' artwork');
 mobile.api.seek(2);const mobileButton=mobile.host.children.find(n=>n.className==='hm-magpie-hello');
 mobileButton.emit('click');assert(!mobile.api.react(),'Repeated mobile tap is locked while loading');await mobile.flush();
 assert.equal(mobile.api.getState().timeline.activeEvent.id,'stretch','Touch activates and loads a non-preloaded action');
 assert(mobile.requests.includes(model.sheets.stretch.src));mobile.api.destroy();
 let profileCalls=0;const cachedBase=model.createDemo('blink');
 const cached=await setup(false,false,undefined,{...cachedBase,poseProfile:p=>{profileCalls++;return cachedBase.poseProfile(p);}});
 cached.api.seek(7);const priorCalls=profileCalls;cached.advance(120);
 assert.equal(profileCalls,priorCalls,'Blink ticks must not rebuild unchanged head paths');
 assert(Number(descendants(cached.host).find(n=>n.tag==='circle').getAttribute('opacity'))>.9,'Cached head still animates the eyelid');cached.api.destroy();
 const flight=await setup(false,true);
 assert(flight.firstReady.includes(model.sheets.flight.src));assert(flight.firstReady.includes(model.sheets.settle.src),'Landing recovery is ready before flying arrival starts');assert(flight.firstReady.includes(model.sheets.braking.src)&&flight.firstReady.includes(model.sheets.brakingBridge.src),'Flight waits for every braking cel before playback');assert(!flight.requests.some(p=>/flight-body|wings\.png/.test(p)),'Detached body and wing assets must not load');
 for(let index=0;index<9;index++){flight.api.seek(arrivalTime(.4+index*2.3/27+.001));assert.equal(flight.api.getState().timeline.poses[0].index,index);verifyWholeFlight(flight.host,index);}
 for(const t of [2.7,2.9,3.12,4.44,4.65,5.351]){
  flight.api.seek(arrivalTime(t));
  verifyEyeApertures(flight.host,flight.visit.poseEyes(flight.api.getState().timeline.poses[0]));
  verifyProfile(flight.host,flight.api.getState().timeline.poses[0]);
 }
 flight.api.seek(0);
 flight.advance(1200);flight.doc.hidden=true;flight.doc.emit('visibilitychange');const frozen=flight.api.getState().time;flight.advance(100000);assert.equal(flight.api.getState().time,frozen);flight.doc.hidden=false;flight.doc.emit('visibilitychange');flight.advance(1000);assert(Math.abs(flight.api.getState().time-frozen-1)<.05);
 flight.api.pause();const paused=flight.api.getState().time;flight.advance(60000);flight.api.play();assert.equal(flight.api.getState().time,paused);
 flight.api.seek(7);const ticks=flight.ticks;flight.advance(1000);assert.equal(flight.ticks,ticks,'Idle should sleep until the next event');
 flight.win.emit('pagehide');const away=flight.api.getState().time;flight.advance(100000);flight.win.emit('pageshow');assert.equal(flight.api.getState().time,away);flight.api.destroy();assert.equal(flight.timers.size,0);
 for(const event of model.eventCatalog){
  const demo=model.createDemo(event.id),h=await setup(false,true,undefined,demo),seen=new Set();
  for(let t=7;t<7+event.duration;t+=.04){
   const pose=demo.timeline(t).poses[0],key=pose.sheet+'/'+pose.index;if(seen.has(key))continue;seen.add(key);
   h.api.seek(t);verifyEyeApertures(h.host,demo.poseEyes(pose));
  }
  h.api.destroy();
 }
 const waking=await setup(false,false,'wake');assert.equal(waking.api.getState().timeline.poses[0].sheet,'wake');assert(waking.firstReady.some(p=>p.endsWith('wake.webp')));assert(!waking.api.react(),'Do not interrupt waking');waking.advance(5100);assert.equal(waking.api.getState().timeline.poses[0].sheet,'neutral');waking.api.destroy();
 const r=await setup(true,false);assert.equal(r.api.getState().time,.7);assert.equal(r.timers.size,0);assert(!r.requests.some(p=>/flight|wings|landing/.test(p)));assert(!imageHrefs(r.host).some(p=>/flight-body|wings/.test(p)));r.api.destroy();
 console.log(`PASS: 1,000 visits (${arrivals} flying / ${1000-arrivals} seated), start modes ${JSON.stringify(modes)}, nine original whole-bird flight cels, faster approach and recovery, two walk cycles at original cadence, six standing recovery cels, ambient4–7s blinks with idle sleep, shared beak contour and seamless solid ink, all-action eye apertures, preserved closed/frontal/waking eyes, fixed stretch supporting toe, stable walking eye registration, 180-second dwell, shared neutral boundaries, non-overlapping events, real atlas dimensions, every event, lazy initial assets, reduced motion, hidden clock, pause/replay/loop, idle sleep, random click actions without repeats across three full cycles, uninterrupted events, pending-load lock, smooth pointer gaze with event priority playback resets, touch-only lazy assets and cached head paths.`);
})().catch(e=>{console.error(e);process.exitCode=1});
