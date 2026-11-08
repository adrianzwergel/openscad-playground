// The mechanism derived from a build (a project without a model), for ③: the gear train with its shafts, belts, racks and
// nuts (parts/train.ts trainMechanism), and every part or plate with a turning or sliding connection of its own as a
// body on a revolute or prismatic joint, on the world or on another such part. Bodies show as boxes round their parts,
// so the bearing planner sees where they are. Coordinates are the Studio's room.
import type {Build} from './build.ts';
import {partOf} from './build.ts';
import {bodyFrames,itemBody,plateBody} from './links.ts';
import type {Joint} from './links.ts';
import {trainMechanism,trainIssues,shaftFrames} from './train.ts';
import type {TrainNut} from './train.ts';
import {modelAsset,box} from '../demos.ts';
import type {Demo} from '../demos.ts';
import type {Asset} from '../model-import.ts';
import {compose,inverse,rotate,identity} from '../kinematics/math.ts';
import type {Frame,V} from '../kinematics/math.ts';
import type {JointRelation,Mechanism} from '../kinematics/model.ts';
import type {Drive} from '../kinematics/drive.ts';
import {toward} from '../kinematics/drive.ts';

const unit:Record<Joint['axis'],V>={x:[1,0,0],y:[0,1,0],z:[0,0,1]};
/** Corners of a box (centre, half sizes) in a frame: for an axis-aligned hull in the room. */
const corners=(f:Frame,c:V,h:V)=>[-1,1].flatMap(a=>[-1,1].flatMap(b=>[-1,1].map(d=>compose(f,{position:[c[0]+a*h[0],c[1]+b*h[1],c[2]+d*h[2]],rotation:[0,0,0,1]}).position)));
/** The derived mechanism and the assets it shows (undefined: nothing in the build moves). */
export function deriveMechanism(b:Build,label:string,assetId:string,nuts:TrainNut[]=[]):{demo:Demo;assets:Asset[]}|undefined{
 const t=b.train,gears=t&&(t.wheels.length||t.shafts.some(s=>s.kind==='spindel'))&&!trainIssues(t).length?trainMechanism(t,label,false,assetId,nuts):undefined;
 const moving=[...b.items.filter(i=>i.free?.joint&&i.free.joint.kind!=='mutter').map(i=>({key:itemBody(i.id),name:partOf(b,i).label,free:i.free!,size:partOf(b,i).box})),...b.plates.filter(p=>p.free.joint&&p.free.joint.kind!=='mutter').map(p=>({key:plateBody(p.id),name:'Bodenplatte',free:p.free,size:{min:[-40,-30,-3] as V,max:[40,30,0] as V}}))];
 if(!moving.length)return gears?{demo:gears,assets:[gears.asset]}:undefined;
 // Where everything stands at rest; a moving part becomes a body named after its key.
 const rest=bodyFrames(b,shaftFrames(t),{}),bodyOf=new Map(moving.map((m,n)=>[m.key,`Teil-${n+1}`])),boxes=moving.map(m=>{const pts=corners(rest[m.key],m.size.min.map((v,k)=>(v+m.size.max[k])/2) as V,m.size.min.map((v,k)=>(m.size.max[k]-v)/2) as V),lo=[0,1,2].map(k=>Math.min(...pts.map(p=>p[k]))) as V,hi=[0,1,2].map(k=>Math.max(...pts.map(p=>p[k]))) as V;return {lo,hi};});
 const parts:[string,Float32Array][]=moving.map((m,n)=>[bodyOf.get(m.key)!,box(boxes[n].lo.map((v,k)=>(v+boxes[n].hi[k])/2) as V,boxes[n].lo.map((v,k)=>Math.max(1,boxes[n].hi[k]-v)) as V)]);
 // Without gears the world gets a plate under the moving parts to stand on.
 if(!gears){const lo=[0,1].map(k=>Math.min(...boxes.map(x=>x.lo[k]))),hi=[0,1].map(k=>Math.max(...boxes.map(x=>x.hi[k]))),floor=Math.min(...boxes.map(x=>x.lo[2]))-16;parts.push(['Grundplatte',box([(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,floor+3],[hi[0]-lo[0]+48,hi[1]-lo[1]+48,6])]);}
 const {asset,mesh}=modelAsset(`${assetId}-teile`,`${label} · Teile`,parts);
 const m:Mechanism=gears?structuredClone(gears.mechanism):{format:'kinematics-1',parameters:[],patterns:[],bodies:[{id:'ground',frame:identity(),ground:true,display:mesh(['Grundplatte'])}],joints:[],elements:[],contacts:[],input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}};
 const drives:Drive[]=gears?structuredClone(gears.drives):[];
 // Parents first: a part on another moving part hangs on its body.
 const done=new Set<string>(),add=(i:number)=>{const x=moving[i];if(done.has(x.key))return;const parentKey=x.free.body&&bodyOf.has(x.free.body)?x.free.body:undefined;if(parentKey)add(moving.findIndex(y=>y.key===parentKey));done.add(x.key);
  const j=x.free.joint!,parent=parentKey?bodyOf.get(parentKey)!:'ground',parentFrame=parentKey?rest[parentKey]:x.free.body?rest[x.free.body]??identity():identity(),pivot=compose(parentFrame,{position:j.kind==='drehen'?j.at??x.free.frame.position:x.free.frame.position,rotation:[0,0,0,1]}).position,axis=rotate(parentFrame.rotation,unit[j.axis]),at:Frame={position:pivot,rotation:toward(axis)},id=bodyOf.get(x.key)!;
  m.bodies.push({id,frame:at,display:mesh([id])});
  m.joints.push({id,joint:{kind:j.kind==='drehen'?'revolute':'prismatic'},a:{body:parent,local:compose(inverse(parentKey?rest[parentKey]:identity()),at)},b:{body:id,local:identity()},limits:{min:j.min,max:j.max}} as JointRelation);
  if(j.input)drives.push({id:`T${i+1}`,spec:j.input.drive,body:parent,frame:compose(at,{position:[0,0,-20],rotation:[0,0,0,1]}),axis:id,target:1,tolerance:5});
};
 moving.forEach((_,i)=>add(i));
 return {demo:{label,asset:gears?.asset??asset,mechanism:m,drives,...(gears?.fabrication?{fabrication:gears.fabrication}:{})},assets:[...(gears?[gears.asset]:[]),asset]};}
