// The drive search uses what the Studio's catalog leaves to it: switched-off kinds are not used, locked parts never
// enter a pair, LEGO parts (locked until released) do not appear, and a released LEGO kind brings its rules in.
import assert from 'node:assert/strict';
import {demos} from '../../src/mechanics/demos.ts';
import {driveTask,placeMotor,heldTrains,modelAxes} from '../../src/mechanics/kinematics/drive.ts';
import {route} from '../../src/mechanics/kinematics/search/route.ts';
import {solve} from '../../src/mechanics/kinematics/solver.ts';
import {defaultCatalog,partAllowed,partKey} from '../../src/mechanics/graph/catalog.ts';
const demo=demos.robot(),m=structuredClone(demo.mechanism),drives=structuredClone(demo.drives);for(const d of drives)placeMotor(m,d);
const axes=modelAxes(m,drives),values=Object.fromEntries(axes.map(j=>[j.id,m.input.kind==='coordinate'&&m.input.joint===j.id?m.range.from:0]));
const ref=await solve({...structuredClone(m),input:{kind:'none'},output:{kind:'none'},range:{from:0,to:0,samples:1}},{yield:false,fixed:Object.fromEntries(axes.map(j=>[j.id,[values[j.id]]]))});
const d=drives.find(x=>x.id==='M3'),assets=id=>id===demo.asset.id?demo.asset:undefined;
const search=async catalog=>{const base=defaultCatalog(),stock=new Map(base.parts.map(p=>[p.id,partKey(p.family,p.params)]));
 const task=driveTask(m,drives,d,assets,ref.poses[0].bodies,values,{budget:6000,catalog:{excludedRules:catalog.excludedRules,lockedParts:catalog.parts.filter(p=>!partAllowed(catalog,p)).map(p=>stock.get(p.id))}});
 const locked=new Set(task.options.lockedParts??[]),filter=c=>![c.a,c.b].some(e=>e.legacy&&locked.has(partKey(e.legacy.family,e.legacy.params)));
 const r=await route(task.request,{...task.options,filter});return {rules:task.options.rules,parts:r.solutions.flatMap(s=>s.chain.stages.flatMap(st=>[st.choice.a,st.choice.b])).map(e=>e.legacy?partKey(e.legacy.family,e.legacy.params):e.key),count:r.solutions.length};};
// Default catalog: every kind, LEGO locked.
{const c=defaultCatalog(),r=await search(c);assert.ok(r.count>0,'Getriebe gefunden');assert.ok(r.parts.every(k=>!k.includes('lego-technic')),'kein LEGO ohne Freigabe');}
// A locked part: the z30 spur gear never appears.
{const c=defaultCatalog(),z30=c.parts.find(p=>p.family==='spur'&&p.params.teeth===30);z30.allowed=false;const r=await search(c),key=partKey(z30.family,z30.params);
 assert.ok(r.count>0,'auch ohne z30 gefunden');assert.ok(!r.parts.includes(key),'gesperrtes Teil nicht verwendet');}
// Spur gears and belts switched off: neither rule is searched.
{const c=defaultCatalog();c.excludedRules=['external-spur','lego-spur','gt2-belt'];const r=await search(c);assert.ok(!r.rules.includes('external-spur')&&!r.rules.includes('gt2-belt'),'abgewählte Gruppen nicht in der Suche');
 assert.ok(r.parts.every(k=>!k.startsWith('["spur"')&&!k.startsWith('["gt2-pulley"')),'keine Stirnräder und Riemen');}
console.log('Antriebssuche folgt dem Katalog: abgewählte Gruppen und gesperrte Teile bleiben draußen, LEGO nur nach Freigabe.');
