import assert from 'node:assert/strict';
import {importStudio,serializeStudio,parseStudio,StudioHistory,adoptSolution} from '../src/mechanics/studio-model.ts';
import {spaceExample} from '../src/mechanics/graph/examples.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {initialProject,serializeProject} from '../src/mechanics/model.ts';
const doc={version:1,assemblies:[{id:'main',graph:spaceExample()}],routes:[{id:'r',assembly:'main',source:'input',target:'output',ratio:1}]},h=new StudioHistory();
const changed=structuredClone(doc);changed.routes[0].ratio=2;h.record(doc,changed);assert.deepEqual(h.undo(changed),parseStudio(doc));assert.deepEqual(h.redo(doc),parseStudio(changed));h.undo(changed);h.record(doc,{...changed,routes:[{...changed.routes[0],ratio:3}]});assert.equal(h.canRedo,false);
assert.deepEqual(importStudio(serializeStudio(doc)),parseStudio(doc));assert.ok(importStudio(serializeProject({...initialProject(),graph:spaceExample()})).assemblies[0].graph);
for(const mutate of [d=>d.routes[0].assembly='missing',d=>d.routes[0].ratio=-1,d=>d.assemblies.push(d.assemblies[0]),d=>d.assemblies[0].graph.output.target.position[0]=Infinity]){const bad=structuredClone(doc);mutate(bad);assert.throws(()=>parseStudio(bad));}
const abort=new AbortController();let solution;await robustRoute(spaceExample(),{target:1,tolerance:0,minStages:2,maxStages:2,budget:10000,beam:120},abort.signal,undefined,g=>{solution=g;abort.abort();});assert.ok(solution);const adopted=adoptSolution(doc,'r',solution);assert.equal(adopted.assemblies[0].adopted,true);assert.deepEqual(importStudio(serializeStudio(adopted)),adopted);h.record(doc,adopted);assert.deepEqual(h.undo(adopted),parseStudio(doc));assert.throws(()=>adoptSolution(changed,'r',solution));assert.throws(()=>adoptSolution(doc,'r',spaceExample()));
console.log('Studio model: history, redo branch, validation, legacy graph migration, adoption and roundtrip passed.');
