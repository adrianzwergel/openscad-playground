// Studio worker for the meshing pool (kinematics/field-jobs.ts), started by the structure worker.
import {fieldHandler} from './kinematics/field-jobs';
const handle=fieldHandler();
self.onmessage=async({data})=>{try{const r=await handle(data);self.postMessage({id:data.id,result:r},r instanceof Float64Array?{transfer:[r.buffer]}:{});}catch(e){self.postMessage({id:data.id,error:String(e instanceof Error?e.stack??e.message:e)});}};
