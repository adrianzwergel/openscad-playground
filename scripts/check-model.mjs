import assert from 'node:assert/strict';
import {initialProject,resolveProject,generateScad,alignPair,parseProject,serializeProject,applySolution,CATALOG} from '../src/mechanics/model.ts';
const p=initialProject();
assert.deepEqual(parseProject(serializeProject(p)),p);
assert.equal(resolveProject(p).ratio,2);
assert.equal(resolveProject(p).requiredDistance,60);
assert.equal(resolveProject(p).ports[0].diameter,5.1);
const shifted=structuredClone(p);shifted.components[0].position=[10,20,5];shifted.components[1].position=[10,80,5];
const resolved=resolveProject(shifted);assert.ok(resolved.valid);assert.equal(resolved.components[0].spin,0);
assert.match(generateScad(shifted),/translate\(\[10,80,5\]\)/);
assert.deepEqual(resolved.ports[2].position,[10,80,5]);
const bad=structuredClone(p);bad.components[1].position[0]=61;
assert.equal(resolveProject(bad).valid,false);assert.throws(()=>generateScad(bad));
assert.equal(resolveProject(alignPair(bad)).valid,true);assert.equal(bad.components[1].position[0],61);
const wrongModule=structuredClone(p);wrongModule.components[1].catalogId='spur-m3-z40';
assert.equal(resolveProject(alignPair(wrongModule)).checks.find(c=>c.id==='module').state,'fail');
const axial=structuredClone(p);axial.components[1].position[2]=10;assert.equal(resolveProject(axial).valid,false);
for(const mutate of [p=>p.version=2,p=>p.catalogVersion='future',p=>p.components[0].catalogId='missing',p=>p.components[1].id=p.components[0].id,p=>p.connections[0].a.port='shaft',p=>p.output.component='missing',p=>p.targetRatio=0,p=>p.components[0].position[0]=null]){
 const corrupt=structuredClone(p);mutate(corrupt);assert.throws(()=>parseProject(JSON.stringify(corrupt)));
}
assert.throws(()=>parseProject('['));assert.throws(()=>parseProject(' '.repeat(100001)));
const suggested=applySolution(shifted,0,2);assert.deepEqual(suggested.components[0].position,[10,20,5]);assert.equal(resolveProject(suggested).ratio,2);
for(let a=0;a<CATALOG.length;a++)for(let b=0;b<CATALOG.length;b++){
 const candidate=applySolution(p,a,b);const r=resolveProject(candidate);
 assert.equal(r.valid,CATALOG[a].module===CATALOG[b].module);
}
console.log('Model checks passed: roundtrip, ports, placement/phase, compatibility, invalid imports, all catalog pairs.');
