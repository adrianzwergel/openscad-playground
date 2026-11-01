// Studio worker for step ⑦: bearing plan, then one optimised structure per
// link (tips first). Posts the plan, progress, every finished link (mesh as a
// triangle soup in the link's frame) and a final summary. With `kind: 'shell'`
// it builds a housing for a board instead (no mechanism) and posts its STLs.
import {planBearings,applyBearings} from './kinematics/bearings';
import {linkStructures} from './kinematics/link-structure';
import {soup,stlBinary} from '../structure/mesh';
import {orientForPrint,printOrientation} from '../structure/print';
import {generateShell} from '../structure/shell';
import {fieldPool} from './kinematics/field-jobs';
import type {Mechanism} from './kinematics/model';
import type {Drive} from './kinematics/drive';

type Part={id:string;positions:Float32Array};
self.onmessage=async({data})=>{
 try{
  if(data.kind==='shell'){const r=generateShell(data.board,data.settings??{}),parts=r.parts.map(p=>{const print=printOrientation(p.mesh);return {id:p.id,mass:p.mass,closed:p.closed,print:{label:print.label,overhang:print.overhang/print.area},stl:stlBinary(orientForPrint(p.mesh,print.up),`${r.board.label} ${p.id}`)};});
   self.postMessage({type:'shell',board:r.board.label,parts,latch:r.layout.latch},{transfer:parts.map(p=>p.stl.buffer)});return;}
  const m:Mechanism=structuredClone(data.mechanism),drives:Drive[]=data.drives??[],parts:Record<string,{parts:Part[]}>=data.assets??{};
  const assets=(id:string)=>parts[id];
  const plan=planBearings(m,drives,assets,data.bearings??{});applyBearings(m,plan);
  self.postMessage({type:'plan',plan});
  // Meshing and clearance spread over field workers (one per core but one).
  const n=Math.max(1,Math.min(16,(navigator.hardwareConcurrency||4)-1)),workers=Array.from({length:n},()=>new Worker('./mechanics-field-worker.js'));
  const pool=fieldPool(workers.map(w=>({post:(msg,transfer)=>w.postMessage(msg,transfer??[]),listen:h=>{w.onmessage=({data})=>h(data);}})));
  const settings=data.settings??{};await pool.init({mechanism:m,drives,plan,assets:parts as never,settings});
  let last=0;
  const links=await linkStructures(m,drives,plan,assets,{...settings,pool:pool.run},(link,stage,f)=>{const now=performance.now();if(now-last>150){last=now;self.postMessage({type:'progress',link,stage,f});}});
  for(const x of links){
   if(!x.result){self.postMessage({type:'link',link:x.link,error:x.error,checks:x.checks});continue;}
   // The STL lies on the bed in its best print direction; the overlay stays in the link's frame.
   const positions=soup(x.result.mesh),stl=stlBinary(orientForPrint(x.result.mesh,x.result.report.print.up),x.link);
   self.postMessage({type:'link',link:x.link,positions,stl,report:{...x.result.report,checks:undefined},checks:x.checks,anchors:x.anchors.map(a=>({id:a.id,role:a.role,kind:a.feature.kind}))},{transfer:[positions.buffer,stl.buffer]});
  }
  for(const w of workers)w.terminate();
  self.postMessage({type:'done'});
 }catch(error){self.postMessage({type:'error',message:String(error instanceof Error?error.message:error)});}
};
