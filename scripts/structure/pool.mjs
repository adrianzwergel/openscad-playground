// Meshing pool in Node: worker_threads running field-worker.mjs, initialised with the mechanism.
// Use: const p=await nodePool(m,drives,plan,asset,settings,n); linkStructures(..., {...settings,pool:p.run}); p.close().
import {Worker} from 'node:worker_threads';import os from 'node:os';
import {fieldPool} from '../../src/mechanics/kinematics/field-jobs.ts';
export async function nodePool(mechanism,drives,plan,asset,settings={},n=Math.max(1,Math.min(16,os.cpus().length-1))){
 const workers=Array.from({length:n},()=>new Worker(new URL('./field-worker.mjs',import.meta.url)));
 const pool=fieldPool(workers.map(w=>({post:(m,t)=>w.postMessage(m,t),listen:h=>w.on('message',h)})));
 const plain=Object.fromEntries(Object.entries(settings).filter(([,v])=>typeof v!=='function'));
 await pool.init({mechanism,drives,plan,assets:asset?{[asset.id]:asset}:{},settings:plain});
 return {run:pool.run,size:n,close:()=>Promise.all(workers.map(w=>w.terminate()))};
}
