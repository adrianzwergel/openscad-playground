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
 {key:'riemen',title:'Riemen GT2 z16 → z40',text:'Zwei Scheiben 80 mm auseinander, Riemenlänge und Normlänge.',
  shafts:[{key:'an',name:'Riemen z16',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'r',part:'gt2-z16',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])},
   {key:'ab',name:'Riemen z40',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'r',part:'gt2-z40',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])}],
  make:ids=>({...newGear(),shafts:[{id:'a',shaft:ids.an,at:[0,0],z:0},{id:'b',shaft:ids.ab,at:[80,0],z:0}],belts:[{id:'r1',a:{on:'a',item:'r'},b:{on:'b',item:'r'}}],input:'a'})},
 {key:'umweg',title:'Steg am Rad vorbei',text:'Eine Stufe mit Stützwelle; eine vierte Welle, nur oben gelagert, hängt mit ihrem z30 bis in die untere Schicht: der Steg muss außen herum oder in die Tiefe.',
  shafts:[{key:'an',name:'Antrieb z20',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z20',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])},
   {key:'ab',name:'Abtrieb z40',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'g',part:'stirnrad-m1-z40',x:20,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])},
   {key:'st',name:'Stütze',doc:shaft([{id:'l1',part:'lager-608',x:2},{id:'l2',part:'lager-608',x:50}])},
   {key:'un',name:'Rad unten z30',doc:shaft([{id:'g',part:'stirnrad-m1-z30',x:8,bore:rund(8)},{id:'l2',part:'lager-608',x:50}])}],
  make:ids=>({...newGear(),shafts:[{id:'a',shaft:ids.an,at:[0,0],z:0},{id:'b',shaft:ids.ab,at:[30,0],z:0},{id:'c',shaft:ids.st,at:[0,-40],z:0},{id:'d',shaft:ids.un,at:[-25,-20],z:0}],input:'a'})},
];
