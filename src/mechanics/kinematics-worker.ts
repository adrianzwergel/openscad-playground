import {solve} from './kinematics/solver';
import {fromGraph} from './kinematics/adapter';
// Solves a mechanism over its range. Accepts a kinematics-1 document or an element graph
// (translated by the adapter). One job per worker; the owner terminates it on cancel.
self.onmessage=async ({data})=>{
 try{
  const mechanism=data.mechanism?structuredClone(data.mechanism):fromGraph(data.graph,{range:data.range});
  if(data.range)mechanism.range=data.range;
  const s=await solve(mechanism,{yield:false});
  self.postMessage({type:'done',solution:{mechanism:s.mechanism,poses:s.poses,transfer:s.transfer,checks:s.checks,error:s.error,mobility:s.mobility}});
 }catch(error){self.postMessage({type:'error',message:String(error instanceof Error?error.message:error)});}
};
