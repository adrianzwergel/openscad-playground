// Structure generation (structure-1): anchors with holding features, load
// cases and a keep-out field in, an optimised strut network and a closed mesh
// out. Independent of mechanisms: a gear link, a motor bracket or a housing
// for an electronics board all come down to anchors, loads and free space.
import type {V,Frame} from './vec.ts';
import {sub,add,scale,norm,apply,cross,unit,dot,rotate} from './vec.ts';
import type {Feature} from './features.ts';
import {featureGeometry,featureSize} from './features.ts';
import {Scene,PrimIndex} from './sdf.ts';
import type {Prim} from './sdf.ts';
import {surfaceNets,inspect,largestPart} from './mesh.ts';
import type {Mesh} from './mesh.ts';
import type {TrussNode,Strut,Material} from './truss.ts';
import {PLA,optimizeAreas,sizeStruts,relax,trimDeadEnds,radiusOf,solveTruss} from './truss.ts';
import {sizeFrame,solveFrame,barUtilisation} from './frame.ts';

/** `support`: held (the link's connection to its parent or the ground); `load`: carries a load. */
export type Anchor={id:string;frame:Frame;feature:Feature;role:'support'|'load';load?:number};
export type StructureSpec={
 id:string;anchors:Anchor[];
 /** Distance to everything the structure must avoid (moving parts, shafts, other links); +Infinity where free. */
 clearance:(p:V)=>number;
 /** Extra load cases (force per anchor id); default cases are ±x, ±y, ±z and torsion. */
 cases?:Record<string,V>[];
 settings?:Partial<StructureSettings>;
};
/** `deflection`: largest allowed displacement of a loaded anchor under the design loads (stiffness). */
export type StructureSettings={load:number;margin:number;maxNodes:number;resolution:number;blend:number;iterations:number;relax:number;keep:number;material:Material;region:number;deflection:number};
export const defaultSettings:StructureSettings={load:40,margin:1.5,maxNodes:170,resolution:.8,blend:3,iterations:30,relax:14,keep:.25,material:PLA,region:35,deflection:.5};
export type StructureResult={id:string;mesh:Mesh;nodes:TrussNode[];struts:{a:V;b:V;r:number;utilisation:number;force:number}[];report:StructureReport};
export type StructureReport={deflection:number;struts:number;nodes:number;volume:number;mass:number;utilisation:number;compliance:number;closed:boolean;components:number;triangles:number;clearance:number;connected:boolean;spacing:number;seconds:number;checks:{id:string;state:'pass'|'fail';message:string}[]};

export async function generateStructure(spec:StructureSpec,progress?:(stage:string,f:number)=>void):Promise<StructureResult>{
 const t0=performance.now(),s={...defaultSettings,...spec.settings,material:{...defaultSettings.material,...spec.settings?.material}},m=s.material,rMin=m.rMin;
 if(!spec.anchors.some(a=>a.role==='support'))throw Error(`${spec.id}: kein Haltepunkt als Auflager.`);
 if(!spec.anchors.some(a=>a.role==='load'))throw Error(`${spec.id}: kein belasteter Haltepunkt.`);
 // ---- anchors: bosses, holes, keep zones, ports ----
 const geo=spec.anchors.map(a=>featureGeometry(a.feature,a.frame)),bosses=new PrimIndex(12,12),holes=new PrimIndex(12,12),keep=new PrimIndex(12,40);
 geo.forEach(g=>{g.solids.forEach(x=>bosses.add(x));g.holes.forEach(x=>holes.add(x));g.keep.forEach(x=>keep.add(x));});
 const nodes:TrussNode[]=[],struts:Strut[]=[],anchorNodes:number[][]=[];
 spec.anchors.forEach((a,k)=>{const ids:number[]=[];const centre=nodes.length;nodes.push({p:a.frame.position,fixed:a.role==='support',anchor:k,load:a.role==='load'});ids.push(centre);
  // Only ports with room for a strut: a port facing a wheel 2 mm away cannot take one.
  // Room is measured one strut radius out from the boss, where the strut leaves it.
  const out=(p:V)=>{const z=rotate(a.frame.rotation,[0,0,1]),rel=sub(p,a.frame.position),radial=sub(rel,scale(z,dot(rel,z)));return add(p,scale(norm(radial)>1e-6?unit(radial):unit(rel),rMin+1));};
  const room=(p:V)=>{const q=out(p);return Math.min(spec.clearance(q)+s.margin,holes.distance(q),keep.distance(q));},ranked=geo[k].ports.map(p=>({p,r:room(p)})).sort((x,y)=>y.r-x.r);
  const usable=ranked.filter(x=>x.r>=rMin+s.margin+s.blend/2),chosen=usable.length?usable.slice(0,8):ranked.slice(0,2);
  for(const {p} of chosen){ids.push(nodes.length);nodes.push({p,fixed:a.role==='support',anchor:k});}
  // An anchor is rigid: every port tied to every other and to the centre.
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)struts.push({i:ids[i],j:ids[j],rigid:true,area:400});
  anchorNodes.push(ids);});
 // ---- free space and ground structure ----
 const ports=nodes.map(x=>x.p),lo=[0,1,2].map(i=>Math.min(...ports.map(p=>p[i]))-s.region) as V,hi=[0,1,2].map(i=>Math.max(...ports.map(p=>p[i]))+s.region) as V;
 const vol=(hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2]),h=Math.max(6,Math.cbrt(vol/s.maxNodes));
 const need=rMin+s.margin;
 const freeAt=(p:V,r:number)=>spec.clearance(p)>=r+s.margin&&holes.distance(p)>=r+s.margin&&keep.distance(p)>=r+s.margin;
 progress?.('Grundstruktur',0);
 const grid:number[]=[];
 for(let x=lo[0];x<=hi[0]+1e-9;x+=h)for(let y=lo[1];y<=hi[1]+1e-9;y+=h)for(let z=lo[2];z<=hi[2]+1e-9;z+=h){const p:V=[x,y,z];if(freeAt(p,need)&&bosses.distance(p)>=need){grid.push(nodes.length);nodes.push({p,fixed:false});}}
 // Segment test: free along the strut, ignoring the boss it starts from.
 const segmentFree=(a:V,b:V,r:number)=>{const d=sub(b,a),L=norm(d),n=Math.max(2,Math.ceil(L/2));for(let k=1;k<n;k++){const t=k/n,p=add(a,scale(d,t)),ends=Math.min(t*L,(1-t)*L);if(ends<r+2)continue;if(!freeAt(p,r))return false;if(ends>r+4&&bosses.distance(p)<r*.5)return false;}return true;};
 const anchorOf=(i:number)=>nodes[i].anchor,isPort=(i:number)=>nodes[i].anchor!==undefined&&!anchorNodes[nodes[i].anchor!].slice(0,1).includes(i);
 const cand=new Set<string>(),addStrut=(i:number,j:number)=>{const k=i<j?i+','+j:j+','+i;if(cand.has(k))return;cand.add(k);if(segmentFree(nodes[i].p,nodes[j].p,rMin))struts.push({i,j,area:1});};
 // Exit nodes a short step out of every port: stepping stones where the grid is too coarse for tight spots.
 const exits:number[]=[];
 for(const i of nodes.map((_,k)=>k).filter(isPort)){const a=spec.anchors[nodes[i].anchor!].frame,z=rotate(a.rotation,[0,0,1]),rel=sub(nodes[i].p,a.position),radial=sub(rel,scale(z,dot(rel,z))),dir=norm(radial)>1e-6?unit(radial):unit(rel);
  const axial=scale(z,Math.sign(dot(rel,z))||1);
  for(const d of [dir,axial])for(const step of [rMin+8]){const p=add(nodes[i].p,scale(d,step));if(freeAt(p,need)&&bosses.distance(p)>=rMin+.5){exits.push(nodes.length);nodes.push({p,fixed:false});}}}
 grid.push(...exits);
 const portIds=nodes.map((_,i)=>i).filter(isPort),bucket=new Map<string,number[]>(),cellOf=(p:V)=>p.map(x=>Math.floor(x/(2*h)));
 for(const i of grid){const c=cellOf(nodes[i].p).join(',');const l=bucket.get(c);if(l)l.push(i);else bucket.set(c,[i]);}
 const around=(p:V)=>{const c=cellOf(p),out:number[]=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const l=bucket.get([c[0]+x,c[1]+y,c[2]+z].join(','));if(l)out.push(...l);}return out;};
 for(const i of grid)for(const j of around(nodes[i].p))if(j>i&&norm(sub(nodes[i].p,nodes[j].p))<=1.75*h)addStrut(i,j);
 for(const i of exits)for(const j of [...portIds,...exits])if(j!==i&&norm(sub(nodes[i].p,nodes[j].p))<=Math.max(2.3*h,rMin+14))addStrut(i,j);
 for(const i of portIds){for(const j of around(nodes[i].p))if(norm(sub(nodes[i].p,nodes[j].p))<=2.3*h)addStrut(i,j);
  for(const j of portIds)if(j>i&&anchorOf(j)!==anchorOf(i)&&norm(sub(nodes[i].p,nodes[j].p))<=Math.max(2.6*h,40))addStrut(i,j);}
 // ---- load cases ----
 const support=spec.anchors.map((a,i)=>a.role==='support'?a.frame.position:undefined).filter((p):p is V=>!!p),centre=scale(support.reduce((c,p)=>add(c,p),[0,0,0] as V),1/support.length);
 const loadNodes=spec.anchors.map((a,k)=>({a,node:anchorNodes[k][0]})).filter(x=>x.a.role==='load');
 const torsionAxis=unit(loadNodes.reduce((c,x)=>add(c,sub(x.a.frame.position,centre)),[0,0,0] as V));
 const cases:V[][]=[];
 for(const dir of [[1,0,0],[0,1,0],[0,0,1]] as V[])cases.push(nodes.map((_,i)=>{const l=loadNodes.find(x=>x.node===i);return l?scale(dir,l.a.load??s.load):[0,0,0] as V;}));
 cases.push(nodes.map((_,i)=>{const l=loadNodes.find(x=>x.node===i);if(!l)return [0,0,0] as V;const r=sub(l.a.frame.position,centre),t=cross(norm(torsionAxis)>1e-9?torsionAxis:[0,0,1],r);return norm(t)<1e-9?[0,0,0] as V:scale(unit(t),l.a.load??s.load);}));
 for(const c of spec.cases??[])cases.push(nodes.map((_,i)=>{const k=nodes[i].anchor;if(k===undefined||anchorNodes[k][0]!==i)return [0,0,0] as V;return c[spec.anchors[k].id]??[0,0,0];}));
 // ---- reachability before optimising ----
 const reach=(list:Strut[])=>{const adj=new Map<number,number[]>();for(const x of list){(adj.get(x.i)??adj.set(x.i,[]).get(x.i)!).push(x.j);(adj.get(x.j)??adj.set(x.j,[]).get(x.j)!).push(x.i);}
  const seen=new Set<number>(),queue=nodes.map((x,i)=>x.fixed?i:-1).filter(i=>i>=0);queue.forEach(i=>seen.add(i));while(queue.length){const i=queue.pop()!;for(const j of adj.get(i)??[])if(!seen.has(j)){seen.add(j);queue.push(j);}}
  return spec.anchors.map((_,k)=>seen.has(anchorNodes[k][0]));};
 // Anchors the coarse grid cannot reach get a path through a fine voxel grid to the connected network.
 {const fine=3,reachedNodes=()=>{const c=connectedFromSupports(nodes,struts);return [...c].filter(i=>nodes[i].anchor===undefined||isPort(i));};
  for(let pass=0;pass<spec.anchors.length;pass++){const ok=reach(struts),k=ok.findIndex(x=>!x);if(k<0)break;
   const targets=reachedNodes(),bucketT=new Map<string,number[]>(),cT=(p:V)=>p.map(x=>Math.floor(x/12)).join(',');for(const i of targets){const key=cT(nodes[i].p);(bucketT.get(key)??bucketT.set(key,[]).get(key)!).push(i);}
   const nearTarget=(p:V)=>{const c=p.map(x=>Math.floor(x/12));for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const i of bucketT.get([c[0]+x,c[1]+y,c[2]+z].join(','))??[])if(norm(sub(nodes[i].p,p))<=12&&segmentFree(p,nodes[i].p,rMin))return i;return -1;};
   const starts=anchorNodes[k].slice(1).filter(i=>freeAt(nodes[i].p,need)||true),key=(v:number[])=>v.join(','),prev=new Map<string,string|null>(),pos=new Map<string,V>(),queue:string[]=[];
   for(const i of starts){const v=nodes[i].p.map(x=>Math.round(x/fine));const kk=key(v);if(!prev.has(kk)){prev.set(kk,null);pos.set(kk,nodes[i].p);queue.push(kk);}}
   const homeR=featureSize(spec.anchors[k].feature).radius+Math.max(featureSize(spec.anchors[k].feature).z1,-featureSize(spec.anchors[k].feature).z0)+rMin+4;
   let goal:{at:string;node:number}|undefined;
   for(let head=0;head<queue.length&&head<80000&&!goal;head++){const kk=queue[head],v=kk.split(',').map(Number);
    for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const w=[v[0]+d[0],v[1]+d[1],v[2]+d[2]],wk=key(w);if(prev.has(wk))continue;const p=w.map(x=>x*fine) as V;
     if(p.some((x,i)=>x<lo[i]-20||x>hi[i]+20)){prev.set(wk,kk);continue;}
     const home=norm(sub(p,spec.anchors[k].frame.position))<=homeR,passable=spec.clearance(p)>=rMin+s.margin&&(home||holes.distance(p)>=rMin+s.margin&&keep.distance(p)>=rMin+s.margin);
     if(!passable){prev.set(wk,kk);pos.set(wk,p);continue;}
     prev.set(wk,kk);pos.set(wk,p);queue.push(wk);const t=nearTarget(p);if(t>=0){goal={at:wk,node:t};break;}}}
   if(globalThis.process?.env?.STRUCTURE_DEBUG)console.log(`Pfad für ${spec.anchors[k].id}: ${goal?'gefunden':'keiner'} nach ${queue.length} Zellen`);
   if(!goal)break;
   // Back-track, then pull the string: keep only the points needed for free straight segments.
   const chain:V[]=[];for(let c:string|null=goal.at;c;c=prev.get(c)!)chain.push(pos.get(c)!);chain.reverse();
   const startPort=anchorNodes[k].slice(1).reduce((b,i)=>norm(sub(nodes[i].p,chain[0]))<norm(sub(nodes[b].p,chain[0]))?i:b,anchorNodes[k][1]);
   const pts:V[]=[];let at=0;while(at<chain.length-1){let next=chain.length-1;while(next>at+1&&!segmentFree(chain[at],chain[next],rMin))next--;pts.push(chain[next]);at=next;}
   let last=startPort;const chainIds:number[]=[];for(const p of pts){const id=nodes.length;nodes.push({p,fixed:false});for(const c of cases)c.push([0,0,0]);struts.push({i:last,j:id,area:1,keep:true});last=id;chainIds.push(id);}
   struts.push({i:last,j:goal.node,area:1,keep:true});
   // Brace the path where there is room: struts to nearby nodes and the anchor's other ports.
   for(const c of chainIds)for(let j=0;j<nodes.length;j++){if(j===c||nodes[j].anchor!==undefined&&!isPort(j))continue;const d=norm(sub(nodes[j].p,nodes[c].p));if(d>Math.max(2.3*h,30)||d<1)continue;if(struts.some(x=>x.i===c&&x.j===j||x.i===j&&x.j===c))continue;if(segmentFree(nodes[c].p,nodes[j].p,rMin))struts.push({i:c,j,area:1});}}}
 const reachable=reach(struts),cut=spec.anchors.filter((_,k)=>!reachable[k]).map(a=>a.id);
 if(cut.length)throw Error(`${spec.id}: Haltepunkte ${cut.join(', ')} sind im freien Raum nicht erreichbar (Sperrzonen zu eng oder Bereich zu klein).`);
 // Nodes not connected to the supports only make the system singular.
 const live=connectedFromSupports(nodes,struts);
 let net=subset(nodes,struts,live);
 const loadsOf=(from:{index:number[]})=>cases.map(c=>from.index.map(i=>c[i]));
 let loads=loadsOf(net);
 // ---- topology, sizing, form finding: struts that would need more room than they have are struck
 // from the ground structure and the layout is optimised again (manufacturing constraint feedback).
 const room=(a:V,b:V)=>{const d=sub(b,a),L=norm(d),n=Math.max(2,Math.ceil(L/2));let r=Infinity;for(let k=0;k<=n;k++){if(k===0||k===n){const p=add(k?b:a,scale(d,(k?-1:1)*Math.min(rMin+1,L/2)/L));r=Math.min(r,spec.clearance(p)+s.margin);continue;}const t=k/n,ends=Math.min(t*L,(1-t)*L);if(ends<rMin+2)continue;const p=add(a,scale(d,t));r=Math.min(r,spec.clearance(p)+s.margin,holes.distance(p),keep.distance(p));}return r;};
 const capOf=(x:TrussNode[],st:Strut)=>st.rigid?40:Math.max(rMin,room(x[st.i].p,x[st.j].p)-s.margin-s.blend/2);
 const sagOf=(x:TrussNode[],us:Float64Array[][])=>Math.max(0,...us.flatMap(u=>x.map((n,i)=>n.load?Math.hypot(u[i][0],u[i][1],u[i][2]):0)));
 const ground={...net},groundLoads=loads,forbidden=new Set<string>();
 const design=(round:number)=>{
  let cur=subset(ground.nodes,ground.struts.filter(x=>x.rigid||x.keep||!forbidden.has(Math.min(x.i,x.j)+','+Math.max(x.i,x.j))),new Set(ground.nodes.map((_,i)=>i))),L=groundLoads.map(c=>cur.index.map(i=>c[i]));
  for(const st of cur.struts)st.area=1;
  progress?.('Optimierung',.1+.15*round);
  optimizeAreas(cur.nodes,cur.struts,L,{E:m.E,iterations:s.iterations});
  // Second pass on what survived a loose cut: the struts compete again and the network thins out.
  {const top=Math.max(...cur.struts.filter(x=>!x.rigid).map(x=>x.area)),kept=cur.struts.filter(x=>x.rigid||x.keep||x.area>=.02*top),used=new Set<number>(cur.nodes.map((x,i)=>x.anchor!==undefined?i:-1).filter(i=>i>=0));for(const x of kept){used.add(x.i);used.add(x.j);}
   const next=subset(cur.nodes,kept,used),nl=L.map(c=>next.index.map(i=>c[i]));
   if(next.nodes.every((x,i)=>!x.load||connectedFromSupports(next.nodes,next.struts).has(i))&&solveTruss(next.nodes,next.struts,nl,m.E)){cur={...next,index:next.index.map(i=>cur.index[i])};L=nl;optimizeAreas(cur.nodes,cur.struts,L,{E:m.E,iterations:Math.ceil(s.iterations*.7)});}}
  {const top=Math.max(...cur.struts.filter(x=>!x.rigid).map(x=>x.area)),kept=trimDeadEnds(cur.nodes,reconnect(cur.nodes,cur.struts,cur.struts.filter(x=>x.rigid||x.keep||x.area>=s.keep*top)));
   const used=new Set<number>(cur.nodes.map((x,i)=>x.anchor!==undefined?i:-1).filter(i=>i>=0));for(const x of kept){used.add(x.i);used.add(x.j);}
   const next=subset(cur.nodes,kept,used),nl=L.map(c=>next.index.map(i=>c[i]));
   if(next.nodes.every((x,i)=>!x.load||connectedFromSupports(next.nodes,next.struts).has(i))&&solveFrame(next.nodes,next.struts,nl,m)){cur={...next,index:next.index.map(i=>cur.index[i])};L=nl;}}
  // Form finding on axial forces, kept only if the frame does not get worse.
  progress?.('Formfindung',.6);
  let forces=sizeStruts(cur.nodes,cur.struts,L,m);
  const before=cur.nodes.map(x=>x.p),utilOf=()=>{try{return Math.max(0,...sizeFrame(cur.nodes,cur.struts,L,m,3).util);}catch{return Infinity;}},utilBefore=utilOf();
  const strutClear=(i:number,p:V)=>{if(!freeAt(p,need)||bosses.distance(p)<need)return false;for(const st of cur.struts){if(st.rigid||(st.i!==i&&st.j!==i))continue;const o=cur.nodes[st.i===i?st.j:st.i].p;if(!segmentFree(p,o,radiusOf(st)))return false;}return true;};
  for(let r=0;r<s.relax;r++){const moved=relax(cur.nodes,cur.struts,forces,strutClear);forces=sizeStruts(cur.nodes,cur.struts,L,m,2);if(moved<.2)break;}
  if(utilOf()>Math.max(1,utilBefore)+1e-6)cur.nodes.forEach((x,i)=>{x.p=before[i];});
  // Strength as a rigid-jointed frame, then stiffness: thicken until no loaded anchor moves more than allowed.
  progress?.('Bemessung',.75);
  let framed=sizeFrame(cur.nodes,cur.struts,L,m,5,()=>14),deflection=sagOf(cur.nodes,framed.us);
  for(let it=0;it<12&&deflection>s.deflection;it++){const f=Math.min(1.6,Math.pow(deflection/s.deflection,1/3)*1.02);for(const st of cur.struts)if(!st.rigid){const r=Math.min(14,radiusOf(st)*f);st.area=Math.PI*r*r;}
   const next=solveFrame(cur.nodes,cur.struts,L,m);if(!next)break;framed={...next,util:cur.struts.map((st,i)=>st.rigid?0:Math.max(...next.forces[i].map(x=>barUtilisation(x,radiusOf(st),m))))};deflection=sagOf(cur.nodes,next.us);}
  return {cur,L,framed,deflection};
 };
 let result=design(0);
 for(let round=1;round<=3;round++){
  // Struts needing more than their room (beyond 0.4 mm) are struck; paths kept for connection stay.
  let struck=0;result.cur.struts.forEach(st=>{if(st.rigid||st.keep)return;const need=radiusOf(st),have=capOf(result.cur.nodes,st);if(need>have+.4){const a=result.cur.index[st.i],b=result.cur.index[st.j];forbidden.add(Math.min(a,b)+','+Math.max(a,b));struck++;}});
  if(globalThis.process?.env?.STRUCTURE_DEBUG)console.log(`Runde ${round}: ${struck} Streben ohne Platz gestrichen`);
  if(!struck)break;
  const next=design(round);if(!next.cur.nodes.every((x,i)=>!x.load||connectedFromSupports(next.cur.nodes,next.cur.struts).has(i)))break;result=next;
 }
 net=result.cur;loads=result.L;const framed=result.framed,deflection=result.deflection;
 const reach2=(x:{nodes:TrussNode[];struts:Strut[]})=>{const c=connectedFromSupports(x.nodes,x.struts);return x.nodes.every((n,i)=>!n.load||c.has(i));};
 const util=framed.util,forceOf=(k:number)=>Math.max(...framed.forces[k].map(f=>Math.abs(f.N)));
 const comp=loads.reduce((c,f,k)=>c+f.reduce((x,v,i)=>x+v[0]*framed.us[k][i][0]+v[1]*framed.us[k][i][1]+v[2]*framed.us[k][i][2],0),0);
 // ---- geometry ----
 progress?.('Geometrie',.8);
 const scene=new Scene(s.blend,12),radius=new Map<number,number>();
 net.struts.forEach(st=>{if(st.rigid)return;const r=radiusOf(st);for(const i of [st.i,st.j])radius.set(i,Math.max(radius.get(i)??0,r));});
 net.struts.forEach(st=>{if(st.rigid)return;const r=radiusOf(st);scene.solid({kind:'capsule',a:net.nodes[st.i].p,b:net.nodes[st.j].p,r});});
 net.nodes.forEach((x,i)=>{if(x.anchor===undefined&&radius.has(i))scene.solid({kind:'sphere',center:x.p,r:Math.min(radius.get(i)!*1.12,Math.max(radius.get(i)!*.9,spec.clearance(x.p)-s.blend/2))});});
 geo.forEach(g=>{g.solids.forEach(x=>scene.hardSolid(x));g.holes.forEach(x=>scene.hole(x));});
 // Clip by the keep-out field: no material where another part is (anchor bosses are placed by design).
 // The keep-out field is 1-Lipschitz: a coarse 4 mm lattice bounds it from below, exact values only where clipping can act.
 const coarse=new Map<string,number>(),G=4,lower=(p:V)=>{const c=p.map(x=>Math.round(x/G)*G) as V,k=c.join(',');let v=coarse.get(k);if(v===undefined){v=spec.clearance(c);coarse.set(k,v);}return v-norm(sub(p,c));};
 // Near the anchors' bosses the clip fades out continuously (they sit where the plan put them).
 const field=(p:V)=>{const d=scene.distance(p);if(d>2*s.resolution)return d;const bd=bosses.distance(p);if(bd<.3)return d;if(lower(p)>=.4-d)return d;const fade=Math.min(1,(bd-.3)/1.5);return Math.max(d,.4-spec.clearance(p)-(1-fade)*30);};
 const b=scene.bounds(),raw=surfaceNets(field,b.min,b.max,s.resolution,8,p=>scene.distance(p)),{mesh,dropped}=largestPart(raw);
 progress?.('Prüfung',.95);
 const info=inspect(mesh);
 // Clearance of the finished surface (every 7th vertex is plenty at 0.8 mm).
 let worst=Infinity,worstAt:V=[0,0,0];for(let i=0;i<mesh.vertices.length/3;i+=7){const p:V=[mesh.vertices[i*3],mesh.vertices[i*3+1],mesh.vertices[i*3+2]];if(bosses.distance(p)<1)continue;const c=spec.clearance(p);if(c<worst){worst=c;worstAt=p;}}
 const struts2=net.struts.map((st,k)=>({st,k})).filter(x=>!x.st.rigid).map(({st,k})=>({a:net.nodes[st.i].p,b:net.nodes[st.j].p,r:radiusOf(st),utilisation:util[k],force:forceOf(k)}));
 const maxUtil=Math.max(0,...struts2.map(x=>x.utilisation)),connected=reach2(net);
 const checks:StructureReport['checks']=[
  {id:'connected',state:connected?'pass':'fail',message:connected?'Alle Haltepunkte hängen am Auflager.':'Ein Haltepunkt ist nicht angebunden.'},
  {id:'strength',state:maxUtil<=1.001?'pass':'fail',message:`Größte Auslastung ${(maxUtil*100).toFixed(0)} % (Rahmen: Zug/Druck, Biegung, Torsion, Knicken; Sicherheit ${(50/m.sigma).toFixed(1)})${maxUtil>1.001?(()=>{const w=struts2.reduce((x,y)=>y.utilisation>x.utilisation?y:x);return ` an Strebe (${w.a.map(n=>n.toFixed(0)).join(',')})–(${w.b.map(n=>n.toFixed(0)).join(',')}) r=${w.r.toFixed(1)}`;})():''}.`},
  {id:'stiffness',state:deflection<=s.deflection*1.05?'pass':'fail',message:`Größte Verformung an einem Haltepunkt ${deflection.toFixed(2)} mm (zulässig ${s.deflection} mm).`},
  {id:'mesh',state:info.closed&&dropped<.01?'pass':'fail',message:`Netz ${info.closed?'geschlossen':`offen (${info.openEdges} Kanten)`}, ein Teil${dropped>0?` (${(dropped*100).toFixed(2)} % Splitter entfernt)`:''}.`},
  {id:'clearance',state:worst>=-.5?'pass':'fail',message:`Kleinster Abstand der Oberfläche zu Sperrzonen ${worst.toFixed(1)} mm${worst<-.3?` bei (${worstAt.map(n=>n.toFixed(0)).join(', ')}), nächster Haltepunkt ${spec.anchors.map(a=>({a,d:norm(sub(a.frame.position,worstAt))})).sort((x,y)=>x.d-y.d)[0].a.id}`:''}.`},
 ];
 progress?.('fertig',1);
 return {id:spec.id,mesh,nodes:net.nodes,struts:struts2,report:{deflection,struts:struts2.length,nodes:net.nodes.filter(x=>x.anchor===undefined).length,volume:info.volume,mass:info.volume*m.density,utilisation:maxUtil,compliance:comp,closed:info.closed,components:info.components,triangles:info.triangles,clearance:worst,connected,spacing:h,seconds:(performance.now()-t0)/1000,checks}};
}
export type {Prim};

/** Nodes reachable from the fixed ones over struts. */
function connectedFromSupports(nodes:TrussNode[],struts:Strut[]){
 const adj=new Map<number,number[]>();for(const x of struts){(adj.get(x.i)??adj.set(x.i,[]).get(x.i)!).push(x.j);(adj.get(x.j)??adj.set(x.j,[]).get(x.j)!).push(x.i);}
 const seen=new Set<number>(),q=nodes.map((x,i)=>x.fixed?i:-1).filter(i=>i>=0);q.forEach(i=>seen.add(i));while(q.length){const i=q.pop()!;for(const j of adj.get(i)??[])if(!seen.has(j)){seen.add(j);q.push(j);}}
 return seen;
}
/** The nodes in `keep` and the struts between them, renumbered; `index` maps back. */
function subset(nodes:TrussNode[],struts:Strut[],keep:Set<number>){
 const index=[...keep].sort((a,b)=>a-b),map=new Map(index.map((i,k)=>[i,k]));
 return {nodes:index.map(i=>({...nodes[i]})),struts:struts.filter(x=>map.has(x.i)&&map.has(x.j)).map(x=>({...x,i:map.get(x.i)!,j:map.get(x.j)!})),index};
}

/** Adds, for every loaded node cut off from the supports, the cheapest path (length over area) back to them. */
function reconnect(nodes:TrussNode[],all:Strut[],kept:Strut[]){
 const out=[...kept],adj=new Map<number,{j:number;s:Strut;w:number}[]>();
 for(const st of all){const w=norm(sub(nodes[st.j].p,nodes[st.i].p))/Math.max(st.area,1e-6);(adj.get(st.i)??adj.set(st.i,[]).get(st.i)!).push({j:st.j,s:st,w});(adj.get(st.j)??adj.set(st.j,[]).get(st.j)!).push({j:st.i,s:st,w});}
 for(let guard=0;guard<nodes.length;guard++){
  const connected=connectedFromSupports(nodes,out),lost=nodes.findIndex((x,i)=>x.load&&!connected.has(i));if(lost<0)break;
  // Dijkstra from the lost node to any connected node.
  const dist=new Map<number,number>([[lost,0]]),via=new Map<number,Strut>(),from=new Map<number,number>(),done=new Set<number>();let goal=-1;
  for(;;){let best=-1,bd=Infinity;for(const [i,d] of dist)if(!done.has(i)&&d<bd){bd=d;best=i;}if(best<0)break;done.add(best);if(connected.has(best)){goal=best;break;}
   for(const e of adj.get(best)??[]){const nd=bd+e.w;if(nd<(dist.get(e.j)??Infinity)){dist.set(e.j,nd);via.set(e.j,e.s);from.set(e.j,best);}}}
  if(goal<0)break;for(let i=goal;i!==lost;i=from.get(i)!){const st=via.get(i)!;if(!out.includes(st))out.push(st);}
 }
 // Every anchor belongs to the one part: an unloaded foot gets its cheapest way to the network too.
 for(let guard=0;guard<nodes.length;guard++){
  const adjOut=new Map<number,number[]>();for(const x of out){(adjOut.get(x.i)??adjOut.set(x.i,[]).get(x.i)!).push(x.j);(adjOut.get(x.j)??adjOut.set(x.j,[]).get(x.j)!).push(x.i);}
  const seed=nodes.findIndex(x=>x.load);if(seed<0)break;const main=new Set<number>([seed]),q=[seed];while(q.length){const i=q.pop()!;for(const j of adjOut.get(i)??[])if(!main.has(j)){main.add(j);q.push(j);}}
  const lost=nodes.findIndex((x,i)=>x.anchor!==undefined&&!main.has(i));if(lost<0)break;
  const dist=new Map<number,number>([[lost,0]]),via=new Map<number,Strut>(),from=new Map<number,number>(),done=new Set<number>();let goal=-1;
  for(;;){let best=-1,bd=Infinity;for(const [i,d] of dist)if(!done.has(i)&&d<bd){bd=d;best=i;}if(best<0)break;done.add(best);if(main.has(best)){goal=best;break;}
   for(const e of adj.get(best)??[]){const nd=bd+e.w;if(nd<(dist.get(e.j)??Infinity)){dist.set(e.j,nd);via.set(e.j,e.s);from.set(e.j,best);}}}
  if(goal<0)break;for(let i=goal;i!==lost;i=from.get(i)!){const st=via.get(i)!;if(!out.includes(st))out.push(st);}
 }
 return out;
}
