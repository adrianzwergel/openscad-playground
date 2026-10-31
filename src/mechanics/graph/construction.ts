import type {Mechanism,Check,ReservedSpace} from './contracts.ts';
import {separation,containment,regionHull} from './space.ts';
import {registry} from './registry.ts';
import {worldElement,context} from './model.ts';
import {axis,rotate,add,scale,norm,cross} from './frames.ts';
import type {Frame,V} from './frames.ts';
export type Box={id:string;owner:string;kind:'rotor'|'shaft'|'bearing'|'access'|'drive'|'coupling';center:V;axes:V[];half:V;radial?:boolean;exempt?:ReservedSpace['exempt']};
const dot=(a:V,b:V)=>a.reduce((s,n,i)=>s+n*b[i],0);
function box(id:string,owner:string,kind:Box['kind'],f:Frame,r:number,lo:number,hi:number):Box{return {id,owner,kind,center:add(f.position,scale(axis(f),(lo+hi)/2)),axes:[rotate(f.rotation,[1,0,0]),rotate(f.rotation,[0,1,0]),axis(f)],half:[r,r,(hi-lo)/2]};}
// A sphere enclosing a cylindrical rotor and a capsule enclosing a finite shaft
// can prove clearance where their oriented boxes overlap. Never use it for racks.
// With `enough`, the result is exact below that value and otherwise only proven >= enough.
export function clearance(a:Box,b:Box,enough=Infinity){let capsule=-Infinity;const rotor=a.kind==='rotor'?a:b,shaft=a.kind==='shaft'?a:b;if(rotor.radial&&shaft.kind==='shaft'&&shaft.radial!==false){
 const delta=add(rotor.center,scale(shaft.center,-1)),along=Math.max(-shaft.half[2],Math.min(shaft.half[2],dot(delta,shaft.axes[2])));const distance=norm(add(delta,scale(shaft.axes[2],-along)));capsule=distance-Math.hypot(rotor.half[0],rotor.half[2])-shaft.half[0];
 if(capsule>=enough)return capsule;}return Math.max(separation(a,b,enough),capsule);}
// Bearing seats and tool access depend on shaft lengths and bearings chosen after
// the gears. Their overlaps are reported as open, not as failures, so compact gear
// layouts stay admissible.
export const deferredSpace=(b:Box)=>b.kind==='bearing'||b.kind==='access';
export function separated(a:Box,b:Box,margin:number){return clearance(a,b,margin)>=margin-1e-7;}
export function constructionHulls(input:Mechanism,resize=true){const graph=structuredClone(input),boxes:Box[]=[],checks:Check[]=[],supports:{body:string;positions:number[];overhung:boolean}[]=[];
 for(const e of graph.elements){const h=registry.getFamily(e.family).envelope(e);const b=box(e.id,e.body,'rotor',worldElement(graph,e),h.radius,h.min,h.max);b.radial=!h.transverse;if(h.transverse){b.half[0]=h.transverse[0];b.half[1]=h.transverse[1];}boxes.push(b);}
 for(const group of new Set(graph.elements.map(e=>e.rotorGroup).filter(Boolean))){
  const es=graph.elements.filter(e=>e.rotorGroup===group).sort((a,b)=>a.pose.position[2]-b.pose.position[2]),first=es[0],last=es.at(-1)!,body=graph.bodies.find(b=>b.id===first.body)!;
  const lo=first.pose.position[2]+registry.getFamily(first.family).envelope(first).max,hi=last.pose.position[2]+registry.getFamily(last.family).envelope(last).min;
  if(hi>lo){const reserved=box('coupling-'+group,body.id,'coupling',body.frame,Math.max(8,...es.map(e=>(registry.getFamily(e.family).bore?.(e)??body.shaft!.diameter)/2+2)),lo,hi);reserved.exempt=es.map(e=>({kind:'rotor',id:e.id}));boxes.push(reserved);}
 }
 const localContacts=graph.relations.flatMap(rel=>registry.getRule(rel.rule).contactShafts?.(context(graph,rel))??[]).filter(c=>c.min!==undefined&&c.max!==undefined);
 const rearSupports=graph.relations.flatMap(rel=>registry.getRule(rel.rule).rearSupports?.(context(graph,rel))??[]);
 const shaftLimits=graph.relations.flatMap(rel=>registry.getRule(rel.rule).shaftLimits?.(context(graph,rel))??[]);
 const spans=graph.relations.flatMap(rel=>{try{return registry.getRule(rel.rule).bearingSpans?.(context(graph,rel))??[];}catch{return [];}});
 for(const b of graph.bodies){if(!b.shaft)continue;const es=graph.elements.filter(e=>e.body===b.id);if(!es.length)continue;const lo=Math.min(...spans.filter(s=>s.body===b.id).map(s=>s.min),...es.map(e=>e.pose.position[2]+registry.getFamily(e.family).envelope(e).min)),hi=Math.max(...spans.filter(s=>s.body===b.id).map(s=>s.max),...es.map(e=>e.pose.position[2]+registry.getFamily(e.family).envelope(e).max)),overhung=rearSupports.includes(b.id)||es.some(e=>registry.getFamily(e.family).support==='rear'),positions=overhung?[lo-26,lo-10]:[lo-10,hi+10];supports.push({body:b.id,positions,overhung});const limit=Math.min(Infinity,...shaftLimits.filter(x=>x.body===b.id).map(x=>x.max));if(hi>limit+1e-6)checks.push({id:b.id+'/shaft-limit',state:'fail',message:'Bauteil liegt jenseits des zulässigen Wellenendes an einer 90°-Paarung.'});if(resize){b.shaft.start=positions[0]-12;b.shaft.end=Math.min(limit,overhung?hi+3:positions[1]+12);}else if(b.shaft.end>limit+1e-6)checks.push({id:b.id+'/shaft-limit',state:'fail',message:'Welle ragt in das Achskreuz der 90°-Paarung.'});else if(b.shaft.start>positions[0]-2.5||b.shaft.end<positions[1]+2.5)checks.push({id:b.id+'/bearing-length',state:'fail',message:'Welle reicht nicht über beide reservierten Lagersitze.'});const contacts=localContacts.filter(c=>c.body===b.id),cuts=[...new Set([b.shaft.start,b.shaft.end,...contacts.flatMap(c=>[c.min!,c.max!]).filter(z=>z>b.shaft!.start&&z<b.shaft!.end)])].sort((a,b)=>a-b);
 for(let i=0;i<cuts.length-1;i++){const segment=box(contacts.length?b.id+'-segment-'+i:b.id,b.id,'shaft',b.frame,b.shaft.diameter/2,cuts[i],cuts[i+1]);segment.exempt=contacts.filter(c=>cuts[i]>=c.min!-1e-7&&cuts[i+1]<=c.max!+1e-7).map(c=>({kind:'rotor',id:c.element}));boxes.push(segment);}
for(const [i,z] of positions.entries())boxes.push(box(`${b.id}-bearing-${i}`,b.id,'bearing',b.frame,10,z-4,z+4));boxes.push(box(`${b.id}-access`,b.id,'access',b.frame,14,positions[0]-24,positions[0]-5));}
 for(const rel of graph.relations){const rule=registry.getRule(rel.rule);try{const c=context(graph,rel);rule.validate(c);for(const sweep of rule.sweeps?.(c)??[])for(const b of boxes.filter(b=>b.owner===sweep.body)){b.radial=false;b.center=add(b.center,scale(sweep.direction,(sweep.min+sweep.max)/2));b.half=b.half.map((h,i)=>h+Math.abs(dot(b.axes[i],sweep.direction))*(sweep.max-sweep.min)/2) as V;}for(const [i,v] of (rule.spaces?.(c)??[]).entries())boxes.push({id:rel.id+'-space-'+i,owner:rel.id,kind:'drive',center:v.frame.position,axes:[rotate(v.frame.rotation,[1,0,0]),rotate(v.frame.rotation,[0,1,0]),axis(v.frame)],half:v.half,exempt:v.exempt});}catch(e){checks.push({id:rel.id+'/space',state:'fail',message:String(e)});}}
 return {graph,boxes,checks,supports};
}
export function assessConstruction(input:Mechanism,margin=1,resize=true){
 if(!Number.isFinite(margin)||margin<0||margin>10)throw Error('Ungültiger Freiraum.');
 const {graph,boxes,checks,supports}=constructionHulls(input,resize);
 let open=0;for(const [a,b] of collisionPairs(graph,boxes))if(!separated(a,b,margin)){if(deferredSpace(a)||deferredSpace(b)){open++;continue;}checks.push({id:`space/${a.id}/${b.id}`,state:'fail',message:`Konservative Freiraumprüfung: ${a.id} / ${b.id} (${margin} mm). Genauere Geometrie könnte den Kandidaten noch freigeben.`});}
 if(graph.environment){const env=graph.environment;for(const b of boxes){
  if(env.bounds&&containment(b,regionHull(env.bounds),env.margin).some(n=>n>1e-7))checks.push({id:'bounds/'+b.id,state:'fail',message:`${b.id}: Hülle überschreitet den Bauraum oder dessen Randabstand (${env.margin} mm).`});
  for(const obstacle of env.obstacles)if(separation(b,regionHull(obstacle),env.margin)<env.margin-1e-7)checks.push({id:'obstacle/'+obstacle.id+'/'+b.id,state:'fail',message:`${b.id}: Sperrzone ${obstacle.id} verletzt (${env.margin} mm Abstand).`});
 }if(!checks.some(c=>c.id.startsWith('bounds/')||c.id.startsWith('obstacle/')))checks.push({id:'environment',state:'pass',message:'Alle Bauteil-, Bewegungs-, Verbindungs- und reservierten Lagerräume liegen im Bauraum und außerhalb der Sperrzonen.'});}
 if(!checks.length)checks.push({id:'reserved-spaces',state:'pass',message:open?'Nicht kämmende Rotoren und endliche Wellen geometrisch getrennt.':'Nicht kämmende Rotoren, endliche Wellen, Lager-/Deckelhüllen und axialer Werkzeugzugang geometrisch getrennt.'});
 if(open)checks.push({id:'bearings-open',state:'unknown',message:`${open} Überschneidung(en) reservierter Lager-/Werkzeugräume. Lagerung und Achslängen werden nach der Zahnradwahl festgelegt.`});
 checks.push({id:'assembly-scope',state:'unknown',message:'Reservierter Lager-/Werkzeugraum; vollständiger Einfädelpfad, Nabenbefestigung, Axiallager und Lastnachweis bleiben offen.'});return {graph,checks,supports,valid:checks.every(c=>c.state!=='fail'),boxes};
}
export function collisionPairs(graph:Mechanism,boxes:Box[]){
 const pairs:[Box,Box][]=[];
 const shaftContacts=graph.relations.flatMap(rel=>registry.getRule(rel.rule).contactShafts?.(context(graph,rel))??[]).filter(c=>c.min===undefined&&c.max===undefined);
 const contacts=new Set(graph.relations.map(r=>JSON.stringify([...r.elements].sort())));
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.exempt?.some(e=>e.id===b.id&&e.kind===b.kind)||b.exempt?.some(e=>e.id===a.id&&e.kind===a.kind))continue;if(shaftContacts.some(c=>(a.kind==='rotor'&&a.id===c.element&&b.kind==='shaft'&&b.owner===c.body)||(b.kind==='rotor'&&b.id===c.element&&a.kind==='shaft'&&a.owner===c.body)))continue;if(a.owner===b.owner&&(a.kind==='shaft'||b.kind==='shaft'))continue;if(a.kind==='rotor'&&b.kind==='rotor'&&contacts.has(JSON.stringify([a.id,b.id].sort())))continue;
 pairs.push([a,b]);}
 return pairs;
}
