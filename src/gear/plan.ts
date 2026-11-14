// From linked shafts on a plane to a gearbox: where every wheel, pulley and bearing stands in the world, which wheels
// mesh, the belts and their lengths, how fast every shaft turns, the layers the bearings fall into, the webs that join
// them, and what is in the way. Pure: the shaft files come in as data.
//
// World: x/y the plane, z up. A placed shaft's item from x0 to x1 (shaft generator) stands from z+x0 to z+x1, or, flipped,
// from z+L−x1 to z+L−x0. A layer holds the bearings whose middle lies in it; its plates reach `lip` beyond its bearings'
// faces (the rim holding the outer ring), so that band is what must stay clear of wheels.
import {planShaft} from '../shaft/plan.ts';
import type {Plan as ShaftPlan} from '../shaft/plan.ts';
import type {ShaftDoc} from '../shaft/model.ts';
import {outer} from '../shaft/profile.ts';
import {BELTS} from '../mechanics/motion.ts';
import {partById} from '../mechanics/parts/catalog.ts';
import type {Part} from '../mechanics/parts/catalog.ts';
import type {GearDoc,PlacedShaft,Layer} from './model.ts';
import {itemKey,webKey} from './model.ts';

const eps=1e-6;
export type ShaftFile={name:string;doc:ShaftDoc};
export type Placed={key:string;on:string;item:string;label:string;at:[number,number];z0:number;z1:number};
export type Wheel=Placed&{teeth:number;module?:number;pulley:boolean;pitch:number;outer:number;lego:boolean};
/** A motor whose shaft is in a linked shaft: its flange face (z), its body below (`down`) or above it, the layer it is
 * screwed to, how far its shaft would have to move to lie on a layer, the slot direction when it drives a belt. `pad`:
 * radius of the round flange field in the plate. */
export type Motor={key:string;on:string;part:Part;label:string;at:[number,number];face:number;down:boolean;depth:number;pad:number;layer?:string;offset?:number;slot?:[number,number];travel:number};
/** A bearing, or a motor's flange as a node of its layer's plate (`motor`; then D/2 + rim is its flange field). */
export type Bearing=Placed&{D:number;d:number;B:number;motor?:Motor};
/** What a plate must keep clear of: a disc from z0 to z1, or the hull of two discs (a belt). */
export type Obstacle={key:string;label:string;z0:number;z1:number;a:[number,number];ra:number;b?:[number,number];rb?:number;on:string[]};
export type ShaftInWorld={id:string;label:string;at:[number,number];z0:number;z1:number;plan:ShaftPlan;/** Its round pieces in the world: z0..z1 and radius. */pieces:{z0:number;z1:number;r:number}[]};
export type Mesh={a:string;b:string;ratio:number};
/** `tension`: a motor's slots move the centre distance within `range` (lengths at its ends); `fit`: the centre distance
 * the stock belt wants. */
export type BeltPlan={id:string;a:string;b:string;center:number;length:number;stock?:number;tension?:{motor:string;range:[number,number]};fit?:{stock:number;center:number}};
/** A web: straight (the hull of both rings), round a part (`path`: points it goes through, `width` its half width there),
 * or `z`: only that high, under or over a part. `route`: what the user chose; `hits`: what it still runs into. */
export type WebPlan={a:string;b:string;auto:boolean;forced:boolean;route?:'aussen'|'tiefe';path?:[number,number][];width?:number;z?:[number,number];hits:string[]};
export type LayerPlan={id:string;z0:number;z1:number;band:[number,number];split:number;auto:boolean;rim:number;thickness:number;bearings:string[];webs:WebPlan[];holes:{on:string;r:number}[];parts:number};
export type Issue={level:'fehler'|'warnung'|'hinweis';message:string;ref?:string};
/** A bolt through all plates: where, the eye round it, which bearing of each layer its eye is joined to. */
export type Bolt={at:[number,number];eye:number;hole:number;auto:boolean;attach:Record<string,string>};
/** Printed columns between two layers, one per bolt. */
export type Columns={from:string;to:string;z0:number;z1:number};
export type BomLine={what:string;count:number;note?:string};
export type GearPlan={motors:Motor[];shafts:ShaftInWorld[];wheels:Wheel[];bearings:Bearing[];obstacles:Obstacle[];meshes:Mesh[];belts:BeltPlan[];rates:Record<string,number>;layers:LayerPlan[];bolts:Bolt[];columns:Columns[];screw?:{length:number;what:string};bom:BomLine[];issues:Issue[]};

const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
const mm=(x:number)=>`${n(x)} mm`;
const dist=(a:[number,number],b:[number,number])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const overlap=(a0:number,a1:number,b0:number,b1:number)=>Math.min(a1,b1)-Math.max(a0,b0);
/** Distance from a point to the hull of two discs (negative inside): the hull is the union of the discs between them. */
export function hullDistance(p:[number,number],a:[number,number],ra:number,b:[number,number],rb:number){let best=Infinity;for(let i=0;i<=64;i++){const t=i/64,q:[number,number]=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];best=Math.min(best,dist(p,q)-(ra+(rb-ra)*t));}return best;}
/** Distance between two hulls of discs (a disc is a hull with b = a). */
function hullsApart(o:{a:[number,number];ra:number;b?:[number,number];rb?:number},w:{a:[number,number];ra:number;b:[number,number];rb:number}){let best=Infinity;const b=o.b??o.a,rb=o.rb??o.ra;for(let i=0;i<=32;i++){const t=i/32,q:[number,number]=[o.a[0]+(b[0]-o.a[0])*t,o.a[1]+(b[1]-o.a[1])*t];best=Math.min(best,hullDistance(q,w.a,w.ra,w.b,w.rb)-(o.ra+(rb-o.ra)*t));}return best;}

export function planGear(doc:GearDoc,files:Record<string,ShaftFile|undefined>):GearPlan{
 const issues:Issue[]=[],shafts:ShaftInWorld[]=[],wheels:Wheel[]=[],bearings:Bearing[]=[],obstacles:Obstacle[]=[],motors:Motor[]=[],s=doc.settings;
 for(const p of doc.shafts){const f=files[p.shaft];if(!f){issues.push({level:'fehler',message:`Welle ${p.id}: die Datei im Wellen-Generator fehlt`,ref:p.id});continue;}
  const plan=planShaft(f.doc),L=f.doc.length,span=(x0:number,x1:number):[number,number]=>p.flip?[p.z+L-x1,p.z+L-x0]:[p.z+x0,p.z+x1];
  const pieces=plan.sections.map(c=>{const [z0,z1]=span(c.x0,c.x1);return {z0,z1,r:outer(c.profile)/2};});
  shafts.push({id:p.id,label:f.name,at:p.at,z0:p.z,z1:p.z+L,plan,pieces});
  if(plan.issues.some(i=>i.level==='fehler'))issues.push({level:'warnung',message:`${f.name}: die Welle selbst hat noch Fehler (im Wellen-Generator ansehen)`,ref:p.id});
  for(const t of plan.placed){const [z0,z1]=span(t.x0,t.x1),base={key:itemKey({on:p.id,item:t.id}),on:p.id,item:t.id,label:`${t.part.short} auf ${f.name}`,at:p.at,z0,z1};
   if(t.part.group==='Lager'){bearings.push({...base,D:t.part.outer,d:outer(t.bore),B:t.x1-t.x0});continue;}
   if(t.part.teeth){const pulley=!!t.part.pulley,pitch=pulley?t.part.teeth/Math.PI:(t.part.module??1)*t.part.teeth/2;wheels.push({...base,teeth:t.part.teeth,...(t.part.module?{module:t.part.module}:{}),pulley,pitch,outer:t.part.outer/2,lego:t.part.group==='LEGO-Zahnräder'});}
   obstacles.push({key:base.key,label:base.label,z0,z1,a:p.at,ra:t.part.outer/2,on:[p.id]});}
  for(const sl of plan.sleeves){const [z0,z1]=span(sl.x0,sl.x1);obstacles.push({key:`${p.id}/${sl.id}`,label:`${sl.label} auf ${f.name}`,z0,z1,a:p.at,ra:Math.max(...sl.steps.map(x=>outer(x.outer)))/2,on:[p.id]});}
  // A motor's shaft in it: the flange face lies the motor shaft's length from where it went in, the body beyond.
  for(const i of plan.inserts){const part=i.part.id.startsWith('motor-')?partById(i.part.id.slice(6)):undefined;if(!part?.shaft)continue;
   const faceX=i.end==='links'?i.x1-part.shaft.length:i.x0+part.shaft.length,face=p.flip?p.z+L-faceX:p.z+faceX,down=(i.end==='links')!==!!p.flip,reach=Math.max(...part.holes.map(h=>Math.hypot(...h.at)+h.d/2),(part.pilot??0)/2);
   motors.push({key:`motor:${p.id}`,on:p.id,part,label:`${part.label.replace(/ Schrittmotor/,'')} an ${f.name}`,at:p.at,face,down,depth:part.size[2],pad:Math.max(reach,part.size[0]/2)+s.rim,travel:0});}}
 const wheel=(k:string)=>wheels.find(w=>w.key===k);
 // Meshing: two wheels of the same module on different shafts, facing each other, at the sum of their pitch radii.
 const meshes:Mesh[]=[];
 wheels.forEach((a,i)=>{for(const b of wheels.slice(i+1)){if(a.on===b.on||a.pulley||b.pulley)continue;const face=overlap(a.z0,a.z1,b.z0,b.z1);if(face<=.3)continue;const c=dist(a.at,b.at),want=a.pitch+b.pitch;
  if(a.module===b.module&&Math.abs(c-want)<.05){meshes.push({a:a.key,b:b.key,ratio:-a.teeth/b.teeth});if(a.lego!==b.lego)issues.push({level:'hinweis',message:`${a.label} kämmt mit ${b.label}: LEGO und gedrucktes Rad gemischt, Modul 1 bei beiden, Zahnform prüfen`,ref:b.on});continue;}
  if(a.module===b.module&&Math.abs(c-want)<1)issues.push({level:'warnung',message:`${a.label} und ${b.label} kämmen fast: Abstand ${mm(c)}, Eingriff bei ${mm(want)}`,ref:b.on});
  else if(c<a.outer+b.outer-.01)issues.push({level:'fehler',message:`${a.label} und ${b.label} berühren sich, ohne zu kämmen (Abstand ${mm(c)}${a.module===b.module?`, für den Eingriff ${mm(want)}`:', anderes Modul'})`,ref:b.on});}});
 // Belts: two pulleys at the same height on different shafts.
 const belts:BeltPlan[]=[];
 for(const bt of doc.belts){const a=wheel(itemKey(bt.a)),b=wheel(itemKey(bt.b));if(!a?.pulley||!b?.pulley||a.on===b.on){issues.push({level:'fehler',message:'Riemen: braucht zwei Riemenscheiben auf verschiedenen Wellen',ref:bt.id});continue;}
  if(overlap(a.z0,a.z1,b.z0,b.z1)<2)issues.push({level:'fehler',message:`Riemen ${a.label} – ${b.label}: die Scheiben stehen nicht auf gleicher Höhe (${mm(a.z0)} und ${mm(b.z0)})`,ref:bt.id});
  const c=dist(a.at,b.at),length=2*c+Math.PI*(a.pitch+b.pitch)+(a.pitch-b.pitch)**2/Math.max(c,eps),stock=BELTS.find(l=>l>=length-.5);
  belts.push({id:bt.id,a:a.key,b:b.key,center:c,length,...(stock?{stock}:{})});
  obstacles.push({key:`riemen:${bt.id}`,label:`Riemen ${a.teeth}/${b.teeth}`,z0:Math.max(a.z0,b.z0),z1:Math.min(a.z1,b.z1),a:a.at,ra:a.outer,b:b.at,rb:b.outer,on:[a.on,b.on]});
}
 // Speeds: per turn of the input; a loop that disagrees locks.
 const rates:Record<string,number>={},input=doc.input??shafts[0]?.id;
 if(input&&shafts.some(x=>x.id===input)){rates[input]=1;const edges=[...meshes.flatMap(m=>{const a=wheel(m.a)!,b=wheel(m.b)!;return [{a:a.on,b:b.on,k:-a.teeth/b.teeth},{a:b.on,b:a.on,k:-b.teeth/a.teeth}];}),...belts.flatMap(bt=>{const a=wheel(bt.a)!,b=wheel(bt.b)!;return [{a:a.on,b:b.on,k:a.teeth/b.teeth},{a:b.on,b:a.on,k:b.teeth/a.teeth}];})];
  const open=[input];let locked=false;while(open.length){const x=open.pop()!;for(const e of edges){if(e.a!==x)continue;const v=rates[x]*e.k;if(rates[e.b]===undefined){rates[e.b]=v;open.push(e.b);}else if(Math.abs(rates[e.b]-v)>1e-9*Math.max(1,Math.abs(v)))locked=true;}}
  if(locked)issues.push({level:'fehler',message:'Das Getriebe klemmt: ein Kreis aus Rädern und Riemen widerspricht sich'});}
 // Shafts must be held.
 for(const x of shafts){if(motors.some(m=>m.on===x.id))continue;const k=bearings.filter(b=>b.on===x.id).length;if(!k)issues.push({level:'warnung',message:`${x.label}: kein Lager, nichts hält die Welle`,ref:x.id});else if(k===1)issues.push({level:'hinweis',message:`${x.label}: nur ein Lager, die Welle kann kippen`,ref:x.id});}
 // A motor driving a belt: its slots point along the belt.
 for(const m of motors){const bt=belts.find(b=>wheel(b.a)!.on===m.on||wheel(b.b)!.on===m.on);if(!bt)continue;const other=wheel(wheel(bt.a)!.on===m.on?bt.b:bt.a)!,d=dist(m.at,other.at)||1;m.slot=[(other.at[0]-m.at[0])/d,(other.at[1]-m.at[1])/d];m.travel=s.slot;}
 const layers=planLayers(doc,shafts,bearings,meshes,wheels,obstacles,issues,motors);
 for(const m of motors){if(m.layer)continue;const faces=layers.map((l,i)=>({i,z:m.down?l.band[0]:l.band[1]})).sort((a,b)=>Math.abs(a.z-m.face)-Math.abs(b.z-m.face))[0];
  if(faces){m.offset=+(faces.z-m.face).toFixed(3);issues.push({level:'warnung',message:`${m.label}: der Flansch liegt bei z ${mm(m.face)} an keiner Platte; die Welle ${mm(Math.abs(m.offset))} ${m.offset>0?'höher':'tiefer'} setzt ihn an ${m.down?'die Unterseite':'die Oberseite'} von Schicht ${faces.i+1} (Knopf an der Welle)`,ref:m.on});}
  else issues.push({level:'warnung',message:`${m.label}: keine Schicht, an die er geschraubt werden kann`,ref:m.on});}
 // Belts against stock lengths: with a motor's slots the centre distance has a range; without, it must fit as it is.
 const lengthAt=(a:Wheel,b:Wheel,c:number)=>2*c+Math.PI*(a.pitch+b.pitch)+(a.pitch-b.pitch)**2/Math.max(c,eps);
 for(const bp of belts){const a=wheel(bp.a)!,b=wheel(bp.b)!,m=motors.find(x=>x.layer&&x.slot&&(x.on===a.on||x.on===b.on)),t=m?m.travel/2:0,lo=lengthAt(a,b,bp.center-t),hi=lengthAt(a,b,bp.center+t);
  if(m)bp.tension={motor:m.key,range:[lo,hi]};const stock=BELTS.find(l=>l>=lo-.5);const label=`Riemen ${a.teeth}/${b.teeth}`;
  if(!stock){issues.push({level:'warnung',message:`${label}: ${mm(bp.length)}, länger als die Normlängen im Katalog`,ref:bp.id});continue;}
  bp.stock=stock;bp.fit={stock,center:centerFor(stock,a.pitch,b.pitch)};
  if(stock<=hi+.5)issues.push({level:'hinweis',message:m?`${label}: Normriemen ${stock} mm passt, gespannt über die Langlöcher des Motors (Achsabstand ${mm(bp.fit.center)})`:`${label}: ${mm(bp.length)}, Normriemen ${stock} mm passt genau`,ref:bp.id});
  else issues.push({level:'warnung',message:m?`${label}: Normriemen ${stock} mm braucht ${mm(bp.fit.center)} Achsabstand, die Langlöcher reichen von ${mm(bp.center-t)} bis ${mm(bp.center+t)}: auf Normriemen stellen`:`${label}: ${mm(bp.length)} lang, Normriemen ${stock} mm und nichts zum Spannen: Achsabstand auf ${mm(bp.fit.center)} stellen oder einen Motor mit Langlöchern daran`,ref:bp.id});}
 const {bolts,columns,screw}=planBolts(doc,layers,bearings,shafts,obstacles,issues);
 const bom:BomLine[]=[];const add=(what:string,count=1,note?:string)=>{const b=bom.find(x=>x.what===what);if(b)b.count+=count;else bom.push({what,count,...(note?{note}:{})});};
 layers.forEach((l,i)=>{add(`Platte Schicht ${i+1} unten (gedruckt)`,1,`${n(l.split-l.band[0])} mm dick`);add(`Platte Schicht ${i+1} oben (gedruckt)`,1,`${n(l.band[1]-l.split)} mm dick`);});
 for(const c of columns)add(`Distanzsäule ${n(c.z1-c.z0)} mm (gedruckt)`,bolts.length,`zwischen ${c.from} und ${c.to}`);
 if(screw&&bolts.length){add(screw.what,bolts.length);add(`Mutter M${n(s.bolt)} DIN 934`,bolts.length);add(`Scheibe M${n(s.bolt)} DIN 125`,2*bolts.length);}
 for(const bp of belts)add(`Zahnriemen GT2 6 mm, ${bp.stock?`${bp.stock} mm geschlossen`:`${n(bp.length)} mm`}`);
 for(const x of shafts)add(`${x.label} (Wellen-Generator, Teile dort in der Stückliste)`);
 for(const m of motors)add(m.part.label,1,m.layer?'mit 4 Schrauben M3 am Flansch':'noch an keiner Platte');
 return {motors,shafts,wheels,bearings,obstacles,meshes,belts,rates,layers,bolts,columns,...(screw?{screw}:{}),bom,issues};
}

/** Layers: proposed from the bearings' heights (bearings whose spans touch share one), or the ones set by hand. Then
 * per layer the webs (meshing shafts always joined, then the shortest webs that hold all together, then the user's
 * changes), holes for shafts passing through, and what the plates hit. */
function planLayers(doc:GearDoc,shafts:ShaftInWorld[],bearings:Bearing[],meshes:Mesh[],wheels:Wheel[],obstacles:Obstacle[],issues:Issue[],motors:Motor[]):LayerPlan[]{
 const s=doc.settings,mid=(b:Bearing)=>(b.z0+b.z1)/2;let given:Layer[]|undefined=doc.layers;
 const groups:{z0:number;z1:number;list:Bearing[]}[]=[];
 if(given?.length){for(const l of given)groups.push({z0:l.z0,z1:l.z1,list:bearings.filter(b=>mid(b)>=l.z0-eps&&mid(b)<=l.z1+eps)});for(const b of bearings)if(!groups.some(g=>g.list.includes(b)))issues.push({level:'warnung',message:`${b.label} liegt in keiner Schicht und wird nicht gehalten`,ref:b.on});}
 else{given=undefined;for(const b of [...bearings].sort((a,c)=>mid(a)-mid(c))){const g=groups.at(-1);if(g&&b.z0<=g.z1+.5){g.z1=Math.max(g.z1,b.z1);g.z0=Math.min(g.z0,b.z0);g.list.push(b);}else groups.push({z0:b.z0,z1:b.z1,list:[b]});}}
 const meshPairs=new Set(meshes.map(m=>{const a=wheels.find(w=>w.key===m.a)!,b=wheels.find(w=>w.key===m.b)!;return [a.on,b.on].sort().join('|');}));
 const remove=new Set((doc.webs?.remove??[]).map(k=>k.join('|'))),add=(doc.webs?.add??[]);
 return groups.map((g,i):LayerPlan=>{const l=given?.[i],id=l?.id??`s${i+1}`,rim=l?.rim??s.rim,thickness=l?.thickness??s.web,list:Bearing[]=[...g.list],z0=Math.min(g.z0,...list.map(b=>b.z0)),z1=Math.max(g.z1,...list.map(b=>b.z1));
  const band:[number,number]=[z0-s.lip,z1+s.lip],split=(z0+z1)/2,name=`Schicht ${i+1}`,ring=(b:Bearing)=>b.D/2+rim;
  for(const b of list)if(Math.abs(mid(b)-split)>.5)issues.push({level:'hinweis',message:`${b.label}: Mitte ${mm(mid(b)-split)} neben der Trennfuge von ${name}, die Taschen werden ungleich tief`,ref:b.on});
  for(const [a,b] of list.flatMap((a,k)=>list.slice(k+1).map(b=>[a,b] as const)))if(a.on===b.on)issues.push({level:'warnung',message:`${a.label} und ${b.label} liegen auf derselben Welle in ${name}`,ref:a.on});
  // Motors screwed to this layer: the flange on the plate's outer face, the body outside.
  for(const m of motors)if(!m.layer&&Math.abs((m.down?band[0]:band[1])-m.face)<.5){m.layer=id;const node:Bearing={key:m.key,on:m.on,item:'motor',label:m.label,at:m.at,z0:m.face,z1:m.face,D:2*(m.pad-rim),d:0,B:0,motor:m};list.push(node);bearings.push(node);}
  // Webs: meshing shafts first (their distance must hold), then the shortest that join everything (Kruskal).
  const parent=new Map(list.map(b=>[b.key,b.key])),find=(k:string):string=>{const p=parent.get(k)!;if(p===k)return k;const r=find(p);parent.set(k,r);return r;},join=(a:string,b:string)=>{const x=find(a),y=find(b);if(x===y)return false;parent.set(x,y);return true;};
  const pairs=list.flatMap((a,k)=>list.slice(k+1).map(b=>({a,b,c:dist(a.at,b.at),forced:meshPairs.has([a.on,b.on].sort().join('|'))}))).sort((x,y)=>Number(y.forced)-Number(x.forced)||x.c-y.c);
  const webs:WebPlan[]=[];for(const p of pairs){if(p.forced||join(p.a.key,p.b.key)){if(p.forced)join(p.a.key,p.b.key);const [a,b]=webKey(p.a.key,p.b.key);if(!remove.has(`${a}|${b}`))webs.push({a,b,auto:true,forced:p.forced,hits:[]});}}
  for(const [a,b] of add){if(!list.some(x=>x.key===a)||!list.some(x=>x.key===b)){if(list.some(x=>x.key===a)||list.some(x=>x.key===b))issues.push({level:'warnung',message:`Steg ${a} – ${b}: beide Lager müssen in ${name} liegen`});continue;}if(!webs.some(w=>w.a===a&&w.b===b))webs.push({a,b,auto:false,forced:false,hits:[]});}
  for(const k of remove){const [a,b]=k.split('|');if(meshPairs.has([list.find(x=>x.key===a)?.on,list.find(x=>x.key===b)?.on].sort().join('|'))&&list.some(x=>x.key===a))issues.push({level:'hinweis',message:`Steg zwischen kämmenden Wellen in ${name} entfernt: der Achsabstand hängt dann an anderen Stegen`});}
  // How many pieces the plate falls into.
  const comp=new Map(list.map(b=>[b.key,b.key])),f2=(k:string):string=>{const p=comp.get(k)!;if(p===k)return k;const r=f2(p);comp.set(k,r);return r;};for(const w of webs){const x=f2(w.a),y=f2(w.b);if(x!==y)comp.set(x,y);}
  const parts=new Set(list.map(b=>f2(b.key))).size;if(parts>1)issues.push({level:'warnung',message:`${name} zerfällt in ${parts} Teile: Stege fehlen`});
  // Shafts passing through without a bearing here: a hole.
  const holes=shafts.filter(x=>!list.some(b=>b.on===x.id)&&overlap(x.z0,x.z1,band[0],band[1])>0).map(x=>({on:x.id,r:Math.max(...x.pieces.filter(p=>overlap(p.z0,p.z1,band[0],band[1])>0).map(p=>p.r),0)+s.hole}));
  // What the plate hits: rings and webs against wheels, pulleys, sleeves and belts in the band's heights.
  const at=(k:string)=>list.find(b=>b.key===k)!;
  for(const o of obstacles){if(overlap(o.z0,o.z1,band[0],band[1])<=eps)continue;
   for(const b of list){if(o.on.includes(b.on)&&!o.b){if(o.ra+s.clearance>(b.motor?(b.motor.part.pilot??0)/2:b.D/2-s.lipIn)+eps&&!(b.motor&&(b.motor.down?o.z0>=band[1]-eps:o.z1<=band[0]+eps)))issues.push({level:'fehler',message:`${name}: ${o.label} sitzt zu nah am Lager ${b.label}, die Platte reicht ${mm(s.lip)} über das Lager (Bord); Abstand oder Distanzhülse nötig`,ref:b.on});continue;}const c=o.b?hullDistance(b.at,o.a,o.ra,o.b,o.rb!):dist(b.at,o.a)-o.ra;if(c<ring(b)+s.clearance-eps)issues.push({level:'fehler',message:`${name}: der Ring um ${b.label} trifft ${o.label}`,ref:b.on});}}
  // Webs against what is in the band's heights: straight, or as the user chose round or under/over it.
  const inBand=obstacles.filter(o=>overlap(o.z0,o.z1,band[0],band[1])>eps),route=doc.webs?.route??{};
  for(const w of webs){const a=at(w.a),b=at(w.b),mine=(o:Obstacle)=>o.on.includes(a.on)||o.on.includes(b.on),hits=(segs:{a:[number,number];ra:number;b:[number,number];rb:number}[],z?:[number,number])=>inBand.filter(o=>!mine(o)&&(!z||overlap(o.z0,o.z1,z[0],z[1])>eps)&&segs.some(g=>hullsApart(o,g)<s.clearance-eps));
   const straight={a:a.at,ra:ring(a),b:b.at,rb:ring(b)},first=hits([straight]),r=route[`${w.a}|${w.b}`];w.hits=first.map(o=>o.label);if(r)w.route=r;
   if(!first.length||!r){for(const o of first)issues.push({level:'fehler',message:`${name}: der Steg ${a.label} – ${b.label} geht durch ${o.label}. Steg anklicken: außen herum, in die Tiefe oder weglassen`,ref:`steg:${w.a}|${w.b}`});continue;}
   if(r==='tiefe'){// Below what is above the band's middle, above what is below it.
    const mid=(band[0]+band[1])/2,top=Math.min(band[1],...first.filter(o=>(o.z0+o.z1)/2>=mid).map(o=>o.z0-s.clearance)),bottom=Math.max(band[0],...first.filter(o=>(o.z0+o.z1)/2<mid).map(o=>o.z1+s.clearance)),z:[number,number]=[bottom,top];
    if(top-bottom<2){issues.push({level:'fehler',message:`${name}: in die Tiefe geht der Steg ${a.label} – ${b.label} nicht, es blieben nur ${mm(Math.max(0,top-bottom))}. Außen herum oder weglassen`,ref:`steg:${w.a}|${w.b}`});continue;}
    w.z=z;w.hits=hits([straight],z).map(o=>o.label);for(const h of w.hits)issues.push({level:'fehler',message:`${name}: der Steg ${a.label} – ${b.label} trifft auch in der Tiefe ${h}`,ref:`steg:${w.a}|${w.b}`});
    issues.push({level:'hinweis',message:`${name}: Steg ${a.label} – ${b.label} in der Tiefe nur ${mm(top-bottom)} dick statt ${mm(band[1]-band[0])} (${mm(z[0])} bis ${mm(z[1])})`,ref:`steg:${w.a}|${w.b}`});continue;}
   // Round it: one point beside each part in the way, on the side that makes the shorter way, narrower than the rings.
   const width=Math.max(2,thickness/2+1),len=(p:[number,number][])=>p.reduce((t,q,k)=>k?t+dist(p[k-1],q):t,0);let best:[number,number][]|undefined;
   for(const extra of [0,4,8,14])for(const side of [1,-1]){const pts:[number,number][]=[a.at];
    for(const o of [...first].sort((x,y)=>dist(a.at,x.a)-dist(a.at,y.a))){const ab:[number,number]=[b.at[0]-a.at[0],b.at[1]-a.at[1]],L=Math.hypot(...ab)||1,t=((o.a[0]-a.at[0])*ab[0]+(o.a[1]-a.at[1])*ab[1])/L/L,foot:[number,number]=[a.at[0]+ab[0]*t,a.at[1]+ab[1]*t];
     let u:[number,number]=[foot[0]-o.a[0],foot[1]-o.a[1]];const ul=Math.hypot(...u);u=ul>1e-6?[u[0]/ul,u[1]/ul]:[-ab[1]/L,ab[0]/L];const R=(o.b?Math.max(o.ra,o.rb!):o.ra)+s.clearance+width+extra;pts.push([+(o.a[0]+side*u[0]*R).toFixed(3),+(o.a[1]+side*u[1]*R).toFixed(3)]);}
    pts.push(b.at);// Bars of one width from centre to centre; the rings are in the plate anyway.
    const segs=pts.slice(1).map((q,k)=>({a:pts[k],ra:width,b:q,rb:width}));
    if(!hits(segs).length&&(!best||len(pts)<len(best)))best=pts;}
   if(!best){issues.push({level:'fehler',message:`${name}: außen herum findet der Steg ${a.label} – ${b.label} keinen freien Weg. In die Tiefe oder weglassen`,ref:`steg:${w.a}|${w.b}`});continue;}
   w.path=best.slice(1,-1);w.width=width;w.hits=[];}
  return {id,z0,z1,band,split,auto:!l,rim,thickness,bearings:list.map(b=>b.key),webs,holes,parts};});
}

const screws=[10,12,16,20,25,30,35,40,45,50,55,60,65,70,80,90,100];
/** Bolts through all plates, held apart by printed columns. Places: round every bearing just outside its ring, kept
 * clear of wheels, belts, sleeves, rings and holes over the whole height of the stack; of those the ones spread widest
 * (three, four with more than two bearings in a layer, or as set). Each layer joins a bolt's eye to its nearest bearing
 * with a web. The screw: through the whole stack with a washer at each end and a nut. */
function planBolts(doc:GearDoc,layers:LayerPlan[],bearings:Bearing[],shafts:ShaftInWorld[],obstacles:Obstacle[],issues:Issue[]):{bolts:Bolt[];columns:Columns[];screw?:{length:number;what:string}}{
 const s=doc.settings,eye=s.bolt/2+2.5,hole=s.bolt/2+.2;if(!layers.length)return {bolts:[],columns:[]};
 const z0=Math.min(...layers.map(l=>l.band[0])),z1=Math.max(...layers.map(l=>l.band[1])),inLayers=bearings.filter(b=>layers.some(l=>l.bearings.includes(b.key)));
 const clear=(p:[number,number])=>obstacles.every(o=>overlap(o.z0,o.z1,z0,z1)<=eps||(o.b?hullDistance(p,o.a,o.ra,o.b,o.rb!):dist(p,o.a)-o.ra)>=eye+s.clearance)
  &&inLayers.every(b=>dist(p,b.at)>=b.D/2+eye+1)&&shafts.every(x=>dist(p,x.at)>=Math.max(0,...x.pieces.map(q=>q.r))+s.hole+eye);
 /** What the web from a bearing's ring to the eye at p hits in a layer's heights. */
 const webHits=(p:[number,number],b:Bearing,l:LayerPlan)=>obstacles.filter(o=>overlap(o.z0,o.z1,l.band[0],l.band[1])>eps&&!o.on.includes(b.on)&&hullsApart(o,{a:b.at,ra:b.D/2+l.rim,b:p,rb:eye})<s.clearance-eps);
 /** The bearing of a layer the eye joins: the nearest with a clear web, else the nearest. */
 const attachTo=(p:[number,number],l:LayerPlan)=>{const near=l.bearings.map(k=>bearings.find(b=>b.key===k)!).sort((a,b)=>dist(a.at,p)-dist(b.at,p));return {b:near.find(b=>!webHits(p,b,l).length)??near[0],clear:near.some(b=>!webHits(p,b,l).length)};};
 let places:[number,number][];const auto=!doc.bolts;
 if(doc.bolts)places=doc.bolts;
 else{const rim=(b:Bearing)=>layers.find(l=>l.bearings.includes(b.key))?.rim??s.rim,cands:[number,number][]=[],extra=new Map<[number,number],number>();
  // Right outside a ring first; further out (5 mm steps) where a wheel takes the ring's surroundings, each mm out costs.
  for(const b of inLayers)for(let out=0;out<=40;out+=5)for(let a=0;a<360;a+=10){const r=b.D/2+rim(b)+eye+out,p:[number,number]=[+(b.at[0]+r*Math.cos(a*Math.PI/180)).toFixed(3),+(b.at[1]+r*Math.sin(a*Math.PI/180)).toFixed(3)];if(clear(p)&&layers.every(l=>!l.bearings.length||attachTo(p,l).clear)&&inLayers.every(o=>o===b||dist(p,o.at)>=dist(p,b.at)-1e-9||dist(p,o.at)>=o.D/2+rim(o)+eye)){cands.push(p);extra.set(p,out);}}
  const cost=(p:[number,number])=>extra.get(p)??0;
  const want=s.bolts||(layers.some(l=>l.bearings.length>2)?4:3),c:[number,number]=[inLayers.reduce((a,b)=>a+b.at[0],0)/Math.max(1,inLayers.length),inLayers.reduce((a,b)=>a+b.at[1],0)/Math.max(1,inLayers.length)];places=[];
  const spread=(p:[number,number])=>Math.min(...places.map(q=>dist(p,q)))-cost(p);
  if(cands.length){places.push(cands.reduce((a,b)=>dist(b,c)-cost(b)>dist(a,c)-cost(a)?b:a));while(places.length<want){const next=cands.filter(p=>!places.includes(p)).reduce<[number,number]|undefined>((a,b)=>!a||spread(b)>spread(a)?b:a,undefined);if(!next||Math.min(...places.map(q=>dist(next,q)))<2*eye)break;places.push(next);}}
  if(places.length<Math.min(want,3))issues.push({level:'warnung',message:`Nur ${places.length} Platz für Bolzen gefunden: zu eng um die Lager. Rand größer oder Bolzen von Hand setzen`});}
 const bolts=places.map((at):Bolt=>{const attach:Record<string,string>={};for(const l of layers){const a=attachTo(at,l);if(a.b)attach[l.id]=a.b.key;}
  if(!auto&&!clear(at))issues.push({level:'fehler',message:`Bolzen bei ${n(at[0])} / ${n(at[1])} mm trifft ein Rad, ein Lager oder eine Welle`});return {at,eye,hole,auto,attach};});
 // Its eye's web in each layer must not cross wheels either (only bolts set by hand can still).
 for(const bo of bolts)for(const l of layers){const k=bo.attach[l.id];if(!k)continue;for(const o of webHits(bo.at,bearings.find(x=>x.key===k)!,l))issues.push({level:'warnung',message:`Der Steg zum Bolzen bei ${n(bo.at[0])} / ${n(bo.at[1])} mm in Schicht ${layers.indexOf(l)+1} streift ${o.label}`});}
 const sorted=[...layers].sort((a,b)=>a.band[0]-b.band[0]),columns:Columns[]=[];
 for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i],gap=b.band[0]-a.band[1];if(gap<-eps)issues.push({level:'fehler',message:`Schicht ${layers.indexOf(a)+1} und ${layers.indexOf(b)+1} überlappen um ${n(-gap)} mm`});else if(gap>.3)columns.push({from:`Schicht ${layers.indexOf(a)+1}`,to:`Schicht ${layers.indexOf(b)+1}`,z0:a.band[1],z1:b.band[0]});}
 const need=z1-z0+2*.5+.8*s.bolt,length=screws.find(l=>l>=need);
 return {bolts,columns,screw:length?{length,what:`Zylinderschraube DIN 912 M${n(s.bolt)} × ${length}`}:{length:Math.ceil(need+.8*s.bolt),what:`Gewindestange M${n(s.bolt)}, ${Math.ceil(need+.8*s.bolt)} mm, mit zwei Muttern`}};}

/** The centre distance at which a belt of length `L` fits two pulleys of pitch radii r1, r2. */
export function centerFor(L:number,r1:number,r2:number){const k=L-Math.PI*(r1+r2),d=k*k-8*(r1-r2)**2;return d<0?NaN:(k+Math.sqrt(d))/4;}
