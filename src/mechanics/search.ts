import {CATALOG, distanceXY, parseProject, resolveProject} from './model.ts';
import type {Project, Vec3, Connection} from './model.ts';

export type Kind='direct'|'idler'|'two_idlers'|'compound';
export const KIND_NAMES:Record<Kind,string>={direct:'Direktpaar',idler:'Ein Zwischenrad',two_idlers:'Zwei Zwischenräder',compound:'Doppelzahnrad'};
export type Candidate={kind:Kind;ids:number[]};
export type Solution={project:Project;kind:Kind;ratio:number;error:number;direction:string;shafts:number;layers:number;stages:number;width:number;height:number};
export type SearchResult={solutions:Solution[];templates:number;placements:number;valid:number;rejected:number;truncated:boolean};
const EPS=1e-6;
/** Exact two-circle intersections; coincident centers have no isolated solution. */
export function intersections(a:Vec3,b:Vec3,r:number,s:number):Vec3[]{
 const d=distanceXY(a,b);if(d<EPS||d>r+s+EPS||d<Math.abs(r-s)-EPS)return [];
 const x=(r*r-s*s+d*d)/(2*d),h=Math.sqrt(Math.max(0,r*r-x*x));
 const ux=(b[0]-a[0])/d,uy=(b[1]-a[1])/d;
 const point=(sign:number):Vec3=>[a[0]+x*ux-sign*h*uy,a[1]+x*uy+sign*h*ux,a[2]];
 return h<EPS?[point(1)]:[point(1),point(-1)];
}
function layouts(p:Project,c:Candidate):Vec3[][]{
 const a:Vec3=[...p.axes.input],b:Vec3=[p.axes.output[0],p.axes.output[1],a[2]];
 const gs=c.ids.map(i=>CATALOG[i]);
 const length=(i:number,j:number)=>(gs[i].module*gs[i].teeth+gs[j].module*gs[j].teeth)/2;
 if(c.kind==='direct')return Math.abs(distanceXY(a,b)-length(0,1))<EPS?[[a,b]]:[];
 if(c.kind==='idler')return intersections(a,b,length(0,1),length(1,2)).map(m=>[a,m,b]);
 if(c.kind==='compound')return intersections(a,b,length(0,1),length(2,3)).map(m=>[a,m,[m[0],m[1],a[2]+p.search.layerSpacing],[b[0],b[1],a[2]+p.search.layerSpacing]]);
 const results:Vec3[][]=[];
 const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
 // A three-link chain has a continuous degree of freedom. Sample 24 relative angles.
 for(let i=0;i<24;i++){
  const t=angle+i*Math.PI/12,r=length(0,1),m:Vec3=[a[0]+r*Math.cos(t),a[1]+r*Math.sin(t),a[2]];
  for(const n of intersections(m,b,length(1,2),length(2,3)))results.push([a,m,n,b]);
 }
 return results;
}
export function placeCandidates(input:Project,candidates:Candidate[]):SearchResult{
 const p=parseProject(JSON.stringify(input));
 const result:SearchResult={solutions:[],templates:candidates.length,placements:0,valid:0,rejected:0,truncated:false};
 const seen=new Set<string>();
 for(const c of candidates){
  const count={direct:2,idler:3,two_idlers:4,compound:4}[c.kind];
  if(!count||!Array.isArray(c.ids)||c.ids.length!==count||c.ids.some(i=>!Number.isInteger(i)||!CATALOG[i]))throw Error('Ungültige Prolog-Antwort.');
  for(const positions of layouts(p,c)){
   result.placements++;
   const ids=[p.input.component];let suffix=1;
   while(ids.length<count-1){const id=`intermediate-${suffix++}`;if(id!==p.input.component&&id!==p.output.component)ids.push(id);}
   ids.push(p.output.component);
   const connections:Connection[]=ids.slice(1).map((id,i)=>{
    const rigid=c.kind==='compound'&&i===1,port=rigid?'shaft':'teeth';
    return {kind:rigid?'rigid-shaft':'external-spur-mesh',a:{component:ids[i],port},b:{component:id,port}};
   });
   const project:Project={...p,components:ids.map((id,i)=>({id,catalogId:CATALOG[c.ids[i]].id,position:positions[i]})),connections};
   // Border coordinates can leave the allowed design workspace; do not abort other candidates.
   if(positions.some(pos=>pos.some(n=>Math.abs(n)>10000))){result.rejected++;continue;}
   const r=resolveProject(project);
   if(!r.valid||r.error>p.search.maxError/100+1e-9||(p.search.direction==='same'&&r.direction!=='gleichläufig')||(p.search.direction==='opposite'&&r.direction!=='gegenläufig')){result.rejected++;continue;}
   const key=JSON.stringify([c.ids,positions.map(pos=>pos.map(n=>Math.round(n*1e6)))]);
   if(seen.has(key))continue;seen.add(key);result.valid++;
   result.solutions.push({project,kind:c.kind,ratio:r.ratio,error:r.error,direction:r.direction,shafts:r.shaftCount,layers:r.layers,stages:r.stages,width:r.bounds.width,height:r.bounds.height});
  }
 }
 result.solutions.sort((a,b)=>a.error-b.error||a.shafts-b.shafts||a.layers-b.layers||a.width*a.height-b.width*b.height||JSON.stringify(a.project.components).localeCompare(JSON.stringify(b.project.components)));
 // Bounded response, preserving the best representative of every available topology.
 const bestKinds=[...new Set(result.solutions.map(s=>s.kind))].map(kind=>result.solutions.find(s=>s.kind===kind)!);
 const selected=new Set([...bestKinds,...result.solutions.slice(0,60-bestKinds.length)]);
 result.truncated=result.solutions.length>selected.size;
 result.solutions=result.solutions.filter(s=>selected.has(s));
 return result;
}
