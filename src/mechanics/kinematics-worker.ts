import {solve} from './kinematics/solver';
import {fromGraph} from './kinematics/adapter';
import {partMesh} from './kinematics/generate/part';
import type {Mechanism,Element} from './kinematics/model';
// Solves a mechanism over its range, then generates the printable parts it was asked for.
// Accepts a kinematics-1 document or an element graph (translated by the adapter).
// Posts 'done' with the solution first and 'parts' with triangle soups afterwards.
self.onmessage=async ({data})=>{
 try{
  const mechanism:Mechanism=data.mechanism?structuredClone(data.mechanism):fromGraph(data.graph,{range:data.range});
  if(data.range)mechanism.range=data.range;
  const s=await solve(mechanism,{yield:false,fixed:data.fixed});
  self.postMessage({type:'done',solution:{mechanism:s.mechanism,poses:s.poses,transfer:s.transfer,checks:s.checks,error:s.error,mobility:s.mobility}});
  if(!data.parts)return;
  const ids:string[]=data.parts==='printed'?mechanism.elements.filter((e:Element)=>e.source.kind==='printed'&&e.surfaces.length).map((e:Element)=>e.id):data.parts;
  const parts:Record<string,Float32Array>={},errors:Record<string,string>={};
  for(const id of ids){try{const {mesh}=partMesh(mechanism,id),out=new Float32Array(mesh.triangles.length*9);mesh.triangles.forEach(([a,b,c],i)=>{[a,b,c].forEach((k,j)=>out.set(mesh.positions[k],i*9+j*3));});parts[id]=out;}catch(e){errors[id]=String(e instanceof Error?e.message:e);}}
  self.postMessage({type:'parts',parts,errors},{transfer:Object.values(parts).map(p=>p.buffer)});
 }catch(error){self.postMessage({type:'error',message:String(error instanceof Error?error.message:error)});}
};
