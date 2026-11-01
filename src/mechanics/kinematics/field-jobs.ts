// Meshing in parallel (LAGER-UND-STRUKTUR.md, B.5 "Worker zuerst"): every worker
// builds the same link environment as the main generation (mechanism, bearing
// plan, neighbours swept over their joints) once, adds the structures made so
// far, and computes a link's clipped structure field at a share of the grid
// points. The pool splits the points over its workers. Works with browser
// workers and with Node's worker_threads alike (`Port`).
import {linkStructures} from './link-structure.ts';
import type {BuiltStructure,LinkPool} from './link-structure.ts';
import type {Mechanism} from './model.ts';
import type {Drive,Assets} from './drive.ts';
import type {BearingPlan} from './bearings.ts';
import type {V} from './math.ts';
import {Scene,PrimIndex} from '../../structure/sdf.ts';
import {clipField,latticeBound} from '../../structure/generate.ts';
import type {FieldJob} from '../../structure/generate.ts';

/** Everything a worker needs to rebuild the environment (plain data). */
export type FieldInit={mechanism:Mechanism;drives:Drive[];plan:BearingPlan;assets:Record<string,{id:string;parts:{id:string;positions:Float32Array}[]}>;settings:Record<string,unknown>};
/** `run`: one batch; its job (scene and structures) is sent to a worker with its first chunk only. */
type Request={type:'init';init:FieldInit}|{type:'field';run:number;link:string;built?:BuiltStructure[];job?:FieldJob;points:Float64Array}|{type:'clearance';run:number;link:string;built?:BuiltStructure[];points:Float64Array};

/** The worker's side: answers init and field requests. */
export function fieldHandler(){
 let env:{clearanceFor:(link:string)=>(p:V)=>number;add:(b:BuiltStructure)=>void}|undefined;
 let added=new Set<string>(),clearances=new Map<string,{clearance:(p:V)=>number;lower:(p:V)=>number}>(),current:{run:number;field?:(p:V)=>number}={run:-1};
 return async(req:Request):Promise<Float64Array|true>=>{
  if(req.type==='init'){const {mechanism,drives,plan,assets,settings}=req.init;env=undefined;added=new Set();clearances=new Map();
   await linkStructures(mechanism,drives,plan,id=>assets[id] as ReturnType<Assets>,{...settings,environment:e=>{env=e;}});return true;}
  if(!env)throw Error('Feld-Worker ohne Umgebung.');
  for(const b of req.built??[])if(!added.has(b.link)){env.add(b);added.add(b.link);}
  // A link's clearance (and its lattice bound) holds as long as no further structure is added.
  const key=`${req.link}:${[...added].sort().join(',')}`;let c=clearances.get(key);
  if(!c){const clearance=env.clearanceFor(req.link);c={clearance,lower:latticeBound(clearance)};clearances.set(key,c);}
  if(req.type==='clearance'){const P=req.points,out=new Float64Array(P.length/3);for(let i=0;i<out.length;i++)out[i]=c.clearance([P[3*i],P[3*i+1],P[3*i+2]]);return out;}
  if(req.job){const scene=Scene.from(req.job.scene),bosses=new PrimIndex(12,12);for(const p of req.job.bosses)bosses.add(p);current={run:req.run,field:clipField(scene,bosses,c.clearance,c.lower,req.job.resolution)};}
  if(current.run!==req.run||!current.field)throw Error('Feld-Auftrag ohne Szene.');
  const field=current.field,P=req.points,out=new Float64Array(P.length/3);
  for(let i=0;i<out.length;i++)out[i]=field([P[3*i],P[3*i+1],P[3*i+2]]);
  return out;
 };
}

/** A worker as the pool sees it. */
export type Port={post:(message:unknown,transfer?:Transferable[])=>void;listen:(handler:(data:{id:number;result?:Float64Array|true;error?:string})=>void)=>void};
/** Spreads the field's points over the workers; `init` must run first (and again for another mechanism). */
export function fieldPool(ports:Port[]){
 let next=0;const waiting=new Map<number,{resolve:(r:Float64Array|true)=>void;reject:(e:Error)=>void}>();
 for(const p of ports)p.listen(({id,result,error})=>{const w=waiting.get(id);if(!w)return;waiting.delete(id);if(error)w.reject(Error(error));else w.resolve(result!);});
 const ask=(p:Port,message:Record<string,unknown>,transfer?:Transferable[])=>new Promise<Float64Array|true>((resolve,reject)=>{const id=next++;waiting.set(id,{resolve,reject});p.post({...message,id},transfer);});
 // Points near obstacles cost far more than others: many contiguous chunks (they keep the clearance caches warm),
 // taken by whichever worker is free.
 let runs=0;
 const spread=async(points:Float64Array,message:(chunk:Float64Array,first:boolean,run:number)=>Record<string,unknown>)=>{const n=points.length/3,size=Math.max(500,Math.ceil(n/(ports.length*8))),out=new Float64Array(n),run=runs++;let start=0;
  const work=async(p:Port)=>{let first=true;while(start<n){const from=start;start=Math.min(n,start+size);const chunk=points.slice(3*from,3*start);out.set(await ask(p,message(chunk,first,run),[chunk.buffer]) as Float64Array,from);first=false;}};
  await Promise.all(ports.map(work));return out;};
 const run:LinkPool={field:(link,built,job,points)=>spread(points,(chunk,first,r)=>({type:'field',run:r,link,...(first?{built,job}:{}),points:chunk})),
  clearance:(link,built,points)=>spread(points,(chunk,first,r)=>({type:'clearance',run:r,link,...(first?{built}:{}),points:chunk}))};
 return {size:ports.length,init:(init:FieldInit)=>Promise.all(ports.map(p=>ask(p,{type:'init',init}))).then(()=>undefined),run};
}
