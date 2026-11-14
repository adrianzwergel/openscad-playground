// What the shaft generator offers, taken from the Studio's catalogs: bearings, LEGO gears, printed spur gears and GT2
// pulleys sit ON a shaft; motor shafts, LEGO axles and round rods go IN it from one end.
import {bearingCatalog} from '../mechanics/kinematics/bearings.ts';
import {legoParts} from '../mechanics/graph/lego-parts.ts';
import {parts} from '../mechanics/parts/catalog.ts';
import {rund} from './profile.ts';
import type {Profile} from './profile.ts';

/** Sits on the shaft: its bore, how wide it is along the shaft, its outer Ø. `stop`: the largest shoulder that touches
 * only what turns with the shaft (a bearing's inner ring). `own`: bore and width can be set per piece. */
export type OnPart={id:string;label:string;/** For narrow clips. */short:string;group:string;bore:Profile;width:number;outer:number;stop?:number;source:string;checked:boolean;note?:string;own?:boolean;/** A spacer: its bore follows the piece it sits on. */spacer?:boolean;/** Holds itself where it is (clamps or is screwed): needs no shoulder, holds what is inside of it. */clamp?:boolean;/** What comes with it into the parts list. */extra?:string};
/** Goes into the shaft from one end. `length`: how long it is (a motor's shaft), the most it can go in. */
export type InPart={id:string;label:string;group:string;profile:Profile;length?:number;source:string;checked:boolean;note?:string};

export const onGroups=['Lager','LEGO-Zahnräder','Stirnräder','Riemenscheiben','Sicherung','Hülsen'];
export const inGroups=['Motorwellen','LEGO','Wellen'];

const bearings:OnPart[]=bearingCatalog.filter(b=>b.kind==='ball').map(b=>({id:`lager-${b.id}`,label:b.label,short:b.id,group:'Lager',bore:rund(b.d),width:b.B,outer:b.D,stop:b.d+.4*(b.D-b.d),source:'Lagerkatalog des Studios',checked:true}));
// One gear per LDraw part a LEGO axle drives; reinforced and sliding versions have the same seat.
const lego:OnPart[]=legoParts.filter(p=>p.search&&p.teeth>0&&p.mount==='cross').map(p=>({id:`lego-${p.id}`,short:`z${p.teeth}`,label:`LEGO z${p.teeth} · ${p.name.replace(/^Technic Gear\s+/,'').replace(/\s+/g,' ')}`,group:'LEGO-Zahnräder',bore:{kind:'kreuz'} as Profile,width:Math.min(...p.size),outer:2*p.radius,source:'LDraw',checked:true})).sort((a,b)=>a.outer-b.outer);
const spur=(teeth:number,module:number):OnPart=>({id:`stirnrad-m${module}-z${teeth}`,short:`z${teeth} m${module}`,label:`Stirnrad z${teeth} m${module} (gedruckt)`,group:'Stirnräder',bore:rund(5),width:10,outer:module*(teeth+2),source:'Generator des Studios',checked:true,own:true,note:'Bohrung und Breite am Teil einstellbar; das Rad selbst macht das Studio.'});
const pulley=(teeth:number):OnPart=>({id:`gt2-z${teeth}`,short:`GT2 z${teeth}`,label:`GT2-Scheibe z${teeth}`,group:'Riemenscheiben',bore:rund(5),width:16,outer:Math.max(2*(teeth/Math.PI+1.5),16),source:'Generator des Studios',checked:true,own:true,note:'6 mm Riemen, Nabe 8 mm lang.'});
export const spacerPart:OnPart={id:'huelse',short:'Hülse',label:'Distanzhülse',group:'Hülsen',bore:rund(5),width:5,outer:0,source:'Wellen-Generator',checked:true,own:true,spacer:true,note:'Innen passt sie sich dem Abschnitt an, auf dem sie sitzt.'};
// Held by themselves: LEGO bushes clamp on the cross (that is how LEGO holds an axle), set collars DIN 705 with their set
// screw on a round shaft. Measures typed in, so `checked: false`.
const bushes:OnPart[]=[{id:'lego-buchse-halb',short:'Buchse ½',label:'LEGO-Buchse ½ (4265c)',width:4,outer:7.2},{id:'lego-buchse',short:'Buchse',label:'LEGO-Buchse 1 (3713)',width:8,outer:7.6}].map(b=>({...b,group:'Sicherung',bore:{kind:'kreuz'} as Profile,clamp:true,source:'LEGO, Maße von Hand',checked:false,note:'Klemmt auf dem LEGO-Kreuz, wie bei LEGO-Achsen. Länge und Ø von Hand eingetragen, bitte nachmessen.'}));
const collars:OnPart[]=([[3,7,5,3],[4,8,5,3],[5,10,6,3],[6,12,6,4],[8,16,8,4],[10,20,10,5]] as const).map(([d,D,B,m])=>({id:`stellring-${d}`,short:`Stellring ${d}`,label:`Stellring DIN 705 Ø${d}`,group:'Sicherung',bore:rund(d),width:B,outer:D,clamp:true,extra:`Madenschraube M${m} (im Stellring)`,source:'DIN 705, Maße von Hand',checked:false,note:`Mit Madenschraube M${m}. Außen-Ø und Breite je nach Hersteller, bitte nachmessen.`}));
export const onParts:OnPart[]=[...bearings,...lego,...[[12,1],[20,1],[30,1],[40,1],[15,2],[20,2]].map(([z,m])=>spur(z,m)),...[16,20,40].map(pulley),...bushes,...collars,spacerPart];

// NEMA motors have a D shaft; the depth of the flat is the usual one, the catalog only knows the Ø.
const motors:InPart[]=parts.filter(p=>p.shaft).map(p=>({id:`motor-${p.id}`,label:`${p.label}: Welle ${String(p.shaft!.d).replace('.',',')} mm`,group:'Motorwellen',profile:{kind:'d',d:p.shaft!.d,flat:.5} as Profile,length:p.shaft!.length,source:p.source,checked:false,note:'Abflachung 0,5 mm wie üblich, bitte am Motor nachmessen.'}));
export const inParts:InPart[]=[...motors,
 {id:'lego-achse',label:'LEGO-Achse',group:'LEGO',profile:{kind:'kreuz'},source:'LEGO',checked:true},
 ...[3,4,5,6,8,10].map(d=>({id:`rund-${d}`,label:`Rundwelle Ø${d}`,group:'Wellen',profile:rund(d),source:'Norm',checked:true})),
 ...[5,6,8].map(d=>({id:`d-${d}`,label:`D-Welle Ø${d}`,group:'Wellen',profile:{kind:'d',d,flat:.5} as Profile,source:'Norm',checked:true})),
];
export const onPart=(id:string)=>onParts.find(p=>p.id===id);
export const inPart=(id:string)=>inParts.find(p=>p.id===id);
