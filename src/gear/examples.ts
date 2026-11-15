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
  make:ids=>({...newGear(),shafts:[{id:'j1',shaft:ids.j1,at:[0,0],z:0},{id:'m1',shaft:ids.m1,at:[0,-30],z:5.5},{id:'m2',shaft:ids.m2,at:[-30,0],z:5.5},{id:'j2',shaft:ids.j2,at:[30,0],z:47},{id:'e',shaft:ids.e,at:[55,0],z:85}],input:'m1',
   groups:[{id:'g1',name:'Hebel 1',pivot:'j1',shafts:['j2'],from:-90,to:90,fixed:true},{id:'g2',name:'Hebel 2',pivot:'j2',shafts:['e'],from:-90,to:90,fixed:true}]})},
];
