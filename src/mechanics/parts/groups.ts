// Groups of a build: parts, plates and wheels taken together, groups in groups, like the assemblies in a CAD browser. A
// group only orders; how things move is said by their connections (parts/links.ts, shafts and wheels in parts/train.ts).
// A starr group (kind Körper) keeps its distances while editing: a member dragged moves it all, and so does the handle;
// it can go into the library as a block and come out again in any project. An Ordnung keeps them together in the tree.
// Coordinates are the build's room (z up); a wheel stands at (x, z along its shaft, height) of its train, its shaft runs
// along y. A group with wheels therefore turns only about y, one without about z.
import type {Build,BuildItem,PlateNode,Free} from './build.ts';
import {worldOf,reframe} from './build.ts';
import type {Part} from './catalog.ts';
import type {Shaft,Wheel} from './train.ts';
import {newTrain,outerOf,inputsOf,outputsOf,setEnds,shaftBody,shaftOfBody,shaftFrames} from './train.ts';
import type {Input} from './train.ts';
import {add,axisAngle,compose,inverse,multiply,rotate} from '../kinematics/math.ts';
import type {Frame,V} from '../kinematics/math.ts';

export type GroupKind='ordnung'|'koerper';
/** `koerper`: starr, `ordnung`: only ordering. */
export type Group={id:string;label:string;kind:GroupKind;parent?:string};
/** Körper and Träger keep their distances while editing; Ordnung does not. */
export const rigidOf=(g:Group)=>g.kind==='koerper';
export const kindNames:Record<GroupKind,string>={ordnung:'Gruppe',koerper:'starre Gruppe'};
/** What a group is called in the tree. */
export function titleOf(_b:Build,g:Group){return g.kind==='ordnung'?'Gruppe':'starr';}
export type MemberKind='item'|'plate'|'wheel'|'group';
export type Member={kind:MemberKind;id:string};
/** A rigid group as the library keeps it: in the room, its middle over the origin and its lowest point on the floor. */
export type Block={id:string;label:string;groups:Group[];items:BuildItem[];plates:PlateNode[];shafts:Shaft[];wheels:Wheel[];parts:Part[];inputs?:Input[];outputs?:string[];/** From before several ends. */input?:string;output?:string};
/** A move of a group: turned by `angle` degrees about `axis` through `centre`, then shifted by `delta`. */
export type Move={delta:V;angle?:number;axis?:'y'|'z';centre?:V};

const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const keyOf=(m:Member)=>`${m.kind}:${m.id}`;
export const memberOf=(key:string):Member=>{const at=key.indexOf(':');return {kind:key.slice(0,at) as MemberKind,id:key.slice(at+1)};};
const groupsOf=(b:Build)=>b.groups??[];
/** The group a member sits in directly. */
export function parentOf(b:Build,m:Member):string|undefined{
 if(m.kind==='group')return groupsOf(b).find(g=>g.id===m.id)?.parent;
 if(m.kind==='item')return b.items.find(i=>i.id===m.id)?.group;
 if(m.kind==='plate')return b.plates.find(p=>p.id===m.id)?.group;
 return b.train?.wheels.find(w=>w.id===m.id)?.group;}
/** The groups from `id` outwards. */
export function chain(b:Build,id:string|undefined){const out:Group[]=[];for(let g=groupsOf(b).find(x=>x.id===id);g&&out.length<64;g=groupsOf(b).find(x=>x.id===g!.parent))out.push(g);return out;}
/** What moves when the member is dragged: the outermost rigid group it sits in, or nothing (it moves alone). */
export function unitOf(b:Build,m:Member){return chain(b,m.kind==='group'?m.id:parentOf(b,m)).filter(rigidOf).at(-1)?.id;}
/** Everything in a group, its subgroups included. */
export function contents(b:Build,id:string){
 const groups=new Set([id]);for(let grew=true;grew;){grew=false;for(const g of groupsOf(b))if(g.parent&&groups.has(g.parent)&&!groups.has(g.id)){groups.add(g.id);grew=true;}}
 const items=b.items.filter(i=>i.group&&groups.has(i.group)),plates=b.plates.filter(p=>p.group&&groups.has(p.group)),wheels=(b.train?.wheels??[]).filter(w=>w.group&&groups.has(w.group));
 return {groups,items,plates,wheels,shafts:(b.train?.shafts??[]).filter(s=>wheels.some(w=>w.shaft===s.id))};}
/** The direct members of a group (or of the build, without `id`), for the tree. */
export function childrenOf(b:Build,id?:string):Member[]{return [...groupsOf(b).filter(g=>g.parent===id).map(g=>({kind:'group' as const,id:g.id})),...b.plates.filter(p=>p.group===id).map(p=>({kind:'plate' as const,id:p.id})),...b.items.filter(i=>i.group===id).map(i=>({kind:'item' as const,id:i.id})),...(b.train?.wheels??[]).filter(w=>w.group===id).map(w=>({kind:'wheel' as const,id:w.id}))];}
const setParent=(b:Build,m:Member,id:string|undefined)=>{
 const put=<T extends {group?:string}>(x:T|undefined)=>{if(!x)return;if(id)x.group=id;else delete x.group;};
 if(m.kind==='group'){const g=groupsOf(b).find(x=>x.id===m.id);if(g){if(id)g.parent=id;else delete g.parent;}}
 else if(m.kind==='item')put(b.items.find(i=>i.id===m.id));else if(m.kind==='plate')put(b.plates.find(p=>p.id===m.id));else put(b.train?.wheels.find(w=>w.id===m.id));};
/** A new group of the members. They must sit in the same group (or none); a plate brings the parts on it, a wheel the
 * wheels on its shaft (a shaft is one rigid piece). Returns the group and how many members came along. */
export function makeGroup(b:Build,members:Member[],id:string,label:string,kind?:GroupKind,frames:Record<string,Frame>={}){
 if(members.length<1)throw Error('Nichts ausgewählt.');
 // From different groups: the new group goes where the wheel is (a sensor joins the wheel in its Träger); the others leave
 // their groups for it. Without a wheel the selection has to sit in one group.
 const parents=new Set(members.map(m=>parentOf(b,m))),wheel=members.find(m=>m.kind==='wheel');if(parents.size>1&&!wheel)throw Error('Die Auswahl liegt in verschiedenen Gruppen: erst in dieselbe Gruppe bringen.');
 const parent=parents.size>1?parentOf(b,wheel!):[...parents][0],all=[...members];let along=0;
 // A plate brings the parts on it, they ride on it anyway.
 for(const m of members)if(m.kind==='plate')for(const i of b.items)if(i.plate===m.id&&i.group===parent&&!all.some(x=>x.kind==='item'&&x.id===i.id)){all.push({kind:'item',id:i.id});along++;}
 for(const m of members)if(m.kind==='wheel'){const w=b.train?.wheels.find(x=>x.id===m.id);for(const o of b.train?.wheels??[])if(w&&o.shaft===w.shaft&&!all.some(x=>x.kind==='wheel'&&x.id===o.id)){if(o.group!==parent)throw Error('Ein Rad auf derselben Welle liegt in einer anderen Gruppe.');all.push({kind:'wheel',id:o.id});along++;}}
 // Without a choice: wheels on more than one shaft are a Träger, everything else one Körper.
 b.groups=[...groupsOf(b),{id,label,kind:'ordnung',...(parent?{parent}:{})}];for(const m of all)setParent(b,m,id);
 // Counted over everything inside, subgroups too.
 // Starr without a choice. Parts grouped with the wheels of one shaft get connected to that shaft (a sensor on a gear):
 // a connection like any other, shown and changed on the part.
 const chosen=kind??'koerper',shafts=inShaft(b,id),onto=shafts.length===1&&all.some(m=>m.kind!=='wheel')?shafts[0]:undefined;setKind(b,id,chosen,frames);let connected=0;if(onto)connected=bind(b,id,onto,frames);
 return {group:id,along,kind:chosen,onto,connected};}
const inShaft=(b:Build,id:string)=>[...new Set(contents(b,id).wheels.map(w=>w.shaft))];
/** Connects the group's free parts and plates fixed to a shaft, where they stand now; returns how many. */
function bind(b:Build,id:string,shaft:string,frames:Record<string,Frame>){const body=shaftBody(shaft),f={...shaftFrames(b.train),...frames},c=contents(b,id);let n=0;
 for(const p of c.plates)if(p.free.body!==body&&!p.free.joint){p.free=reframe(p.free,body,f);n++;}for(const i of c.items)if(i.free&&i.free.body!==body&&!i.free.joint){i.free=reframe(i.free,body,f);n++;}return n;}
/** What the group is: Ordnung, Körper (one piece; on a shaft it turns with it) or Träger (holds shafts at fixed distances). */
export function setKind(b:Build,id:string,kind:GroupKind,_frames:Record<string,Frame>={}){const g=groupsOf(b).find(x=>x.id===id);if(g)g.kind=kind;}
/** Takes a group apart: its members go to the group around it. */
export function dissolve(b:Build,id:string,frames:Record<string,Frame>={}){const g=groupsOf(b).find(x=>x.id===id);if(!g)return;void frames;for(const m of childrenOf(b,id))setParent(b,m,g.parent);b.groups=groupsOf(b).filter(x=>x.id!==id);if(!b.groups.length)delete b.groups;}
/** Removes a group with all it holds: its parts (and those on its plates), plates, wheels and their shafts. */
export function removeGroup(b:Build,id:string){const c=contents(b,id),plates=new Set(c.plates.map(p=>p.id)),items=new Set(c.items.map(i=>i.id)),wheels=new Set(c.wheels.map(w=>w.id));
 b.items=b.items.filter(i=>!items.has(i.id)&&!(i.plate&&plates.has(i.plate)));b.plates=b.plates.filter(p=>!plates.has(p.id));b.groups=groupsOf(b).filter(g=>!c.groups.has(g.id));if(!b.groups.length)delete b.groups;
 const t=b.train;if(t){t.wheels=t.wheels.filter(w=>!wheels.has(w.id));t.shafts=t.shafts.filter(s=>t.wheels.some(w=>w.shaft===s.id));const known=(s:string)=>t.shafts.some(x=>x.id===s);setEnds(t,inputsOf(t).filter(i=>known(i.shaft)),outputsOf(t).filter(known));}}
/** A new wheel on a shaft whose wheels are grouped joins them: the shaft is one piece. */
export function joinShaft(b:Build,w:Wheel){const mate=b.train?.wheels.find(o=>o.id!==w.id&&o.shaft===w.shaft&&o.group);if(mate)w.group=mate.group;}

/** Where the members stand in the room, for the middle of the group and its handle. */
function points(b:Build,id:string,given:Record<string,Frame>){const frames={...shaftFrames(b.train),...given},c=contents(b,id),inside=new Set(c.plates.map(p=>p.id)),out:V[]=[];
 for(const i of c.items){if(i.free)out.push(worldOf(i.free,frames).position);else if(!inside.has(i.plate!)){const n=b.plates.find(p=>p.id===i.plate);if(n)out.push(compose(worldOf(n.free,frames),{position:[i.at[0],i.at[1],0],rotation:[0,0,0,1]}).position);}}
 for(const p of c.plates)out.push(worldOf(p.free,frames).position);
 for(const w of c.wheels){const s=c.shafts.find(x=>x.id===w.shaft)!;out.push([s.at[0],w.z,s.at[1]]);}
 return out;}
export function centreOf(b:Build,id:string,frames:Record<string,Frame>):V{const p=points(b,id,frames);if(!p.length)return [0,0,0];return [0,1,2].map(k=>p.reduce((s,v)=>s+v[k],0)/p.length) as V;}
/** A group with wheels turns about the shafts' direction, one without about the vertical. */
export const turnAxis=(b:Build,id:string):'y'|'z'=>contents(b,id).wheels.length?'y':'z';

/** Moves and turns every member of a group in the room. Parts on a plate of the group ride on it; a part of the group on
 * a plate outside it slides on that plate. */
export function moveGroup(b:Build,id:string,move:Move,given:Record<string,Frame>){
 // What hangs on a shaft of the group rides on it.
 const frames={...shaftFrames(b.train),...given},c=contents(b,id),riding=new Set(c.shafts.map(s=>shaftBody(s.id))),rides=(f:Free)=>!!f.body&&riding.has(f.body),inside=new Set(c.plates.map(p=>p.id)),axis:V=move.axis==='y'?[0,1,0]:[0,0,1],q=axisAngle(axis,move.angle??0),centre=move.centre??centreOf(b,id,frames);
 const at=(p:V):V=>add(add(rotate(q,sub(p,centre)),centre),move.delta);
 const free=(f:Free)=>{const w=worldOf(f,frames),next=reframe({frame:{position:at(w.position),rotation:multiply(q,w.rotation)}},f.body,frames);f.frame=next.frame;};
 for(const p of c.plates)if(!rides(p.free))free(p.free);
 for(const i of c.items){if(i.free){if(!rides(i.free))free(i.free);continue;}if(inside.has(i.plate!))continue;
  const n=b.plates.find(p=>p.id===i.plate);if(!n)continue;const plate=worldOf(n.free,frames),world=compose(plate,{position:[i.at[0],i.at[1],0],rotation:[0,0,0,1]}).position,local=compose(inverse(plate),{position:at(world),rotation:[0,0,0,1]}).position;i.at=[local[0],local[1]];if(move.axis!=='y')i.angle=(((i.angle+(move.angle??0))%360)+360)%360;}
 for(const s of c.shafts){const p=at([s.at[0],0,s.at[1]]);s.at=[p[0],p[2]];}
 for(const w of c.wheels)w.z+=move.delta[1];
}

const fresh=(prefix:string)=>`${prefix}-${crypto.randomUUID().slice(0,8)}`;
/** A copy of a group for the library: in the room (nothing hangs on a link; on a shaft of the block it stays), standing on
 * the floor over the origin. */
export function blockOf(b:Build,id:string,given:Record<string,Frame>):Block{
 const g=groupsOf(b).find(x=>x.id===id);if(!g)throw Error('Gruppe fehlt.');const c=contents(b,id),frames={...shaftFrames(b.train),...given},own=new Set(c.shafts.map(s=>shaftBody(s.id))),keep=(f:Free)=>f.body&&own.has(f.body)?structuredClone(f):{frame:worldOf(f,frames)};
 const groups=groupsOf(b).filter(x=>c.groups.has(x.id)).map(x=>x.id===id?{id:x.id,label:x.label,kind:x.kind}:structuredClone(x));
 const inside=new Set(c.plates.map(p=>p.id)),items=c.items.map(i=>{const x=structuredClone(i);if(x.free)x.free=keep(x.free);else if(!inside.has(x.plate!)){const n=b.plates.find(p=>p.id===x.plate)!,f=compose(worldOf(n.free,frames),{position:[x.at[0],x.at[1],0],rotation:[0,0,0,1]});delete x.plate;x.free={frame:f};}return x;});
 const plates=c.plates.map(p=>({...structuredClone(p),free:keep(p.free)})),shafts=structuredClone(c.shafts),wheels=structuredClone(c.wheels),used=new Set(items.map(i=>i.part));
 const part:Build={id:'baustein',label:g.label,plates,items,parts:[],grid:b.grid,groups,train:{...newTrain(),shafts,wheels}};
 const at=shaftFrames(part.train),centre=centreOf(part,id,{}),low=Math.min(...items.filter(i=>i.free).map(i=>worldOf(i.free!,at).position[2]),...plates.map(p=>worldOf(p.free,at).position[2]-p.thickness),...wheels.map(w=>shafts.find(s=>s.id===w.shaft)!.at[1]-outerOf(w)));
 moveGroup(part,id,{delta:[-centre[0],-centre[1],Number.isFinite(low)?-low:0]},{});
 const t=b.train,mine=(s:string)=>shafts.some(x=>x.id===s);return {id:fresh('baustein'),label:g.label,groups,items,plates,shafts,wheels,parts:b.parts.filter(p=>used.has(p.id)).map(p=>structuredClone(p)),inputs:t?inputsOf(t).filter(i=>mine(i.shaft)):[],outputs:t?outputsOf(t).filter(mine):[]};}
/** Puts a block into the build with new names, its floor point at `at`. Returns the id of its outer group. */
export function insertBlock(b:Build,block:Block,at:V):string{
 const names=new Map<string,string>(),name=(old:string,prefix:string)=>{let n=names.get(`${prefix}:${old}`);if(!n){n=fresh(prefix);names.set(`${prefix}:${old}`,n);}return n;};
 const top=block.groups.find(g=>!g.parent||!block.groups.some(x=>x.id===g.parent))!;
 const groups=block.groups.map(g=>{const x:Group={id:name(g.id,'gruppe'),label:g.label,kind:kindOfOld(g)};if(g.id!==top.id&&g.parent)x.parent=name(g.parent,'gruppe');return x;});
 // On a shaft of the block: on the same shaft of the copy.
 const onto=(f:Free|undefined)=>{if(!f)return f;const s=shaftOfBody(f.body);return s?{...structuredClone(f),body:shaftBody(name(s,'w'))}:structuredClone(f);};
 const plates=block.plates.map(p=>({...structuredClone(p),id:name(p.id,'platte'),free:onto(p.free)!,...(p.group?{group:name(p.group,'gruppe')}:{})}));
 const items=block.items.map(i=>({...structuredClone(i),id:name(i.id,'t'),...(i.free?{free:onto(i.free)}:{}),...(i.group?{group:name(i.group,'gruppe')}:{}),...(i.plate?{plate:name(i.plate,'platte')}:{})}));
 const shafts=block.shafts.map(s=>({...structuredClone(s),id:name(s.id,'w')})),wheels=block.wheels.map(w=>({...structuredClone(w),id:name(w.id,'r'),shaft:name(w.shaft,'w'),...(w.group?{group:name(w.group,'gruppe')}:{})}));
 for(const p of block.parts)if(!b.parts.some(x=>x.id===p.id))b.parts.push(structuredClone(p));
 b.groups=[...groupsOf(b),...groups];b.plates.push(...plates);b.items.push(...items);
 if(wheels.length){const t=b.train??=newTrain();t.shafts.push(...shafts);t.wheels.push(...wheels);const ins=block.inputs??(block.input?[{shaft:block.input,drive:t.drive}]:[]),outs=block.outputs??(block.output?[block.output]:[]);setEnds(t,[...inputsOf(t),...ins.map(i=>({...i,shaft:name(i.shaft,'w')}))],[...outputsOf(t),...outs.map(o=>name(o,'w'))]);}
 const id=name(top.id,'gruppe');moveGroup(b,id,{delta:at},{});return id;}
/** Checks the groups of a parsed build: known parents, no loops, members that point at groups that exist. */
export function parseGroups(value:unknown):Group[]|undefined{
 if(value===undefined)return undefined;if(!Array.isArray(value)||value.length>200)throw Error('Aufbau: Gruppen ungültig');
 const out=value.map(g=>{if(!g||typeof g.id!=='string'||!g.id||typeof g.label!=='string'||!(g.kind in kindNames||g.kind==='traeger')&&typeof g.rigid!=='boolean'||g.parent!==undefined&&typeof g.parent!=='string')throw Error('Aufbau: Gruppe ungültig');return {id:g.id,label:g.label.slice(0,80),kind:kindOfOld(g),...(g.parent?{parent:g.parent}:{})} as Group;});
 if(new Set(out.map(g=>g.id)).size!==out.length)throw Error('Aufbau: Gruppe doppelt');
 for(const g of out){if(g.parent&&!out.some(x=>x.id===g.parent))throw Error('Aufbau: Gruppe ohne Obergruppe');const seen=new Set<string>();for(let x:Group|undefined=g;x;x=out.find(y=>y.id===x!.parent)){if(seen.has(x.id))throw Error('Aufbau: Gruppen im Kreis');seen.add(x.id);}}
 return out;}
/** Files and blocks from before: fest and Träger are a Körper (standing), frei is an Ordnung. */
function kindOfOld(g:{kind?:unknown;rigid?:unknown}):GroupKind{return g.kind==='ordnung'||g.rigid===false&&g.kind===undefined?'ordnung':'koerper';}

// ---------- the tree: order and moving things around ----------
/** The direct members of a group (or of the build) in the order of the tree: `order` first, the rest after. */
export function orderedChildren(b:Build,id?:string):Member[]{const at=new Map((b.order??[]).map((k,i)=>[k,i]));return childrenOf(b,id).map((m,i)=>({m,i})).sort((x,y)=>(at.get(keyOf(x.m))??1e6+x.i)-(at.get(keyOf(y.m))??1e6+y.i)).map(x=>x.m);}
/** Moves a member in the tree: into a group (or to the top, without `into`), before `before` (else last). A wheel brings
 * the wheels on its shaft, a plate the parts on it; a group cannot go into itself. The tree only orders: connections stay.
 * Groups left empty go. */
export function moveMember(b:Build,m:Member,into:string|undefined,before:Member|undefined,frames:Record<string,Frame>={}){
 if(m.kind==='group'&&into&&(into===m.id||chain(b,into).some(g=>g.id===m.id)))throw Error('Eine Gruppe kann nicht in sich selbst.');
 if(before&&keyOf(before)===keyOf(m))return;const from=parentOf(b,m),moving:Member[]=[m];
 if(m.kind==='wheel'){const w=b.train?.wheels.find(x=>x.id===m.id);for(const o of b.train?.wheels??[])if(w&&o.id!==w.id&&o.shaft===w.shaft)moving.push({kind:'wheel',id:o.id});}
 if(m.kind==='plate')for(const i of b.items)if(i.plate===m.id&&i.group===from)moving.push({kind:'item',id:i.id});
 void frames;for(const x of moving)setParent(b,x,into);
 // The order: every member once; the moved ones before `before`.
 const all=(id?:string):string[]=>childrenOf(b,id).flatMap(x=>[keyOf(x),...(x.kind==='group'?all(x.id):[])]),keys=new Set(moving.map(keyOf)),order=[...(b.order??[]).filter(k=>all().includes(k)),...all().filter(k=>!(b.order??[]).includes(k))].filter(k=>!keys.has(k)),at=before?order.indexOf(keyOf(before)):-1;
 order.splice(at<0?order.length:at,0,...moving.map(keyOf));b.order=order;
 // Groups left empty go, outwards.
 for(let id=from;id;){const g=groupsOf(b).find(x=>x.id===id);if(!g||childrenOf(b,id).length)break;b.groups=groupsOf(b).filter(x=>x.id!==id);id=g.parent;}if(b.groups&&!b.groups.length)delete b.groups;}
