// Tension springs in a gearbox, hooked onto two bolts of different bodies: the frame and a swing arm, or two arms (a
// belt tensioner, a lever pulled back, a sprung arm). Over every pose of the arms it hangs between: its length over the
// hooks, how far it is stretched, its force and the moment it puts on each arm about its pivot; whether it goes slack or
// is stretched further than its wire takes; whether it passes clear of wheels, shafts and other bolts. It hangs at one
// height in a gap both bolts' columns share; there each column is split for the hook, which sits on the bare bolt.
import type {GearDoc,GearSpring} from './model.ts';
import type {GroupPlan,Bolt,Columns,Obstacle,Issue} from './plan.ts';
import {links,carried} from './sweep.ts';
import type {Spring,SpringCatalog} from '../shaft/springs.ts';
import {forceAt} from '../shaft/springs.ts';

type P=[number,number];
/** One pose of the arms: their angles, the spring's length over the hooks, its stretch, force and the moments it puts
 * on the arms (N·mm, counter-clockwise from above), by arm. */
export type SpringPose={angles:Record<string,number>;L:number;s:number;F:number;M:Record<string,number>};
export type SpringPlan={id:string;label:string;part?:Spring;/** Its bolts, as indices of the plan's bolts. */bolts:[number,number];bodies:[string,string];z:number;room:[number,number];
 /** As drawn, and over every pose (the extremes). */rest:SpringPose;poses:SpringPose[];range:{L:[number,number];F:[number,number]}};
/** Where a column is split for a hook: the bolt (plan index), the column (plan index), the gap's middle and height. */
export type ColumnSplit={bolt:number;column:number;z:number;gap:number};
const n=(x:number)=>String(+x.toFixed(1)).replace('.',',');
const toSeg=(p:P,a:P,b:P)=>{const ab:P=[b[0]-a[0],b[1]-a[1]],l=ab[0]**2+ab[1]**2,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/l)):0;return Math.hypot(p[0]-a[0]-ab[0]*t,p[1]-a[1]-ab[1]*t);};
/** The radius of the bare bolt a hook sits on. */
export const POST=1.6;

export function planSprings(doc:GearDoc,x:{groups:GroupPlan[];bolts:Bolt[];columns:Columns[];obstacles:Obstacle[]},catalog:SpringCatalog){
 const issues:Issue[]=[],springs:SpringPlan[]=[],splits:ColumnSplit[]=[],clearance=doc.settings.clearance;
 for(const sp of doc.springs??[]){const ref=`feder:${sp.id}`,part=catalog[sp.part],label=part?.label??'Feder';
  const pick=(e:GearSpring['a'])=>{const of=x.bolts.map((b,i)=>({b,i})).filter(v=>v.b.body===e.body);return of[e.bolt]?.i;},ia=pick(sp.a),ib=pick(sp.b);
  if(ia===undefined||ib===undefined){issues.push({level:'fehler',message:`${label}: ein Bolzen, an dem sie hängt, fehlt`,ref});continue;}
  if(sp.a.body===sp.b.body){issues.push({level:'fehler',message:`${label}: beide Enden am selben Körper, sie dehnt sich nie`,ref});continue;}
  if(!part){issues.push({level:'fehler',message:`Feder ${sp.part} steht nicht im Katalog`,ref});continue;}
  if(part.kind!=='zug'){issues.push({level:'fehler',message:`${label}: zwischen zwei Bolzen hängt nur eine Zugfeder`,ref});continue;}
  // The height: a gap between plates both bolts pass through as columns, high enough for the coil.
  const gaps=(body:string)=>x.columns.map((c,i)=>({c,i})).filter(v=>v.c.body===body),room:{z0:number;z1:number;ca:number;cb:number}[]=[];
  for(const ga of gaps(sp.a.body))for(const gb of gaps(sp.b.body)){const z0=Math.max(ga.c.z0,gb.c.z0),z1=Math.min(ga.c.z1,gb.c.z1);if(z1-z0>0)room.push({z0,z1,ca:ga.i,cb:gb.i});}
  room.sort((p,q)=>(q.z1-q.z0)-(p.z1-p.z0));const best=sp.z!==undefined?room.find(r=>sp.z!>=r.z0&&sp.z!<=r.z1)??room[0]:room[0];
  if(!best){issues.push({level:'fehler',message:`${label}: die beiden Bolzen haben keine gemeinsame Höhe zwischen Platten`,ref});continue;}
  const z=sp.z!==undefined&&sp.z>=best.z0&&sp.z<=best.z1?sp.z:(best.z0+best.z1)/2;
  if(best.z1-best.z0<part.D+1)issues.push({level:'fehler',message:`${label}: zwischen den Platten sind nur ${n(best.z1-best.z0)} mm, die Feder braucht ${n(part.D+1)}`,ref});
  if(z-part.D/2<best.z0-1e-6||z+part.D/2>best.z1+1e-6)issues.push({level:'warnung',message:`${label}: in der Höhe ${n(z)} mm stößt sie an eine Platte`,ref});
  const gap=part.d+1;splits.push({bolt:ia,column:best.ca,z,gap},{bolt:ib,column:best.cb,z,gap});
  // Every pose of the arms it hangs between: their chains, each from its start to its end.
  const chain=(body:string)=>{const out:string[]=[];for(let g=x.groups.find(v=>v.id===body);g&&out.length<8;g=x.groups.find(v=>v.id===g!.parent))out.push(g.id);return out;};
  const moving=[...new Set([...chain(sp.a.body),...chain(sp.b.body)])];let poses:Record<string,number>[]=[{}];
  for(const id of moving){const g=x.groups.find(v=>v.id===id)!,steps=[...new Set([g.from,...Array.from({length:7},(_,k)=>g.from+(g.to-g.from)*k/6),0,g.to].filter(v=>v>=g.from-1e-9&&v<=g.to+1e-9))];poses=poses.flatMap(q=>steps.map(v=>({...q,[id]:v})));}
  const A=x.bolts[ia],B=x.bolts[ib],at=(q:P,body:string,angles:Record<string,number>)=>carried(q,links(x.groups,body,angles));
  const pose=(angles:Record<string,number>):SpringPose=>{const a=at(A.at,A.body,angles),b=at(B.at,B.body,angles),c=Math.hypot(b[0]-a[0],b[1]-a[1]),L=c+2*POST+2*part.d,F=forceAt(part,L),u:P=c?[(b[0]-a[0])/c,(b[1]-a[1])/c]:[0,0],M:Record<string,number>={};
   // On each arm the spring pulls its end towards the other; the moment about the arm's pivot as it stands now.
   for(const [end,body,dir] of [[a,A.body,u],[b,B.body,[-u[0],-u[1]] as P]] as [P,string,P][]){const g=x.groups.find(v=>v.id===body);if(!g)continue;const pv=at(g.at,g.parent,angles),r:P=[end[0]-pv[0],end[1]-pv[1]];M[body]=(r[0]*dir[1]-r[1]*dir[0])*F;}
   return {angles,L,s:L-part.L0,F,M};};
  const all=poses.map(pose),rest=pose({}),Ls=all.map(p=>p.L),Fs=all.map(p=>p.F),where=(p:SpringPose)=>Object.entries(p.angles).map(([g,v])=>`${x.groups.find(q=>q.id===g)?.name??g} ${n(v)}°`).join(', ')||'wie gezeichnet';
  const slack=all.filter(p=>p.s<0).sort((p,q)=>p.s-q.s)[0];if(slack)issues.push({level:'warnung',message:`${label} wird schlaff (${n(-slack.s)} mm zu kurz) bei ${where(slack)}: längere Bolzen-Abstände oder eine kürzere Feder`,ref});
  const far=all.reduce((p,q)=>q.s>p.s?q:p);if(far.s>part.smax)issues.push({level:'fehler',message:`${label} wird bei ${where(far)} um ${n(far.s)} mm gedehnt, der Draht hält ${n(part.smax)} mm`,ref});
  else if(far.s>.8*part.smax)issues.push({level:'warnung',message:`${label} wird bis ${n(far.s)} mm gedehnt, nah an den ${n(part.smax)} mm, die der Draht hält`,ref});
  // Clear of what turns or stands at its height: wheels, shafts, other bolts; over every pose.
  const band=[z-part.D/2,z+part.D/2],hit=new Set<string>();
  for(const angles of poses){const a=at(A.at,A.body,angles),b=at(B.at,B.body,angles);
   for(const o of x.obstacles){if(o.spin||o.soft||hit.has(o.label)||Math.min(o.z1,band[1])-Math.max(o.z0,band[0])<=0)continue;const c=at(o.a,o.body,angles);if(toSeg(c,a,b)<part.D/2+o.ra+clearance)hit.add(o.label);}
   x.bolts.forEach((bo,i)=>{if(i===ia||i===ib||hit.has(`Bolzen ${i+1}`))return;if(toSeg(at(bo.at,bo.body,angles),a,b)<part.D/2+bo.eye-.5+clearance)hit.add(`Bolzen ${i+1}`);});}
  for(const h of hit)issues.push({level:'fehler',message:`${label} streift ${h}`,ref});
  springs.push({id:sp.id,label,part,bolts:[ia,ib],bodies:[A.body,B.body],z,room:[best.z0,best.z1],rest,poses:all,range:{L:[Math.min(...Ls),Math.max(...Ls)],F:[Math.min(...Fs),Math.max(...Fs)]}});}
 return {springs,issues,splits};}
/** How every tension spring of the catalogue would do between the same two bolts: stretched how far, pulling how hard,
 * and whether it fits (never slack, at most 80 % of what its wire takes). The best first: fitting, slimmest, softest. */
export function springFits(sp:SpringPlan,catalog:SpringCatalog){const d0=sp.part?.d??0,cs=sp.poses.map(p=>p.L-2*POST-2*d0);
 return Object.values(catalog).filter(c=>c.kind==='zug').map(part=>{const s=cs.map(c=>c+2*POST+2*part.d-part.L0),lo=Math.min(...s),hi=Math.max(...s),F=s.map(v=>v<0?0:part.F0+part.R*v);
  const why=lo<.5?`schlaff (${n(-lo)} mm zu kurz)`:hi>.8*part.smax?`überdehnt (${n(hi)} von ${n(part.smax)} mm)`:`${n(lo)}–${n(hi)} mm gedehnt, ${n(Math.min(...F))}–${n(Math.max(...F))} N`;
  return {part,s:[lo,hi] as [number,number],F:[Math.min(...F),Math.max(...F)] as [number,number],ok:lo>=.5&&hi<=.8*part.smax,why};})
  .sort((a,b)=>Number(b.ok)-Number(a.ok)||a.part.D-b.part.D||a.part.R-b.part.R);}
