// The parts store: one format for everything that can be placed, whatever its source. Part frame: z = 0 is the face
// that is mounted (a board's underside, a motor's flange), x and y centred on the part.
import {nopscadlib} from './nopscadlib.generated.ts';

type V=[number,number,number];
export type PartHole={at:[number,number];d:number};
/** A connector and the way out of its plug: `dir` the outward direction (degrees, part frame). */
export type Plug={label:string;at:[number,number];dir:number;width:number;height:number};
/** `box`: the whole part, also what overhangs its board. `body`: which side of the mounted face the body lies on.
 * `pilot`: Ø of the boss or bore the face needs a hole for. `checked`: the numbers come from a pinned data source;
 * parts typed in by hand stay marked until somebody measured them. */
export type Part={id:string;label:string;group:string;source:string;checked:boolean;size:V;corner:number;color:string;holes:PartHole[];plugs:Plug[];box:{min:V;max:V};mount:'board'|'flange'|'support';body:1|-1;/** A support: the pad the structure stands on or is screwed down with. */pad?:{width:number;depth:number;thickness:number;holes:[number,number][];hole:number};mesh?:string;pilot?:number;shaft?:{d:number;length:number};note?:string};

const imported:Part[]=nopscadlib.parts.map(p=>({id:p.id,label:p.label,group:p.group,source:'NopSCADlib',checked:true,size:p.size as V,corner:p.corner,color:p.color,holes:p.holes as PartHole[],plugs:p.plugs as Plug[],box:p.box as Part['box'],mount:p.mount as Part['mount'],body:p.group==='Motoren'?-1:1,mesh:`./mechanics-assets/parts/${p.id}.stl`,...('pilot' in p?{pilot:p.pilot as number}:{}),...('shaft' in p?{shaft:p.shaft as Part['shaft']}:{})}));
const rect=(x:number,y:number,d:number):PartHole[]=>[[-x/2,-y/2],[x/2,-y/2],[x/2,y/2],[-x/2,y/2]].map(at=>({at:at as [number,number],d}));
/** A part from its measures alone: a board on `z` mm of height, its holes on a rectangle or none. */
export function boxPart(o:{id:string;label:string;group:string;size:[number,number];thickness?:number;height:number;below?:number;holes?:PartHole[];note?:string;source?:string}):Part{
 const [l,w]=o.size;return {id:o.id,label:o.label,group:o.group,source:o.source??'Handeingabe',checked:false,size:[l,w,o.thickness??1.6],corner:0,color:'#4a6074',holes:o.holes??[],plugs:[],box:{min:[-l/2,-w/2,-(o.below??0)],max:[l/2,w/2,o.height]},mount:'board',body:1,...(o.note?{note:o.note}:{})};
}
const pi4=imported.find(p=>p.id==='rpi4')!;
// Not in NopSCADlib. Measures by hand: `checked` stays false, the Studio says so.
const typed:Part[]=[
 // Same outline and hole pattern as the Pi 4; Ethernet and the USB stacks trade places, so their plugs do too.
 {...boxPart({id:'rpi5',label:'Raspberry Pi 5',group:'Controller',size:[85,56],thickness:1.4,height:18,below:2,note:'Bohrbild wie Pi 4 (58 × 49 mm). Stecker: Lage aus dem Pi 4 übernommen, Ethernet und USB getauscht; bitte am Teil nachmessen.'}),holes:pi4.holes,box:{...pi4.box,min:[-42.5,-28,-1.8],max:[44.5,28,17.8]},plugs:pi4.plugs.map(p=>p.dir===0?{...p,at:[p.at[0],-p.at[1]] as [number,number]}:p)},
 boxPart({id:'esp32-devkitc',label:'ESP32 DevKitC V4',group:'Controller',size:[54.4,27.9],height:6,below:6,note:'Keine Befestigungslöcher, Maße je nach Hersteller verschieden.'}),
 boxPart({id:'d1-mini',label:'Wemos D1 mini (ESP8266)',group:'Controller',size:[34.2,25.6],height:6.7,below:3,note:'Keine Befestigungslöcher.'}),
 boxPart({id:'hc-sr04',label:'HC-SR04 Ultraschall',group:'Sensoren',size:[45,20],height:15,holes:rect(41,16,2),below:3,note:'Lochabstand je nach Hersteller verschieden, bitte nachmessen.'}),
 boxPart({id:'l298n',label:'L298N Motortreiber',group:'Module',size:[43,43],height:27,holes:rect(37,37,3),below:3,note:'Lochabstand je nach Hersteller verschieden, bitte nachmessen.'}),
 boxPart({id:'a4988',label:'A4988 Schritttreiber',group:'Module',size:[15.24,20.32],height:12,below:7,note:'Keine Befestigungslöcher, sitzt sonst auf Stiftleisten.'}),
 {...boxPart({id:'sg90',label:'SG90 Mikroservo',group:'Motoren',size:[32.5,12.2],thickness:2.5,height:6,below:17,holes:[{at:[-13.85,0],d:2},{at:[13.85,0],d:2}],note:'Laschenmaß von Hand, bitte nachmessen.'}),mount:'flange',body:-1,pilot:23},
];
const support=(id:string,label:string,width:number,depth:number,holes:[number,number][],hole:number,note:string):Part=>({...boxPart({id,label,group:'Befestigung',size:[width,depth],thickness:5,height:5,note,source:'Eigenes Element'}),checked:true,mount:'support',color:'#c58a4a',pad:{width,depth,thickness:5,holes,hole}});
const supports:Part[]=[
 support('fuss','Fuß',30,30,[[-8,0],[8,0]],4.5,'Standfläche mit zwei Schraublöchern. Ein eigener Befestigungspunkt ersetzt die automatischen Füße.'),
 support('schraubpunkt','Schraubpunkt',16,16,[[0,0]],4.5,'Für eine Schraube: auf eine Fläche legen oder mit dem Griff an eine Wand drehen.'),
 support('wandhalter','Wandhalter',44,20,[[-14,0],[14,0]],4.5,'Für zwei Schrauben nebeneinander: mit dem Griff an die Wand drehen.'),
];
export const parts:Part[]=[...imported,...typed,...supports];
/** A part's mass in grams, estimated from its hull (the sources give none): a board is mostly air, a motor mostly iron.
 * An estimate: the item can state the real one. */
export function massOf(p:Part){const hull=p.group==='Motoren'&&p.size[0]>30?p.size[0]*p.size[1]*p.size[2]:(p.box.max[0]-p.box.min[0])*(p.box.max[1]-p.box.min[1])*(p.box.max[2]-p.box.min[2]),v=hull/1000,d=p.group==='Motoren'?(p.size[0]>30?4:1.2):p.group==='Lüfter'?.3:.4;return Math.max(1,v*d);}
/** Holding torque of a stepper by frame size (Nm), for the couple on its screws; 0 for everything else. */
export function torqueOf(p:Part){if(p.group!=='Motoren'||!p.shaft)return 0;return p.size[0]>50?1.3:p.size[0]>40?.45:.18;}
export const partGroups=['Controller','Motoren','Module','Sensoren','Anzeigen','Schalter','Lüfter','Befestigung','Eigene Teile'];
export const partById=(id:string,own:Part[]=[])=>parts.find(p=>p.id===id)??own.find(p=>p.id===id);
export const catalogSource={source:nopscadlib.source,commit:nopscadlib.commit,license:nopscadlib.license};
