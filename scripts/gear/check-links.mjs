// Links of an arm, driven from the frame. The example "Zwei Gelenke, beide Motoren im Gestell": motor 1 turns the first
// joint's shaft through z20/z40, lever 1 sits fast on that shaft (a hub with the shaft's D profile instead of a bearing).
// Motor 2 drives a z40 that runs free on the same shaft; on the lever a z20 rolls on it and turns the second joint's
// shaft, on which lever 2 sits fast. So lever 1 follows motor 1 alone, lever 2 both: swinging lever 1 with motor 2 at
// rest rolls the z20 round the idler. For ±90° at both joints motor 1 turns ±180°, motor 2 ±270°. Each lever has plates
// of its own, a hub on its pivot; lever 2 hangs on lever 1 (link on link) and is seen from the frame through both motions.
// A lever nothing drives is reported; a lever on a round seat gets a set screw; an idler with a cross bore is refused.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC} from 'replicad';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {planShaft} from '../../src/shaft/plan.ts';
import {parseGear} from '../../src/gear/model.ts';
import {planGear,HUB_WALL} from '../../src/gear/plan.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
import {topView,posePlan} from '../../src/gear/draw.ts';
import {gearNotes} from '../../src/gear/notes.ts';
const near=(a,e,t,w)=>assert.ok(Math.abs(a-e)<=t,`${w}: ${a} statt ${e}`),say=p=>p.issues.map(i=>`${i.level}: ${i.message}`).join(' | ');
// ---- the idler in the shaft generator ----
{const ex=gearExamples.find(x=>x.key==='arm').shafts.find(s=>s.key==='j1'),doc=parseShaft(ex.doc),p=planShaft(doc),f=p.placed.find(t=>t.id==='f');
 assert.ok(f.free&&/Losrad/.test(f.label));assert.ok(!p.placed.find(t=>t.id==='g').free);assert.deepEqual(p.issues.filter(i=>i.level==='fehler'),[]);assert.ok(p.issues.some(i=>/dreht frei auf Ø8: Gleitsitz/.test(i.message)));
 assert.equal(parseShaft(JSON.parse(JSON.stringify(doc))).items.find(i=>i.id==='f').free,true,'das Dateiformat behält es');
 const lego=planShaft({...newShaft(),length:40,items:[{id:'z',part:'lego-3648b',x:10,free:true}]});assert.ok(lego.issues.some(i=>i.level==='fehler'&&/ein Losrad braucht eine runde Bohrung/.test(i.message)));
 // Only wheels can run free.
 assert.ok(!planShaft({...newShaft(),length:40,items:[{id:'b',part:'lager-608',x:10,free:true}]}).placed[0].free);}
// ---- the example ----
const ex=gearExamples.find(x=>x.key==='arm'),files={},ids={};for(const s of ex.shafts){ids[s.key]=s.key;files[s.key]={name:s.name,doc:parseShaft(s.doc)};}
const base=ex.make(ids),doc=o=>parseGear({...base,...o}),groups=(...o)=>base.groups.map((g,i)=>({...g,...(o[i]??{})}));
assert.deepEqual(parseGear(JSON.parse(JSON.stringify(doc({})))).groups,base.groups,'fest bleibt im Dateiformat');
{const p=planGear(doc({}),files),d=p.drive;
 assert.deepEqual(p.issues.filter(i=>i.level!=='hinweis'),[],say(p));assert.deepEqual(p.groups.map(g=>[g.id,g.fixed,g.parent]),[['g1',true,''],['g2',true,'g1']]);
 // The wheel on the joint's shaft runs free: three meshes, none of them a contradiction.
 assert.ok(p.wheels.find(w=>w.key==='j1/f').free);assert.equal(p.meshes.length,3);
 // Drives and what they turn.
 assert.deepEqual(d.inputs.map(i=>i.id),['m1','m2']);assert.deepEqual(d.shafts.j1,[-.5,0]);assert.deepEqual(d.wheels['j1/f'],[0,-.5],'das Losrad dreht nur mit Motor 2');
 assert.deepEqual(d.joints.g1,[-.5,0]);assert.deepEqual(d.joints.g2,[-1,1],'Hebel 2 hängt an beiden Motoren');assert.deepEqual(d.shafts.j2,[-1.5,1]);
 assert.deepEqual(d.needs,{m1:[-180,180],m2:[-270,270]});assert.ok(d.lines.some(t=>/Hebel 2 schwenkt −1 × Motor 1 z20 \+ 1 × Motor 2 z20 \(gekoppelt/.test(t)),d.lines.join(' | '));assert.ok(d.lines.some(t=>/Motor 2 z20 dreht für alle Bereiche -270° bis 270°/.test(t)));
 assert.equal(p.rates.j1,-.5);assert.equal(p.rates.m2,undefined,'Motor 2 hängt nicht am ersten Antrieb');
 // Plates: the frame's two, lever 1's two, lever 2's one (a pair); each lever with its hub on its pivot.
 assert.deepEqual(p.layers.map(l=>[l.body,l.pair,l.bearings.slice().sort()]),[['',false,['j1/l1','motor:m1','motor:m2']],['',false,['j1/l2','m2/l']],['g1',false,['j2/l1','nabe:s3']],['g1',false,['j2/l2','nabe:s4']],['g2',true,['e/l','nabe:s5']]]);
 const hub=p.bearings.find(b=>b.key==='nabe:s3');assert.deepEqual(hub.hub.profile,{kind:'d',d:8,flat:.8});assert.equal(hub.on,'j1');assert.equal(hub.D,8+2*HUB_WALL);assert.deepEqual(hub.at,[0,0]);
 assert.ok(!p.issues.some(i=>/Madenschraube M3 in der Nabe/.test(i.message)),'auf dem D braucht es keine');
 // Bolts and columns per body.
 for(const body of ['','g1','g2'])assert.ok(p.bolts.filter(b=>b.body===body).length>=3,`Bolzen ${body}`);assert.deepEqual(p.columns.map(c=>[c.body,c.z0,c.z1]),[['',9,36],['g1',68,76]]);
 // Seen from the frame, lever 2's shaft moves with both joints.
 const far=p.obstacles.length;assert.ok(far>0);
 // The view: hubs, the idler marked; a pose carries lever 2 with lever 1 and turns it about the moved joint.
 const svg=topView(p,p.layers[2]);assert.match(svg,/class="hub"/);assert.match(topView(p,p.layers[1]),/class="wheel free/);
 const posed=posePlan(p,{turn:0,groups:{g1:90,g2:90}}),at=id=>posed.shafts.find(x=>x.id===id).at;near(at('j2')[0],0,1e-9,'Gelenk 2 x');near(at('j2')[1],30,1e-9,'Gelenk 2 y');near(at('e')[0],-25,1e-9,'Abtrieb x: Hebel 2 steht quer zu Hebel 1');near(at('e')[1],30,1e-9,'Abtrieb y');
 const notes=gearNotes('Arm',doc({}),p);assert.match(notes,/Antriebe und Gelenke/);assert.match(notes,/Nabe von Hebel 1 auf Gelenk 1: Bohrung im Profil der Welle/);}
// The idler made fast: motor 2 then turns the same shaft as motor 1 (one drive), and the wheel on the lever no longer rolls: lever 2 stands on lever 1.
{const fast={...files,j1:{name:'Gelenk 1',doc:parseShaft({...files.j1.doc,items:files.j1.doc.items.map(i=>({...i,free:false}))})}},p=planGear(doc({}),fast);assert.deepEqual(p.drive.inputs.map(i=>i.id),['m1'],say(p));assert.deepEqual(p.drive.joints.g2,[0]);assert.deepEqual(p.drive.shafts.m2,[1]);}
// Lever 2 swinging freely instead: it is moved by hand, no motor turns it; its pivot's bearings are lever 1's.
{const p=planGear(doc({groups:groups({},{fixed:false})}),files);assert.deepEqual(p.drive.inputs.map(i=>i.id),['m1','m2','schwinge:g2']);assert.deepEqual(p.drive.joints.g2,[0,0,1]);assert.ok(!p.bearings.some(b=>b.key==='nabe:s5'));}
// A lever on a shaft nothing drives.
{const p=planGear(doc({shafts:base.shafts.filter(s=>s.id!=='m1'),input:'m2'}),files);assert.ok(p.issues.some(i=>i.level==='warnung'&&/Hebel 1 sitzt fest auf Gelenk 1, aber nichts treibt diese Welle/.test(i.message)),say(p));}
// A round seat: the hub clamps with a set screw.
{const round={...files,j1:{name:'Gelenk 1',doc:parseShaft({...files.j1.doc,sections:undefined})}},p=planGear(doc({}),round);assert.ok(p.issues.some(i=>i.level==='hinweis'&&/Hebel 1 sitzt auf rundem Ø8 von Gelenk 1; eine Madenschraube M3 in der Nabe klemmt sie/.test(i.message)),say(p));assert.equal(p.bearings.find(b=>b.key==='nabe:s3').hub.profile.kind,'rund');}
// The pivot too short for the lever's plate.
{const short={...files,j2:{name:'Gelenk 2',doc:parseShaft({...files.j2.doc,length:40,sections:undefined})}},p=planGear(doc({}),short);assert.ok(p.issues.some(i=>/Gelenk 2 reicht nicht durch die Platte von Hebel 2/.test(i.message)),say(p));}
// Lever 1 swung so far that lever 2's end runs into motor 2's shaft is reported with both motions in it.
{const p=planGear(doc({groups:groups({from:-180,to:180})}),files);assert.ok(p.issues.some(i=>i.level==='fehler'&&/stößt beim Schwenken an/.test(i.message)),say(p));}
// ---- solids ----
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const build=(d,f,pose)=>{const p=planGear(d,f),[keep,gc]=localGC(),parts=buildGearParts(d,p,f,keep,pose),out=parts.map(x=>({name:x.name,file:x.file,kind:x.kind,v:measureVolume(x.shape),b:x.shape.boundingBox.bounds}));gc();return {p,out};};
{const bolts=[[15,-56],[-53,27],[21,18],[-40,-29]],{out}=build(doc({bolts}),files),round={...files,j1:{name:'Gelenk 1',doc:parseShaft({...files.j1.doc,sections:undefined})}},plain=build(doc({bolts}),round).out,plate=(l,k)=>l.find(x=>x.file===`schicht-${k}`);
 assert.deepEqual([...new Set(out.filter(x=>x.kind==='platte').map(x=>x.file))],['schicht-1','schicht-2','schicht-3','schicht-4','schicht-5-unten','schicht-5-oben']);
 // The D bore takes a little less out of lever 1's plate than the round one of the same Ø (the flat stays), which also has the tap drill.
 const t=8.5,flat=4.1**2*Math.acos(3.3/4.1)-3.3*Math.sqrt(4.1**2-3.3**2);assert.ok(plate(out,3).v>plate(plain,3).v+flat*t*.8,`D-Bohrung: ${plate(out,3).v} gegen rund ${plate(plain,3).v}`);
 assert.ok(plate(out,3).v-plate(plain,3).v<flat*t+Math.PI*1.25**2*(8+3+1),'und nicht mehr als Abflachung und Kernloch');
 // A pose: lever 1 a quarter turn, lever 2 another against it.
 const posed=build(doc({bolts}),files,{turn:0,groups:{g1:90,g2:90}}).out,mid=x=>[(x.b[0][0]+x.b[1][0])/2,(x.b[0][1]+x.b[1][1])/2],shaft=(l,name)=>l.find(x=>x.name.startsWith(`Welle · ${name}`));
 near(mid(shaft(out,'Abtrieb'))[0],55,.01,'gezeichnet');near(mid(shaft(posed,'Abtrieb'))[0],-25,.01,'Abtrieb in der Stellung x');near(mid(shaft(posed,'Abtrieb'))[1],30,.01,'y');near(mid(shaft(posed,'Gelenk 2'))[1],30,.2,'Gelenk 2 in der Stellung');
 near(plate(posed,1).b[1][0],plate(out,1).b[1][0],1e-6,'das Gestell steht');near(plate(posed,3).v,plate(out,3).v,1,'Hebel 1 dieselbe Platte');assert.ok(Math.abs(plate(posed,3).b[1][1]-plate(out,3).b[1][1])>10,'und geschwenkt');
 const l5=l=>l.find(x=>x.file==='schicht-5-unten');assert.ok(mid(l5(posed))[0]<0&&mid(l5(posed))[1]>20,`Hebel 2 mit beiden Gelenken geschwenkt: ${mid(l5(posed))}`);}
console.log('Glieder: Losrad im Wellen-Plan, Hebel fest mit Nabe im Wellenprofil, Glied an Glied, zwei Motoren im Gestell mit gekoppelten Gelenken und nötigen Motorwegen, ohne Losrad nur ein Antrieb, freies Glied von Hand, Hebel ohne Antrieb, runder Sitz mit Madenschraube, zu kurze Achse, Anstoßen über zwei Gelenke; als Volumen und in einer Stellung.');
