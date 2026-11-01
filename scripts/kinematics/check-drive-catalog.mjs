// The drive search uses what the Studio's catalog leaves to it: switched-off kinds are not used, locked parts never
// enter a pair; LEGO parts are released like all others by default and stay out when locked; a sled train whose rail
// would lie behind the track is recognised (the Studio's search drops it).
import assert from 'node:assert/strict';
import {demos} from '../../src/mechanics/demos.ts';
import {driveTask,placeMotor,heldTrains,modelAxes,pinionEnd} from '../../src/mechanics/kinematics/drive.ts';
import {route} from '../../src/mechanics/kinematics/search/route.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {defaultCatalog,partAllowed,partKey} from '../../src/mechanics/graph/catalog.ts';
const demo=demos.robot(),m=structuredClone(demo.mechanism),drives=structuredClone(demo.drives);for(const d of drives)placeMotor(m,d);
const axes=modelAxes(m,drives),values=Object.fromEntries(axes.map(j=>[j.id,m.input.kind==='coordinate'&&m.input.joint===j.id?m.range.from:0]));
const ref=await solve({...structuredClone(m),input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}},{yield:false,fixed:Object.fromEntries(axes.map(j=>[j.id,[values[j.id]]]))});
const d=drives.find(x=>x.id==='M3'),assets=id=>id===demo.asset.id?demo.asset:undefined;
const search=async catalog=>{const base=defaultCatalog(),stock=new Map(base.parts.map(p=>[p.id,partKey(p.family,p.params)]));
 const task=driveTask(m,drives,d,assets,ref.poses[0].bodies,values,{budget:20000,catalog:{excludedRules:catalog.excludedRules,lockedParts:catalog.parts.filter(p=>!partAllowed(catalog,p)).map(p=>stock.get(p.id))}});
 const locked=new Set(task.options.lockedParts??[]),filter=c=>![c.a,c.b].some(e=>e.legacy&&locked.has(partKey(e.legacy.family,e.legacy.params)));
 const r=await route(task.request,{...task.options,filter});return {rules:task.options.rules,parts:r.solutions.flatMap(s=>s.chain.stages.flatMap(st=>[st.choice.a,st.choice.b])).map(e=>e.legacy?partKey(e.legacy.family,e.legacy.params):e.key),count:r.solutions.length};};
// LEGO parts locked one by one: none of them appears.
{const c=defaultCatalog();for(const p of c.parts)if(p.family==='lego-technic')p.allowed=false;const r=await search(c);assert.ok(r.count>0,'Getriebe gefunden');assert.ok(r.parts.every(k=>!k.includes('lego-technic')),'gesperrte LEGO-Teile nicht verwendet');}
// Default catalog: LEGO is a part like any other .
{const c=defaultCatalog();assert.ok(c.parts.filter(p=>p.family==='lego-technic').every(p=>p.allowed!==false),'LEGO freigegeben wie alle Teile');}
// A locked part: the z30 spur gear never appears.
{const c=defaultCatalog(),z30=c.parts.find(p=>p.family==='spur'&&p.params.teeth===30);z30.allowed=false;const r=await search(c),key=partKey(z30.family,z30.params);
 assert.ok(r.count>0,'auch ohne z30 gefunden');assert.ok(!r.parts.includes(key),'gesperrtes Teil nicht verwendet');}
// Spur gears and belts switched off: neither rule is searched.
{const c=defaultCatalog();c.excludedRules=['external-spur','lego-spur','gt2-belt'];const r=await search(c);assert.ok(!r.rules.includes('external-spur')&&!r.rules.includes('gt2-belt'),'abgewählte Gruppen nicht in der Suche');
 assert.ok(r.parts.every(k=>!k.startsWith('["spur"')&&!k.startsWith('["gt2-pulley"')),'keine Stirnräder und Riemen');}
// Sled: a path drive's rail must lie on the wagon's side of the track; trains that put it behind the track are told.
{const sd=demos.sled(),sm=structuredClone(sd.mechanism),sdr=structuredClone(sd.drives);for(const x of sdr)placeMotor(sm,x);
 const sax=modelAxes(sm,sdr),sv=Object.fromEntries(sax.map(j=>[j.id,sm.input.kind==='coordinate'&&sm.input.joint===j.id?sm.range.from:0]));
 const sref=await solve({...structuredClone(sm),input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}},{yield:false,fixed:Object.fromEntries(sax.map(j=>[j.id,[sv[j.id]]]))});
 const task=driveTask(sm,sdr,sdr[0],id=>id===sd.asset.id?sd.asset:undefined,sref.poses[0].bodies,sv,{catalog:{excludedRules:[],lockedParts:[]}}),r=await route(task.request,task.options);
 const sides=r.solutions.map(x=>({side:pinionEnd(x.mechanism,task.info.rail).wagonSide,stages:x.chain.stages.length}));
 assert.ok(sides.some(x=>x.side)&&sides.some(x=>!x.side),'Schlitten: Schiene teils auf der Wagenseite, teils dahinter');assert.ok(sides.filter(x=>x.stages===3).every(x=>x.side),'die dreistufigen Getriebe liegen auf der Wagenseite');}
console.log('Antriebssuche folgt dem Katalog: abgewählte Gruppen und gesperrte Teile bleiben draußen, LEGO wie alle anderen Teile.');
