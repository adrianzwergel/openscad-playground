import assert from 'node:assert/strict';
import {rotors} from '../src/mechanics/inspection.ts';
import {defaultMixed,parseMixed} from '../src/mechanics/mixed-model.ts';
import {resolveMixed,searchMixed,mixedCAD} from '../src/mechanics/mixed.ts';
import {initialProject,parseProject,serializeProject} from '../src/mechanics/model.ts';
import {beltCenter} from '../src/mechanics/motion.ts';
const candidates=[];for(const kind of ['spur','belt'])for(const wheel of [30,40])for(const starts of [1,2])for(const za of kind==='spur'?[20,30,40,50]:[16,20,30,40,60])for(const zb of kind==='spur'?[20,30,40,50]:[16,20,30,40,60])for(const belt of kind==='spur'?[0]:[200,280,300,400,500,600,610,752,800])candidates.push({kind,wheel,starts,za,zb,belt});
for(const kind of ['spur','belt']){const m=defaultMixed();m.allow=kind;if(kind==='belt')m.output[0]=beltCenter(300,20/Math.PI,40/Math.PI);const r=searchMixed(m,candidates);assert.ok(r.total>0);for(const a of r.solutions){assert.deepEqual(a.ports[0].position,m.input);assert.deepEqual(a.ports[1].position,m.output);assert.ok(a.columnHeight>=12);assert.ok(Math.abs(a.distance-(kind==='spur'?a.c.za+a.c.zb:a.b.c))<1e-5);assert.equal(a.ratio,a.c.wheel/a.c.starts*a.c.zb/a.c.za);const cad=mixedCAD(m,a.c);assert.ok(cad.parts.length>15);assert.deepEqual(cad.parts,mixedCAD(m,a.c,true).parts);}
 const a=r.solutions[0],p={...initialProject(),mixed:{...m,selected:a.c}};assert.deepEqual(parseProject(serializeProject(p)),p);assert.equal(rotors(p,360).length,4);assert.ok(Math.abs(rotors(p,360)[3].angle-rotors(p,0)[3].angle-360*(kind==='spur'?-1:1)/a.ratio)<1e-8);
 assert.equal(searchMixed({...m,output:[m.output[0],m.output[1],0]},candidates).total,0);assert.equal(searchMixed({...m,output:[999,999,120]},candidates).total,0);
 const moved={...m,input:m.input.map(n=>n+30),output:m.output.map(n=>n+30)};assert.equal(searchMixed(moved,candidates).total,r.total);
}
assert.ok(searchMixed(defaultMixed(),candidates).solutions.some(a=>a.c.kind==='belt'));
assert.throws(()=>parseMixed({...defaultMixed(),selected:null}));
assert.throws(()=>parseMixed({...defaultMixed(),input:[Infinity,0,0]}));assert.throws(()=>parseMixed({...defaultMixed(),selected:{kind:'spur',wheel:99}}));for(const version of [1,2,3,4])assert.equal(parseProject(JSON.stringify({...initialProject(),version})).version,5);
console.log('Mixed model passed: enumeration, fixed axes, ratios, both families, mounting constraints, impossible cases, translation, roundtrip and migrations.');
