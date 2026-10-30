import {resolveMotion} from './motion.ts';
import type {Motion} from './motion.ts';
export type MotionPart={id:string;name:string;quantity:number;source:string};
const head='include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;\n';
const ring=(d:number,b:number,h:number)=>`difference(){cylinder(d=${d},h=${h});translate([0,0,-0.1]) cylinder(d=${b},h=${h+0.2});}`;
const xring=(x:number,y:number,z:number,d:number,b:number,h:number)=>`translate([${x},${y},${z}]) rotate([0,90,0]) ${ring(d,b,h)}`;
function beltCAD(m:Motion){
 const a=resolveMotion(m),rs=[a.r,a.R],ys=rs.map(r=>Math.max(r+1.5,8)+m.clearance+4),bw=Math.max(...ys)+10;
 const plate=(i:number)=>`difference(){translate([-12,${-ys[i]-7},0]) cube([24,${2*ys[i]+14},6]);translate([0,0,-0.1]) cylinder(d=6.2,h=6.2);translate([0,0,3.5]) cylinder(d=8.15,h=2.6);for(y=[${-ys[i]},${ys[i]}]) translate([0,y,-0.1]) cylinder(d=3.4,h=6.2);}`;
 const base=`difference(){translate([-20,${-bw},0]) cube([${a.max+40},${2*bw},6]);translate([0,0,-0.1]) cylinder(d=6.2,h=6.2);hull(){translate([${a.min},0,-0.1]) cylinder(d=6.2,h=6.2);translate([${a.max},0,-0.1]) cylinder(d=6.2,h=6.2);}for(y=[${-ys[0]},${ys[0]}]) translate([0,y,-0.1]) cylinder(d=3.4,h=6.2);for(y=[${-ys[1]},${ys[1]}]) hull(){translate([${a.min},y,-0.1]) cylinder(d=3.4,h=6.2);translate([${a.max},y,-0.1]) cylinder(d=3.4,h=6.2);}}`;
 const parts:MotionPart[]=[{id:'belt-base',name:'Grundplatte mit freigegebenem Spannweg',quantity:1,source:head+base},...rs.map((_,i)=>({id:`belt-carrier-${i}`,name:`Lagerplatte Scheibe ${i+1} (oben umdrehen)`,quantity:2,source:head+plate(i)})),{id:'belt-post',name:'Lagerplatten-Abstandshalter',quantity:4,source:head+ring(8,3.4,24)}];
 const bodies=[base];
 for(const i of [0,1]){
  const x=i?a.c:0,r=rs[i];
  bodies.push(`translate([${x},0,6]) ${plate(i)}`,`translate([${x},0,42]) mirror([0,0,1]) ${plate(i)}`);
  for(const y of [-ys[i],ys[i]])bodies.push(`translate([${x},${y},12]) ${ring(8,3.4,24)}`);
  // Purchased GT2 pulleys and belt are pitch/flange envelopes, not fabricated tooth approximations.
  bodies.push(`translate([${x},0,17]) ${ring(2*r,5,6)}`,`translate([${x},0,16]) ${ring(2*r+3,5,1)}`,`translate([${x},0,23]) ${ring(2*r+3,5,1)}`,`translate([${x},0,24]) ${ring(16,5,8)}`,`translate([${x},0,2]) cylinder(d=5,h=50);`);
  for(const z of [9.5,36])bodies.push(`translate([${x},0,${z}]) ${ring(8,5,2.5)}`);
  bodies.push(`translate([${x},0,12.15]) ${ring(6,5.1,3.85)}`,`translate([${x},0,32]) ${ring(6,5.1,3.85)}`);
 }
 bodies.push(`translate([0,0,17]) linear_extrude(6) difference(){hull(){circle(r=${a.r+0.75});translate([${a.c},0]) circle(r=${a.R+0.75});}hull(){circle(r=${a.r-0.75});translate([${a.c},0]) circle(r=${a.R-0.75});}}`);
 return {parts,source:head+bodies.join('\n'),bom:[`GT2-Endlosriemen ${m.beltLength} mm / ${m.beltLength/2} Zähne, 6 mm breit`,`GT2-Kaufscheiben ${m.teethA}/${m.teethB} Zähne, 5-mm-Bohrung, Flanschpaket 8 mm breit + Klemmnabe Ø16 × 8 mm; Hüllmaße vor Kauf prüfen`,'4 Lager 5 × 8 × 2,5 mm; 2 Wellen Ø5 × 50 mm','4 Metall-Distanzhülsen innen 5,1 / außen 6 × 3,85 mm; Innenringkontakt prüfen','4 M3 × 50 Schrauben, 8 breite Scheiben, 4 Muttern; M3-Schrauben führen auch die verstellbare Lagerbrücke']};
}
function axisCAD(m:Motion){
 const a=resolveMotion(m),right=a.right,rack=m.kind==='rack',cx=m.stroke/2,py=80;
 const xmin=rack?Math.min(-79,-a.rackLength/2-8):-104,xmax=rack?Math.max(right+24,m.stroke+a.rackLength/2+8):right+24;
 const low=19-m.clearance,high=37+m.clearance;
 const defs=`
 module xhole(x,y,z,d,h){translate([x,y,z]) rotate([0,90,0]) cylinder(d=d,h=h);}
 module guide_end(x,floating=false){difference(){translate([x,-42,6]) cube([12,84,36]);
 for(y=[-30,30]){xhole(x-0.1,y,24,8.15,12.2);translate([x-0.1,y-0.4,24]) cube([12.2,0.8,19]);translate([x+6,y>0?30:-42.1,36]) rotate([-90,0,0]) cylinder(d=3.4,h=12.2);translate([x+6,y>0?18:-30,36]) rotate([-90,0,0]) cylinder(d=2.5,h=12.1);}
 ${!rack?'xhole(x-0.1,0,24,8.6,12.2);if(floating) xhole(x+5,0,24,22.15,7.1);else {xhole(x-0.1,0,24,16.2,1.1);xhole(x+11,0,24,16.2,1.1);}':''}
 for(y=[-14,14]) translate([x+6,y,5.9]) cylinder(d=3.3,h=20);
 ${!rack?'if(floating) for(y=[-16,16]) xhole(x+3,y,24,2.5,9.1);':''}}}
 module rear(){difference(){translate([-90,-20,6]) cube([12,40,36]);xhole(-90.1,0,24,8.6,12.2);xhole(-90.1,0,24,22.15,7.1);for(y=[-16,16]) xhole(-90.1,y,24,2.5,9);for(y=[-14,14]) translate([-84,y,5.9]) cylinder(d=3.3,h=20);}}
 module bearing_cap(){difference(){translate([0,-20,8]) cube([3,40,32]);xhole(-0.1,0,24,9,3.2);for(y=[-16,16]) xhole(-0.1,y,24,3.4,3.2);}}
 module carriage(){difference(){union(){translate([-35,-42,12]) cube([70,84,24]);${rack?'for(x=[-24,16]) translate([x,38,12]) cube([8,16,7]);':''}}
 for(y=[-30,30]){xhole(-35.1,y,24,8.6,70.2);xhole(-35.1,y,24,15.2,24.6);xhole(10.5,y,24,15.2,24.6);}
 ${!rack?'xhole(-35.1,0,24,10.5,70.2);for(t=[45,135,225,315]) xhole(-35.1,8*cos(t),24+8*sin(t),2.5,12);':''}
 for(y=[-38,38]) for(z=[16,32]) {xhole(-35.1,y,z,2.5,12);xhole(23,y,z,2.5,12.1);}
 ${rack?'for(x=[-20,20]) translate([x,50,11.9]) cylinder(d=2.5,h=7.2);':''}}}
 module keeper(){difference(){translate([0,-42,12]) cube([3,84,24]);for(y=[-30,30]) xhole(-0.1,y,24,8.6,3.2);xhole(-0.1,0,24,23,3.2);for(y=[-38,38]) for(z=[16,32]) xhole(-0.1,y,z,3.4,3.2);}}
 module base(){difference(){translate([${xmin},-50,0]) cube([${xmax-xmin},${rack?176:100},6]);for(x=[-61,${right+6}${rack?'':',-84'}]) for(y=[-14,14]) translate([x,y,-0.1]) cylinder(d=4.5,h=6.2);${rack?`for(x=[${cx-30},${cx+30}]) translate([x,110,-0.1]) cylinder(d=4.5,h=6.2);`:''}}}
 module rack_part(){difference(){translate([0,60,24]) rack(mod=2,teeth=${a.rackTeeth},thickness=10,bottom=14,orient=BACK,profile_shift=0,pressure_angle=20,backlash=0.15);for(x=[-20,20]) translate([x,50,18.9]) cylinder(d=3.4,h=10.2);}}
 module pinion(){difference(){union(){translate([0,0,5]) spur_gear(mod=2,teeth=20,thickness=10,profile_shift=0,pressure_angle=20,backlash=0.15,shaft_diam=0);translate([0,0,9.9]) cylinder(d=14,h=8.1);}translate([0,0,-0.1]) cylinder(d=5.1,h=18.2);translate([0,0,14]) rotate([0,90,0]) cylinder(d=2.5,h=8);}}
 module pinion_plate(z,bottom=false){difference(){union(){translate([${cx-36},68,z]) cube([72,48,6]);if(bottom) for(x=[${cx-30},${cx+30}]) translate([x,110,6]) cylinder(d=12,h=${low-12});}
 translate([${cx},80,z-0.1]) cylinder(d=6.2,h=6.2);translate([${cx},80,bottom?z+3.5:z-0.1]) cylinder(d=8.15,h=2.6);for(x=[${cx-30},${cx+30}]) translate([x,110,5.9]) cylinder(d=4.5,h=60);}}
 `;
 const part=(id:string,name:string,quantity:number,body:string):MotionPart=>({id,name,quantity,source:head+defs+body});
 const parts=[part('axis-base','Grundplatte',1,'base();'),part('guide-left','Linker Führungsträger',1,'translate([0,0,-6]) guide_end(-67);'),part('guide-right','Rechter Führungsträger',1,`translate([0,0,-6]) guide_end(${right},true);`),part('carriage','Schlitten mit Lager- und Antriebsaufnahme',1,'translate([0,0,-12]) carriage();'),part('keeper','Schlitten-Lagerdeckel',2,'rotate([0,-90,0]) keeper();')];
 const scene=['base();','guide_end(-67);',`guide_end(${right},true);`,`translate([${a.q},0,0]) carriage();`,`translate([${a.q-38},0,0]) keeper();`,`translate([${a.q+35},0,0]) keeper();`];
 for(const y of [-30,30]){scene.push(`xhole(-67,${y},24,8,${m.guideLength});`);for(const x of [a.q-35,a.q+11])scene.push(xring(x,y,24,15,8,24));}
 const bom=['2 Führungswellen Ø8 × '+m.guideLength+' mm; 4 LM8UU (8 × 15 × 24 mm)', '8 M3 × 10 für Schlitten-Lagerdeckel, 4 M3 × 20 für Führungsklemmung; Ø2,5-Piloten M3 schneiden',`${rack?4:6} M4 × 20 von unten in Führungsträger (Ø3,3-Piloten M4 schneiden)`];
 if(!rack){
  parts.push(part('fixed-radial','Separater radialer Festlagerträger',1,'translate([0,0,-6]) rear();'),part('radial-cap','Radiallager-Abdeckung',2,'rotate([0,-90,0]) bearing_cap();'));
  scene.push('rear();','translate([-93,0,0]) bearing_cap();',`translate([${right+12},0,0]) bearing_cap();`,`xhole(-110,0,24,8,${right+135});`);
  for(const x of [-90,right+5])scene.push(xring(x,0,24,22,8,7));
  for(const x of [-71,-56])scene.push(xring(x,0,24,16,8,5));
  for(const x of [-76,-51])scene.push(xring(x,0,24,16,8,5));
  scene.push(xring(a.q-38.5,0,24,22,8,3.5),xring(a.q-35,0,24,10,8,11.5));
  bom.push(`TR8-Spindel, Vorschub ${m.lead} mm/U, Länge ${(right+135).toFixed(1)} mm; glatte Ø8-Lagerzapfen erforderlich`, 'TR8-Flanschmutter: Körper Ø10 × 11,5, Flansch Ø22 × 3,5; vier M3 auf Ø16-Lochkreis, 45° versetzt; Katalogvorlage vor Kauf abgleichen','2 Radiallager 608 (8 × 22 × 7), 2 Axiallager 8 × 16 × 5, 2 Klemmringe Ø8 (Hülle Ø16 × 5)','4 M3 × 8 für Mutter, 4 M3 × 10 für Radiallagerdeckel; Motor/Kupplung an freiem linken Zapfen ergänzen');
 }else{
  parts.push(part('rack','Zahnstange Modul 2',1,'translate([0,-46,-19]) rack_part();'),part('rack-pinion','Ritzel Modul 2 mit Klemmnabe',1,'pinion();'),part('pinion-lower','Untere Ritzel-Lagerbrücke mit Füßen',1,`translate([0,0,-6]) pinion_plate(${low-6},true);`),part('pinion-upper','Obere Ritzel-Lagerplatte',1,`translate([0,0,${high+6}]) mirror([0,0,1]) pinion_plate(${high});`),part('pinion-post','Ritzel-Abstandshalter',2,ring(12,4.5,high-low)));
  scene.push(`translate([${a.q},0,0]) rack_part();`,`translate([${cx},80,19]) rotate([0,0,${9+(a.q-cx)*180/(20*Math.PI)}]) pinion();`,`pinion_plate(${low-6},true);`,`pinion_plate(${high});`,`translate([${cx},80,${6+m.clearance}]) cylinder(d=5,h=47);`);
  for(const x of [cx-30,cx+30])scene.push(`translate([${x},110,${low}]) ${ring(12,4.5,high-low)}`);
  for(const z of [low-2.5,high])scene.push(`translate([${cx},80,${z}]) ${ring(8,5,2.5)}`);
  for(const z of [low,37])scene.push(`translate([${cx},80,${z}]) ${ring(6,5.1,m.clearance-0.15)}`);
  bom.push('2 Lager 5 × 8 × 2,5, Ritzelwelle Ø5 × '+(47).toFixed(1)+' mm; 2 Metallhülsen Ø5,1/6 × '+(m.clearance-0.15).toFixed(2)+' mm','2 M3 × 16 für Zahnstange, 1 M3 × 4 Madenschraube (Pilot M3 schneiden)','2 M4-Gewindestangen '+Math.ceil((high+6+10)/5)*5+' mm, 4 Muttern, 4 Scheiben für Ritzel-Lagerbrücke');
 }
 return {parts,source:head+defs+scene.join('\n'),bom};
}
export function motionCAD(m:Motion){const a=resolveMotion(m);if(!a.valid)throw Error('Antriebs-/Hubprüfung verletzt.');return m.kind==='belt'?beltCAD(m):axisCAD(m);}
export function motionInstructions(m:Motion){const a=resolveMotion(m);return `Mechanics-10 Etappe E — ${m.kind}\n\n${m.kind==='belt'?`GT2, 2-mm-Teilung, 6-mm-Breite. Riemen und Scheiben sind Kaufteile; Vorschau zeigt Teilkreis-/Flanschhüllen, keine GT2-Zahngeometrie. Ausgangs-Lagerbrücke ist nur im Bereich ${a.min.toFixed(2)} bis ${a.max.toFixed(2)} mm verstellbar. Rechnerischer Achsabstand ${a.c.toFixed(3)} mm. Vor Montage Brücke mindestens 2 mm nach innen schieben, Riemen mit abnehmbaren Scheiben/Flanschen einsetzen, Brücke nach außen verschieben und beide M3-Schrauben mit breiten Scheiben klemmen. Der verbleibende Stellweg ist keine berechnete Riemenvorspannung. Nach Herstellerangaben spannen; nicht bis zum Anschlag überdehnen. Beide Wellen beidseitig lagern, Distanzhülsen nur gegen Innenringe setzen, Scheiben auf Wellen klemmen. Die feste Eingangsachse bleibt unverändert; nur die ausdrücklich freigegebene Ausgangsbrücke verschiebt sich.`:`Zwei Ø8-Führungswellen verhindern Verdrehen; vier LM8UU tragen den Schlitten. Lager in die offenen Taschen einsetzen, Schlitten-Enddeckel verschrauben, Führungswellen durchschieben und die geteilten Endhalter klemmen. M3-Pilotlöcher Ø2,5 und M4-Piloten Ø3,3 nachschneiden. Endträger von unten mit Grundplatte verschrauben. Alle Enddeckel und Halter bleiben lösbar. Erst danach Antrieb montieren.\n${m.kind==='screw'?`Flanschmutter mit vier M3-Schrauben am Schlitten befestigen: sie darf sich nicht mitdrehen. Spindel mit passenden glatten Ø8-Zapfen verwenden; keine Kugellager auf Gewindegängen laufen lassen. Linke axiale Abstützung: Klemmring – Axiallager – Führungsträger – Axiallager – Klemmring. Separater radialer Lagerträger links; rechtes Radiallager lässt den Zapfen axial gleiten. Klemmringe auf ca. 0,2 mm axiales Spiel einstellen, nicht verspannen. Mutter- und Lagermaße sind konkrete Vorlagen, keine universellen TR8-Adapter. Gewinde wird in der Vorschau nur als Hülle dargestellt; Spindel und Mutter sind Kaufteile.`:`Zahnstange an beiden Schlittenarmen verschrauben. Festes Modul-2-Ritzel zwischen zwei Lagerplatten einsetzen, Zahneingriff einstellen und Nabe auf der Welle klemmen. Ritzelphase folgt dem Schlittenweg; 20 Zähne entsprechen ${(40*Math.PI).toFixed(3)} mm/U. Die bewegte Zahnstange benötigt seitlich zusätzlichen Raum über beide Hubenden hinaus.`}\nHub 0 bis ${m.stroke} mm. Die Hubprüfung verwendet analytische Bewegungshüllen, nicht nur die aktuelle Vorschauposition. Einen Sperrraum kann man explizit vorgeben. Endlagen zunächst von Hand prüfen; Endschalter und elastische Anschläge sind vor motorischem Betrieb zu ergänzen.`}\n\nAlle Maße mm. Druckteile liegen mit Unterseite bei Z=0; Querbohrungen können Stützen/Nacharbeit benötigen. Lange Grundplatten/Zahnstangen müssen zum Druckraum passen; keine automatische Segmentierung. Kaufteile, Passungen, Werkzeugzugang und Funktionsfähigkeit sind physisch noch nicht abgenommen. Kräfte, Knicken, Drehzahlen und Lebensdauer werden nicht ausgelegt.\n`;}
