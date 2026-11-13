// The CAD worker of the shaft generator: OpenCascade loaded once, then per message the plan, the solids and either
// meshes for the preview or the files. Freed after every message; it reports its memory so the page can start a fresh
// one when OpenCascade's small leaks add up.
import opencascade from 'replicad-opencascadejs';
import {setOC} from 'replicad';
import {parseShaft} from './model.ts';
import {planShaft} from './plan.ts';
import {buildParts,meshParts,exportParts} from './cad.ts';

export type CadRequest={id:number;kind:'mesh'|'files';doc:unknown};
export type CadReply={id:number;kind:'mesh';meshes:ReturnType<typeof meshParts>;memory:number}|{id:number;kind:'files';files:{name:string;data:ArrayBuffer}[];memory:number}|{id:number;kind:'error';message:string;memory:number};

type OC=Awaited<ReturnType<typeof opencascade>>&{wasmMemory?:WebAssembly.Memory};
const ready:Promise<OC>=(opencascade as unknown as (o:object)=>Promise<OC>)({print:()=>{},printErr:()=>{}}).then(oc=>{setOC(oc as never);return oc;});
const post=(r:CadReply,transfer:Transferable[]=[])=>(self as unknown as Worker).postMessage(r,transfer);
self.onmessage=async(e:MessageEvent<CadRequest>)=>{
 const oc=await ready,memory=()=>oc.wasmMemory?.buffer.byteLength??0,{id,kind}=e.data;let free=()=>{};
 try{const doc=parseShaft(e.data.doc),plan=planShaft(doc),built=buildParts(doc,plan);free=built.free;
  if(kind==='mesh'){const meshes=meshParts(built.parts);free();free=()=>{};post({id,kind,meshes,memory:memory()},meshes.flatMap(m=>[m.vertices.buffer,m.normals.buffer,m.triangles.buffer,m.edges.buffer]));}
  else{const files=await exportParts(built.parts);free();free=()=>{};post({id,kind,files,memory:memory()},files.map(f=>f.data));}}
 catch(err){free();post({id,kind:'error',message:err instanceof Error?err.message:String(err),memory:memory()});}
};
