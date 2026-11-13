// The page's side of the CAD worker: one request after the other, answers by id. OpenCascade leaks a little with
// every boolean, so a worker that has grown past `limit` bytes is replaced after its answer (the next request starts
// a fresh one; loading takes a moment, the browser keeps the WASM cached).
import type {CadReply,CadRequest} from './cad-worker.ts';

export class CadClient{
 private worker?:Worker;private seq=0;private waiting=new Map<number,{resolve:(r:CadReply)=>void;reject:(e:Error)=>void}>();
 /** How often a worker was replaced: for the checks. */
 restarts=0;
 constructor(private limit=700e6){}
 private spawn(){const w=new Worker('./welle-cad-worker.js');
  w.onmessage=(e:MessageEvent<CadReply>)=>{const r=e.data,p=this.waiting.get(r.id);this.waiting.delete(r.id);if(r.memory>this.limit&&w===this.worker&&!this.waiting.size){w.terminate();this.worker=undefined;this.restarts++;}p?.resolve(r);};
  w.onerror=e=>{e.preventDefault();const all=[...this.waiting.values()];this.waiting.clear();if(w===this.worker)this.worker=undefined;w.terminate();for(const p of all)p.reject(Error(e.message||'CAD-Worker abgestürzt'));};
  return w;}
 request(kind:CadRequest['kind'],doc:unknown){this.worker??=this.spawn();const id=++this.seq,w=this.worker;return new Promise<CadReply>((resolve,reject)=>{this.waiting.set(id,{resolve,reject});w.postMessage({id,kind,doc} satisfies CadRequest);});}
}
