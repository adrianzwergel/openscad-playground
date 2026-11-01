// Node worker for the meshing pool (field-jobs.ts): answers init and field requests.
import {parentPort} from 'node:worker_threads';
import {fieldHandler} from '../../src/mechanics/kinematics/field-jobs.ts';
const handle=fieldHandler();
parentPort.on('message',async m=>{try{const r=await handle(m);parentPort.postMessage({id:m.id,result:r},r instanceof Float64Array?[r.buffer]:[]);}catch(e){parentPort.postMessage({id:m.id,error:String(e?.stack??e)});}});
