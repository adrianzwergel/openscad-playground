// From a mechanism with drives and a bearing plan to one optimised printed
// structure per link (LAGER-UND-STRUKTUR.md B7). Per link: anchors (seats,
// flanges, the connection to the parent as support, feet on the ground, a pad
// at the tip of an end link), and a clearance field: everything on the link
// itself plus everything on every other link swept over the axes between them,
// including the structures generated before. Links are built from the tips to
// the base; each one avoids what is already there, so no pair can collide.
import type {V,Frame} from './math.ts';
import {compose,inverse,rotate,add,scale,norm,identity,dot,cross} from './math.ts';
import type {Mechanism,Element,JointRelation} from './model.ts';
import type {Drive,Assets} from './drive.ts';
import {owned,driveSpec,modelAxes} from './drive.ts';
import {jointFrame} from './joints.ts';
import {curve} from './curves.ts';
import type {BearingPlan,Seat} from './bearings.ts';
import {modelPoints} from './bearings.ts';
import type {Anchor,StructureResult,StructureSettings} from '../../structure/generate.ts';
import {generateStructure} from '../../structure/generate.ts';
import {featureGeometry,featureSize} from '../../structure/features.ts';
const featureSizeOf=(x:{feature:import('../../structure/features.ts').Feature})=>featureSize(x.feature).radius;
import {PrimIndex} from '../../structure/sdf.ts';
import type {Prim} from '../../structure/sdf.ts';

/** `inspect` sees each link's anchors and clearance field before generation (diagnostics). */
export type LinkSettings={structure:Partial<StructureSettings>;load:number;payload:number;gap:number;region:number;only?:string[];inspect?:(link:string,anchors:Anchor[],clearance:(p:V)=>number,parts:(p:V)=>{link:string;d:number}[])=>void};
export const defaultLinkSettings:LinkSettings={structure:{},load:40,payload:20,gap:1.5,region:35};
export type LinkStructure={link:string;anchors:Anchor[];result?:StructureResult;error?:string;clearance?:number;checks:{id:string;state:'pass'|'fail'|'warn';message:string}[]};

const toFrame=(p:V):Frame=>({position:p,rotation:[0,0,0,1]});
const quatToward=(v:V):Frame['rotation']=>{const z:V=[0,0,1],c=cross(z,v),s=norm(c),d=v[2]/norm(v);if(s<1e-9)return d>0?[0,0,0,1]:[1,0,0,0];const a=Math.atan2(s/norm(v),d)/2,k=Math.sin(a)/s;return [c[0]*k,c[1]*k,c[2]*k,Math.cos(a)];};

/** Tree of the model's links from the ground: parent joint per link. */
export function linkTree(m:Mechanism,drives:Drive[]){
 const axes=modelAxes(m,drives),ground=m.bodies.find(b=>b.ground)!.id,parent=new Map<string,JointRelation>(),depth=new Map<string,number>([[ground,0]]),queue=[ground];
 while(queue.length){const x=queue.shift()!;for(const j of axes){const other=j.a.body===x?j.b.body:j.b.body===x?j.a.body:undefined;if(!other||depth.has(other))continue;depth.set(other,depth.get(x)!+1);parent.set(other,j);queue.push(other);}}
 return {ground,parent,depth,links:[...depth.keys()]};
}
type Step={map:(p:V,q:number)=>V;speed:(p:V,q:number)=>number;lo:number;hi:number};
/** Joint steps that carry a point from link `from` to link `to` (tree path). */
function path(m:Mechanism,tree:ReturnType<typeof linkTree>,from:string,to:string):Step[]{
 const up=(x:string)=>{const out=[x];while(tree.parent.has(out[out.length-1])){const j=tree.parent.get(out[out.length-1])!;out.push(j.a.body===out[out.length-1]?j.b.body:j.a.body);}return out;};
 const a=up(from),b=up(to),common=a.find(x=>b.includes(x))!,chain=[...a.slice(0,a.indexOf(common)+1),...b.slice(0,b.indexOf(common)).reverse()];
 const steps:Step[]=[];
 for(let i=0;i+1<chain.length;i++){
  const X=chain[i],Y=chain[i+1],j=m.joints.find(k=>(k.a.body===X&&k.b.body===Y)||(k.a.body===Y&&k.b.body===X))!,forward=j.a.body===X;
  const lo=j.limits?.min??(j.joint.kind==='revolute'?-180:0),hi=j.limits?.max??(j.joint.kind==='revolute'?180:200),ia=inverse(j.a.local),ib=inverse(j.b.local);
  const kappa=j.joint.kind==='path'&&j.joint.curve.cornerRadius>0?1/j.joint.curve.cornerRadius:0;
  const map=(p:V,q:number)=>{const J=jointFrame(j.joint,[q,0],j.shift);return forward?compose(j.b.local,compose(inverse(J),compose(ia,toFrame(p)))).position:compose(j.a.local,compose(J,compose(ib,toFrame(p)))).position;};
  const speed=(p:V,q:number)=>{const local=compose(forward?ia:ib,toFrame(p)).position;
   if(j.joint.kind==='revolute')return Math.hypot(local[0],local[1])*Math.PI/180+1e-3;
   if(j.joint.kind==='path'){const J=jointFrame(j.joint,[q,0],j.shift);return 1+norm(add(forward?local:compose(J,toFrame(local)).position,scale(J.position,-1)))*kappa;}
   return 1;};
  steps.push({map,speed,lo,hi});
 }
 return steps;
}
/** Smallest distance of `p` to the primitives over all values of the joints in `steps` (Lipschitz marching).
 * Exact below `cap`; above it the walk jumps as far as the distance allows (callers only need "at least cap"). */
const CAP=20;
function sweptDistance(p:V,steps:Step[],k:number,index:PrimIndex,stop:number):number{
 if(k===steps.length)return index.distance(p);
 const st=steps[k];let best=Infinity;
 for(let q=st.lo;;){const d=sweptDistance(st.map(p,q),steps,k+1,index,stop);best=Math.min(best,d);if(best<=stop||q>=st.hi)break;const v=st.speed(p,q);q=Math.min(st.hi,q+(d>CAP?d-CAP+.6:Math.max(d*.7,.6))/v);}
 return best;
}

export async function linkStructures(m:Mechanism,drives:Drive[],plan:BearingPlan,assets?:Assets,settings:Partial<LinkSettings>={},progress?:(link:string,stage:string,f:number)=>void):Promise<LinkStructure[]>{
 const s={...defaultLinkSettings,...settings},tree=linkTree(m,drives),frameOf=(id:string)=>m.bodies.find(b=>b.id===id)?.frame??identity();
 const carrierOf=(body:string):string=>{if(tree.depth.has(body))return body;const j=m.joints.find(x=>x.b.body===body);return j?carrierOf(j.a.body):body;};
 function worldOf(id:string):Frame{if(tree.depth.has(id))return frameOf(id);const j=m.joints.find(x=>x.b.body===id);if(!j)return frameOf(id);return compose(compose(worldOf(j.a.body),j.a.local),inverse(j.b.local));}
 const inLink=(link:string,world:Frame)=>compose(inverse(frameOf(link)),world);
 // ---- what each link carries, as primitives in its own coordinates ----
 const carried=new Map<string,Prim[]>(tree.links.map(l=>[l,[]]));const put=(l:string,x:Prim)=>carried.get(l)?.push(x);
 const cyl=(f:Frame,r:number,z0:number,z1:number):Prim=>({kind:'cylinder',frame:f,r,z0,z1});
 for(const e of m.elements){const link=carrierOf(e.mounts[0].body),f=inLink(link,compose(worldOf(e.mounts[0].body),e.mounts[0].pose)),pitch=e.surfaces[0]?.pitch;
  if(pitch?.kind==='path'){const fn=curve(pitch),n=Math.ceil(fn.length/6),z0=e.surfaces[0].z[0],z1=e.surfaces[0].z[1],mod=e.surfaces[0].profile.kind==='involute'?e.surfaces[0].profile.module:2;
   for(let i=0;i<=n;i++){const pf=compose(f,fn.frame(fn.length*i/n));put(link,{kind:'box',frame:compose(pf,{position:[0,(mod-4.25*mod)/2,(z0+z1)/2],rotation:[0,0,0,1]}),half:[4,(5.25*mod)/2,(z1-z0)/2]});}continue;}
  if(pitch?.kind==='line'){const L=pitch.length??200;put(link,{kind:'box',frame:compose(f,{position:[L/2,0,(e.envelope.min+e.envelope.max)/2],rotation:[0,0,0,1]}),half:[L/2,(e.envelope.transverse?.[1]??16),(e.envelope.max-e.envelope.min)/2]});continue;}
  put(link,cyl(f,e.envelope.radius,e.envelope.min,e.envelope.max));}
 for(const l of plan.lines){const shaft=l.kind==='roller'?undefined:cyl(l.frame,l.d/2+.3,l.z0,l.z1);if(shaft)put(l.link,shaft);}
 for(const x of plan.seats)if(x.keep)put(x.link,cyl(x.keep.frame,x.keep.r,x.keep.z0,x.keep.z1));
 for(const d of drives){const spec=driveSpec(d.spec),link=carrierOf(d.body),f=inLink(link,compose(worldOf(d.body),d.frame));put(link,{kind:'box',frame:compose(f,{position:[0,0,-spec.size[2]/2],rotation:[0,0,0,1]}),half:scale(spec.size,.5) as V});}
 // ---- anchors per link ----
 const anchors=new Map<string,Anchor[]>(tree.links.map(l=>[l,[]]));
 const seatAnchor=(x:Seat):Anchor=>({id:x.id,frame:x.frame,feature:x.feature,role:x.support?'support':'load',load:s.load});
 for(const x of plan.seats)anchors.get(x.link)?.push(seatAnchor(x));
 // Anchors of a link are obstacles for every other link (they are printed into it), not for the link itself.
 // Seats of a joint get an approach zone on their outer side: the neighbour on the other side of the
 // joint must not wrap its structure around them (it may be built first).
 const access=new Map<string,Prim[]>(tree.links.map(l=>[l,[]]));
 for(const x of plan.seats){const line=plan.lines.find(l=>l.id===x.line);if(line?.kind!=='axis'||x.link!==line.link)continue;const z=compose(inverse(line.frame),x.frame).position[2],mid=(line.seats.map(id=>plan.seats.find(y=>y.id===id)!).filter(y=>y.kind==='hub').map(y=>compose(inverse(line.frame),compose(inverse(frameOf(x.link)),compose(frameOf(y.link),y.frame))).position[2])[0])??0,out=z>=mid?1:-1,r=featureSizeOf(x)+20;
  access.get(x.link)!.push(cyl(compose(line.frame,{position:[0,0,z+out*4],rotation:[0,0,0,1]}),r,out>0?0:-45,out>0?45:0));}
 const bossesOf=(l:string)=>[...anchors.get(l)!.flatMap(a=>featureGeometry(a.feature,a.frame).solids),...access.get(l)!];
 const ground=tree.ground,groundPts=modelPoints(m,assets,ground,4000).map(p=>inLink(ground,toFrame(p)).position);
 {// Feet: the ground stands on a floor under its anchors.
  const list=anchors.get(ground)!,pos=list.map(a=>a.frame.position),floor=Math.min(...pos.map(p=>p[2]-12),...groundPts.map(p=>p[2]));
  const xs=pos.map(p=>p[0]),ys=pos.map(p=>p[1]),x0=Math.min(...xs)-20,x1=Math.max(...xs)+20,y0=Math.min(...ys)-20,y1=Math.max(...ys)+20;
  const long=Math.max(x1-x0,y1-y0)>500,feet:V[]=[];
  if(long){const alongX=x1-x0>=y1-y0,n=Math.max(2,Math.round(Math.max(x1-x0,y1-y0)/300)+1);for(let i=0;i<n;i++){const t=i/(n-1);for(const side of [-1,1]){const c=alongX?[x0+(x1-x0)*t,(y0+y1)/2+side*Math.max(25,(y1-y0)/2)]:[(x0+x1)/2+side*Math.max(25,(x1-x0)/2),y0+(y1-y0)*t];feet.push([c[0],c[1],floor]);}}}
  else{const w=Math.max(30,(x1-x0)/2),h=Math.max(30,(y1-y0)/2),cx=(x0+x1)/2,cy=(y0+y1)/2;for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]])feet.push([cx+a*w,cy+b*h,floor]);}
  feet.forEach((p,i)=>list.push({id:`fuss${i+1}`,frame:{position:p,rotation:[1,0,0,0]},feature:{kind:'pad',width:30,depth:30,thickness:5,holes:[[-8,0],[8,0]],hole:4.5},role:'support'}));
  // A path rail on the ground is held from its outer side every 110 mm.
  for(const e of m.elements){const pitch=e.surfaces[0]?.pitch;if(pitch?.kind!=='path'||carrierOf(e.mounts[0].body)!==ground)continue;const fn=curve(pitch),f=inLink(ground,compose(worldOf(e.mounts[0].body),e.mounts[0].pose)),z1=e.surfaces[0].z[1],mod=e.surfaces[0].profile.kind==='involute'?e.surfaces[0].profile.module:2;
   const n=Math.max(2,Math.round(fn.length/110));for(let i=0;i<=n;i++){const sP=Math.min(fn.length-12,Math.max(12,fn.length*i/n)),pf=compose(f,fn.frame(sP));
    list.push({id:`${e.id}/halter${i+1}`,frame:compose(pf,{position:[0,-2*mod,z1],rotation:[1,0,0,0]}),feature:{kind:'pad',width:22,depth:3.5*mod,thickness:5,holes:[[0,0]],hole:3.4},role:'load',load:s.load});}}
 }
 // End links carry a tool pad at the far end of their model.
 for(const l of tree.links){if(l===ground)continue;const list=anchors.get(l)!;if(list.some(a=>a.role==='load'))continue;
  const pts=modelPoints(m,assets,l,4000).map(p=>inLink(l,toFrame(p)).position),sup=list.filter(a=>a.role==='support').map(a=>a.frame.position);if(!pts.length||!sup.length)continue;
  const c=scale(sup.reduce((x,p)=>add(x,p),[0,0,0] as V),1/sup.length),far=pts.reduce((b,p)=>norm(add(p,scale(c,-1)))>norm(add(b,scale(c,-1)))?p:b,pts[0]),near=pts.filter(p=>norm(add(p,scale(far,-1)))<35),centre=scale(near.reduce((x,p)=>add(x,p),[0,0,0] as V),1/near.length),dir=add(far,scale(c,-1));
  list.push({id:`${l}/werkzeug`,frame:{position:centre,rotation:quatToward(scale(dir,1/norm(dir)))},feature:{kind:'pad',width:40,depth:30,thickness:6,holes:[[-12,0],[12,0]],hole:3.4},role:'load',load:s.payload});}
 // ---- generation, tips first ----
 const adjacent=(x:string,y:string)=>tree.parent.get(x)&&[tree.parent.get(x)!.a.body,tree.parent.get(x)!.b.body].includes(y)||tree.parent.get(y)&&[tree.parent.get(y)!.a.body,tree.parent.get(y)!.b.body].includes(x);
 const order=[...tree.links].sort((a,b)=>tree.depth.get(b)!-tree.depth.get(a)!),out:LinkStructure[]=[];
 const indexOf=(l:string,withBosses=true)=>{const x=new PrimIndex(15,40);for(const p of carried.get(l)!)x.add(p);if(withBosses)for(const p of bossesOf(l))x.add(p);return x;};
 const floorOf=(l:string)=>{if(l!==ground)return undefined;const f=anchors.get(ground)!.filter(a=>a.id.startsWith('fuss')).map(a=>a.frame.position[2]);return f.length?Math.min(...f):undefined;};
 const clearanceFor=(l:string,own:string[]=[])=>{
  // Generation avoids the neighbours over their joint; links further away meet only at extreme axis values (checked at the end).
  const self=indexOf(l,false),others=tree.links.filter(x=>x!==l&&adjacent(l,x)).map(x=>({x,index:indexOf(x),steps:path(m,tree,l,x)})),floor=floorOf(l),cache=new Map<string,number>();
  void own;
  return (p:V)=>{const key=`${Math.round(p[0]*2)},${Math.round(p[1]*2)},${Math.round(p[2]*2)}`,hit=cache.get(key);if(hit!==undefined)return hit;
   let d=self.distance(p);if(floor!==undefined)d=Math.min(d,p[2]-floor+5);
   for(const o of others){if(d<=0)break;d=Math.min(d,sweptDistance(p,o.steps,0,o.index,0));}
   d-=s.gap;cache.set(key,d);return d;};};
 for(const l of order){
  const list=anchors.get(l)!,entry:LinkStructure={link:l,anchors:list,checks:[]};out.push(entry);
  if(!list.some(a=>a.role==='load')||!list.some(a=>a.role==='support')){entry.error='Glied hat keine Haltepunkte zum Verbinden.';continue;}
  if(s.only&&!s.only.includes(l))continue;
  if(s.inspect){const own=indexOf(l,false),others=tree.links.filter(x=>x!==l&&adjacent(l,x)).map(x=>({x,index:indexOf(x),steps:path(m,tree,l,x)}));s.inspect(l,list,clearanceFor(l),p=>[{link:l,d:own.distance(p)},...others.map(o=>({link:o.x,d:sweptDistance(p,o.steps,0,o.index,-1)}))]);continue;}
  try{
   const result=await generateStructure({id:l,anchors:list,clearance:clearanceFor(l),settings:{...s.structure,region:s.region}},(stage,f)=>progress?.(l,stage,f));
   entry.result=result;entry.checks.push(...result.report.checks);
   // Later links avoid this structure: struts and nodes as primitives of this link.
   for(const st of result.struts)put(l,{kind:'capsule',a:st.a,b:st.b,r:st.r});
  }catch(e){entry.error=e instanceof Error?e.message:String(e);entry.checks.push({id:'generate',state:'fail',message:entry.error});}
 }
 // ---- final check with everything in place: each surface against all other links over their motion ----
 for(const entry of out){const r=entry.result;if(!r)continue;progress?.(entry.link,'Prüfung über den Bewegungsbereich',0);
  const own=new PrimIndex(15,15);for(const a of entry.anchors)for(const prim of featureGeometry(a.feature,a.frame).solids)own.add(prim);
  const check=(list:string[],every:number)=>{const others=list.map(x=>({x,index:indexOf(x),steps:path(m,tree,entry.link,x)}));let worst=Infinity,who='';const v=r.mesh.vertices;
   for(let i=0;i<v.length/3;i+=every){const p:V=[v[i*3],v[i*3+1],v[i*3+2]];if(own.distance(p)<1)continue;for(const o of others){const d=sweptDistance(p,o.steps,0,o.index,-1);if(d<worst){worst=d;who=o.x;}}}return {worst,who};};
  const near=check(tree.links.filter(x=>x!==entry.link&&adjacent(entry.link,x)),11);entry.clearance=near.worst;
  entry.checks.push({id:'motion',state:near.worst>=-.3?'pass':'fail',message:`Kleinster Abstand zu den Nachbargliedern über ihren Achsbereich ${near.worst===Infinity?'–':near.worst.toFixed(1)+' mm'}${near.who?` (${near.who})`:''}.`});
  const far=check(tree.links.filter(x=>x!==entry.link&&!adjacent(entry.link,x)),97);
  if(far.worst<-.3)entry.checks.push({id:'reach',state:'warn',message:`Bei extremen Achsstellungen kann ${far.who} dieses Glied berühren – Achsgrenzen prüfen.`});}
 return out;
}
export type {Element,Seat};
export {dot,rotate};
