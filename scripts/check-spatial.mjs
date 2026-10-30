import assert from 'node:assert/strict';
import {defaultSpatial,resolveSpatial,parseSpatial} from '../src/mechanics/spatial.ts';
import {spatialCAD} from '../src/mechanics/spatial-cad.ts';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
import {defaultMotion} from '../src/mechanics/motion.ts';
for(const kind of ['internal','bevel','worm'])for(const teeth of kind==='internal'?[60,80]:kind==='bevel'?[20,40]:[30,40])for(const clearance of [1,2,3]){
 const p={...defaultSpatial(kind),teeth,clearance},a=resolveSpatial(p),cad=spatialCAD(p);
 assert.deepEqual(parseProject(serializeProject({...initialProject(),spatial:p})).spatial,p);
 assert.equal(a.shafts.length,2);assert.equal(cad.parts.filter(p=>p.id.startsWith('panel')).length,6);
 assert.ok(a.valid);assert.ok(a.minHousingGap>=clearance-1e-7);assert.ok(a.shaftGap>=clearance);
 assert.equal(cad.parts.find(p=>p.id==='cartridge').quantity,2);
 for(const s of a.shafts){assert.ok(s.tip>s.cart+30);assert.ok(s.cart+42<0);}
 const dot=a.ports[0].axis.reduce((sum,n,i)=>sum+n*a.ports[1].axis[i],0);
 assert.equal(dot,kind==='internal'?-1:0);
 if(kind==='bevel'){assert.ok(Math.abs(a.coneAngles.reduce((s,n)=>s+n,0)-90)<1e-10);assert.deepEqual(a.shafts[0].origin,[0,0,-teeth]);}
 if(kind==='internal'){assert.equal(a.spacing,teeth-20);assert.equal(a.outputGain,-20/teeth);assert.ok(a.shafts[1].tip< -5-clearance);}
 if(kind==='worm'){assert.ok(Math.abs(a.spacing-(teeth/Math.sqrt(1-(2/24)**2)+12))<1e-10);assert.ok(a.shafts.every(s=>s.aux));}
}
const two=resolveSpatial({...defaultSpatial('worm'),starts:2});assert.equal(two.ratio,15);assert.equal(two.outputGain,2/30);
for(const patch of [{kind:'unknown'},{teeth:21},{starts:0},{clearance:0},{phase:Infinity}])assert.throws(()=>parseSpatial({...defaultSpatial('worm'),...patch}));
assert.throws(()=>parseProject(JSON.stringify({...initialProject(),spatial:defaultSpatial('worm'),motion:defaultMotion('belt')})));
for(const version of [1,2,3]){const legacy={...initialProject(),version};assert.equal(parseProject(JSON.stringify(legacy)).version,5);}
console.log('Spatial model passed: catalog, perpendicular/parallel axes, cone apex, worm spacing and starts, shaft endpoints, supports, parts, invalid input and migrations.');
