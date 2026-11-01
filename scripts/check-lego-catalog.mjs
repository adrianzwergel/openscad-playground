import assert from 'node:assert/strict';
import fs from 'node:fs';
import {legoParts} from '../src/mechanics/graph/lego.ts';
import {defaultCatalog,parseCatalog,catalogAllows} from '../src/mechanics/graph/catalog.ts';
import {registry} from '../src/mechanics/graph/registry.ts';
import {identity} from '../src/mechanics/graph/frames.ts';
import {reflow} from '../src/mechanics/graph/refine.ts';
import {resolveMechanism,demoMechanism,mechanismCAD} from '../src/mechanics/graph/model.ts';
import {robustRoute} from '../src/mechanics/graph/robust-search.ts';
import {connectionVariants} from '../src/mechanics/graph/topology.ts';
import {assessConstruction} from '../src/mechanics/graph/construction.ts';
const catalog=defaultCatalog();assert.equal(legoParts.length,77);assert.equal(catalog.parts.filter(p=>p.family==='lego-technic').length,77);assert.equal(legoParts.filter(p=>p.search).length,15);
for(const part of legoParts){const bytes=fs.readFileSync('public/mechanics-assets/ldraw/meshes/'+part.id+'.stl');assert.equal(bytes.length,84+50*bytes.readUInt32LE(80));assert.ok(part.author&&part.license);}
const legacy={...catalog,parts:catalog.parts.filter(p=>p.family!=='lego-technic')};assert.equal(legacy.parts.length,31);assert.equal(parseCatalog(legacy).parts.length,108);
const stock=structuredClone(catalog);stock.whitelist=true;for(const p of stock.parts)if(['lego-3648b','lego-3649'].includes(p.id)||p.family==='spur'&&[20,40].includes(p.params.teeth)){p.listed=true;p.allowed=true;p.quantity=2;}
const a=legoParts.find(p=>p.id==='3648b'),b=legoParts.find(p=>p.id==='3649');
const pair={family:'lego-technic',params:{model:a.model}},other={family:'lego-technic',params:{model:b.model}};
const body=i=>({id:'b'+i,kind:'shaft',motion:'rotation',frame:identity(),shaft:{diameter:5,start:-40,end:100}}),terminal=i=>({body:'b'+i,local:identity(),target:identity(),constraint:'frame'});
let g={version:2,registryVersion:registry.version,bodies:[0,1,2].map(body),elements:[pair,other,{family:'spur',params:{teeth:20,module:2,width:10,bore:5.1}},{family:'spur',params:{teeth:40,module:2,width:10,bore:5.1}}].map((e,i)=>({...e,id:'e'+i,body:'b'+[0,1,1,2][i],binding:'fixed',phase:0,pose:{...identity(),position:[0,0,i===2?60:0]}})),relations:[{id:'r0',rule:'lego-spur',elements:['e0','e1'],params:{azimuth:0}},{id:'r1',rule:'external-spur',elements:['e2','e3'],params:{azimuth:0}}],input:terminal(0),output:terminal(2)};
g=reflow(g);g.output.target=structuredClone(g.bodies[2].frame);assert.ok(resolveMechanism(g).valid);assert.ok(assessConstruction(g).valid);assert.ok(resolveMechanism(g).checks.some(c=>c.id.endsWith('/machined-seat')));assert.equal(g.bodies[1].shaft.diameter,5);assert.match(mechanismCAD(g).source,/import\("\/lego\/3648b.stl"\)/);assert.ok(catalogAllows(g,stock));assert.ok(connectionVariants(g).every(x=>!x.elements.some(e=>e.family==='lego-technic'&&e.binding==='free')));
const repeated=structuredClone(g);repeated.elements[2].family='lego-technic';repeated.elements[2].params={...other.params};repeated.elements[3].family='lego-technic';repeated.elements[3].params={...pair.params};repeated.relations[1].rule='lego-spur';
const shared=connectionVariants(repeated).find(x=>x.elements.length===3);assert.ok(shared);assert.equal(shared.elements.find(e=>e.id==='e1').binding,'fixed');assert.equal(shared.bodies[1].motion,'rotation');const sharedFlow=reflow(shared);sharedFlow.output.target=structuredClone(sharedFlow.bodies[2].frame);assert.ok(resolveMechanism(sharedFlow).valid);
const loose=structuredClone(g);loose.elements[0].binding='free';assert.equal(resolveMechanism(loose).valid,false);
const source=demoMechanism();source.input.target=g.input.target;source.output.target=g.output.target;
const result=await robustRoute(source,{target:10/3,tolerance:0,minStages:2,maxStages:2,budget:100000,beam:120,rules:['lego-spur','external-spur'],catalog:stock});assert.ok(result.solutions.some(s=>new Set(s.relations.map(r=>r.rule)).size===2),'Cold mixed LEGO/custom search');
fs.writeFileSync(process.env.TEMP+'/lego-mixed-graph.json',JSON.stringify(result.solutions[0]));
console.log('77 sourced models; legacy catalog migration; 5 mm machined cross seats; fixed binding; cold mixed search with shared drive shaft:',result.solutions.length,'solutions');
