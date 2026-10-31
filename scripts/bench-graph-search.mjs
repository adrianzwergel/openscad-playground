// Fixed benchmark corpus for the automatic route search. Not a regression test:
// it reports time to first solution, solutions, attempts and rejection reasons
// so search changes can be compared. Usage: node scripts/bench-graph-search.mjs [case...]
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {demoMechanism,transformMechanism} from '../src/mechanics/graph/model.ts';
import {identity,axisAngle} from '../src/mechanics/graph/frames.ts';
import {fixture as mixedFixture} from './mixed-space-fixture.mjs';
import {createHash} from 'node:crypto';

const world={position:[17,-23,9],rotation:axisAngle([1,2,3],37)};
function free(n){
 const g=demoMechanism();
 g.output.target={...identity(),position:n===3?[102.4264068712,102.4264068712,60]:[60,144.8528137424,90]};
 return transformMechanism(g,world);
}
// Same obstacle layout as check-graph-detours.mjs (that file runs its tests on import).
function detour(n){
 const g=demoMechanism();g.version=4;g.output.target={...identity(),position:[n===3?120:160,0,n*30]};
 g.environment={margin:1,bounds:{id:'space',frame:{...identity(),position:[90,0,45]},size:[320,300,250]},obstacles:[{id:'block',frame:{...identity(),position:[n===3?60:80,0,30]},size:[10,10,180]}]};
 return transformMechanism(g,{position:[21,-13,8],rotation:axisAngle([1,2,3],31)});
}
function mixedCold(){
 const target=mixedFixture(4),g=demoMechanism();g.version=4;
 g.input.target=target.input.target;g.output.target=target.output.target;g.environment=target.environment;
 return {graph:g,rules:target.relations.map(r=>r.rule)};
}
// Output axis perpendicular to the input. Only spur center distances reach
// across both axes; 70 mm needs the large 40-tooth gears.
function legoAngled(across){
 const g=demoMechanism();
 g.output.target={position:[across,45,55],rotation:axisAngle([1,0,0],90)};
 return transformMechanism(g,world);
}
const cases={
 'free-3':()=>({graph:free(3),options:{target:8,minStages:3,maxStages:3,budget:100000}}),
 'free-4':()=>({graph:free(4),options:{target:16,minStages:4,maxStages:4,budget:100000}}),
 'detour-4':()=>({graph:detour(4),options:{target:16,minStages:4,maxStages:4,budget:40000,rules:['external-spur']}}),
 'mixed-cold-4':()=>{const {graph,rules}=mixedCold();return {graph,options:{target:120,minStages:4,maxStages:4,budget:40000,rules}};},
 'lego-angled-70':()=>({graph:legoAngled(70),options:{target:5,minStages:2,maxStages:3,budget:40000,rules:['lego-spur','lego-bevel-90']}}),
 'lego-angled-30':()=>({graph:legoAngled(30),options:{target:5,minStages:2,maxStages:3,budget:40000,rules:['lego-spur','lego-bevel-90']}}),
};
const selected=process.argv.slice(2).length?process.argv.slice(2):Object.keys(cases);
for(const name of selected){
 const {graph,options}=cases[name]();
 const start=performance.now();let first;
 const r=await robustRoute(graph,{tolerance:0,beam:120,...options},undefined,undefined,()=>{first??=performance.now()-start;});
 console.log(JSON.stringify({case:name,firstMs:first===undefined?null:Math.round(first),totalMs:Math.round(performance.now()-start),solutions:r.solutions.length,hash:createHash('sha1').update(JSON.stringify(r.solutions)).digest('hex').slice(0,10),attempts:r.attempts,visited:r.visited,status:r.status,rejections:r.rejections}));
}
