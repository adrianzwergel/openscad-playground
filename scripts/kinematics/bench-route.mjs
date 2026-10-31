// Benchmark corpus of bench-graph-search.mjs run through the route search and
// through the element-graph API. Since phase 6 both run on the kinematics core;
// the comparison with the old core is recorded in docs/KINEMATIK-KERN.md 13.1. Usage: node scripts/kinematics/bench-route.mjs [case...] [--old] [--new]
import {robustRoute} from '../../src/mechanics/graph/robust-search.ts';
import {demoMechanism,transformMechanism} from '../../src/mechanics/graph/model.ts';
import {identity,axisAngle} from '../../src/mechanics/graph/frames.ts';
import {fixture as mixedFixture} from '../mixed-space-fixture.mjs';
import {route} from '../../src/mechanics/kinematics/search/route.ts';

const world={position:[17,-23,9],rotation:axisAngle([1,2,3],37)};
function free(n){const g=demoMechanism();g.output.target={...identity(),position:n===3?[102.4264068712,102.4264068712,60]:[60,144.8528137424,90]};return transformMechanism(g,world);}
function detour(n){const g=demoMechanism();g.version=4;g.output.target={...identity(),position:[n===3?120:160,0,n*30]};g.environment={margin:1,bounds:{id:'space',frame:{...identity(),position:[90,0,45]},size:[320,300,250]},obstacles:[{id:'block',frame:{...identity(),position:[n===3?60:80,0,30]},size:[10,10,180]}]};return transformMechanism(g,{position:[21,-13,8],rotation:axisAngle([1,2,3],31)});}
function mixedCold(){const target=mixedFixture(4),g=demoMechanism();g.version=4;g.input.target=target.input.target;g.output.target=target.output.target;g.environment=target.environment;return {graph:g,rules:target.relations.map(r=>r.rule)};}
function legoAngled(across){const g=demoMechanism();g.output.target={position:[across,45,55],rotation:axisAngle([1,0,0],90)};return transformMechanism(g,world);}
export const cases={
 'free-3':()=>({graph:free(3),options:{target:8,minStages:3,maxStages:3,budget:100000}}),
 'free-4':()=>({graph:free(4),options:{target:16,minStages:4,maxStages:4,budget:100000}}),
 'detour-4':()=>({graph:detour(4),options:{target:16,minStages:4,maxStages:4,budget:40000,rules:['external-spur']}}),
 'mixed-cold-4':()=>{const {graph,rules}=mixedCold();return {graph,options:{target:120,minStages:4,maxStages:4,budget:40000,rules}};},
 'lego-angled-70':()=>({graph:legoAngled(70),options:{target:5,minStages:2,maxStages:3,budget:40000,rules:['lego-spur','lego-bevel-90']}}),
 'lego-angled-30':()=>({graph:legoAngled(30),options:{target:5,minStages:2,maxStages:3,budget:40000,rules:['lego-spur','lego-bevel-90']}}),
};
export const terminal=t=>({kind:'frame',local:t.local,target:t.target,constraint:t.constraint,...(t.tolerance?{tolerance:t.tolerance}:{})});
export const request=graph=>({input:terminal(graph.input),output:terminal(graph.output),...(graph.environment?{environment:structuredClone(graph.environment)}:{})});
export async function runOld(graph,options){const start=performance.now();let first;const r=await robustRoute(graph,{tolerance:0,beam:120,...options},undefined,undefined,()=>{first??=performance.now()-start;});return {firstMs:first===undefined?null:Math.round(first),totalMs:Math.round(performance.now()-start),solutions:r.solutions.length,status:r.status,rejections:r.rejections,visited:r.visited};}
export async function runNew(graph,options){const start=performance.now();let first;const r=await route(request(graph),{tolerance:0,yield:false,...options},undefined,undefined,()=>{first??=performance.now()-start;});return {firstMs:first===undefined?null:Math.round(first),totalMs:Math.round(performance.now()-start),solutions:r.solutions.length,status:r.status,rejections:r.rejections,visited:r.visited,result:r};}
if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/')}`){
 const args=process.argv.slice(2),which=args.includes('--old')?['old']:args.includes('--new')?['new']:['old','new'],names=args.filter(a=>!a.startsWith('--'));
 for(const name of names.length?names:Object.keys(cases)){const {graph,options}=cases[name]();
  for(const core of which){const r=core==='old'?await runOld(graph,options):await runNew(graph,options);const {result,...rest}=r;console.log(JSON.stringify({case:name,core,...rest}));}}
}
