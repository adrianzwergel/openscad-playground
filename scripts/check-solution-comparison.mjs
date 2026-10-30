import assert from 'node:assert/strict';
import {solutionMetrics} from '../src/mechanics/graph/comparison.ts';
import {compoundExample,freeRotorExample,linearExample} from '../src/mechanics/graph/examples.ts';
import {transformMechanism} from '../src/mechanics/graph/model.ts';
import {axisAngle,identity} from '../src/mechanics/graph/frames.ts';
for(const g of [compoundExample(),freeRotorExample(),linearExample('belt-screw')]){
 const before=structuredClone(g),m=solutionMetrics(g),turned=solutionMetrics(transformMechanism(g,{position:[23,-11,8],rotation:axisAngle([1,2,3],37)}));
 assert.deepEqual(g,before);assert.equal(m.stages,g.relations.length);assert.equal(m.parts,g.elements.length+g.bodies.filter(b=>b.kind==='shaft').length);assert.ok(m.volume>0);m.size.forEach((v,i)=>assert.ok(Math.abs(v-turned.size[i])<1e-7));assert.ok(Math.abs(m.volume-turned.volume)<1e-6);
 const withRoom=structuredClone(g);withRoom.version=4;withRoom.environment={margin:1,obstacles:[],bounds:{id:'room',frame:identity(),size:[9999,9999,9999]}};assert.deepEqual(solutionMetrics(withRoom),m,'Compare occupied envelope, not prescribed workspace size');
}
const g=linearExample('spur-rack'),short=solutionMetrics(g);g.relations.find(r=>r.rule==='rack-drive').params.stroke+=50;assert.ok(solutionMetrics(g).volume>short.volume,'Full travel participates in the measured envelope');
console.log('Comparison metrics: occupied envelope, frame invariance, stages, elements/shafts and motion sweep passed.');

