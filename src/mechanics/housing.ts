import {DEFAULT_HOUSING,parseProject,resolveProject,distanceXY} from './model.ts';
import type {Project,Check,Vec3} from './model.ts';

// Purchased bearing 5 x 8 x 2.5; inner-facing seats and an outer shoulder.
export const BEARING={id:5,od:8,width:2.5};
const HUB_RADIUS=7,HUB_HEIGHT=8,POST_RADIUS=6,SHOULDER_HOLE=6.2;
export type Part={id:string;name:string;quantity:number;source:string};
export function resolveHousing(input:Project){
 const p=parseProject(JSON.stringify(input)),r=resolveProject(p),h=p.housing??DEFAULT_HOUSING;
 const clearance=Math.max(h.clearance,p.search.margin);
 const groups=[...new Set(r.components.map(c=>c.shaft))].map((id,index)=>{
  const gears=r.components.filter(c=>c.shaft===id),pos=gears[0].position;
  return {id,index,gears,pos,low:Math.min(...gears.map(c=>c.position[2]-c.gear.width/2)),
   gearTop:Math.max(...gears.map(c=>c.position[2]+c.gear.width/2)),
   high:Math.max(...gears.map(c=>c.position[2]+c.gear.width/2))+HUB_HEIGHT};
 });
 const lower=Math.min(...groups.map(g=>g.low))-clearance;
 const upper=Math.max(...groups.map(g=>g.high))+clearance;
 const gap=upper-lower,t=h.plateThickness;
 const xs=r.components.flatMap(c=>[c.position[0]-c.gear.module*(c.gear.teeth/2+1),c.position[0]+c.gear.module*(c.gear.teeth/2+1)]);
 const ys=r.components.flatMap(c=>[c.position[1]-c.gear.module*(c.gear.teeth/2+1),c.position[1]+c.gear.module*(c.gear.teeth/2+1)]);
 const left=Math.min(...xs)-clearance-POST_RADIUS,right=Math.max(...xs)+clearance+POST_RADIUS;
 const front=Math.min(...ys)-clearance-POST_RADIUS,back=Math.max(...ys)+clearance+POST_RADIUS;
 const posts:Vec3[]=[[left,front,lower],[left,back,lower],[right,front,lower],[right,back,lower]];
 const x=left-POST_RADIUS-3,y=front-POST_RADIUS-3,width=right-left+2*(POST_RADIUS+3),depth=back-front+2*(POST_RADIUS+3);
 const checks:Check[]=r.checks.filter(c=>c.id!=='construction');
 const check=(id:string,ok:boolean,message:string)=>checks.push({id,state:ok?'pass':'fail',message});
 check('bearing-shoulder',t-BEARING.width>=1.5,'Lagersitze: mindestens 1,5 mm Schulter hinter dem Lager');
 check('bearing-retention',h.endplay<BEARING.width/2,'Axialspiel kleiner als halbe Lagertiefe; Lager bleiben in ihren Sitzen');
 check('plate-gap',clearance>=p.search.margin,'Plattenabstand hält den geforderten Freiraum ein');
 const shafts=groups.map(g=>({...g,
  lowerSleeve:g.low-lower-h.endplay/2,upperSleeve:upper-g.high-h.endplay/2,
  shaftStart:lower-t-10,shaftLength:gap+2*t+20}));
 for(const g of shafts){
  check(`sleeves:${g.id}`,Math.min(g.lowerSleeve,g.upperSleeve)>0.5,`Welle ${g.index+1}: zwei Distanzhülsen und ${h.endplay} mm axiales Gesamtspiel`);
  for(const c of r.components.filter(c=>c.shaft!==g.id)){
   // Conservative full-height radial corridor also reserves hub and grub-screw access before closing.
   check(`hub:${g.id}/${c.id}`,distanceXY(g.pos,c.position)>=HUB_RADIUS+c.gear.module*(c.gear.teeth/2+1)+clearance-1e-6,`Welle ${g.index+1}/${c.id}: Freiraum für Nabe und Montagekorridor`);
  }
  for(const other of shafts.filter(o=>o.index>g.index)){
   check(`bearing-spacing:${g.index}/${other.index}`,distanceXY(g.pos,other.pos)>=BEARING.od+h.bearingFit+3,`Wellen ${g.index+1}/${other.index+1}: Material zwischen Lagersitzen`);
  }
  for(let i=0;i<posts.length;i++)for(const c of g.gears){
   check(`post:${i}/${c.id}`,distanceXY(posts[i],c.position)>=POST_RADIUS+c.gear.module*(c.gear.teeth/2+1)+clearance-1e-6,`Abstandshalter ${i+1}/${c.id}: Bewegungsraum frei`);
  }
 }
 checks.push({id:'assembly-route',state:'pass',message:'Axialer Montageweg: obere Platte abnehmbar, gerade Wellen und von innen offene Lagersitze'});
 checks.push({id:'physical-validation',state:'unknown',message:'Passungen, Lager-Innenringkontakt, M3-Gewinde und Tragfähigkeit am gedruckten Muster prüfen. Kein Festigkeitsnachweis.'});
 const rodLength=Math.ceil((gap+2*t+12.4)/5)*5;
 const bom=[{name:'Lager 5 × 8 × 2,5 mm',quantity:shafts.length*2,note:'Kaufteil; Innenring muss zur Ø6-mm-Distanzhülse passen'},
  {name:`M4-Gewindestange, ${rodLength} mm`,quantity:4,note:'Zuschnitt; je zwei Muttern und Scheiben'},
  {name:'M4-Mutter',quantity:8,note:'außen zugänglich'},{name:'M4-Unterlegscheibe',quantity:8,note:'je 1 mm Dicke vorgesehen'},
  {name:'M3 × 4 Madenschraube',quantity:shafts.length,note:'M3 in Ø2,5-mm-Pilotloch schneiden; lokale Wellenfläche abflachen'},
  ...shafts.flatMap(g=>[{name:`Welle ${g.index+1}: Ø5 × ${g.shaftLength.toFixed(2)} mm`,quantity:1,note:'Metallwelle, Enden entgraten; 10 mm Anschlussüberstand je Seite'},
   {name:`Distanzhülse ${g.index+1} unten: ${g.lowerSleeve.toFixed(2)} mm`,quantity:1,note:'Metallrohr innen Ø5,1 / außen Ø6 mm; plan entgraten'},
   {name:`Distanzhülse ${g.index+1} oben: ${g.upperSleeve.toFixed(2)} mm`,quantity:1,note:'Metallrohr innen Ø5,1 / außen Ø6 mm; keine Druckteile'}])];
 return {p,r,h,clearance,lower,upper,gap,x,y,width,depth,posts,shafts,rodLength,checks,bom,valid:checks.every(c=>c.state!=='fail')};
}
const header='include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=64;\n';
/** Plate local coordinates: flat outer face on bed, bearing pockets face up. */
function plateBody(a:ReturnType<typeof resolveHousing>){
 const t=a.h.plateThickness;
 return `difference(){translate([${a.x},${a.y},0]) cube([${a.width},${a.depth},${t}]);
 ${a.shafts.map(g=>`translate([${g.pos[0]},${g.pos[1]},-0.1]) cylinder(d=${SHOULDER_HOLE},h=${t+0.2});
 translate([${g.pos[0]},${g.pos[1]},${t-BEARING.width}]) cylinder(d=${BEARING.od+a.h.bearingFit},h=${BEARING.width+0.1});`).join('\n')}
 ${a.posts.map(pos=>`translate([${pos[0]},${pos[1]},-0.1]) cylinder(d=4.5,h=${t+0.2});`).join('\n')}}`;
}
function gearBody(g:ReturnType<typeof resolveHousing>['shafts'][number]){
 const bore=g.gears[0].gear.bore;
 const firstCenter=Math.min(...g.gears.map(c=>c.position[2]));
 return `difference(){union(){
 ${g.gears.map(c=>`translate([0,0,${c.position[2]-g.low}]) spur_gear(mod=${c.gear.module},teeth=${c.gear.teeth},thickness=${c.gear.width},shaft_diam=0,pressure_angle=${c.gear.pressureAngle},profile_shift=0,backlash=${c.gear.backlash},spin=${c.spin});`).join('\n')}
 translate([0,0,${firstCenter-g.low}]) cylinder(d=${bore+4},h=${g.gearTop-firstCenter});
 translate([0,0,${g.gearTop-g.low-0.1}]) cylinder(d=14,h=${HUB_HEIGHT+0.1});}
 translate([0,0,-0.1]) cylinder(d=${bore},h=${g.high-g.low+0.2});
 translate([0,0,${g.gearTop-g.low+HUB_HEIGHT/2}]) rotate([0,90,0]) cylinder(d=2.5,h=8);
 }`;
}
const ring=(diameter:number,bore:number,height:number)=>`difference(){cylinder(d=${diameter},h=${height});translate([0,0,-0.1]) cylinder(d=${bore},h=${height+0.2});}`;
export function printableParts(p:Project):Part[]{
 const a=resolveHousing(p);if(!a.valid)throw Error('Gehäuse- oder Montageprüfung verletzt.');
 // Mirror in local Y to print the top plate bearing-side up; flip around X to assemble it.
 const bottom=plateBody(a),top=`mirror([0,1,0]) ${bottom}`;
 return [
  {id:'plate-bottom',name:'Untere Lagerplatte',quantity:1,source:header+`translate([${-a.x},${-a.y},0]) ${bottom}`},
  {id:'plate-top',name:'Obere Lagerplatte',quantity:1,source:header+`translate([${-a.x},${a.y+a.depth},0]) ${top}`},
  {id:'standoff',name:`Abstandshalter · ${a.gap.toFixed(2)} mm`,quantity:4,source:header+ring(12,4.5,a.gap)},
  ...a.shafts.map(g=>({id:`gear-${g.index+1}`,name:`Zahnradpaket Welle ${g.index+1}`,quantity:1,source:header+gearBody(g)}))];
}
/** Assembly is a visualization, never offered as a printable STL. Purchased parts included. */
export function housingScad(p:Project,exploded=false){
 const a=resolveHousing(p);if(!a.valid)throw Error('Gehäuse- oder Montageprüfung verletzt.');
 const lift=exploded?35:0,t=a.h.plateThickness;
 const lines=[header,`translate([0,0,${a.lower-t-lift}]) ${plateBody(a)}`,
  `translate([0,0,${a.upper+t+lift}]) mirror([0,0,1]) ${plateBody(a)}`,
  ...a.posts.map(pos=>`translate([${pos.join(',')}]) ${ring(12,4.5,a.gap)}`)];
 // Purchased fasteners shown as nominal envelopes; threads are not modeled.
 for(const pos of a.posts){
  lines.push(`translate([${pos[0]},${pos[1]},${a.lower-t-6.2}]) cylinder(d=4,h=${a.rodLength});`);
  for(const z of [a.lower-t-1-lift,a.upper+t+lift])lines.push(`translate([${pos[0]},${pos[1]},${z}]) ${ring(9,4.5,1)}`);
  for(const z of [a.lower-t-4.2-lift,a.upper+t+1+lift])lines.push(`translate([${pos[0]},${pos[1]},${z}]) difference(){cylinder(d=8.1,h=3.2,$fn=6);translate([0,0,-0.1]) cylinder(d=4,h=3.4);}`);
 }
 for(const g of a.shafts){
  lines.push(`translate([${g.pos[0]},${g.pos[1]},${g.low}]) ${gearBody(g)}`);
  lines.push(`translate([${g.pos[0]},${g.pos[1]},${g.shaftStart}]) cylinder(d=5,h=${g.shaftLength});`);
  for(const z of [a.lower-BEARING.width-lift,a.upper+lift])lines.push(`translate([${g.pos[0]},${g.pos[1]},${z}]) ${ring(BEARING.od,5,BEARING.width)}`);
  lines.push(`translate([${g.pos[0]},${g.pos[1]},${a.lower+a.h.endplay/2}]) ${ring(6,5.1,g.lowerSleeve)}`,
   `translate([${g.pos[0]},${g.pos[1]},${g.high}]) ${ring(6,5.1,g.upperSleeve)}`);
 }
 return lines.join('\n');
}
export function assemblyInstructions(p:Project){
 const a=resolveHousing(p);
 return `Mechanics-10 — Montageentwurf\n
1. Zwei Lagerplatten mit Taschen nach oben drucken. Vier Abstandshalter drucken. Zahnradpakete stehen im STL mit der Unterseite bei Z=0; Doppelzahnräder benötigen je nach Geometrie Stützmaterial. Alle Flächen und Bohrungen entgraten.
2. Erst einen Lagersitz als Passprobe drucken. Lagersitz-Durchmesser ${8+a.h.bearingFit} mm; Lager 5 × 8 × 2,5 mm. Passung anhand des Druckers einstellen. Lager dürfen nicht klemmen; Distanzhülsen dürfen nur die Innenringe berühren, nicht Dichtung oder Außenring. Eignung des konkreten Lagers am Muster prüfen.
3. Ø5-mm-Metallwellen und Metall-Distanzhülsen nach Stückliste ablängen. Rohr innen Ø5,1 / außen Ø6 mm. Enden plan schleifen und entgraten. In die Ø2,5-mm-Radialbohrungen der gedruckten Naben M3-Gewinde schneiden. Wellen lokal für Madenschrauben abflachen, Lagerlaufflächen rund lassen.
4. Zahnradpakete außerhalb des Gehäuses auf die Wellen schieben, ausrichten und mit M3 × 4 Madenschrauben fixieren. Stirnräder seitlich zueinander in Eingriff bringen, Zahnstellung wie in der Vorschau. Die vollständige Getriebekette gemeinsam einsetzen; einzelne große Räder nicht durch bereits montierte Räder anderer Ebenen schieben.
5. Untere Lager in die nach innen offenen Sitze einsetzen. Untere Distanzhülsen auffädeln. Die vorgerichtete Kette gemeinsam in die unteren Lager absenken; eine Montagehilfe ist bei mehreren Wellen sinnvoll. Vier Abstandshalter und M4-Gewindestangen einsetzen.
6. Obere Distanzhülsen und Lager auf die Wellen schieben. Obere Platte umdrehen (Taschen nach innen) und parallel über alle Wellen absenken. Sie darf keinen Druck auf die rotierende Kette ausüben. M4-Scheiben und Muttern außen über Kreuz anziehen. Abstandshalter bestimmen ${a.gap.toFixed(2)} mm Platteninnenabstand.
7. Von Hand drehen und ${a.h.endplay} mm axiales Gesamtspiel kontrollieren. Hülsen bei Bedarf nacharbeiten; Lager nicht axial verspannen. Demontage: obere Muttern lösen, Platte axial abheben, komplette Kette herausnehmen.

Offenes Plattengehäuse ohne Berührschutz. Wellen, Lager, Distanzhülsen und Schrauben sind Kauf-/Zuschnittteile, keine STL-Druckteile. Die gefangene Zahnrad-/Hülsenkette begrenzt axiale Bewegung; Madenschrauben dürfen sich nicht lösen. Für Lastbetrieb sind Sicherung und Tragfähigkeit gesondert zu prüfen.
Softwareprüfungen sind keine Druck-/Montagefreigabe. Ein physisches Muster wurde nicht geprüft.\n`;
}
