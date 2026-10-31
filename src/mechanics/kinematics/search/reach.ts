// Necessary reach for open chains with exactly one change of axis: sliding
// along the input and output axes covers the plane they span, so only
// parallel centre distances and the turn's own offset reach along w = u0 × u1.
import type {FrameTerminal} from '../chain.ts';
import {inputFrame,desiredFrame,linearMate} from '../chain.ts';
import type {PairChoice} from '../catalog.ts';
import {pairGeometry,mateFrame} from '../contacts.ts';
import {axis,add,scale,norm,cross} from '../math.ts';

export function choiceGeometry(c:PairChoice,angle?:number){return pairGeometry(c.a.surfaces[0],c.b.surfaces[0],c.kind,{angle:angle??c.params.angle,length:c.params.length,distance:c.contactParams?.distance});}

export function turnReach(source:{input:FrameTerminal;output:FrameTerminal}){
 const inF=inputFrame(source),outF=desiredFrame(source),local=source.output.local;
 const determined=source.output.constraint!=='axis'||norm(local.position)<1e-9&&Math.abs(Math.abs(local.rotation[3])-1)<1e-12;
 const delta=add(outF.position,scale(inF.position,-1)),crossing=cross(axis(inF),axis(outF)),crossingLength=norm(crossing);
 const across=crossingLength>1e-9?delta.reduce((s,n,i)=>s+n*crossing[i],0)/crossingLength:0;
 const axesAngle=Math.acos(Math.max(-1,Math.min(1,axis(inF).reduce((s,n,i)=>s+n*axis(outF)[i],0))))*180/Math.PI;
 const angleSlack=(source.output.tolerance?.angle??0)+1e-6,slack=(source.output.tolerance?.position??0)+norm(delta)*angleSlack*Math.PI/180+1e-6;
 const distances=new Map<PairChoice,number>(),offsets=new Map<PairChoice,{offset:number;length:number}|null>();
 const centerDistance=(c:PairChoice)=>{let d=distances.get(c);if(d===undefined){const linear=linearMate({choice:c,params:{...c.params,azimuth:0},seat:0,join:'fixed'});d=norm((linear??mateFrame(choiceGeometry(c),{azimuth:0})).position);distances.set(c,d);}return d;};
 const turnOffset=(c:PairChoice)=>{
  if(offsets.has(c))return offsets.get(c)!;let offset:{offset:number;length:number}|null=null;
  try{const variable=c.variables.find(v=>v.key==='angle');
   if(!variable||axesAngle>=variable.lo-angleSlack&&axesAngle<=variable.hi+angleSlack){
    const f=mateFrame(choiceGeometry(c,variable?Math.max(variable.lo,Math.min(variable.hi,axesAngle)):undefined),{azimuth:0}),a=axis(f),h=Math.hypot(a[0],a[1]);
    if(h>1e-9&&(variable||Math.abs(Math.acos(Math.max(-1,Math.min(1,a[2])))*180/Math.PI-axesAngle)<=angleSlack))offset={offset:(-f.position[0]*a[1]+f.position[1]*a[0])/h,length:norm(f.position)};}
  }catch{/* a pair may reject the required angle */}
  offsets.set(c,offset);return offset;
 };
 const turnSlack=(turn:{length:number})=>slack+turn.length*angleSlack*Math.PI/180;
 const applies=(rules:{changesAxis:boolean}[])=>determined&&crossingLength>1e-9&&rules.filter(r=>r.changesAxis).length===1;
 const reachable=(path:PairChoice[])=>{
  if(!applies(path))return true;
  const turn=turnOffset(path.find(c=>c.changesAxis)!);if(turn===null)return false;
  return Math.abs(across-turn.offset)<=path.filter(c=>!c.changesAxis).reduce((s,c)=>s+centerDistance(c),0)+turnSlack(turn);
 };
 return {applies,reachable,centerDistance,turnOffset,turnSlack,across,axesAngle};
}
