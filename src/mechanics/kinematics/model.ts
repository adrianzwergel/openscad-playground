// The kinematics document: bodies, elements with surfaces, joints, contacts,
// patterns, parameters and terminals (KINEMATIK-KERN.md 4). Parsing resolves
// parameter expressions and validates references; expansion materialises
// patterns into derived bodies, elements, joints and contacts.
import type {V,Frame,Q} from './math.ts';
import {identity,compose,inverse,rotate,add,scale,norm,dot,quaternionFromBasis,unit,cross} from './math.ts';
import type {Curve3} from './curves.ts';
import {curve} from './curves.ts';
import type {Surface} from './surfaces.ts';
import {validateSurface} from './surfaces.ts';
import {jointFrame,projectCoordinates} from './joints.ts';

export type Interface=
 |{id:string;kind:'bore';diameter:number;z:[number,number]}
 |{id:string;kind:'technic-cross';z:[number,number]}
 |{id:string;kind:'outer-ring';diameter:number;z:[number,number]}
 |{id:string;kind:'flange';frame:Frame};
export type Envelope={radius:number;min:number;max:number;transverse?:[number,number]};
export type Mount={interface:string;body:string;pose:Frame};
export type Element={id:string;source:{kind:'printed'}|{kind:'library';library:string;part:string};surfaces:Surface[];interfaces:Interface[];envelope:Envelope;mounts:Mount[];phase:number;derived?:string};
export type Body={id:string;frame:Frame;ground?:boolean;shaft?:{diameter:number;start:number;end:number};derived?:string;mirror?:{source:string;plane:Frame}};
export type Joint=
 |{kind:'fixed'}
 |{kind:'revolute'}
 |{kind:'prismatic'}
 |{kind:'cylindrical'}
 |{kind:'screw';lead:number}
 |{kind:'path';curve:Curve3;roll:'free'|'locked'}
 |{kind:'spherical'};
export type JointRelation={id:string;joint:Joint;a:{body:string;local:Frame};b:{body:string;local:Frame};derived?:string;redundant?:boolean;shift?:number};
export type SurfaceRef={element:string;surface:string};
/** `side`: follower contacts put the pinion on the +normal (1) or −normal (−1) side of the rail curve. */
export type ContactParams={offsetA:number;offsetB:number;azimuth?:number;angle?:number;length?:number;hand?:1|-1;distance?:number;side?:1|-1};
export type Contact={id:string;kind:'roll'|'belt'|'helical';a:SurfaceRef;b:SurfaceRef;mode:'fixed-axes'|'follower';params:ContactParams;derived?:string;redundant?:boolean};
export type Pattern=
 |{kind:'mirror';plane:Frame;source:string[]}
 |{kind:'array';count:number;step:Frame|{alongJoint:string;offset:number};source:string[];chain?:JointRelation[]};  // chain: joints from copy k (side a) to copy k+1 (side b)
export type Parameter={id:string;value:number;unit?:'mm'|'deg'|'1'};
export type Terminal=
 |{kind:'frame';body:string;local:Frame;target:Frame;constraint:'frame'|'axis';tolerance?:{position:number;angle:number}}
 |{kind:'coordinate';joint:string;coordinate:0|1|2};
export type Range={from:number;to:number;samples:number};
/** `ratio` is the reduction ratio ω_in/ω_out (2 = output turns half as fast), as in the element graph. */
export type Target=
 |{kind:'ratio';value:number;tolerance:number}
 |{kind:'stroke-per-turn';value:number;tolerance:number}
 |{kind:'profile';samples:{input:number;output:number}[];tolerance:number};
export type Region={id:string;frame:Frame;size:V};
export type Environment={bounds?:Region;obstacles:Region[];margin:number};
export type Mechanism={format:'kinematics-1';parameters:Parameter[];bodies:Body[];elements:Element[];joints:JointRelation[];contacts:Contact[];patterns:Pattern[];input:Terminal;output:Terminal;range:Range;target?:Target;environment?:Environment};

export const jointDofs=(j:Joint)=>j.kind==='fixed'?0:j.kind==='revolute'||j.kind==='prismatic'||j.kind==='screw'?1:j.kind==='cylindrical'?2:j.kind==='path'?(j.roll==='free'?2:1):3;

// ---------- parameter expressions ----------
/** Arithmetic over parameter names: + - * / ^, parentheses, unary minus and a few functions. */
export function evaluate(expr:string,scope:Record<string,number>):number{
 const tokens=expr.match(/\s*([0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/^(),])/g)?.map(t=>t.trim())??[];
 if(tokens.join('').replace(/\s/g,'')!==expr.replace(/\s/g,''))throw Error(`Ungültiger Ausdruck: ${expr}`);
 let i=0;const peek=()=>tokens[i],next=()=>tokens[i++];
 const fns:Record<string,(...a:number[])=>number>={sin:x=>Math.sin(x*Math.PI/180),cos:x=>Math.cos(x*Math.PI/180),tan:x=>Math.tan(x*Math.PI/180),sqrt:Math.sqrt,abs:Math.abs,min:Math.min,max:Math.max,floor:Math.floor,ceil:Math.ceil,round:Math.round};
 const primary=():number=>{const t=next();if(t===undefined)throw Error(`Ausdruck unvollständig: ${expr}`);
  if(t==='('){const v=sum();if(next()!==')')throw Error(`Klammer fehlt: ${expr}`);return v;}
  if(t==='-')return -unary();if(t==='+')return unary();
  if(/^[0-9.]/.test(t))return Number(t);
  if(peek()==='('){next();const args:number[]=[];if(peek()!==')'){args.push(sum());while(peek()===','){next();args.push(sum());}}if(next()!==')')throw Error(`Klammer fehlt: ${expr}`);const f=fns[t];if(!f)throw Error(`Unbekannte Funktion ${t}`);return f(...args);}
  if(t==='pi')return Math.PI;if(!(t in scope))throw Error(`Unbekannter Parameter ${t}`);return scope[t];};
 const unary=():number=>primary();
 const power=():number=>{let v=unary();while(peek()==='^'){next();v=Math.pow(v,unary());}return v;};
 const product=():number=>{let v=power();while(peek()==='*'||peek()==='/'){const op=next();const r=power();v=op==='*'?v*r:v/r;}return v;};
 const sum=():number=>{let v=product();while(peek()==='+'||peek()==='-'){const op=next();const r=product();v=op==='+'?v+r:v-r;}return v;};
 const v=sum();if(i!==tokens.length)throw Error(`Ausdruck nicht verstanden: ${expr}`);if(!Number.isFinite(v))throw Error(`Ausdruck ergibt keine Zahl: ${expr}`);return v;
}
/** Resolves `{expr}` objects anywhere in a JSON tree; parameters may reference earlier ones. */
export function resolveParameters(input:unknown):unknown{
 const doc=structuredClone(input) as Record<string,unknown>;const scope:Record<string,number>={};
 const raw=Array.isArray(doc.parameters)?doc.parameters as {id:string;value:unknown}[]:[];
 for(const p of raw){const v=p.value;if(typeof v==='number')scope[p.id]=v;else if(v&&typeof v==='object'&&typeof (v as {expr?:unknown}).expr==='string')scope[p.id]=evaluate((v as {expr:string}).expr,scope);else throw Error(`Parameter ${p.id}: Zahl oder Ausdruck erwartet.`);p.value=scope[p.id];}
 const walk=(v:unknown):unknown=>{if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if(typeof o.expr==='string'&&Object.keys(o).length===1)return evaluate(o.expr,scope);const out:Record<string,unknown>={};for(const [k,x] of Object.entries(o))out[k]=walk(x);return out;}return v;};
 for(const key of Object.keys(doc))if(key!=='parameters')doc[key]=walk(doc[key]);
 return doc;
}

// ---------- validation ----------
const num=(v:unknown,what:string)=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error(`${what}: Zahl erwartet.`);return v;};
const id=(v:unknown,what:string)=>{if(typeof v!=='string'||!/^[A-Za-z0-9_#./-]{1,80}$/.test(v))throw Error(`${what}: ungültige ID.`);return v;};
function frame(v:unknown,what:string):Frame{const f=v as Frame;if(!f||!Array.isArray(f.position)||f.position.length!==3||!Array.isArray(f.rotation)||f.rotation.length!==4)throw Error(`${what}: Rahmen erwartet.`);f.position.forEach(n=>num(n,what));f.rotation.forEach(n=>num(n,what));const l=Math.hypot(...f.rotation);if(Math.abs(l-1)>1e-6)throw Error(`${what}: Quaternion nicht normiert.`);return {position:[...f.position] as V,rotation:f.rotation.map(n=>n/l) as Q};}

export function parseMechanism(input:unknown):Mechanism{
 const m=resolveParameters(input) as Mechanism;
 if(!m||m.format!=='kinematics-1')throw Error('Dokumentformat kinematics-1 erwartet.');
 for(const key of ['bodies','elements','joints','contacts','patterns','parameters'] as const)if(!Array.isArray(m[key]))throw Error(`${key}: Liste erwartet.`);
 const unique=(xs:{id:string}[],what:string)=>{const seen=new Set<string>();for(const x of xs){id(x.id,what);if(seen.has(x.id))throw Error(`${what}: doppelte ID ${x.id}`);seen.add(x.id);}};
 unique(m.bodies,'Körper');unique(m.elements,'Element');unique(m.joints,'Gelenk');unique(m.contacts,'Kontakt');unique(m.parameters,'Parameter');
 const bodies=new Map(m.bodies.map(b=>[b.id,b]));
 if(m.bodies.filter(b=>b.ground).length!==1)throw Error('Genau ein Körper ist das Gestell (ground).');
 for(const b of m.bodies){b.frame=frame(b.frame,`Körper ${b.id}`);if(b.shaft){num(b.shaft.diameter,'Welle');num(b.shaft.start,'Welle');num(b.shaft.end,'Welle');if(!(b.shaft.diameter>0&&b.shaft.start<b.shaft.end))throw Error(`Körper ${b.id}: ungültige Welle.`);}}
 for(const e of m.elements){
  if(!e.source||(e.source.kind!=='printed'&&e.source.kind!=='library'))throw Error(`Element ${e.id}: Herkunft fehlt.`);
  if(!Array.isArray(e.surfaces)||!Array.isArray(e.interfaces)||!Array.isArray(e.mounts))throw Error(`Element ${e.id}: Listen fehlen.`);
  unique(e.surfaces,`Element ${e.id} Wirkfläche`);unique(e.interfaces,`Element ${e.id} Montagefläche`);
  for(const s of e.surfaces)validateSurface(s);
  if(!e.envelope||!(num(e.envelope.radius,'Hülle')>=0)||!(num(e.envelope.min,'Hülle')<=num(e.envelope.max,'Hülle')))throw Error(`Element ${e.id}: Hülle ungültig.`);
  if(!e.mounts.length||e.mounts.length>2)throw Error(`Element ${e.id}: ein oder zwei Montagen.`);
  for(const mt of e.mounts){if(!bodies.has(mt.body))throw Error(`Element ${e.id}: Körper ${mt.body} fehlt.`);if(!e.interfaces.some(i=>i.id===mt.interface))throw Error(`Element ${e.id}: Montagefläche ${mt.interface} fehlt.`);mt.pose=frame(mt.pose,`Element ${e.id} Montage`);}
  if(e.mounts.length===2&&e.mounts[0].body===e.mounts[1].body)throw Error(`Element ${e.id}: zwei Montagen auf demselben Körper.`);
  e.phase=num(e.phase??0,`Element ${e.id} Phase`);
 }
 for(const j of m.joints){
  if(!j.joint||!['fixed','revolute','prismatic','cylindrical','screw','path','spherical'].includes(j.joint.kind))throw Error(`Gelenk ${j.id}: Art fehlt.`);
  if(j.joint.kind==='screw'&&!(num(j.joint.lead,`Gelenk ${j.id}`)!==0))throw Error(`Gelenk ${j.id}: Steigung fehlt.`);
  if(j.joint.kind==='path'){if(!j.joint.curve||j.joint.curve.kind!=='path')throw Error(`Gelenk ${j.id}: Pfadkurve fehlt.`);if(j.joint.roll!=='free'&&j.joint.roll!=='locked')throw Error(`Gelenk ${j.id}: roll free|locked.`);curve(j.joint.curve);}
  for(const side of ['a','b'] as const){const s=j[side];if(!s||!bodies.has(s.body))throw Error(`Gelenk ${j.id}: Körper fehlt.`);s.local=frame(s.local,`Gelenk ${j.id}`);}
  if(j.a.body===j.b.body)throw Error(`Gelenk ${j.id}: verbindet einen Körper mit sich selbst.`);
  if(j.shift!==undefined)num(j.shift,`Gelenk ${j.id} Versatz`);
 }
 const elements=new Map(m.elements.map(e=>[e.id,e]));
 for(const c of m.contacts){
  if(!['roll','belt','helical'].includes(c.kind)||!['fixed-axes','follower'].includes(c.mode))throw Error(`Kontakt ${c.id}: Art oder Modus fehlt.`);
  for(const side of ['a','b'] as const){const r=c[side],e=elements.get(r?.element);if(!e||!e.surfaces.some(s=>s.id===r.surface))throw Error(`Kontakt ${c.id}: Wirkfläche ${r?.element}/${r?.surface} fehlt.`);}
  if(!c.params)c.params={offsetA:0,offsetB:0};c.params.offsetA=num(c.params.offsetA??0,`Kontakt ${c.id}`);c.params.offsetB=num(c.params.offsetB??0,`Kontakt ${c.id}`);
  for(const k of ['azimuth','angle','length','distance'] as const)if(c.params[k]!==undefined)num(c.params[k],`Kontakt ${c.id} ${k}`);
  if(c.params.hand!==undefined&&c.params.hand!==1&&c.params.hand!==-1)throw Error(`Kontakt ${c.id}: hand ±1.`);
  if(c.params.side!==undefined&&c.params.side!==1&&c.params.side!==-1)throw Error(`Kontakt ${c.id}: side ±1.`);
 }
 for(const p of m.patterns){
  if(p.kind==='mirror'){p.plane=frame(p.plane,'Spiegelung');}
  else if(p.kind==='array'){if(!Number.isInteger(p.count)||p.count<2||p.count>64)throw Error('Reihe: Anzahl 2–64.');const step=p.step;if('alongJoint' in step){if(!m.joints.some(j=>j.id===step.alongJoint&&j.joint.kind==='path'))throw Error('Reihe: Pfadgelenk fehlt.');num(step.offset,'Reihe');}else p.step=frame(step,'Reihe');}
  else throw Error('Unbekannte Musterart.');
  if(!Array.isArray(p.source)||!p.source.length)throw Error('Muster ohne Quelle.');
  if(p.kind==='array'&&p.chain)for(const j of p.chain){if(!p.source.includes(j.a.body)||!p.source.includes(j.b.body))throw Error(`Reihe: Kettengelenk ${j.id} muss Quellkörper verbinden.`);j.a.local=frame(j.a.local,'Kettengelenk');j.b.local=frame(j.b.local,'Kettengelenk');}
  for(const s of p.source)if(!bodies.has(s)&&!elements.has(s)&&!m.joints.some(j=>j.id===s)&&!m.contacts.some(c=>c.id===s))throw Error(`Muster: Quelle ${s} fehlt.`);
 }
 for(const key of ['input','output'] as const){const t=m[key];if(!t)throw Error(`${key}: Anschluss fehlt.`);
  if(t.kind==='frame'){if(!bodies.has(t.body))throw Error(`${key}: Körper fehlt.`);t.local=frame(t.local,key);t.target=frame(t.target,key);if(t.constraint!=='frame'&&t.constraint!=='axis')throw Error(`${key}: constraint frame|axis.`);if(t.tolerance){num(t.tolerance.position,key);num(t.tolerance.angle,key);}}
  else if(t.kind==='coordinate'){const j=m.joints.find(j=>j.id===t.joint);if(!j)throw Error(`${key}: Gelenk fehlt.`);if(!Number.isInteger(t.coordinate)||t.coordinate<0||t.coordinate>=jointDofs(j.joint))throw Error(`${key}: Koordinate außerhalb der Gelenkfreiheit.`);}
  else throw Error(`${key}: Anschlussart fehlt.`);}
 if(!m.range||!Number.isInteger(m.range.samples)||m.range.samples<1||m.range.samples>400||!Number.isFinite(num(m.range.from,'range'))||!Number.isFinite(num(m.range.to,'range')))throw Error('range: 1–400 Stellungen.');
 if(m.range.samples>1&&m.range.from===m.range.to)throw Error('range: mehrere Stellungen brauchen einen Bereich.');
 if(m.target){if(m.target.kind==='ratio'||m.target.kind==='stroke-per-turn'){if(!(num(m.target.value,'target')>0)||!(num(m.target.tolerance,'target')>=0))throw Error('target: Wert und Toleranz.');}else if(m.target.kind==='profile'){if(!Array.isArray(m.target.samples)||m.target.samples.length<2)throw Error('target: Verlauf braucht Stützstellen.');}else throw Error('target: Art fehlt.');}
 if(m.environment){const env=m.environment;if(!Array.isArray(env.obstacles)||!(num(env.margin,'Umgebung')>=0))throw Error('Umgebung ungültig.');for(const r of [...(env.bounds?[env.bounds]:[]),...env.obstacles]){r.frame=frame(r.frame,'Region');if(r.size.length!==3||r.size.some(n=>!(num(n,'Region')>0)))throw Error('Region: Größe.');}}
 return m;
}

// ---------- geometry helpers ----------
export const mirrorMatrix=(plane:Frame)=>{const n=rotate(plane.rotation,[0,0,1]);return (v:V):V=>add(v,scale(n,-2*dot(v,n)));};
/** Mirror of a frame across the xy-plane of `plane`: reflect the position and conjugate the rotation. */
export function mirrorFrame(f:Frame,plane:Frame):Frame{
 const M=mirrorMatrix(plane),p0=plane.position,position=add(M(add(f.position,scale(p0,-1))),p0);
 const x=rotate(f.rotation,[1,0,0]),y=rotate(f.rotation,[0,1,0]),z=rotate(f.rotation,[0,0,1]);
 // R' = M R M: columns are M·R·M·e_i; M e_i = e_i − 2 n n_i.
 const n=rotate(plane.rotation,[0,0,1]),col=(i:number):V=>{const e:V=[0,0,0];e[i]=1;const me=add(e,scale(n,-2*n[i])),rme=add(add(scale(x,me[0]),scale(y,me[1])),scale(z,me[2]));return M(rme);};
 return {position,rotation:quaternionFromBasis(col(0),col(1),col(2))};
}
/** World frame of an element from its first mount. */
export const elementFrame=(m:Pick<Mechanism,'bodies'>,e:Element)=>{const mount=e.mounts[0],body=m.bodies.find(b=>b.id===mount.body);if(!body)throw Error(`Element ${e.id}: Körper ${mount.body} fehlt.`);return compose(body.frame,mount.pose);};

// ---------- pattern expansion ----------
export type Expanded=Omit<Mechanism,'patterns'>&{patterns:[]};
/** Materialises patterns. Derived ids are `${source}#${pattern}.${k}`; derived joints are redundant. */
export function expand(m:Mechanism):Expanded{
 const out:Expanded={...structuredClone(m),patterns:[]};
 m.patterns.forEach((p,pi)=>{
  const count=p.kind==='mirror'?1:p.count-1;
  // Sources include copies made by earlier patterns (`x#0.1` counts as `x`), never copies of this one.
  const baseOf=(id:string)=>id.split('#')[0],inSource=(id:string)=>p.source.includes(baseOf(id));
  const sources={bodies:out.bodies.filter(b=>inSource(b.id)),elements:out.elements.filter(e=>inSource(e.id)),joints:out.joints.filter(j=>inSource(j.id)||inSource(j.a.body)&&inSource(j.b.body)),contacts:out.contacts.filter(c=>inSource(c.id)||inSource(c.a.element)&&inSource(c.b.element))};
  for(let k=1;k<=count;k++){
   const tag=`#${pi}.${k}`,map=new Map<string,string>();
   for(const x of [...sources.bodies,...sources.elements,...sources.joints,...sources.contacts])map.set(x.id,x.id+tag);
   const along=p.kind==='array'&&'alongJoint' in p.step?p.step:undefined;
   // Along a path the copy is moved by the rigid motion between the path frames at s and s + k·offset.
   const alongTransform=(()=>{if(!along)return undefined;const j=out.joints.find(j=>j.id===along.alongJoint)!;if(j.joint.kind!=='path')throw Error('Reihe: Pfadgelenk fehlt.');const A=compose(out.bodies.find(b=>b.id===j.a.body)!.frame,j.a.local),B=compose(out.bodies.find(b=>b.id===j.b.body)!.frame,j.b.local),s0=projectCoordinates(j.joint,compose(inverse(A),B),j.shift)[0];
    const from=compose(A,jointFrame(j.joint,[s0,0],j.shift)),to=compose(A,jointFrame(j.joint,[s0+k*along.offset,0],j.shift));return (f:Frame)=>compose(compose(to,inverse(from)),f);})();
   const transform=(f:Frame):Frame=>{
    if(p.kind==='mirror')return mirrorFrame(f,p.plane);
    if(alongTransform)return alongTransform(f);
    let g=f;for(let i=0;i<k;i++)g=compose(p.step as Frame,g);return g;};
   const bodyFrames=new Map<string,Frame>();
   // Mirror copies follow their source at every pose; array copies move on their own joints.
   for(const b of sources.bodies){const f=transform(b.frame);bodyFrames.set(b.id,f);out.bodies.push({...structuredClone(b),id:b.id+tag,frame:f,ground:false,derived:`${b.id}${tag}`,...(p.kind==='mirror'?{mirror:{source:b.id,plane:p.plane}}:{})});}
   const worldOf=(bodyId:string,local:Frame)=>compose(out.bodies.find(b=>b.id===bodyId)!.frame,local);
   const localFor=(bodyId:string,world:Frame)=>{const target=map.get(bodyId)??bodyId;const bf=bodyFrames.get(bodyId)??out.bodies.find(b=>b.id===bodyId)!.frame;return {body:target,local:compose(inverse(bf),world)};};
   for(const e of sources.elements){
    const mounts=e.mounts.map(mt=>{const world=transform(worldOf(mt.body,mt.pose)),l=localFor(mt.body,world);return {interface:mt.interface,body:l.body,pose:l.local};});
    out.elements.push({...structuredClone(e),id:e.id+tag,mounts,derived:`${e.id}${tag}`,surfaces:e.surfaces.map(s=>p.kind==='mirror'&&s.helix?{...s,helix:-s.helix}:s)});
   }
   for(const j of sources.joints){
    if(along&&j.joint.kind==='path'){
     out.joints.push({...structuredClone(j),id:j.id+tag,b:{body:map.get(j.b.body)??j.b.body,local:j.b.local},shift:(j.shift??0)+k*along.offset,derived:`${j.id}${tag}`});continue;}
    const A=localFor(j.a.body,transform(worldOf(j.a.body,j.a.local))),B=localFor(j.b.body,transform(worldOf(j.b.body,j.b.local)));
    const joint=j.joint.kind==='path'&&p.kind==='mirror'?{...j.joint,curve:{...j.joint.curve,points:j.joint.curve.points.map(pt=>add(mirrorMatrix(p.plane)(add(pt,scale(p.plane.position,-1))),p.plane.position)),axis:j.joint.curve.axis?mirrorMatrix(p.plane)(j.joint.curve.axis):undefined}}:j.joint;
    out.joints.push({...structuredClone(j),joint:structuredClone(joint),id:j.id+tag,a:A,b:B,derived:`${j.id}${tag}`,...(p.kind==='mirror'?{redundant:true}:{})});
   }
   for(const c of sources.contacts){
    out.contacts.push({...structuredClone(c),id:c.id+tag,a:{element:map.get(c.a.element)??c.a.element,surface:c.a.surface},b:{element:map.get(c.b.element)??c.b.element,surface:c.b.surface},derived:`${c.id}${tag}`,...(p.kind==='mirror'?{redundant:true}:{})});
   }
   // Chain joints link copy k-1 (side a) to copy k (side b).
   if(p.kind==='array')for(const j of p.chain??[]){const prev=k===1?'':`#${pi}.${k-1}`;out.joints.push({...structuredClone(j),id:j.id+tag,a:{body:j.a.body+prev,local:j.a.local},b:{body:j.b.body+tag,local:j.b.local},derived:`${j.id}${tag}`});}
  }
 });
 return out;
}
/** Elements on the same body with a common axis act as one rotor (replaces rotor groups). */
export function rotorGroups(m:Pick<Mechanism,'bodies'|'elements'>){
 const groups:string[][]=[];
 for(const e of m.elements){const f=elementFrame(m,e),z=rotate(f.rotation,[0,0,1]);
  const g=groups.find(ids=>ids.some(id=>{const o=m.elements.find(x=>x.id===id)!;if(o.mounts[0].body!==e.mounts[0].body)return false;const g=elementFrame(m,o),w=rotate(g.rotation,[0,0,1]);return norm(cross(z,w))<1e-9&&norm(cross(z,add(g.position,scale(f.position,-1))))<1e-6;}));
  if(g)g.push(e.id);else groups.push([e.id]);}
 return groups;
}
export const unitOrThrow=unit;
export {identity};
