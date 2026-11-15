// Swing arms. The example "Schwinge um die Antriebsachse": the z40 sits on a swing arm about the z20's axle, from −30°
// to 45°. The mesh holds (round the pivot the distance stays). The frame keeps its two plates (the axle's outer bearings
// and the post), the swing arm gets two of its own (its shaft's bearings and the axle's inner ones) with bolts and
// columns of their own. Where the swinging shaft goes through the frame's upper plate there is a slot along its arc;
// swung further it crosses the web to the post: the slot gets its ring of material and the wheel is reported at the post.
// The frame's bolts stay clear of what swings. A wheel of the frame meshing the swinging one elsewhere meshes as drawn
// only. A belt to a swinging pulley is tensioned by swinging. A motor alone on a swing arm gets its plate with the
// pivot's bearing in it. In the solids: the slot is missing from the plate, a pose swings shaft and plates.
import assert from 'node:assert/strict';import fs from 'node:fs';
import opencascade from 'replicad-opencascadejs';
import {setOC,measureVolume,localGC} from 'replicad';
import {parseShaft,newShaft} from '../../src/shaft/model.ts';
import {rund} from '../../src/shaft/profile.ts';
import {parseGear,newGear} from '../../src/gear/model.ts';
import {planGear} from '../../src/gear/plan.ts';
import {primDistance,rot} from '../../src/gear/sweep.ts';
import {buildGearParts} from '../../src/gear/cad.ts';
import {gearExamples} from '../../src/gear/examples.ts';
import {topView,posePlan} from '../../src/gear/draw.ts';
import {gearNotes} from '../../src/gear/notes.ts';
const near=(a,e,t,w)=>assert.ok(Math.abs(a-e)<=t,`${w}: ${a} statt ${e}`),say=p=>p.issues.map(i=>`${i.level}: ${i.message}`).join(' | '),errors=p=>p.issues.filter(i=>i.level==='fehler');
const ex=gearExamples.find(x=>x.key==='schwinge'),files={},ids={};for(const s of ex.shafts){ids[s.key]=s.key;files[s.key]={name:s.name,doc:parseShaft(s.doc)};}
const base=ex.make(ids),doc=o=>parseGear({...base,...o}),group=o=>[{...base.groups[0],...o}];
// The file format keeps the swing arm.
assert.deepEqual(parseGear(JSON.parse(JSON.stringify(doc({})))).groups,base.groups);assert.throws(()=>parseGear({...base,groups:group({to:-40})}));
{const p=planGear(doc({}),files),g=p.groups[0];
 assert.deepEqual(p.issues.filter(i=>i.level!=='hinweis'),[],say(p));assert.deepEqual([g.pivot,g.at,g.shafts],['p',[0,0],['b']]);
 assert.equal(p.meshes.length,1);near(p.rates.b,-.5,1e-9,'Übersetzung');
 // Plates: the frame's, then the swing arm's.
 assert.deepEqual(p.layers.map(l=>[l.body,l.bearings.slice().sort()]),[['',['g/l1','p/l1']],['',['g/l2','p/l4']],['g1',['b/l1','p/l2']],['g1',['b/l2','p/l3']]]);
 assert.deepEqual(p.layers.map(l=>l.lips),[[true,false],[false,true],[true,false],[false,true]],'Anschläge außen je Körper');
 // The swinging shaft through the frame's upper plate: a slot along its arc. The post through the swing arm's plates the other way round.
 assert.deepEqual(p.layers[1].holes,[{on:'b',r:4.5,arc:{c:[0,0],from:-30,to:45}}]);assert.deepEqual(p.layers[2].holes.map(h=>[h.on,h.arc]),[['g',{c:[0,0],from:-45,to:30}]]);
 // Bolts and columns per body; the frame's stay clear of the swinging wheel (r 21 on a 30 mm arc) and plates.
 const mine=b=>p.bolts.filter(x=>x.body===b);assert.ok(mine('').length>=3&&mine('g1').length>=3,say(p));assert.deepEqual(p.columns.map(c=>[c.body,c.z0,c.z1]),[['',9,70],['g1',37,52]]);
 const wheel={a:[30,0],ra:21,b:[30,0],rb:21,sweep:{c:[0,0],from:-30,to:45}};for(const b of mine(''))assert.ok(primDistance(b.at,wheel)>=b.eye+1-1e-6,`Bolzen ${b.at} im Schwenkweg des Rads`);
 for(const b of mine('g1'))assert.deepEqual(Object.keys(b.attach).sort(),['s3','s4']);
 assert.ok(p.bom.some(x=>/Platte Schicht 3, Schwinge/.test(x.what))&&p.bom.filter(x=>/Distanzsäule/.test(x.what)).length===2);
 // The view and the notes.
 const svg=topView(p,p.layers[1]);assert.match(svg,/class="hole-arc"/);assert.match(svg,/class="swing"/);assert.match(svg,/class="pivot"/);assert.match(topView(p,p.layers[2]),/swing-plate/);
 const posed=posePlan(p,{turn:0,groups:{g1:45}});near(posed.shafts.find(x=>x.id==='b').at[0],30*Math.SQRT1_2,1e-9,'geschwenkte Welle');assert.deepEqual([posed.layers[1].holes[0].arc,posed.layers[1].holes[0].base],[{c:[0,0],from:-30,to:45},[30,0]],'der Ausschnitt bleibt in seiner Platte');near(posed.layers[2].holes[0].base[1],-45*Math.SQRT1_2,1e-9,'der Ausschnitt in der Platte der Schwinge schwenkt mit ihr');
 const notes=gearNotes('Test',doc({}),p);assert.match(notes,/Schwinge: schwenkt -30° bis 45° um Achse z20/);assert.match(notes,/Schicht 2: Ausschnitt im Bogen für Schwingenrad z40, 9 mm breit, 75° lang/);}
// Swung further: the arc crosses the web from the axle to the post (straight down): the slot gets its ring, and the wheel meets the post.
{const p=planGear(doc({groups:group({from:-120})}),files),h=p.layers[1].holes[0];assert.equal(h.ring,4.5+3,say(p));assert.ok(p.issues.some(i=>i.level==='fehler'&&/z40 m1 auf Schwingenrad z40 stößt beim Schwenken an Stütze/.test(i.message)),say(p));}
// The range to zero: nothing moves, the hole is round again.
{const p=planGear(doc({groups:group({from:0,to:0})}),files);assert.deepEqual(p.layers[1].holes,[{on:'b',r:4.5}]);assert.deepEqual(errors(p),[]);}
// A wheel of the frame meshing the swinging wheel beside the pivot: as drawn only. Swinging away it opens; towards it would run in.
{const side={name:'Seitenrad z20',doc:parseShaft({...newShaft(),length:80,items:[{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z20',x:38,bore:rund(8)},{id:'l2',part:'lager-608',x:70}]})},f={...files,side};
 const p=planGear(doc({shafts:[...base.shafts,{id:'c',shaft:'side',at:[60,0],z:0}]}),f);assert.equal(p.meshes.length,2);assert.ok(p.issues.some(i=>i.level==='warnung'&&/z40 m1 auf Schwingenrad z40 kämmt mit z20 m1 auf Seitenrad z20 nur in der gezeichneten Stellung/.test(i.message)),say(p));assert.ok(!p.issues.some(i=>/läuft .* hinein/.test(i.message)));
 const q=planGear(doc({shafts:[...base.shafts,{id:'c',shaft:'side',at:rot([60,0],[30,0],100).map(v=>+v.toFixed(4)),z:0}]}),f);assert.ok(q.issues.some(i=>i.level==='fehler'&&/läuft z20 m1 auf Seitenrad z20 in z40 m1 auf Schwingenrad z40 hinein|läuft z40 m1 auf Schwingenrad z40 in z20 m1 auf Seitenrad z20 hinein/.test(i.message)),say(q));}
// A shaft on two swing arms.
assert.ok(planGear(doc({groups:[...base.groups,{id:'g2',name:'Zweite',pivot:'g',shafts:['b'],from:-5,to:5}]}),files).issues.some(i=>/gehört schon zu einer anderen Schwinge/.test(i.message)));
// Link on link is allowed (the pivot on another swing arm); a chain that hangs on itself is not.
{const p=planGear(doc({groups:[...base.groups,{id:'g2',name:'Zweite',pivot:'b',shafts:['g'],from:-5,to:5}]}),files);assert.equal(p.groups[1].parent,'g1');assert.ok(!p.issues.some(i=>/an ihr selbst hängt/.test(i.message)));}
assert.ok(planGear(doc({groups:[...base.groups,{id:'g2',name:'Zweite',pivot:'b',shafts:['p'],from:-5,to:5}]}),files).issues.some(i=>/an ihr selbst hängt/.test(i.message)));
// A swing arm that does not hang on its pivot (the axle's inner bearings gone).
{const bare={...files,ac:{name:'Achse z20',doc:parseShaft({...files.ac.doc,items:files.ac.doc.items.filter(i=>i.id!=='l2'&&i.id!=='l3')})}},p=planGear(doc({}),bare);assert.ok(p.issues.some(i=>/Schwinge hängt nicht an ihrer Drehachse/.test(i.message)),say(p));}
// Layers set by hand belong to the frame or to a swing arm.
{const auto=planGear(doc({}),files),p=planGear(doc({layers:auto.layers.map(l=>({id:l.id,z0:l.z0,z1:l.z1,...(l.body?{group:l.body}:{})}))}),files);assert.deepEqual(p.layers.map(l=>[l.body,l.bearings.slice().sort()]),auto.layers.map(l=>[l.body,l.bearings.slice().sort()]));}
// ---- a motor on a swing arm tensions its belt by swinging ----
{const motor={name:'Motor z16',doc:parseShaft({...newShaft(),length:34,items:[{id:'r',part:'gt2-z16',x:16.5,bore:rund(8)}],inserts:[{id:'m',part:'motor-nema17-40',end:'links',depth:15}],works:[{id:'s',kind:'madenschraube',x:7,m:3}]})},
  out={name:'Riemen z40',doc:parseShaft({...newShaft(),length:60,items:[{id:'l1',part:'lager-608',x:12},{id:'r',part:'gt2-z40',x:22,bore:rund(8)},{id:'l2',part:'lager-608',x:50}]})},
  post={name:'Zapfen',doc:parseShaft({...newShaft(),length:60,items:[{id:'l0',part:'lager-608',x:1},{id:'l1',part:'lager-608',x:12},{id:'l2',part:'lager-608',x:50}]})},f={motor,out,post};
 // The motor's flange at z 0.5, its plate above it; the post offers a bearing in the plate's height and two more for the frame,
 // whose lower plate lies above the motor's.
 const d=parseGear({...newGear(),shafts:[{id:'m',shaft:'motor',at:[0,0],z:5.5},{id:'o',shaft:'out',at:[72,0],z:0},{id:'z',shaft:'post',at:[0,45],z:-.5}],belts:[{id:'r1',a:{on:'m',item:'r'},b:{on:'o',item:'r'}}],input:'m',groups:[{id:'g1',name:'Motorschwinge',pivot:'z',shafts:['m'],from:-6,to:6}]});
 const p=planGear(d,f),plate=p.layers.find(l=>l.motor);
 assert.ok(plate&&plate.body==='g1',say(p));assert.ok(plate.bearings.includes('motor:m')&&plate.bearings.includes('z/l0'),'die Motorplatte hängt am Lager der Drehachse: '+plate.bearings);assert.equal(p.motors[0].layer,plate.id);
 const b=p.belts[0];assert.ok(b.swing&&b.swing.group==='g1'&&b.swing.range[0]<b.length&&b.swing.range[1]>b.length,'der Riemen wird durch Schwenken länger und kürzer');
 assert.ok(p.issues.some(i=>/Normriemen 200 mm passt, gespannt durch Schwenken von Motorschwinge/.test(i.message)),say(p));assert.ok(!p.issues.some(i=>/nur in der gezeichneten Stellung/.test(i.message)));
 // The frame holds the post with its other bearings.
 assert.ok(p.layers.some(l=>!l.body&&l.bearings.includes('z/l1')),say(p));}
// ---- solids ----
const oc=await opencascade({print:()=>{},printErr:()=>{},wasmBinary:fs.readFileSync('node_modules/replicad-opencascadejs/dist/replicad_single.wasm')});setOC(oc);
const build=(d,pose)=>{const p=planGear(d,files),[keep,gc]=localGC(),parts=buildGearParts(d,p,files,keep,pose),out=parts.map(x=>({name:x.name,file:x.file,kind:x.kind,v:measureVolume(x.shape),b:x.shape.boundingBox.bounds}));gc();return out;};
{// The same bolts in all three, set by hand: else they move out of the way and the plate changes with them.
 const bolts=[[0,38],[0,-63],[-20,-11.5]],still=build(doc({bolts,groups:group({from:0,to:0})})),swung=build(doc({bolts})),plate=l=>l.find(x=>x.file==='schicht-2'),t=8.5;
 assert.deepEqual([...new Set(swung.filter(x=>x.kind==='platte').map(x=>x.file))],['schicht-1','schicht-2','schicht-3','schicht-4']);assert.equal(swung.filter(x=>x.file==='saeule-2').length,swung.filter(x=>x.file==='saeule-1').length);
 // The swinging shaft's way lies beside the frame's upper plate as it is: nothing is cut, the plate is the same.
 near(plate(swung).v,plate(still).v,plate(still).v*.002,'Platte neben dem Bogen unverändert');
 // Swung to the post's web: the ring of material comes on (a band 15 wide along the arc), the slot 9 wide goes out of it.
 const far=build(doc({bolts,groups:group({from:-120})})),arc=30*150*Math.PI/180;/* Part of the band lies on the web that was there, and the slot takes some of that web: at least a third of the band's own rim is new. */assert.ok(plate(far).v>plate(still).v+(arc*15-arc*9)*t/3,`Ring um den Ausschnitt: ${plate(far).v} gegen ${plate(still).v}`);near(plate(far).b[1][0],30+7.5,.05,'der Ring reicht bis zur Welle samt Rand');
 // A pose swings the shaft, the swing arm's plates and its columns, not the frame's.
 const posed=build(doc({bolts}),{turn:0,groups:{g1:45}}),mid=x=>[(x.b[0][0]+x.b[1][0])/2,(x.b[0][1]+x.b[1][1])/2],shaft=l=>l.find(x=>/^Welle · Schwingenrad/.test(x.name));
 near(mid(shaft(swung))[0],30,.01,'gezeichnet');near(mid(shaft(posed))[0],30*Math.SQRT1_2,.01,'geschwenkt x');near(mid(shaft(posed))[1],30*Math.SQRT1_2,.01,'geschwenkt y');
 const p3=l=>l.find(x=>x.file==='schicht-3'),p1=l=>l.find(x=>x.file==='schicht-1');assert.ok(Math.abs(p3(posed).b[1][1]-p3(swung).b[1][1])>5,'die Platte der Schwinge schwenkt mit');near(p1(posed).b[1][1],p1(swung).b[1][1],1e-6,'das Gestell steht');near(p3(posed).v,p3(swung).v,1,'gleiche Platte');}
console.log('Schwingen: Eingriff um die Drehachse, Platten, Bolzen und Säulen je Körper, Ausschnitt im Bogen (mit Materialrand, wo er die Platte schneidet), Anstoßen beim Schwenken, Eingriff nur in der gezeichneten Stellung, Riemen durch Schwenken gespannt, Motorplatte am Lager der Drehachse; als Volumen und in einer Stellung.');
