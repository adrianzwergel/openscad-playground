// Studio worker for step ⑦: bearing plan, then one optimised structure per
// link (tips first). Posts the plan, progress, every finished link (mesh as a
// triangle soup in the link's frame) and a final summary.
import {planBearings,applyBearings} from './kinematics/bearings';
import {linkStructures} from './kinematics/link-structure';
import {soup,stlBinary} from '../structure/mesh';
import type {Mechanism} from './kinematics/model';
import type {Drive} from './kinematics/drive';

type Part={id:string;positions:Float32Array};
self.onmessage=async({data})=>{
 try{
  const m:Mechanism=structuredClone(data.mechanism),drives:Drive[]=data.drives??[],parts:Record<string,{parts:Part[]}>=data.assets??{};
  const assets=(id:string)=>parts[id];
  const plan=planBearings(m,drives,assets,data.bearings??{});applyBearings(m,plan);
  self.postMessage({type:'plan',plan});
  let last=0;
  const links=await linkStructures(m,drives,plan,assets,data.settings??{},(link,stage,f)=>{const now=performance.now();if(now-last>150){last=now;self.postMessage({type:'progress',link,stage,f});}});
  for(const x of links){
   if(!x.result){self.postMessage({type:'link',link:x.link,error:x.error,checks:x.checks});continue;}
   const positions=soup(x.result.mesh),stl=stlBinary(x.result.mesh,x.link);
   self.postMessage({type:'link',link:x.link,positions,stl,report:{...x.result.report,checks:undefined},checks:x.checks,anchors:x.anchors.map(a=>({id:a.id,role:a.role,kind:a.feature.kind}))},{transfer:[positions.buffer,stl.buffer]});
  }
  self.postMessage({type:'done'});
 }catch(error){self.postMessage({type:'error',message:String(error instanceof Error?error.message:error)});}
};
