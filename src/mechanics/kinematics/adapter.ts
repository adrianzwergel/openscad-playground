// Translates element-graph documents (versions 1–4) into kinematics-1
// (KINEMATIK-KERN.md 10). Every shaft becomes a body on a revolute joint to
// ground; every pairing becomes a contact between surfaces whose geometry
// reproduces the old mate frames exactly.
import type {Mechanism as Old,Element as OldElement,Relation} from '../graph/contracts.ts';
import {parseMechanism as parseOld} from '../graph/model.ts';
import {legoPart} from '../graph/lego.ts';
import {legoBevelIds,legoWormProfiles} from '../graph/lego-config.ts';
import type {Mechanism,Element,Body,JointRelation,Contact,Terminal} from './model.ts';
import type {Surface} from './surfaces.ts';
import type {Profile} from './profiles.ts';
import {coneAngles} from './contacts.ts';
import {identity,compose,inverse,rotate,cross,add,scale,dot,frameFromBasis} from './math.ts';
import {worldElement} from '../graph/model.ts';

const involute=(module:number):Profile=>({kind:'involute',module,pressureAngle:20,backlash:.15});
const legoProfile:Profile={kind:'library',id:'lego-m1',reference:{module:1,pressureAngle:20},tolerance:.03,apexOffset:2};
const circle=(r:number)=>({kind:'circle' as const,r});

export type AdapterOptions={range?:Mechanism['range']};
/** Converts an old mechanism. Linear bodies slide on a prismatic joint along their z axis; a spindle
 * and its nut close a loop through a screw joint; a rack is a straight rail with the pinion as follower. */
export function fromGraph(input:Old,o:AdapterOptions={}):Mechanism{
 const g=parseOld(input);
 const bodies:Body[]=[{id:'ground',frame:identity(),ground:true}],joints:JointRelation[]=[],elements:Element[]=[],contacts:Contact[]=[];
 for(const b of g.bodies){
  bodies.push({id:b.id,frame:b.frame,...(b.shaft?{shaft:{...b.shaft}}:{})});
  joints.push({id:'ground/'+b.id,joint:b.motion==='fixed'?{kind:'fixed'}:b.motion==='translation'?{kind:'prismatic'}:{kind:'revolute'},a:{body:'ground',local:b.frame},b:{body:b.id,local:identity()}});
 }
 const relationOf=(e:OldElement)=>g.relations.find(r=>r.elements.includes(e.id));
 // A rack's pitch line runs through its carrier origin along the travel axis; the surface frame
 // takes the travel axis as x and the pinion axis as z.
 const rackPose=(e:OldElement,r:Relation)=>{
  const pinion=g.elements.find(x=>x.id===r.elements[0])!,P=worldElement(g,pinion),B=g.bodies.find(b=>b.id===e.body)!.frame;
  const x=rotate(B.rotation,[0,0,1]),z=rotate(P.rotation,[0,0,1]),y=cross(z,x),side=dot(add(P.position,scale(B.position,-1)),y)>=0?1:-1;
  return {pose:compose(inverse(B),frameFromBasis(B.position,x,y,z)),side:side as 1|-1};
 };
 const surfaceOf=(e:OldElement,r:Relation|undefined):Surface|undefined=>{
  const p=e.params,mate=r?g.elements.find(x=>x.id===r.elements.find(id=>id!==e.id))!:undefined;
  switch(e.family){
   case 'spur':return {id:'teeth',pitch:circle(p.module*p.teeth/2),profile:involute(p.module),z:[-p.width/2,p.width/2],side:'external'};
   case 'bevel':{const sigma=r!.params.angle,first=r!.elements[0]===e.id,ra=p.module*p.teeth/2,rb=mate!.params.module*mate!.params.teeth/2,{d1,d2}=coneAngles(first?ra:rb,first?rb:ra,sigma);
    return {id:'teeth',pitch:circle(ra),profile:involute(p.module),z:[0,p.width],plane:0,side:'external',cone:(first?d1:d2)*180/Math.PI};}
   case 'gt2-pulley':return {id:'belt',pitch:circle(p.teeth/Math.PI),profile:{kind:'belt',pitch:2,toothed:true},z:[-3,3],side:'external'};
   case 'worm':return {id:'thread',pitch:circle(p.diameter/2),profile:{kind:'helical',lead:Math.PI*p.module*p.starts,starts:p.starts},z:[-p.width/2,p.width/2],side:'external'};
   case 'worm-wheel':return {id:'teeth',pitch:circle(p.module*p.teeth/2),profile:involute(p.module),z:[-p.width/2,p.width/2],side:'external'};
   case 'lego-technic':{const part=legoPart(p),worm=legoWormProfiles[part.id];
    if(worm)return {id:'thread',pitch:circle(worm.pitchRadius),profile:{kind:'helical',lead:Math.PI*worm.starts,starts:worm.starts},z:[-part.size[2]/2,part.size[2]/2],side:'external'};
    const bevel=r?.rule==='lego-bevel-90'&&legoBevelIds.includes(part.id);
    const ra=part.teeth/2;let cone:number|undefined;
    if(bevel){const first=r!.elements[0]===e.id,rb=legoPart(mate!.params).teeth/2,{d1,d2}=coneAngles(first?ra:rb,first?rb:ra,90);cone=(first?d1:d2)*180/Math.PI;}
    return {id:'teeth',pitch:circle(ra),profile:legoProfile,z:[-part.size[2]/2,part.size[2]/2],plane:0,side:'external',...(cone!==undefined?{cone}:{})};}
   case 'rack-pinion':return {id:'teeth',pitch:circle(p.module*p.teeth/2),profile:involute(p.module),z:[-p.width/2,p.width/2],side:'external'};
   case 'rack':return {id:'teeth',pitch:{kind:'line'},profile:involute(p.module),z:[-p.width/2,p.width/2],side:'external'};
   case 'tr8-screw':return {id:'thread',pitch:circle(4),profile:{kind:'helical',lead:p.lead,starts:1},z:[0,p.length],side:'external'};
   case 'tr8-nut':return undefined;
   default:throw Error(`Familie ${e.family} wird nicht übersetzt.`);
  }
 };
 for(const e of g.elements){
  const r=relationOf(e),surface=surfaceOf(e,r),radius=surface?.pitch.kind==='circle'?surface.pitch.r:0,z=surface?surface.z:[-8,8];
  let body=e.body,pose=e.pose;if(e.family==='rack')pose=rackPose(e,r!).pose;
  // Free elements turn on their axle; a rotor group shares one rotor body.
  if(e.binding==='free'){const rotor=`${e.body}/${e.rotorGroup??e.id}`;if(!bodies.some(b=>b.id===rotor)){bodies.push({id:rotor,frame:g.bodies.find(b=>b.id===e.body)!.frame});joints.push({id:'rotor/'+rotor,joint:{kind:'revolute'},a:{body:e.body,local:identity()},b:{body:rotor,local:identity()}});}body=rotor;}
  elements.push({id:e.id,source:e.family==='lego-technic'?{kind:'library',library:'lego',part:String(e.params.model)}:{kind:'printed'},surfaces:surface?[surface]:[],interfaces:[{id:'bore',kind:e.family==='lego-technic'?'technic-cross':'bore',...(e.family==='lego-technic'?{}:{diameter:e.params.bore??8}),z:[z[0],z[1]]} as Element['interfaces'][number]],envelope:{radius:radius+2,min:z[0]-1,max:z[1]+1},mounts:[{interface:'bore',body,pose}],phase:e.phase});
 }
 for(const r of g.relations){
  const [a,b]=r.elements.map(id=>elements.find(e=>e.id===id)!),ea=g.elements.find(e=>e.id===r.elements[0])!,eb=g.elements.find(e=>e.id===r.elements[1])!;
  if(r.rule==='screw-nut'){
   // Screw joint from the spindle element frame to the nut, at its current place.
   const screw=worldElement(g,ea),nutBody=g.bodies.find(x=>x.id===eb.body)!.frame;
   joints.push({id:r.id,joint:{kind:'screw',lead:ea.params.lead},a:{body:a.mounts[0].body,local:compose(a.mounts[0].pose,{position:[0,0,0],rotation:[0,0,0,1]})},b:{body:eb.body,local:compose(inverse(nutBody),screw)}});
   continue;
  }
  const base:Omit<Contact,'kind'|'params'>={id:r.id,a:{element:a.id,surface:a.surfaces[0].id},b:{element:b.id,surface:b.surfaces[0].id},mode:'fixed-axes'};
  switch(r.rule){
   case 'rack-drive':contacts.push({...base,kind:'roll',mode:'follower',params:{offsetA:0,offsetB:0,side:rackPose(eb,r).side}});break;
   case 'external-spur':case 'lego-spur':contacts.push({...base,kind:'roll',params:{offsetA:0,offsetB:0,azimuth:r.params.azimuth}});break;
   case 'bevel-mesh':contacts.push({...base,kind:'roll',params:{offsetA:0,offsetB:0,azimuth:r.params.azimuth,angle:r.params.angle}});break;
   case 'lego-bevel-90':contacts.push({...base,kind:'roll',params:{offsetA:0,offsetB:0,azimuth:r.params.azimuth,angle:90}});break;
   case 'gt2-belt':contacts.push({...base,kind:'belt',params:{offsetA:0,offsetB:0,azimuth:r.params.azimuth,length:r.params.length}});break;
   case 'worm-mesh':{const starts=ea.params.starts,distance=12+eb.params.teeth/Math.sqrt(1-(starts*2/24)**2);contacts.push({...base,kind:'helical',params:{offsetA:0,offsetB:0,azimuth:r.params.azimuth,distance}});break;}
   case 'lego-worm':contacts.push({...base,kind:'helical',params:{offsetA:0,offsetB:0,azimuth:r.params.azimuth}});break;
   default:throw Error(`Paarung ${r.rule} wird nicht übersetzt.`);
  }
 }
 // A sliding output is read on its prismatic joint; its frame target only holds at one stroke position.
 const terminal=(t:Old['input']):Terminal=>t.motion==='translation'?{kind:'coordinate',joint:'ground/'+t.body,coordinate:0}:{kind:'frame',body:t.body,local:t.local,target:t.target,constraint:t.constraint,...(t.tolerance?{tolerance:t.tolerance}:{})};
 return {format:'kinematics-1',parameters:[],bodies,elements,joints,contacts,patterns:[],input:terminal(g.input),output:terminal(g.output),range:o.range??{from:0,to:0,samples:1},...(g.environment?{environment:structuredClone(g.environment)}:{})};
}
