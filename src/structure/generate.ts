// Structure generation (structure-1): anchors with holding features, load
// cases and a keep-out field in, an optimised strut network and a closed mesh
// out. Independent of mechanisms: a gear link, a motor bracket or a housing
// for an electronics board all come down to anchors, loads and free space.
import type {V,Frame} from './vec.ts';
import {sub,add,scale,norm,cross,unit,dot,rotate} from './vec.ts';
import type {Feature} from './features.ts';
import {featureGeometry,featureSize} from './features.ts';
import {Scene,PrimIndex} from './sdf.ts';
import type {Prim} from './sdf.ts';
import {surfaceNets,inspect,largestPart} from './mesh.ts';
import type {Mesh} from './mesh.ts';
import type {TrussNode,Strut,Material} from './truss.ts';
import {PLA,relax,radiusOf} from './truss.ts';
import {sizeFrame,solveFrame,barUtilisation} from './frame.ts';

/** `support`: held (the link's connection to its parent or the ground); `load`: carries a load. */
/** `group`: anchors of one group are rigidly joined (seats in a bearing plate); `clip`: the feature may be cut by keep-outs (a plate). */
export type Anchor={id:string;frame:Frame;feature:Feature;role:'support'|'load';load?:number;group?:string;clip?:boolean};
export type StructureSpec={
 id:string;anchors:Anchor[];
 /** Distance to everything the structure must avoid (moving parts, shafts, other links); +Infinity where free. */
 clearance:(p:V)=>number;
 /** Extra load cases (force per anchor id); default cases are ±x, ±y, ±z and torsion. */
 cases?:Record<string,V>[];
 settings?:Partial<StructureSettings>;
};
/** `deflection`: largest allowed displacement of a loaded anchor under the design loads (stiffness). */
/** `bracing`: 0 a pure tree, 1 a light net, 2 a dense net of cross struts between branches. */
export type StructureSettings={bracing:number;load:number;margin:number;maxNodes:number;resolution:number;blend:number;iterations:number;relax:number;keep:number;material:Material;region:number;deflection:number};
export const defaultSettings:StructureSettings={bracing:1,load:20,margin:1,maxNodes:140,resolution:.8,blend:2,iterations:30,relax:14,keep:.25,material:{...PLA,rMin:3},region:35,deflection:.5};
export type StructureResult={id:string;mesh:Mesh;nodes:TrussNode[];struts:{a:V;b:V;r:number;utilisation:number;force:number}[];report:StructureReport};
export type StructureReport={deflection:number;struts:number;nodes:number;volume:number;mass:number;utilisation:number;compliance:number;closed:boolean;components:number;triangles:number;clearance:number;connected:boolean;spacing:number;seconds:number;checks:{id:string;state:'pass'|'fail'|'warn';message:string}[]};

export async function generateStructure(spec:StructureSpec,progress?:(stage:string,f:number)=>void):Promise<StructureResult>{
 const t0=performance.now(),s={...defaultSettings,...spec.settings,material:{...defaultSettings.material,...spec.settings?.material}},m=s.material,rMin=m.rMin;
 if(!spec.anchors.some(a=>a.role==='support'))throw Error(`${spec.id}: kein Haltepunkt als Auflager.`);
 // The keep-out field is 1-Lipschitz: values on a 4 mm lattice bound it from below everywhere; exact values only near obstacles.
 const exact=spec.clearance,lattice=new Map<string,number>(),G=4,lowerBound=(p:V)=>{const c=p.map(x=>Math.round(x/G)*G) as V,k=c.join(',');let v=lattice.get(k);if(v===undefined){v=exact(c);lattice.set(k,v);}return v-norm(sub(p,c));};
 const atLeast=(p:V,t:number)=>lowerBound(p)>=t||exact(p)>=t;
 const clearanceCapped=(p:V,cap:number)=>{const l=lowerBound(p);return l>=cap?l:exact(p);};
 if(!spec.anchors.some(a=>a.role==='load'))throw Error(`${spec.id}: kein belasteter Haltepunkt.`);
 // ---- anchors: bosses, holes, keep zones, ports ----
 const geo=spec.anchors.map(a=>featureGeometry(a.feature,a.frame)),bosses=new PrimIndex(12,12),holes=new PrimIndex(12,12),keep=new PrimIndex(12,40);
 geo.forEach((g,k)=>{if(!spec.anchors[k].clip)g.solids.forEach(x=>bosses.add(x));g.holes.forEach(x=>holes.add(x));g.keep.forEach(x=>keep.add(x));});
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
 // Grouped anchors are one rigid body.
 spec.anchors.forEach((a,k)=>{if(!a.group)return;spec.anchors.forEach((b,l)=>{if(l>k&&b.group===a.group)struts.push({i:anchorNodes[k][0],j:anchorNodes[l][0],rigid:true,area:400});});});
 // ---- free space and ground structure ----
 const ports=nodes.map(x=>x.p),lo=[0,1,2].map(i=>Math.min(...ports.map(p=>p[i]))-s.region) as V,hi=[0,1,2].map(i=>Math.max(...ports.map(p=>p[i]))+s.region) as V;
 const vol=(hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2]),h=Math.max(6,Math.cbrt(vol/s.maxNodes));
 const need=rMin+s.margin;
 const freeAt=(p:V,r:number)=>atLeast(p,r+s.margin)&&holes.distance(p)>=r+s.margin&&keep.distance(p)>=r+s.margin;
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
 const room=(a:V,b:V)=>{const d=sub(b,a),L=norm(d),n=Math.max(2,Math.ceil(L/2));let r=Infinity;for(let k=0;k<=n;k++){if(k===0||k===n){const p=add(k?b:a,scale(d,(k?-1:1)*Math.min(rMin+1,L/2)/L));r=Math.min(r,clearanceCapped(p,16)+s.margin);continue;}const t=k/n,ends=Math.min(t*L,(1-t)*L);if(ends<rMin+1)continue;const p=add(a,scale(d,t));r=Math.min(r,clearanceCapped(p,16)+s.margin,holes.distance(p),keep.distance(p));}return r;};
 const capOf=(x:TrussNode[],st:Strut)=>st.rigid?40:Math.min(12,Math.max(rMin,room(x[st.i].p,x[st.j].p)-s.margin-s.blend/2));
 const sagOf=(x:TrussNode[],us:Float64Array[][])=>Math.max(0,...us.flatMap(u=>x.map((n,i)=>n.load?Math.hypot(u[i][0],u[i][1],u[i][2]):0)));
 // Frame compliance of a network with its optimised areas scaled to a common volume: compares thinning levels fairly.
 const volumeOf=(x:{nodes:TrussNode[];struts:Strut[]})=>x.struts.reduce((v,st)=>st.rigid?v:v+st.area*norm(sub(x.nodes[st.j].p,x.nodes[st.i].p)),0);
 const frameCompliance=(x:{nodes:TrussNode[];struts:Strut[]},L:V[][],volume:number)=>{const k=volume/Math.max(1e-9,volumeOf(x)),sc=x.struts.map(st=>({...st,area:st.rigid?st.area:Math.max(st.area*k,1e-3)}));const f=solveFrame(x.nodes,sc,L,m);if(!f)return Infinity;return L.reduce((c,cs,ci)=>c+cs.reduce((y,v,i)=>y+v[0]*f.us[ci][i][0]+v[1]*f.us[ci][i][1]+v[2]*f.us[ci][i][2],0),0);};
 // ---- topology: Steiner tree from the supports (each load anchor joins the nearest point of the growing tree
 // by its shortest free path, farthest first), optional cross bracing between branches for a net. ----
 const design=()=>{
  progress?.('Baum',.1);
  const N=net.nodes,len=(st:Strut)=>norm(sub(N[st.j].p,N[st.i].p)),adj=new Map<number,{j:number;k:number}[]>();
  net.struts.forEach((st,k)=>{if(st.rigid)return;(adj.get(st.i)??adj.set(st.i,[]).get(st.i)!).push({j:st.j,k});(adj.get(st.j)??adj.set(st.j,[]).get(st.j)!).push({j:st.i,k});});
  const anchorOf=(i:number)=>N[i].anchor,tree=new Set<number>(),usedStrut=new Set<number>(),usedAnchor=new Set<number>();
  // Paths prefer open space: a strut's cost grows where it has little room (trunks need it).
  const roomOf=new Map<number,number>(),cost=(k:number)=>{let c=roomOf.get(k);if(c===undefined){c=capOf(N,net.struts[k]);roomOf.set(k,c);}return len(net.struts[k])*(1+(6/Math.max(c,.5))**2);};
  // Supports are where the tree starts (all their nodes); a support anchor counts as used once something hangs on it.
  // With several supports (feet) the tree starts at the one nearest to the loads; the others join like loads.
  const supports=spec.anchors.map((a,k)=>({a,k})).filter(x=>x.a.role==='support'),loadMid=scale(spec.anchors.filter(a=>a.role==='load').reduce((c,a)=>add(c,a.frame.position),[0,0,0] as V),1/Math.max(1,spec.anchors.filter(a=>a.role==='load').length));
  const root=supports.reduce((b,x)=>norm(sub(x.a.frame.position,loadMid))<norm(sub(b.a.frame.position,loadMid))?x:b,supports[0]);
  N.forEach((x,i)=>{if(x.fixed&&(supports.length===1||x.anchor===root.k))tree.add(i);});usedAnchor.add(root.k);
  const loadAnchors=spec.anchors.map((a,k)=>({a,k})).filter(x=>x.a.role==='load'||spec.anchors.filter(y=>y.role==='support').length>1&&x.a.role==='support'),centre=scale(spec.anchors.filter(a=>a.role==='support').reduce((c,a)=>add(c,a.frame.position),[0,0,0] as V),1/Math.max(1,spec.anchors.filter(a=>a.role==='support').length));
  loadAnchors.sort((x,y)=>norm(sub(y.a.frame.position,centre))-norm(sub(x.a.frame.position,centre)));
  const groupOf=(k:number)=>spec.anchors[k].group?spec.anchors.map((a,l)=>a.group===spec.anchors[k].group?l:-1).filter(l=>l>=0):[k];
  const anchorNodesOf=(k:number)=>{const g=groupOf(k);return N.map((x,i)=>x.anchor!==undefined&&g.includes(x.anchor)?i:-1).filter(i=>i>=0);};
  for(const {k} of loadAnchors){
   if(usedAnchor.has(k))continue;
   // Multi-source Dijkstra from the anchor's ports to the tree; existing struts are cheaper (trunks are shared).
   // In a net every anchor gets a second, largely separate way to the tree (triangles instead of a single branch).
   const starts=anchorNodesOf(k),connect=(avoid:Set<number>,avoidGoal:Set<number>)=>{const dist=new Map<number,number>(starts.map(i=>[i,0])),via=new Map<number,{from:number;k:number}>(),done=new Set<number>();let goal=-1;
    const heap:[number,number][]=starts.map(i=>[0,i]);
    while(heap.length){let bi=0;for(let i=1;i<heap.length;i++)if(heap[i][0]<heap[bi][0])bi=i;const [d,i]=heap.splice(bi,1)[0];if(done.has(i))continue;done.add(i);
     if(tree.has(i)&&!starts.includes(i)&&!avoidGoal.has(i)){goal=i;break;}
     for(const e of adj.get(i)??[]){if(anchorOf(e.j)!==undefined&&!groupOf(k).includes(anchorOf(e.j)!)&&!tree.has(e.j)&&!N[e.j].fixed)continue;const w=cost(e.k)*(avoid.has(e.k)?6:usedStrut.has(e.k)?.35:1),nd=d+w;if(nd<(dist.get(e.j)??Infinity)){dist.set(e.j,nd);via.set(e.j,{from:i,k:e.k});heap.push([nd,e.j]);}}}
    if(goal<0)return undefined;const path:number[]=[],nodesOn=new Set<number>();for(let i=goal;!starts.includes(i);){const v=via.get(i)!;path.push(v.k);nodesOn.add(i);i=v.from;}return {goal,path,nodesOn};};
   const first=connect(new Set(),new Set());if(!first)continue;
   for(const sk of first.path){usedStrut.add(sk);const st=net.struts[sk];tree.add(st.i);tree.add(st.j);}
   const goal=first.goal;
   if(s.bracing>0){const second=connect(new Set(first.path),first.nodesOn);if(second&&second.path.length<=first.path.length*3+4)for(const sk of second.path){usedStrut.add(sk);const st=net.struts[sk];tree.add(st.i);tree.add(st.j);}}
   for(const i of starts)tree.add(i);for(const g of groupOf(k))usedAnchor.add(g);
   const hit=anchorOf(goal);if(hit!==undefined)usedAnchor.add(hit);
  }
  // Fan-out at the supports: up to four more ports join the tree, so the load spreads over the flange.
  for(const sp of supports){const ports=anchorNodesOf(sp.k).filter(i=>i!==N.findIndex(x=>x.anchor===sp.k)),treeOnly=new Set([...tree].filter(i=>N[i].anchor===undefined));if(!treeOnly.size)continue;let joined=0;
   for(const pi of ports.sort((a,b)=>Math.min(...[...treeOnly].map(t=>norm(sub(N[t].p,N[a].p))))-Math.min(...[...treeOnly].map(t=>norm(sub(N[t].p,N[b].p)))))){if(joined>=4)break;
    const e=(adj.get(pi)??[]).filter(x=>treeOnly.has(x.j)&&!usedStrut.has(x.k)).sort((a,b)=>cost(a.k)-cost(b.k))[0];if(e){usedStrut.add(e.k);joined++;}}}
  let kept=[...net.struts.filter(x=>x.rigid),...[...usedStrut].map(k=>net.struts[k])];
  // Net: cross struts between nodes of different branches that are close and free.
  if(s.bracing>0){const treeNodes=[...new Set(kept.filter(x=>!x.rigid).flatMap(x=>[x.i,x.j]))].filter(i=>N[i].anchor===undefined);
   const hop=new Map<number,Set<number>>();for(const x of kept)if(!x.rigid){(hop.get(x.i)??hop.set(x.i,new Set()).get(x.i)!).add(x.j);(hop.get(x.j)??hop.set(x.j,new Set()).get(x.j)!).add(x.i);}
   let added=0;const limit=Math.ceil(treeNodes.length*.6*s.bracing);
   for(const st of [...net.struts].filter(x=>!x.rigid&&!usedStrut.has(net.struts.indexOf(x))).sort((a,b)=>len(a)-len(b))){if(added>=limit)break;
    if(!treeNodes.includes(st.i)||!treeNodes.includes(st.j)||len(st)>2.4*h)continue;const ni=hop.get(st.i)!,nj=hop.get(st.j)!;if([...ni].some(x=>nj.has(x))||ni.has(st.j))continue;kept.push(st);ni.add(st.j);nj.add(st.i);added++;}}
  const used=new Set<number>();for(const x of kept)if(!x.rigid){used.add(x.i);used.add(x.j);}
  // Anchors without any strut (an unused foot) are left out of the part.
  N.forEach((x,i)=>{if(x.anchor!==undefined&&usedAnchorNode(x.anchor))used.add(i);});
  function usedAnchorNode(k:number){return usedAnchor.has(k)||kept.some(st=>!st.rigid&&(N[st.i].anchor===k||N[st.j].anchor===k));}
  kept=kept.filter(x=>used.has(x.i)&&used.has(x.j));
  let cur=subset(N,kept,used),L=loads.map(c=>cur.index.map(i=>c[i]));
  for(const st of cur.struts)if(!st.rigid)st.area=Math.PI*rMin*rMin;
  // Form finding: straighten paths and settle branch points, then drop chain nodes where the line of sight is free.
  progress?.('Formfindung',.5);
  const strutClear=(i:number,p:V)=>{if(!freeAt(p,need)||bosses.distance(p)<need)return false;for(const st of cur.struts){if(st.rigid||(st.i!==i&&st.j!==i))continue;const o=cur.nodes[st.i===i?st.j:st.i].p;if(!segmentFree(p,o,rMin+1))return false;}return true;};
  const unit1=cur.struts.map(()=>[1]);
  for(let r=0;r<s.relax*2;r++){const moved=relax(cur.nodes,cur.struts,unit1,strutClear,.7);if(moved<.1)break;}
  for(let again=true;again;){again=false;
   const deg=new Map<number,Strut[]>();for(const st of cur.struts)if(!st.rigid){(deg.get(st.i)??deg.set(st.i,[]).get(st.i)!).push(st);(deg.get(st.j)??deg.set(st.j,[]).get(st.j)!).push(st);}
   for(const [i,list] of deg){if(list.length!==2||cur.nodes[i].anchor!==undefined)continue;const [a,b]=list.map(st=>st.i===i?st.j:st.i);if(a===b||!segmentFree(cur.nodes[a].p,cur.nodes[b].p,rMin+1))continue;
    cur.struts=cur.struts.filter(x=>!list.includes(x));cur.struts.push({i:a,j:b,area:Math.PI*rMin*rMin});again=true;break;}}
  for(let again=true;again;){again=false;for(const st of cur.struts){if(st.rigid)continue;const a=cur.nodes[st.i],b=cur.nodes[st.j];if(norm(sub(a.p,b.p))>=2)continue;const [keepN,drop]=a.anchor===undefined?[st.j,st.i]:b.anchor===undefined?[st.i,st.j]:[-1,-1];if(keepN<0)continue;
   cur.struts=cur.struts.filter(x=>x!==st).map(x=>({...x,i:x.i===drop?keepN:x.i,j:x.j===drop?keepN:x.j})).filter((x,k,all)=>x.i!==x.j&&all.findIndex(y=>Math.min(y.i,y.j)===Math.min(x.i,x.j)&&Math.max(y.i,y.j)===Math.max(x.i,x.j))===k);again=true;break;}}
  {const live=new Set<number>();for(const x of cur.struts){live.add(x.i);live.add(x.j);}const next=subset(cur.nodes,cur.struts,live);L=L.map(c=>next.index.map(i=>c[i]));cur={...next,index:next.index.map(i=>cur.index[i])};}
  // Strength as a rigid-jointed frame, then stiffness; never thicker than the free room.
  progress?.('Bemessung',.75);
  const caps=new Map(cur.struts.map(st=>[st,capOf(cur.nodes,st)]));
  let framed=sizeFrame(cur.nodes,cur.struts,L,m,5,st=>caps.get(st)!),deflection=sagOf(cur.nodes,framed.us);
  for(let it=0;it<14&&deflection>s.deflection;it++){const f=Math.min(1.5,Math.pow(deflection/s.deflection,1/3)*1.02);let grew=false;for(const st of cur.struts)if(!st.rigid){const r=Math.min(caps.get(st)!,radiusOf(st)*f);if(r>radiusOf(st)+1e-6)grew=true;st.area=Math.PI*r*r;}if(!grew)break;
   const next=solveFrame(cur.nodes,cur.struts,L,m);if(!next)break;framed={...next,util:cur.struts.map((st,i)=>st.rigid?0:Math.max(...next.forces[i].map(x=>barUtilisation(x,radiusOf(st),m))))};deflection=sagOf(cur.nodes,next.us);}
  return {cur,L,framed,deflection};
 };
 const result=design();
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
 geo.forEach((g,k)=>{g.solids.forEach(x=>spec.anchors[k].clip?scene.solid(x):scene.hardSolid(x));g.holes.forEach(x=>scene.hole(x));});
 // Clip by the keep-out field: no material where another part is (anchor bosses are placed by design).
 // The keep-out field is 1-Lipschitz: a coarse 4 mm lattice bounds it from below, exact values only where clipping can act.
 const lower=lowerBound;
 // Near the anchors' bosses the clip fades out continuously (they sit where the plan put them).
 const field=(p:V)=>{const d=scene.distance(p);if(d>2*s.resolution)return d;const bd=bosses.distance(p);if(bd<.3)return d;if(lower(p)>=.4-d)return d;const fade=Math.min(1,(bd-.3)/.4);return Math.max(d,.4-spec.clearance(p)-(1-fade)*30);};
 const b=scene.bounds();
 const raw=surfaceNets(field,b.min,b.max,s.resolution,8,p=>scene.distance(p)),{mesh,dropped}=largestPart(raw);
 progress?.('Prüfung',.95);
 const info=inspect(mesh);
 // Clearance of the finished surface (every 7th vertex is plenty at 0.8 mm).
 let worst=Infinity,worstAt:V=[0,0,0];for(let i=0;i<mesh.vertices.length/3;i+=7){const p:V=[mesh.vertices[i*3],mesh.vertices[i*3+1],mesh.vertices[i*3+2]];if(bosses.distance(p)<1)continue;const c=spec.clearance(p);if(c<worst){worst=c;worstAt=p;}}
 const struts2=net.struts.map((st,k)=>({st,k})).filter(x=>!x.st.rigid).map(({st,k})=>({a:net.nodes[st.i].p,b:net.nodes[st.j].p,r:radiusOf(st),utilisation:util[k],force:forceOf(k)}));
 const maxUtil=Math.max(0,...struts2.map(x=>x.utilisation)),connected=reach2(net);
 const checks:StructureReport['checks']=[
  {id:'connected',state:connected?'pass':'fail',message:connected?'Alle Haltepunkte hängen am Auflager.':'Ein Haltepunkt ist nicht angebunden.'},
  {id:'strength',state:maxUtil<=1.001?'pass':'warn',message:`Größte Auslastung ${(maxUtil*100).toFixed(0)} % (Rahmen: Zug/Druck, Biegung, Torsion, Knicken; Sicherheit ${(50/m.sigma).toFixed(1)})${maxUtil>1.001?(()=>{const w=struts2.reduce((x,y)=>y.utilisation>x.utilisation?y:x);return ` an Strebe (${w.a.map(n=>n.toFixed(0)).join(',')})–(${w.b.map(n=>n.toFixed(0)).join(',')}) r=${w.r.toFixed(1)}`;})():''}.`},
  {id:'stiffness',state:deflection<=s.deflection*1.05?'pass':'warn',message:`Größte Verformung an einem Haltepunkt ${deflection.toFixed(2)} mm (zulässig ${s.deflection} mm)${(()=>{let w=-1,d=-1;framed.us.forEach(u=>net.nodes.forEach((x,i)=>{if(!x.load)return;const v=Math.hypot(u[i][0],u[i][1],u[i][2]);if(v>d){d=v;w=i;}}));return w>=0&&deflection>s.deflection*1.05?` bei ${spec.anchors[net.nodes[w].anchor!].id}`:'';})()}.`},
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
