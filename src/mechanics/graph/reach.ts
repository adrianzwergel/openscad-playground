import type {Mechanism,PairChoice} from './contracts.ts';
import {registry} from './registry.ts';
import {identity,compose,inverse,axis,add,scale,norm,cross} from './frames.ts';

export type Variant={rule:string;choice:PairChoice};

/** Mate frame of a catalog pair with the driving element at the carrier origin. */
export function pairFrame(v:Variant,params=v.choice.params){
 return registry.getRule(v.rule).mateFrames!({elements:v.choice.elements.map((e,j)=>({...e,id:String(j),body:String(j),pose:identity(),phase:0})),frames:[identity(),identity()],params})[0];
}

/** Necessary reach for open chains with exactly one change of axis.
 * Sliding along the input and output shaft axes covers the plane they span.
 * Only parallel center distances and the turn's own offset reach along
 * w = u0 × u1, and that offset does not depend on the azimuth. A rejected chain
 * cannot close; an accepted one may still fail axial limits or clearance. */
export function turnReach(source:Mechanism){
 const inputFrame=compose(source.input.target,inverse(source.input.local)),outputFrame=compose(source.output.target,inverse(source.output.local));
 // With a free roll, a rotated or offset local terminal frame leaves the shaft
 // axis and position undetermined; keep every chain in that case.
 const local=source.output.local,determined=source.output.constraint!=='axis'||norm(local.position)<1e-9&&Math.abs(Math.abs(local.rotation[3])-1)<1e-12;
 const linear=source.output.motion==='translation',delta=add(outputFrame.position,scale(inputFrame.position,-1));
 const crossing=cross(axis(inputFrame),axis(outputFrame)),crossingLength=norm(crossing);
 const across=crossingLength>1e-9?delta.reduce((s,n,i)=>s+n*crossing[i],0)/crossingLength:0;
 const axesAngle=Math.acos(Math.max(-1,Math.min(1,axis(inputFrame).reduce((s,n,i)=>s+n*axis(outputFrame)[i],0))))*180/Math.PI;
 const angleSlack=(source.output.tolerance?.angle??0)+1e-6;
 const slack=(source.output.tolerance?.position??0)+norm(delta)*angleSlack*Math.PI/180+1e-6;
 const distances=new Map<Variant,number>(),offsets=new Map<Variant,{offset:number;length:number}|null>();
 const changes=(rule:string)=>registry.getRule(rule).search?.changesAxis;
 /** Center distance of a parallel pair, cached per catalog entry. */
 const centerDistance=(v:Variant)=>{let d=distances.get(v);if(d===undefined){d=norm(pairFrame(v).position);distances.set(v,d);}return d;};
 /** Offset of a turning pair along w, or null if it cannot produce the required angle.
  * `length` bounds how far an angular tolerance can move that offset. */
 const turnOffset=(v:Variant)=>{
  if(offsets.has(v))return offsets.get(v)!;let offset:{offset:number;length:number}|null=null;
  try{
   const variable=registry.getRule(v.rule).search!.variables.find(x=>x.key==='angle');
   if(!variable||axesAngle>=variable.lo-angleSlack&&axesAngle<=variable.hi+angleSlack){
    const f=pairFrame(v,{...v.choice.params,azimuth:0,...(variable?{angle:Math.max(variable.lo,Math.min(variable.hi,axesAngle))}:{})}),a=axis(f),h=Math.hypot(a[0],a[1]);
    if(h>1e-9&&(variable||Math.abs(Math.acos(Math.max(-1,Math.min(1,a[2])))*180/Math.PI-axesAngle)<=angleSlack))offset={offset:(-f.position[0]*a[1]+f.position[1]*a[0])/h,length:norm(f.position)};
   }
  }catch{/* A provider may reject the required angle for this catalog pair. */}
  offsets.set(v,offset);return offset;
 };
 const turnSlack=(turn:{length:number})=>slack+turn.length*angleSlack*Math.PI/180;
 const applies=(rules:string[])=>determined&&!linear&&crossingLength>1e-9&&rules.filter(id=>changes(id)===true).length===1&&rules.every(id=>changes(id)!==undefined);
 const reachable=(path:Variant[])=>{
  if(!applies(path.map(v=>v.rule)))return true;
  const turn=turnOffset(path.find(v=>changes(v.rule))!);if(turn===null)return false;
  return Math.abs(across-turn.offset)<=path.filter(v=>changes(v.rule)===false).reduce((s,v)=>s+centerDistance(v),0)+turnSlack(turn);
 };
 return {applies,reachable,centerDistance,turnOffset,turnSlack,across};
}
