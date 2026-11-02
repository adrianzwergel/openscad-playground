// Placement grid of a motor (catalog grid): where a motor can sit so that the
// released catalog parts can reach its axis with the asked reduction. Uses the
// search's own necessary reach conditions (search/reach.ts): a straight train of
// centre distances d₁…dₖ reaches shaft distances between max(0, 2·max d − Σd) and
// Σd (one stage: exactly d, a circle; free idler angles open it into a ring); one
// change of axis (bevel, worm) puts the shaft across the axis, its offset off by
// at most the straight distances. Each train is a family of its own; the grid is
// a necessary condition, the search still decides about room and seats.
import type {Frame,V} from './math.ts';
import {compose,rotate,add,scale,dot,norm,cross,multiply,axisAngle} from './math.ts';
import type {Mechanism} from './model.ts';
import type {PairChoice} from './catalog.ts';
import {selectProviders} from './catalog.ts';
import {choiceGeometry} from './search/reach.ts';
import {axisJoint,driveRules} from './drive.ts';
import type {Drive,DriveCatalog} from './drive.ts';

/** One train: shaft distances (mm) it reaches, `lo === hi` for one stage. `kind`: shaft parallel to the axis or across
 * it (the distance is then the offset between both shaft lines). */
export type GridFamily={key:string;kind:'parallel'|'across';lo:number;hi:number;stages:number;label:string};
/** `axis`: the driven axis on the carrying link (z along it). */
/** `alternatives`: without families, the reductions nearest to the target that the catalog does reach (as many stages). */
export type MotorGrid={axis:Frame;families:GridFamily[];alternatives:{ratio:number;stages:number;label:string}[]};
export type Snapped={frame:Frame;family:GridFamily;distance:number};

// Parts by their teeth (LEGO: module 1, so twice the pitch radius); worms by their name.
const part=(e:PairChoice['a'])=>{const s=e.surfaces[0];if(s?.profile.kind==='helical')return `${s.profile.starts}-gängig`;if(e.source.kind==='library'&&e.source.library==='lego'&&s?.pitch.kind==='circle')return `z${Math.round(2*s.pitch.r)}`;return /z\d+/.exec(e.label)?.[0]??e.label;};
const pairLabel=(c:PairChoice)=>`${part(c.a)} → ${part(c.b)}`;
const ruleLabel:Record<string,string>={'external-spur':'Stirnräder','gt2-belt':'GT2-Riemen','bevel-mesh':'Kegelräder','worm-mesh':'Schnecke','lego-spur':'LEGO','lego-bevel-90':'LEGO-Kegel','lego-worm':'LEGO-Schnecke'};
const stageLabel=(c:PairChoice)=>`${ruleLabel[c.rule]??c.rule} ${pairLabel(c)}${c.rule==='gt2-belt'?` (${c.params.length} mm)`:''}`;

/** The grid of a drive on a rotary axis (undefined for linear axes and paths: there the motor is placed freely).
 * `allowed`: catalog filter for pairs (locked parts); each stage count visits at most `limit` partial trains and keeps
 * at most `keep` families. */
export function motorGrid(m:Mechanism,d:Drive,o:{catalog?:DriveCatalog;allowed?:(c:PairChoice)=>boolean;limit?:number;keep?:number}={}):MotorGrid|undefined{
 const j=axisJoint(m,d.axis);if(j.joint.kind!=='revolute')return undefined;
 const side=j.a.body===d.body?j.a:j.b.body===d.body?j.b:undefined;if(!side)return undefined;
 const choices=selectProviders(driveRules('rotation',o.catalog)).flatMap(p=>p.catalog()).filter(c=>!c.linear&&(!o.allowed||o.allowed(c)));
 // Pairs with the same reduction and distance reach the same places: one of each is enough.
 type Pair={factor:number;d:number;c:PairChoice;turn:boolean};const pairs=new Map<string,Pair>();
 for(const c of choices){try{const g=choiceGeometry(c,c.variables.some(v=>v.key==='angle')?90:undefined);
  if(c.changesAxis&&g.kind!=='helical'&&Math.abs(g.sigma-90)>1e-6)continue;const dist=c.changesAxis?(g.kind==='helical'?g.distance:0):g.distance,key=`${c.changesAxis}:${c.factor.toFixed(9)}:${dist.toFixed(2)}`;
  if(!pairs.has(key))pairs.set(key,{factor:c.factor,d:dist,c,turn:c.changesAxis});}catch{/* a pair without this geometry */}}
 const list=[...pairs.values()],target=d.target,tol=d.tolerance/100,within=(r:number)=>Math.abs(r-target)/target<=tol+1e-9,max=d.maxStages??3;
 const factors=[...new Set(list.map(x=>x.factor))];
 // Can exactly `left` more stages bring the reduction within the tolerance? (memoised as in the search)
 const memo=new Map<string,boolean>(),finish=(left:number,r:number):boolean=>{if(!left)return within(r);const key=left+':'+r.toPrecision(10);let v=memo.get(key);if(v===undefined){v=factors.some(f=>finish(left-1,r*f));memo.set(key,v);}return v;};
 const families=new Map<string,GridFamily>(),limit=o.limit??100000,keep=o.keep??200;
 for(let stages=1;stages<=max;stages++){let visits=0,kept=0;
  // Pairs in a train only add up, so their order does not matter: walk them in non-decreasing index order.
  const walk=(path:Pair[],from:number,r:number)=>{
   if(++visits>limit||kept>=keep)return;
   if(path.length===stages){const s=path.filter(x=>!x.turn),turns=path.filter(x=>x.turn);if(turns.length>1)return;
    const sum=s.reduce((a,x)=>a+x.d,0),longest=Math.max(0,...s.map(x=>x.d)),kind=turns.length?'across':'parallel',lo=kind==='across'?Math.max(0,turns[0].d-sum):Math.max(0,2*longest-sum),hi=kind==='across'?turns[0].d+sum:sum;
    const key=`${kind}:${stages}:${lo.toFixed(1)}:${hi.toFixed(1)}`;if(!families.has(key)){families.set(key,{key,kind,lo,hi,stages,label:path.map(x=>stageLabel(x.c)).join(' · ')});kept++;}return;}
   for(let i=from;i<list.length;i++){const x=list[i];if(x.turn&&path.some(y=>y.turn))continue;const next=r*x.factor;if(finish(stages-path.length-1,next))walk([...path,x],i,next);}
  };
  walk([],0,1);}
 // Nothing within the tolerance: the nearest reductions within reach tell what to change.
 const alternatives:MotorGrid['alternatives']=[];
 if(!families.size){const seen=new Map<string,MotorGrid['alternatives'][number]>();let visits=0;
  const walk=(path:Pair[],from:number,r:number)=>{if(++visits>limit)return;if(path.length){const key=r.toFixed(3);if(!seen.has(key)||seen.get(key)!.stages>path.length)seen.set(key,{ratio:r,stages:path.length,label:path.map(x=>stageLabel(x.c)).join(' · ')});}
   if(path.length<max)for(let i=from;i<list.length;i++){const x=list[i];if(x.turn&&path.some(y=>y.turn))continue;walk([...path,x],i,r*x.factor);}};
  walk([],0,1);alternatives.push(...[...seen.values()].sort((a,b)=>Math.abs(Math.log(a.ratio/target))-Math.abs(Math.log(b.ratio/target))||a.stages-b.stages).slice(0,3));}
 return {axis:side.local,alternatives,families:[...families.values()].sort((a,b)=>a.stages-b.stages||(a.kind===b.kind?0:a.kind==='parallel'?-1:1)||a.hi-a.lo-(b.hi-b.lo)||a.hi-b.hi)};
}

/** Nearest grid distance to `r` among families: a one-stage circle within `magnet` mm wins; inside a ring the motor
 * stays; else the nearest edge. */
export function nearestFamily(families:GridFamily[],r:number,magnet=3){
 let best:{family:GridFamily;distance:number;cost:number}|undefined;
 for(const f of families){const at=Math.max(f.lo,Math.min(f.hi,r)),gap=Math.abs(at-r),cost=gap-(f.stages===1&&gap<=magnet?magnet+1:0)+f.stages*1e-6;if(!best||cost<best.cost)best={family:f,distance:at,cost};}
 return best&&{family:best.family,distance:best.distance};
}

/** Puts a flange frame (on the carrying link) onto the grid: the shaft parallel to the axis or across it (whichever is
 * nearer to its current direction and offered), at the nearest reachable distance; the rest of its pose stays.
 * `only`: snap to this family alone. */
export function snapMotor(grid:MotorGrid,frame:Frame,o:{only?:string;magnet?:number}={}):Snapped|undefined{
 const pool=o.only?grid.families.filter(f=>f.key===o.only):grid.families;if(!pool.length)return undefined;
 const a=rotate(grid.axis.rotation,[0,0,1]),origin=grid.axis.position,z=rotate(frame.rotation,[0,0,1]),c=dot(z,a);
 const offered=(k:GridFamily['kind'])=>pool.some(f=>f.kind===k),kind:GridFamily['kind']=offered('across')&&(Math.abs(c)<Math.SQRT1_2||!offered('parallel'))?'across':'parallel',families=pool.filter(f=>f.kind===kind);
 // Shaft direction: turned the shortest way onto ±axis or into the plane across it.
 let s:V=kind==='parallel'?scale(a,c<0?-1:1):add(z,scale(a,-c));if(norm(s)<1e-6)s=rotate(grid.axis.rotation,[1,0,0]);s=scale(s,1/norm(s));
 const turn=cross(z,s),sin=norm(turn),cos=Math.max(-1,Math.min(1,dot(z,s))),rotation=normalise(sin<1e-9?(cos>0?frame.rotation:multiply(axisAngle(perpendicular(z),180),frame.rotation)):multiply(axisAngle(scale(turn,1/sin),Math.atan2(sin,cos)*180/Math.PI),frame.rotation));
 const rel=add(frame.position,scale(origin,-1));
 if(kind==='parallel'){const radial=add(rel,scale(a,-dot(rel,a))),r=norm(radial),hit=nearestFamily(families,r,o.magnet)!,dir=r>1e-6?scale(radial,1/r):rotate(grid.axis.rotation,[1,0,0]);
  return {frame:{position:add(add(origin,scale(a,dot(rel,a))),scale(dir,hit.distance)),rotation},family:hit.family,distance:hit.distance};}
 // Across: the shaft line's offset from the axis line along their common normal.
 const n0=cross(a,s),n=scale(n0,1/norm(n0)),off=dot(rel,n),hit=nearestFamily(families,Math.abs(off),o.magnet)!,signed=(off<0?-1:1)*hit.distance;
 return {frame:{position:add(frame.position,scale(n,signed-off)),rotation},family:hit.family,distance:hit.distance};
}
const perpendicular=(v:V):V=>{const p=cross(v,Math.abs(v[0])<.9?[1,0,0]:[0,1,0]);return scale(p,1/norm(p));};
const normalise=(q:number[])=>{const l=Math.hypot(...q);return q.map(x=>x/l) as Frame['rotation'];};
/** The axis frame at the motor's height (for drawing the grid around it): z along the axis. */
export function gridPlane(grid:MotorGrid,flange:V):Frame{const a=rotate(grid.axis.rotation,[0,0,1]),h=dot(add(flange,scale(grid.axis.position,-1)),a);return compose(grid.axis,{position:[0,0,h],rotation:[0,0,0,1]});}
