// Route search for one drive (Studio "Getriebe finden"): runs the kinematics
// route search on a prepared request and posts every solution as it is found.
import {route} from './kinematics/search/route';
import type {RouteSolution} from './kinematics/search/route';
const pack=(s:RouteSolution)=>({mechanism:s.mechanism,ratio:s.ratio,summary:s.summary,label:s.chain.stages.map(x=>x.choice.rule==='screw-nut'?x.choice.a.label:`${x.choice.a.label} → ${x.choice.b.label}`).join(' · ')});
let last=0;
self.onmessage=async({data})=>{
 try{
  const result=await route(data.request,{...data.options,yield:true},undefined,visited=>{const now=performance.now();if(now-last>200){last=now;self.postMessage({type:'progress',visited,budget:data.options.budget});}},s=>self.postMessage({type:'solution',solution:pack(s)}));
  self.postMessage({type:'done',status:result.status,visited:result.visited,rejections:result.rejections});
 }catch(error){self.postMessage({type:'error',message:String(error instanceof Error?error.message:error)});}
};
