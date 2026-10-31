// Open chains for the route search: an ordered list of catalog pairs with
// their continuous parameters, placed from the input frame by mate frames.
// Chains are what the search enumerates and refines; a solved chain becomes a
// kinematics-1 document.
import type {V,Frame,Q} from './math.ts';
import {identity,compose,inverse,axisAngle,multiply,inverseQ,add,scale,norm,cross,axis,rotationError,rotate,dot,quaternionFromBasis} from './math.ts';
import type {Mechanism,Environment,Terminal,Element,Body,JointRelation,Contact} from './model.ts';
import type {PairChoice,ElementSpec} from './catalog.ts';
import {withAngle} from './catalog.ts';
import {pairGeometry,mateFrame} from './contacts.ts';
import type {PairGeometry} from './contacts.ts';
import type {Placed} from './construction.ts';
import type {Check} from './conjugate.ts';

export type Join='fixed'|'shared'|'compound';
export type Stage={choice:PairChoice;params:Record<string,number>;seat:number;join:Join};
export type FrameTerminal=Extract<Terminal,{kind:'frame'}>;
export type Chain={input:FrameTerminal;output:FrameTerminal;stages:Stage[];lastSeat:number;lastRoll:number;environment?:Environment};

export const inputFrame=(c:Pick<Chain,'input'>)=>compose(c.input.target,inverse(c.input.local));
export const desiredFrame=(c:Pick<Chain,'output'>)=>compose(c.output.target,inverse(c.output.local));
const geometryCache=new WeakMap<PairChoice,Map<string,PairGeometry>>();
export function stageGeometry(s:Stage):PairGeometry{
 if(s.choice.linear||s.choice.mate||!s.choice.b.surfaces.length){const pa=s.choice.a.surfaces[0]?.pitch,ra=pa?.kind==='circle'?pa.r:s.choice.a.envelope.radius;return {kind:s.choice.kind,ra,rb:s.choice.b.envelope.radius,crossing:false,sigma:0,ha:0,hb:0,distance:ra,sign:1};}
 let perChoice=geometryCache.get(s.choice);if(!perChoice){perChoice=new Map();geometryCache.set(s.choice,perChoice);}
 const key=`${s.params.angle??''}|${s.params.length??''}`;let g=perChoice.get(key);
 if(!g){g=pairGeometry(s.choice.a.surfaces[0],s.choice.b.surfaces[0],s.choice.kind,{angle:s.params.angle,length:s.params.length,distance:s.choice.contactParams?.distance});perChoice.set(key,g);}
 return g;
}
export type Reflow={shafts:Frame[];drivers:Frame[];drivens:Frame[];end:Frame};
/** Linear stages keep the element graph's mate frames: the nut 30 mm up the spindle; the rack
 * carrier at half stroke behind the pinion, travelling along its z axis. */
export function linearMate(s:Stage):Frame|undefined{
 if(s.choice.mate)return s.choice.mate(s.params);
 if(s.choice.linear==='screw')return {position:[0,0,30],rotation:[0,0,0,1]};
 if(s.choice.linear==='rack'){const r=stageGeometry(s).ra;return compose({position:[0,0,0],rotation:axisAngle([0,0,1],s.params.azimuth??0)},{position:[-(s.params.stroke??100)/2,-r,0],rotation:axisAngle([0,1,0],90)});}
 return undefined;
}
export const linearOutput=(c:Pick<Chain,'stages'>)=>!!c.stages[c.stages.length-1]?.choice.linear;
/** Shaft frames along the chain: the driver sits at its seat, the driven at the shaft origin. */
export function reflow(c:Chain):Reflow{
 const shafts:Frame[]=[inputFrame(c)],drivers:Frame[]=[],drivens:Frame[]=[];
 c.stages.forEach((s,i)=>{
  const driver=compose(shafts[i],{position:[0,0,s.seat],rotation:[0,0,0,1]}),driven=compose(driver,linearMate(s)??mateFrame(stageGeometry(s),s.params));
  drivers.push(driver);drivens.push(driven);
  const last=i===c.stages.length-1;shafts.push(last&&!s.choice.linear?compose(driven,inverse({position:[0,0,c.lastSeat],rotation:axisAngle([0,0,1],c.lastRoll)})):driven);
 });
 return {shafts,drivers,drivens,end:shafts[shafts.length-1]};
}
export function terminalDeviation(actual:Frame,t:FrameTerminal){
 const delta=add(actual.position,scale(t.target.position,-1));
 const position=t.constraint==='frame'?norm(delta):norm(cross(delta,axis(t.target)));
 const angle=t.constraint==='frame'?rotationError(actual.rotation,t.target.rotation):Math.acos(Math.max(-1,Math.min(1,axis(actual).reduce((s,n,i)=>s+n*axis(t.target)[i],0))))*180/Math.PI;
 return {position,angle,positionLimit:t.tolerance?.position??0,angleLimit:t.tolerance?.angle??0};
}
/** Output closure residual with the terminal tolerance subtracted. */
export function endResidual(c:Chain,r:Reflow=reflow(c)){
 const f=compose(r.end,c.output.local),t=c.output.target,delta=add(f.position,scale(t.position,-1)),d=terminalDeviation(f,c.output);
 const shrink=(v:number[],error:number,limit:number)=>v.map(n=>n*(error>0?Math.max(0,error-limit)/error:0));
 const position=shrink(c.output.constraint==='axis'?cross(delta,axis(t)):delta,d.position,d.positionLimit);
 let orientation:number[];
 if(c.output.constraint==='axis')orientation=add(axis(f),scale(axis(t),-1)).map(n=>n*30);
 else{let q=multiply(inverseQ(t.rotation),f.rotation);if(q[3]<0)q=q.map(n=>-n) as Q;orientation=q.slice(0,3).map(n=>n*60);}
 return [...position,...shrink(orientation,d.angle,d.angleLimit)];
}
/** Same slack as the element graph's terminal check (1e-5 mm, 1e-4°); acos noise alone is ~2e-6°. */
export const closes=(c:Chain,r?:Reflow)=>{const f=compose((r??reflow(c)).end,c.output.local),d=terminalDeviation(f,c.output);return d.position<=d.positionLimit+1e-5&&d.angle<=d.angleLimit+1e-4;};
/** Reduction ratio ω_in/ω_out of the chain. */
export const chainRatio=(c:Chain)=>c.stages.reduce((r,s)=>r*s.choice.factor,1);

export const elementIds=(c:Chain)=>c.stages.map((s,i)=>({driver:s.join==='shared'?`b${i-1}`:`a${i}`,driven:`b${i}`}));
/** Elements with world frames and axial seats on their shafts, plus shaft extents (reflow rule: −40 / +12). */
export function place(c:Chain,r:Reflow=reflow(c)):Placed{
 const ids=elementIds(c),bodies:Placed['bodies']=[],elements:Placed['elements']=[],contacts:Placed['contacts']=[],couplings:Placed['couplings']=[];
 const n=c.stages.length;
 for(let i=0;i<=n;i++)bodies.push({id:'s'+i,frame:r.shafts[i],...(i===n&&linearOutput(c)?{}:{shaft:{diameter:5,start:-40,end:12}})});
 c.stages.forEach((s,i)=>{
  if(s.join!=='shared')elements.push({id:ids[i].driver,body:'s'+i,frame:r.drivers[i],envelope:s.choice.a.envelope,z:s.seat,shaftLimit:s.choice.a.shaftLimit,rearSupport:s.choice.a.rearSupport});
  const last=i===n-1;elements.push({id:ids[i].driven,body:'s'+(i+1),frame:r.drivens[i],envelope:s.choice.b.envelope,z:last&&!s.choice.linear?c.lastSeat:0,shaftLimit:s.choice.b.shaftLimit,rearSupport:s.choice.b.rearSupport});
  const g=stageGeometry(s);contacts.push({kind:s.choice.kind,rule:s.choice.rule,a:ids[i].driver,b:ids[i].driven,frameA:r.drivers[i],ra:g.ra,rb:g.rb,distance:g.distance,params:s.params});
  if(s.join==='compound'){const bore=Math.max(...[s.choice.a,c.stages[i-1].choice.b].map(x=>x.interfaces.find(f=>f.kind==='bore')&&'diameter' in x.interfaces[0]?(x.interfaces[0] as {diameter:number}).diameter:5));couplings.push({body:'s'+i,members:[ids[i-1].driven,ids[i].driver],radius:Math.max(8,bore/2+2)});}
 });
 // Shaft extents follow the element-graph rule: bearing seats 10 mm beyond the hulls plus
 // 12 mm, or an overhung seat pair behind rear-supported (bevel) elements. Worm shafts
 // reserve the wheel's reach around the worm.
 for(const b of bodies){const es=elements.filter(e=>e.body===b.id);if(!es.length||!b.shaft)continue;
  const spans=contacts.filter(k=>k.kind==='helical'&&elements.find(e=>e.id===k.a)!.body===b.id).map(k=>{const w=elements.find(e=>e.id===k.a)!,reach=k.rb+4+(k.distance-k.ra-k.rb);return [w.z-reach,w.z+reach];});
  const lo=Math.min(...es.map(e=>e.z+e.envelope.min),...spans.map(s=>s[0])),hi=Math.max(...es.map(e=>e.z+e.envelope.max),...spans.map(s=>s[1])),overhung=es.some(e=>e.rearSupport);
  b.shaft={diameter:5,start:(overhung?lo-26:lo-10)-12,end:overhung?hi+3:hi+10+12};}
 return {bodies,elements,contacts,couplings,environment:c.environment};
}
/** Elements on one shaft must keep 1 mm between their axial envelopes. */
export function axialChecks(c:Chain,p:Placed=place(c)):Check[]{
 const checks:Check[]=[];
 for(const b of p.bodies){const es=p.elements.filter(e=>e.body===b.id);for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++){const a=es[i],d=es[j];checks.push({id:`${a.id}/${d.id}/axial`,state:Math.max(a.z+a.envelope.min,d.z+d.envelope.min)-Math.min(a.z+a.envelope.max,d.z+d.envelope.max)>=1?'pass':'fail',message:'Axiale Elementhüllen auf gemeinsamer Welle mindestens 1 mm getrennt'});}}
 return checks;
}
export const specKey=(s:ElementSpec)=>s.key;
export function signature(c:Chain){
 const r=reflow(c);
 return JSON.stringify([r.shafts.map(f=>[f.position.map(n=>Math.round(n*10)),f.rotation.map(n=>Math.round(n*1000))]),c.stages.map(s=>[s.choice.rule,s.choice.a.key,s.choice.b.key,s.join,Math.round(s.seat*10)]),Math.round(c.lastSeat*10)]);
}
export function summary(c:Chain){
 const elements=c.stages.reduce((n,s)=>n+(s.join==='shared'?1:2),0);
 const freeIdlers=c.stages.filter(s=>s.join==='shared'&&s.choice.a.mount!=='technic-cross').length,freeCompounds=c.stages.filter(s=>s.join==='compound').length;
 const driveShafts=c.stages.length-1-freeIdlers-freeCompounds;
 return {elements,freeIdlers,freeCompounds,driveShafts};
}
/** The chain as a kinematics-1 document with revolute shafts, rotor bodies for free elements and contacts. */
export function toMechanism(c:Chain,r:Reflow=reflow(c)):Mechanism{
 const ids=elementIds(c),n=c.stages.length,bodies:Body[]=[{id:'ground',frame:identity(),ground:true}],joints:JointRelation[]=[],elements:Element[]=[],contacts:Contact[]=[];
 const p=place(c,r);
 const linear=c.stages[n-1]?.choice.linear;
 for(let i=0;i<=n;i++){const s=c.stages[i],prev=c.stages[i-1],axle=i>0&&i<n&&(prev.join==='compound'||s.join==='compound'||s.join==='shared'&&s.choice.a.mount!=='technic-cross');
  bodies.push({id:'s'+i,frame:r.shafts[i],...(p.bodies[i].shaft?{shaft:p.bodies[i].shaft}:{})});joints.push({id:'ground/s'+i,joint:axle?{kind:'fixed'}:i===n&&linear?{kind:'prismatic'}:{kind:'revolute'},a:{body:'ground',local:r.shafts[i]},b:{body:'s'+i,local:identity()}});
  if(axle){bodies.push({id:`s${i}/rotor`,frame:r.shafts[i]});joints.push({id:`rotor/s${i}`,joint:{kind:'revolute'},a:{body:'s'+i,local:identity()},b:{body:`s${i}/rotor`,local:identity()}});}
 }
 const bodyFor=(i:number)=>bodies.some(b=>b.id===`s${i}/rotor`)?`s${i}/rotor`:'s'+i;
 const element=(id:string,spec:ElementSpec,shaft:number,z:number,roll=0,pose?:Frame):Element=>({id,source:spec.source,surfaces:structuredClone(spec.surfaces),interfaces:structuredClone(spec.interfaces),envelope:{...spec.envelope},mounts:[{interface:spec.interfaces[0].id,body:bodyFor(shaft),pose:pose??{position:[0,0,z],rotation:axisAngle([0,0,1],roll)}}],phase:0});
 c.stages.forEach((s,i)=>{const choice=withAngle(s.choice,s.params.angle??90);
  if(s.join!=='shared')elements.push(element(ids[i].driver,choice.a,i,s.seat));
  // Pairs known only by their element-graph rule carry no surfaces; the document keeps their parts.
  if(!choice.a.surfaces.length||!choice.b.surfaces.length&&!choice.linear){const last=i===n-1;elements.push(element(ids[i].driven,choice.b,i+1,last?c.lastSeat:0,last?c.lastRoll:0));return;}
  if(choice.linear==='screw'){elements.push(element(ids[i].driven,choice.b,i+1,0));joints.push({id:'p'+i,joint:{kind:'screw',lead:choice.ratio},a:{body:bodyFor(i),local:{position:[0,0,s.seat],rotation:[0,0,0,1]}},b:{body:'s'+(i+1),local:inverse({position:[0,0,30],rotation:[0,0,0,1]})}});return;}
  if(choice.linear==='rack'){
   // Rail frame on the carrier: x along travel (carrier z), z along the pinion axis; the pitch line passes the carrier origin.
   const pinionAxis=rotate(inverse(r.shafts[i+1]).rotation,axis(r.drivers[i])),x:V=[0,0,1],y=cross(pinionAxis,x),pose={position:[0,0,0] as V,rotation:quaternionFromBasis(x,y,pinionAxis)};
   elements.push(element(ids[i].driven,choice.b,i+1,0,0,pose));
   const towards=rotate(inverse(r.shafts[i+1]).rotation,add(r.drivers[i].position,scale(r.shafts[i+1].position,-1))),side=dot(towards,y)>=0?1:-1;
   contacts.push({id:'p'+i,kind:'roll',mode:'follower',a:{element:ids[i].driver,surface:choice.a.surfaces[0].id},b:{element:ids[i].driven,surface:choice.b.surfaces[0].id},params:{offsetA:0,offsetB:0,side}});return;}
  const last=i===n-1;elements.push(element(ids[i].driven,choice.b,i+1,last?c.lastSeat:0,last?c.lastRoll:0));
  const params:Contact['params']={offsetA:0,offsetB:0,azimuth:s.params.azimuth,...(s.params.angle!==undefined?{angle:s.params.angle}:{}),...(s.params.length!==undefined?{length:s.params.length}:{}),...(choice.contactParams?.distance!==undefined?{distance:choice.contactParams.distance}:{})};
  contacts.push({id:'p'+i,kind:choice.kind,a:{element:ids[i].driver,surface:choice.a.surfaces[0].id},b:{element:ids[i].driven,surface:choice.b.surfaces[0].id},mode:'fixed-axes',params});
 });
 return {format:'kinematics-1',parameters:[],bodies,elements,joints,contacts,patterns:[],input:{...c.input,body:'s0'},output:{...c.output,body:'s'+n},range:{from:0,to:0,samples:1},...(c.environment?{environment:structuredClone(c.environment)}:{})};
}
export const cloneChain=(c:Chain):Chain=>({...c,stages:c.stages.map(s=>({...s,params:{...s.params}})),environment:c.environment});
export {identity};
export type {V};
