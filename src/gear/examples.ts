// Gearboxes to start from. Each brings its shafts: they are written into the shaft generator's files, the gearbox links
// to them.
import {newShaft} from '../shaft/model.ts';
import type {ShaftDoc} from '../shaft/model.ts';
import {rund} from '../shaft/profile.ts';
import {newGear} from './model.ts';
import type {GearDoc} from './model.ts';

type Example={key:string;title:string;text:string;shafts:{key:string;name:string;doc:ShaftDoc}[];make:(ids:Record<string,string>)=>GearDoc};
const shaft=(items:ShaftDoc['items'],length=60):ShaftDoc=>({...newShaft(),length,items});
export const gearExamples:Example[]=[
 {key:'stufe',title:'Eine Stufe 1 : 2',text:'z20 treibt z40, Modul 1, zwei 608 je Welle: zwei Lagerschilde mit je einem Steg.',
  shafts:[{key:'an',name:'Antrieb z20',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z20',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])},
   {key:'ab',name:'Abtrieb z40',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])}],
  make:ids=>({...newGear(),shafts:[{id:'a',shaft:ids.an,at:[0,0],z:0},{id:'b',shaft:ids.ab,at:[30,0],z:0}],input:'a'})},
 {key:'riemen',title:'Motor mit Riemen GT2 z16 → z40',text:'Ein NEMA 17 unter der Platte, die Welle mit der z16-Scheibe auf seiner D-Welle; Langlöcher in Riemenrichtung spannen den Normriemen 200 mm.',
  shafts:[{key:'an',name:'Motorwelle z16',doc:{...shaft([{id:'r',part:'gt2-z16',x:16.5,bore:rund(8)}],34),inserts:[{id:'m',part:'motor-nema17-40',end:'links',depth:15}],works:[{id:'s',kind:'madenschraube',x:7,m:3}]}},
   {key:'ab',name:'Riemen z40',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'r',part:'gt2-z40',x:22,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])}],
  make:ids=>({...newGear(),shafts:[{id:'a',shaft:ids.an,at:[0,0],z:5.5},{id:'b',shaft:ids.ab,at:[72,0],z:0}],belts:[{id:'r1',a:{on:'a',item:'r'},b:{on:'b',item:'r'}}],input:'a'})},
 {key:'umweg',title:'Steg am Rad vorbei',text:'Eine Stufe mit Stützwelle; eine vierte Welle, nur oben gelagert, hängt mit ihrem z30 bis in die untere Schicht: der Steg muss außen herum oder in die Tiefe.',
  shafts:[{key:'an',name:'Antrieb z20',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z20',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])},
   {key:'ab',name:'Abtrieb z40',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])},
   {key:'st',name:'Stütze',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'l2',part:'lager-608',x:50}])},
   {key:'un',name:'Rad unten z30',doc:shaft([{id:'g',part:'stirnrad-m1-z30',x:8,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])}],
  make:ids=>({...newGear(),shafts:[{id:'a',shaft:ids.an,at:[0,0],z:0},{id:'b',shaft:ids.ab,at:[30,0],z:0},{id:'c',shaft:ids.st,at:[0,-40],z:0},{id:'d',shaft:ids.un,at:[-25,-20],z:0}],input:'a'})},
 {key:'hebel',title:'Abtrieb mit Hebel',text:'z20 treibt z40; auf dem Abtrieb sitzt zwischen den Schichten ein gedruckter Hebel, der ±45° schwenkt. Bolzen und Stege bleiben aus seinem Fächer.',
  shafts:[{key:'an',name:'Antrieb z20',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z20',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])},
   {key:'ab',name:'Abtrieb mit Hebel',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:20,bore:rund(8)},{id:'h',part:'hebel',x:34,width:6,arm:{length:35,width:10,angle:0,hole:4}},{id:'l2',part:'lager-608',x:50}])}],
  make:ids=>({...newGear(),shafts:[{id:'a',shaft:ids.an,at:[0,0],z:0},{id:'b',shaft:ids.ab,at:[30,0],z:0,turn:180}],input:'a',turn:{on:'b',from:-45,to:45}})},
 {key:'schwinge',title:'Schwinge um die Antriebsachse',text:'Das z40 sitzt auf einer Schwinge, die um die Achse des z20 schwenkt: der Eingriff bleibt. Die Schwinge hat eigene Platten; wo ihre Welle durch die obere Gestellplatte geht, entsteht ein Ausschnitt im Bogen.',
  shafts:[{key:'ac',name:'Achse z20',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'l2',part:'lager-608',x:30},{id:'g',part:'stirnrad-m1-z20',x:38,bore:rund(8)},{id:'l3',part:'lager-608',x:52},{id:'l4',part:'lager-608',x:70}],80)},
   {key:'sw',name:'Schwingenrad z40',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:10,bore:rund(8)},{id:'l2',part:'lager-608',x:24}],52)},
   {key:'st',name:'Stütze',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'l2',part:'lager-608',x:70}],80)}],
  make:ids=>({...newGear(),shafts:[{id:'p',shaft:ids.ac,at:[0,0],z:0},{id:'b',shaft:ids.sw,at:[30,0],z:28},{id:'g',shaft:ids.st,at:[0,-45],z:0}],input:'p',groups:[{id:'g1',name:'Schwinge',pivot:'p',shafts:['b'],from:-30,to:45}]})},
 {key:'arm',title:'Zwei Gelenke, beide Motoren im Gestell',text:'Motor 1 dreht die erste Gelenkwelle, auf der Hebel 1 fest sitzt. Motor 2 treibt ein Losrad auf derselben Achse; es läuft durch das Gelenk hindurch auf das Rad am Hebel und dreht so das zweite Gelenk mit Hebel 2.',
  shafts:[{key:'m1',name:'Motor 1 z20',doc:{...shaft([{id:'g',part:'stirnrad-m1-z20',x:16.5,bore:rund(8)}],34),inserts:[{id:'m',part:'motor-nema17-40',end:'links',depth:15}],works:[{id:'s',kind:'madenschraube',x:7,m:3}]}},
   {key:'m2',name:'Motor 2 z20',doc:{...shaft([{id:'l',part:'lager-608',x:30.5},{id:'g',part:'stirnrad-m1-z20',x:41.5,bore:rund(8)}],54),inserts:[{id:'m',part:'motor-nema17-40',end:'links',depth:15}],works:[{id:'s',kind:'madenschraube',x:7,m:3}]}},
   {key:'j1',name:'Gelenk 1',doc:{...shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:22,bore:rund(8)},{id:'l2',part:'lager-608',x:36},{id:'f',part:'stirnrad-m1-z40',x:47,bore:rund(8),free:true}],85),sections:[{x0:59,x1:85,profile:{kind:'d',d:8,flat:.8}}]}},
   {key:'j2',name:'Gelenk 2',doc:{...shaft([{id:'g',part:'stirnrad-m1-z20',x:0,bore:rund(8)},{id:'l1',part:'lager-608',x:14},{id:'l2',part:'lager-608',x:29}],50),sections:[{x0:37,x1:50,profile:{kind:'d',d:8,flat:.8}}]}},
   {key:'e',name:'Abtrieb',doc:shaft([{id:'l',part:'lager-608',x:2}],20)}],
  make:ids=>({...newGear(),shafts:[{id:'j1',shaft:ids.j1,at:[0,0],z:0},{id:'m1',shaft:ids.m1,at:[30,0],z:5.5},{id:'m2',shaft:ids.m2,at:[-30,0],z:5.5},{id:'j2',shaft:ids.j2,at:[30,0],z:47},{id:'e',shaft:ids.e,at:[55,0],z:85}],input:'m1',
   groups:[{id:'g1',name:'Hebel 1',pivot:'j1',shafts:['j2'],from:-90,to:90,fixed:true},{id:'g2',name:'Hebel 2',pivot:'j2',shafts:['e'],from:-90,to:90,fixed:true}]})},
 // One side of a rocker-bogie: the motor up in the body, all three wheels driven by belts 1 : 1 through both joints,
 // every belt between the two plates of its body. Stock belts of 200 mm make every arm 80 mm long. The bogie's plates
 // lie outside the rocker's (one at the height of the frame's upper plate, far from it), its belts between the rocker's.
 (()=>{const L=(id:string,x:number)=>({id,part:'lager-685',x}),S=(id:string,x:number)=>({id,part:'gt2-z20-schmal',x}),K={kind:'kreuz' as const};
  const pol=(c:[number,number],r:number,deg:number):[number,number]=>[+(c[0]+r*Math.cos(deg*Math.PI/180)).toFixed(3),+(c[1]+r*Math.sin(deg*Math.PI/180)).toFixed(3)];
  // All three axles 45 mm below the rocker's pivot.
  const P:[number,number]=[0,0],drop=45,B=pol(P,80,-5),rear=180+Math.asin(drop/80)*180/Math.PI,bogie=Math.asin((drop+B[1])/80)*180/Math.PI;
  return {key:'rocker',title:'Rocker-Bogie, eine Seite',text:'Motor oben im Körper, Riemen GT2 1 : 1 über Rocker-Achse und Bogie-Achse auf alle drei Räder, jeder Riemen zwischen den beiden Platten seines Körpers. Normriemen 200 mm, Lager 685 (5 × 11 × 5), Wellen Ø5; Rocker und Bogie schwenken frei. Die Radwellen enden als LEGO-Kreuz für die Reifen.',
   shafts:[{key:'m',name:'Motor z16',doc:{...shaft([{id:'r',part:'gt2-z16',x:4.5,bore:rund(9)}],30),inserts:[{id:'m',part:'motor-nema17-40',end:'links' as const,depth:15}]}},
    {key:'p',name:'Rocker-Achse',doc:shaft([L('l1',0),{id:'r',part:'gt2-z40',x:8},L('l2',27),L('l3',36),S('a',44),S('b',53),L('l4',74)],80)},
    {key:'w1',name:'Rad hinten',doc:{...shaft([L('l1',0),S('r',8),L('l2',38)],76),sections:[{x0:44,x1:76,profile:K}]}},
    {key:'b',name:'Bogie-Achse',doc:shaft([L('l1',0),L('l2',9),S('c',17),S('r',26),S('d',35),L('l3',47),L('l4',56)],62)},
    {key:'w2',name:'Bogie-Rad hinten',doc:{...shaft([L('l1',0),S('r',17),L('l2',56)],85),sections:[{x0:62,x1:85,profile:K}]}},
    {key:'w3',name:'Bogie-Rad vorn',doc:{...shaft([L('l1',0),S('r',35),L('l2',56)],85),sections:[{x0:62,x1:85,profile:K}]}}],
   make:(ids:Record<string,string>):GearDoc=>{const g=newGear();return {...g,settings:{...g.settings,lipIn:.7},input:'m',
    shafts:[{id:'m',shaft:ids.m,at:[0,72],z:3.5},{id:'p',shaft:ids.p,at:P,z:0},{id:'w1',shaft:ids.w1,at:pol(P,80,rear),z:36},{id:'b',shaft:ids.b,at:B,z:27},{id:'w2',shaft:ids.w2,at:pol(B,80,180+bogie),z:27},{id:'w3',shaft:ids.w3,at:pol(B,80,-bogie),z:27}],
    belts:([['m','r','p','r'],['p','a','w1','r'],['p','b','b','r'],['b','c','w2','r'],['b','d','w3','r']] as const).map(([a,i,b,j],k)=>({id:`r${k+1}`,a:{on:a,item:i},b:{on:b,item:j}})),
    groups:[{id:'g1',name:'Rocker',pivot:'p',shafts:['w1','b'],from:-15,to:15},{id:'g2',name:'Bogie',pivot:'b',shafts:['w2','w3'],from:-12,to:12}]};}};})(),
 // The same with LEGO gears, all between the plates, from what one has plenty of: a z40 on every axle and between them
 // one idler each (an odd number: the wheels turn alike, swinging does not turn them), a z40 on the rocker, a z24 on the
 // bogie; a z8 on the motor's shaft. No z16 and no z36. The 685 bearings sit straight on the LEGO cross where the gear
 // had to pass. Frame and bogie plates share the outer heights, the rocker's lie inside them, the gears in the middle:
 // 1 mm between plate and plate and between plate and gear, the bearings' lips (1,5 mm) only where a plate holds its
 // bearings from outside. The side is 38 mm across (49 before).
 (()=>{const L=(id:string,x:number)=>({id,part:'lager-685',x}),Z40=(x:number)=>({id:'g',part:'lego-3649',x}),Z24=(x:number)=>({id:'g',part:'lego-3648b',x}),Z8=(x:number)=>({id:'g',part:'lego-10928',x}),K={kind:'kreuz' as const};
  const pol=(c:[number,number],r:number,deg:number):[number,number]=>[+(c[0]+r*Math.cos(deg*Math.PI/180)).toFixed(3),+(c[1]+r*Math.sin(deg*Math.PI/180)).toFixed(3)];
  // The rear wheel 80 mm from the rocker's pivot, a z40 halfway; the bogie's pivot 76 mm ahead, its z40 40 mm from both,
  // off the line and above it, clear of the bogie's gears when the bogie swings. The bogie's wheels 64 mm from theirs
  // (a z24 between): all three axles at the height of the rear wheel. Searched for: nothing in the way over both ranges,
  // the longest wheelbase.
  const P:[number,number]=[0,0],rear=225,front=-10,W1=pol(P,80,rear),B=pol(P,76,front),up=Math.acos(38/40)*180/Math.PI,drop=Math.asin((B[1]-W1[1])/64)*180/Math.PI;
  return {key:'rocker-lego',title:'Rocker-Bogie mit LEGO z40, z24 und z8',text:'Wie das Riemen-Beispiel, aber mit LEGO-Zahnrädern zwischen den Platten: z40 auf jeder Achse, dazwischen je ein Zwischenrad (am Rocker z40, an der Bogie z24), ein z8 auf der Motorwelle (5 : 1). Kein z16, kein z36. Die Lager 685 sitzen dort, wo das Rad vorbei muss, direkt auf dem LEGO-Kreuz. Die Radwellen enden als LEGO-Kreuz für die Reifen.',
   shafts:[{key:'m',name:'Motor z8',doc:{...shaft([Z8(10)],24),inserts:[{id:'m',part:'motor-nema17-40',end:'links' as const,depth:9.5}],works:[{id:'s',kind:'madenschraube' as const,x:5,m:3}],sections:[{x0:0,x1:10,profile:{kind:'rund' as const,d:11}}]}},
    {key:'p',name:'Achse z40',doc:shaft([L('l1',0),L('l2',7.5),Z40(13.5),L('l3',22.5),L('l4',30)],35)},
    {key:'i',name:'Zwischenrad z40',doc:shaft([L('l1',0),Z40(6),L('l2',15)],20)},
    {key:'w1',name:'Rad hinten z40',doc:{...shaft([L('l1',0),Z40(6),L('l2',15)],61),sections:[{x0:21,x1:61,profile:K}]}},
    {key:'j',name:'Bogie-Zwischenrad z24',doc:shaft([L('l1',0),Z24(13.5),L('l2',30)],35)},
    {key:'w',name:'Bogie-Rad z40',doc:{...shaft([L('l1',0),Z40(13.5),L('l2',30)],67),sections:[{x0:36,x1:67,profile:K}]}}],
   make:(ids:Record<string,string>):GearDoc=>{const g=newGear();return {...g,settings:{...g.settings,lipIn:.7},input:'m',
    shafts:[{id:'m',shaft:ids.m,at:[0,24],z:3.5},{id:'p',shaft:ids.p,at:P,z:0},
     {id:'h',shaft:ids.i,at:pol(P,40,rear),z:7.5},{id:'w1',shaft:ids.w1,at:W1,z:7.5},
     {id:'v',shaft:ids.i,at:pol(P,40,front+up),z:7.5},{id:'b',shaft:ids.p,at:B,z:0},
     {id:'j2',shaft:ids.j,at:pol(B,32,180+drop),z:0},{id:'w2',shaft:ids.w,at:pol(B,64,180+drop),z:0},{id:'j3',shaft:ids.j,at:pol(B,32,-drop),z:0},{id:'w3',shaft:ids.w,at:pol(B,64,-drop),z:0}],
    groups:[{id:'g1',name:'Rocker',pivot:'p',shafts:['h','w1','v','b'],from:-15,to:15},{id:'g2',name:'Bogie',pivot:'b',shafts:['j2','w2','j3','w3'],from:-10,to:20}]};}};})(),
];
/** The LEGO rocker with a tension spring from the frame onto the rocker: it pulls the rocker back towards where it is
 * drawn. The bolts of frame and rocker are set (where the plan put them), so the spring keeps its two bolts. */
{const lego=gearExamples.find(e=>e.key==='rocker-lego')!;
 gearExamples.push({...lego,key:'rocker-feder',title:'LEGO-Rocker mit Rückholfeder',text:'Der LEGO-Rocker, dazu eine Zugfeder 5 × 20,5 aus dem Sortiment vom Gestell an den Rocker: über ±15° 2,7 bis 6,9 N, die Säulen an ihren Bolzen für den Haken geteilt. Federn messen: Knopf „Federn“.',
  make:(ids:Record<string,string>):GearDoc=>{const d=lego.make(ids);return {...d,bolts:[[0,54.42],[-26.34,8.79],[59.5,34.49]],groups:d.groups?.map(g=>g.id==='g1'?{...g,bolts:[[-80.39,-70.32],[100.69,-3.79],[-16.25,28.15],[-7.22,-45.96]] as [number,number][]}:g),
   springs:[{id:'f1',part:'zug-5x20,5',a:{body:'',bolt:0},b:{body:'g1',bolt:2}}]};}});}
