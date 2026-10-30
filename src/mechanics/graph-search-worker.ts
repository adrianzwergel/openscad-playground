import {robustRoute} from './graph/robust-search';
// One search per worker. The owner terminates the worker on cancel or adoption,
// including during synchronous catalog / beam work; emitted results remain usable.
self.onmessage=async ({data})=>{
 let last=0;
 try{
  const result=await robustRoute(data.graph,data.options,undefined,visited=>{
   const now=performance.now();if(now-last<100)return;last=now;self.postMessage({type:'progress',visited});
  },(graph,report,stats)=>self.postMessage({type:'solution',graph,report,stats}));
  self.postMessage({type:'done',result});
 }catch(error){self.postMessage({type:'error',message:String(error)});}
};
