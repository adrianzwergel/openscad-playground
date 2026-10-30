import {resolveSpatial} from './spatial.ts';
import type {Spatial,V} from './spatial.ts';
export type SpatialPart={id:string;name:string;quantity:number;source:string};
const T=8;
const head='include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;\n';
const shift=(v:V)=>`translate([${v.join(',')}])`;
export const orient=(v:V)=>v[0]?'rotate([0,90,0])':v[1]?'rotate([90,0,0])':v[2]<0?'rotate([180,0,0])':'';
const ring=(d:number,b:number,h:number)=>`difference(){cylinder(d=${d},h=${h});translate([0,0,-0.1]) cylinder(d=${b},h=${h+0.2});}`;
export function spatialCAD(input:Spatial,view:'pair'|'housing'|'open'='pair'){
 const a=resolveSpatial(input),p=a.p,c=p.clearance,[lo,hi]=[a.lo,a.hi],R=a.R;
 if(!a.valid)throw Error('Räumliche Freiraumprüfung verletzt.');
 const pose=(i:number,z=0)=>shift(a.shafts[i].origin)+orient(a.shafts[i].axis)+`translate([0,0,${z}])`;
 const common=`
 module cartridge(){difference(){union(){translate([-15,-15,0]) cube([30,30,30]);translate([-24,-24,0]) cube([48,48,4]);}
 translate([0,0,-0.1]) cylinder(d=6.2,h=30.2);translate([0,0,-0.1]) cylinder(d=16.15,h=5.3);translate([0,0,24.8]) cylinder(d=16.15,h=5.3);
 for(x=[-11,11])for(y=[-11,11]){translate([x,y,-0.1]) cylinder(d=2.5,h=10);translate([x,y,20]) cylinder(d=2.5,h=10.1);}
 for(x=[-20,20])for(y=[-20,20]) translate([x,y,-0.1]) cylinder(d=4.5,h=4.2);}}
 module cap(){difference(){translate([-15,-15,0]) cube([30,30,3]);translate([0,0,-0.1]) cylinder(d=6.2,h=3.2);for(x=[-11,11])for(y=[-11,11])translate([x,y,-0.1]) cylinder(d=3.4,h=3.2);}}
 module hub(z){translate([0,0,z]) difference(){cylinder(d=16,h=8.1);translate([0,0,4]) rotate([0,90,0]) cylinder(d=2.5,h=9);}}
 module bore(z,h){translate([0,0,z]) cylinder(d=5.1,h=h);}
 module input_raw(){${p.kind==='internal'?`spur_gear(mod=2,teeth=20,thickness=10,profile_shift=0,shaft_diam=0,backlash=0.15,gear_spin=0);`:p.kind==='bevel'?`bevel_gear(mod=2,teeth=20,mate_teeth=${R},shaft_angle=90,face_width=6,bottom=4,cone_backing=false,spiral=0,cutter_radius=0,left_handed=true,backlash=0.15,gear_spin=0);`:`worm(mod=2,d=24,l=24,starts=${p.starts},left_handed=false,pressure_angle=20,backlash=0.15,gear_spin=0);`}}
 module output_raw(){${p.kind==='internal'?`ring_gear(mod=2,teeth=${R},thickness=10,od=${2*(R+15)},profile_shift=0,backlash=0.15,gear_spin=0);`:p.kind==='bevel'?`bevel_gear(mod=2,teeth=${R},mate_teeth=20,shaft_angle=90,face_width=6,bottom=4,cone_backing=false,spiral=0,cutter_radius=0,left_handed=false,backlash=0.15,gear_spin=${180/R});`:`worm_gear(mod=2,teeth=${R},thickness=10,worm_diam=24,worm_starts=${p.starts},left_handed=false,profile_shift=0,pressure_angle=20,backlash=0.15,slices=8,search_steps=24,gear_spin=0);`}}
 module input_part(){difference(){union(){input_raw();hub(${p.kind==='internal'?-13:p.kind==='bevel'?-12:-20});}bore(-40,80);}}
 module output_part(){${p.kind==='internal'?`difference(){output_raw();for(t=[0:60:300]) rotate([0,0,t]) translate([${R+10},0,-5.1]) cylinder(d=3.4,h=10.2);}`:`difference(){union(){output_raw();hub(${p.kind==='bevel'?-12:-13});}bore(-40,80);}`}}
 module driver(){difference(){union(){translate([0,0,${-11-c}]) cylinder(r=${R+15},h=6);hub(${-19-c});}bore(-40,80);for(t=[0:60:300])rotate([0,0,t])translate([${R+10},0,${-11.1-c}]) cylinder(d=3.4,h=6.2);}}
 module gear_pair(){${pose(0)} rotate([0,0,${p.phase}]) input_part();${pose(1)} rotate([0,0,${a.outputGain*p.phase}]) output_part();${p.kind==='internal'?`rotate([0,0,${-p.phase*20/R}]){driver();for(t=[0:60:300])rotate([0,0,t])translate([${R+10},0,${-5-c}]) ${ring(8,3.4,c)}}`:''}}
 `;
 // Panels share all cut locations with cassette and support poses.
 const joinXY:V[]=[];
 for(const x of [lo[0]-T/2,hi[0]+T/2])for(const y of [lo[1]+14,hi[1]-14])joinXY.push([x,y,0]);
 for(const y of [lo[1]-T/2,hi[1]+T/2])for(const x of [lo[0]+14,hi[0]-14])joinXY.push([x,y,0]);
 const holes=a.shafts.map((s,i)=>`${pose(i,s.cart)}{translate([-15.2,-15.2,3.9]) cube([30.4,30.4,8.2]);for(x=[-20,20])for(y=[-20,20])translate([x,y,3.9]) cylinder(d=4.5,h=8.2);}`).join('\n');
 const auxiliary=a.shafts.map((s,i)=>s.aux?`${pose(i)}{translate([0,0,${hi[i===0?0:2]-0.1}]) cylinder(d=6.2,h=8.2);translate([0,0,${hi[i===0?0:2]+2.8}]) cylinder(d=16.15,h=5.3);for(x=[-11,11])for(y=[-11,11])translate([x,y,${hi[i===0?0:2]-0.1}]) cylinder(d=2.5,h=8.2);}`:'').join('\n');
 const panels:SpatialPart[]=[];const placed:string[]=[];
 for(let axis=0;axis<3;axis++)for(const side of [0,1]){
  const start:V=[lo[0]-T,lo[1]-T,lo[2]],size:V=[hi[0]-lo[0]+2*T,hi[1]-lo[1]+2*T,hi[2]-lo[2]];
  if(axis===0){start[0]=side?hi[0]:lo[0]-T;size[0]=T;}
  if(axis===1){start[0]=lo[0];size[0]=hi[0]-lo[0];start[1]=side?hi[1]:lo[1]-T;size[1]=T;}
  if(axis===2){start[2]=side?hi[2]:lo[2]-T;size[2]=T;}
  const body=`difference(){${shift(start)} cube([${size.join(',')}]);${holes}${auxiliary}${joinXY.map(v=>`${shift([v[0],v[1],lo[2]-T-0.1])} cylinder(d=${axis===2?3.4:2.5},h=${T+10.1});${shift([v[0],v[1],hi[2]-10])} cylinder(d=${axis===2?3.4:2.5},h=${T+10.1});`).join('\n')}}`;
  const rot=axis===0?'rotate([0,-90,0])':axis===1?'rotate([90,0,0])':'';
  panels.push({id:`panel-${axis}-${side}`,name:`Gehäuseplatte ${'XYZ'[axis]}${side?'+':'−'}`,quantity:1,source:head+`translate([0,0,${-start[axis]}]) ${rot} ${body}`});
  if(view!=='open'||!(axis===2&&side===1||axis===1&&side===0))placed.push(body);
 }
 const parts:SpatialPart[]=[...panels,{id:'cartridge',name:'Doppellager-Kassette mit Montageflansch',quantity:2,source:head+common+'cartridge();'},{id:'bearing-cap',name:'Lagerdeckel',quantity:p.kind==='worm'?6:4,source:head+common+'cap();'},
  {id:'input-gear',name:p.kind==='worm'?'Schnecke mit Nabe':'Eingangsritzel mit Nabe',quantity:1,source:head+common+`translate([0,0,${p.kind==='internal'?13:p.kind==='bevel'?12:20}]) input_part();`},
  {id:'output-gear',name:p.kind==='internal'?'Hohlrad':p.kind==='bevel'?'Kegelrad mit Nabe':'Schneckenrad mit Nabe',quantity:1,source:head+common+`translate([0,0,${p.kind==='internal'?5:p.kind==='bevel'?12:13}]) output_part();`}];
 if(p.kind==='internal')parts.push({id:'ring-driver',name:'Hohlrad-Mitnehmerscheibe',quantity:1,source:head+common+`translate([0,0,${-5-c}]) mirror([0,0,1]) driver();`},{id:'ring-spacer',name:'Distanzhülse Hohlrad',quantity:6,source:head+ring(8,3.4,c)});
 const support:string[]=[];
 for(const [i,s] of a.shafts.entries()){
  support.push(`${pose(i,s.cart)} cartridge();`,`${pose(i,s.cart-3)} cap();`,`${pose(i,s.cart+30)} cap();`);
  for(const z of s.aux?[s.cart+0.2]:[s.cart+0.2,s.cart+24.8])support.push(`${pose(i,z)} ${ring(16,5,5)}`);
  for(const z of [s.cart-7,s.cart+33])support.push(`${pose(i,z)} ${ring(10,5,4)}`);
  for(const z of [s.cart-12,s.cart+37])support.push(`${pose(i,z)} ${ring(10,5,5)}`);
  support.push(`${pose(i,s.cart-22)} cylinder(d=5,h=${s.tip-s.cart+22});`);
  if(s.aux){const end=hi[i===0?0:2];support.push(`${pose(i,end+2.8)} ${ring(16,5,5)}`,`${pose(i,end+8)} cap();`);}
 }
 const bom=['4 × 625-Radiallager (5 × 16 × 5 mm)','4 × Axiallager 5 × 10 × 4 mm; 4 × Klemmring Ø5, Hülle Ø10 × 5 mm',
  '8 × M4 × 20, Scheiben und Muttern: Kassetten am Gehäuse',`${p.kind==='worm'?24:16} × M3 × 10 für Lagerdeckel; 16 × M3 × 16 für Gehäuseplatten; Ø2,5-Piloten M3 schneiden`,
  '2 × M3 × 5 Madenschraube; Nabenpiloten M3 schneiden, Wellen lokal abflachen',
  ...a.shafts.map(s=>`${s.name}: Metallwelle Ø5 × ${(s.tip-s.cart+22).toFixed(2)} mm; lokale Koordinate ${s.cart-22} bis ${s.tip}`),
  ...(p.kind==='internal'?['6 × M3 × 30 mit Scheiben/Muttern: Hohlrad und Mitnehmerscheibe']:[])];
 return {parts,bom,definitions:head+common,stationary:support.join('\n')+placed.join('\n'),source:head+common+'gear_pair();'+(view==='pair'?'':support.join('\n')+placed.join('\n'))};
}
export function spatialInstructions(p:Spatial){const a=resolveSpatial(p);return `Mechanics-10 Etappe F — ${p.kind}\n
1. Gehäuseplatten flach drucken. Lagerkassetten mit Flansch unten, Deckel flach. Verzahnungs-/Nabenteile können Stützen benötigen. Alle Maße mm. Druckpassungen am Probestück prüfen.
2. ${p.kind==='worm'?'Je Kassette nur das äußere 625-Lager einsetzen; die innere Radiallageraufnahme bleibt leer, denn die zweite radiale Führung sitzt an der gegenüberliegenden Gehäusewand.':'Je Kassette zwei 625-Lager einsetzen.'} Deckel verschrauben. Zwei Axiallager außen an die Deckel setzen; Klemmringe sichern die Welle in beiden axialen Richtungen. Ungefähr 0,2 mm Axialspiel einstellen, nicht verspannen. Lager- und Ring-Hüllmaße vor Beschaffung abgleichen. M3-Pilotlöcher nachschneiden.
3. Kassetten bei offenem Gehäuse von außen einsetzen, Flansche verschrauben. Räder im offenen Gehäuse auf die Wellen schieben und Naben mit Madenschrauben fixieren. Wellenenden und Gear-Positionen gemäß Anschlüssen prüfen; Naben sitzen nicht automatisch an einer Wellenstufe.
${p.kind==='internal'?'4. Hohlrad mit sechs Distanzhülsen auf die Mitnehmerscheibe schrauben. Den Ritzelstrang von der offenen Stirnseite einsetzen. Die Ritzelwelle endet vor dem Hohlradboden; beide Wellen sind rückseitig jeweils zweifach gelagert. Das Hohlrad läuft in Weltrichtung gleichsinnig zum Ritzel, die Ports zeigen gegeneinander.':p.kind==='bevel'?'4. Beide Kegelräder auf die gemeinsame Kegelspitze ausrichten. 90°-Achsen, kurze Wellenenden: die Wellen dürfen nicht bis zur Kegelspitze durchlaufen. Je zwei rückseitige Radiallager und zwei Axiallager bilden eine überhängende Lagerung. Keine Durchgangswellen durch das Gegenrad.':'4. Schnecke und Schneckenrad mit identischem Normalmodul 2, Gangzahl und Rechtshändigkeit montieren. Die Achsen sind rechtwinklig und windschief, nicht schneidend. Gegenüberliegende 625-Loslager bilden jeweils die zweite radiale Lagerstelle; dort keine weiteren axialen Klemmringe setzen. Selbsthemmung ist nicht zugesichert.'}
5. Zahneingriff bei offenem Gehäuse von Hand durchdrehen, Axialspiel und Freiräume kontrollieren. Vorder-/Deckelplatte zuletzt montieren. Demontage in umgekehrter Reihenfolge; Räder nicht durch Lageröffnungen ziehen.

Übersetzung ${a.ratio}:1. Mindest-Gehäusefreiraum ${p.clearance} mm. Freiräume basieren auf konservativen Rotationshüllen und festen Vorlagen, nicht auf beliebigen importierten Teilen. Zahnkontakte sind beabsichtigte Paarungen. Schnittprüfungen an Stichproben ersetzen keine lückenlose physische Prüfung.
Überhängende Lagerung bei Hohl- und Kegelrad benötigt eine Last-/Durchbiegungsprüfung. Die Dimensionierung der Lager, Wellen, axialen Sicherung, Schmierung und Druckmaterialien ist nicht freigegeben. Keine Drehmoment-, Lebensdauer- oder Selbsthemmungsberechnung. Physische Abnahme steht aus.\n`;}
