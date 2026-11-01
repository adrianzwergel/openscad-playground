import {initialProject,resolveProject} from './model.ts';
import type {Vec3,Check} from './model.ts';
import {resolveHousing,housingScad,printableParts,assemblyInstructions} from './housing.ts';
import {defaultSpatial,resolveSpatial} from './spatial.ts';
import {spatialCAD,spatialInstructions} from './spatial-cad.ts';
import {defaultMotion,resolveMotion,beltCenter} from './motion.ts';
import {motionCAD,motionInstructions} from './motion-cad.ts';
import {parseMixed,parseChoice} from './mixed-model.ts';
import type {MixedSpec,MixedChoice} from './mixed-model.ts';
const strip=(s:string)=>s.replace(/^include[^\n]*\n/gm,'').replace(/\$fn=\d+;/g,'');
const stageSpacer='difference(){cylinder(d=14,h=10);translate([0,0,-0.1]) cylinder(d=4.5,h=10.2);translate([0,0,5.5]) cylinder(d=9.5,h=4.6);}';
const header='include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;\n';
const move=(v:number[])=>`translate([${v.join(',')}])`;
const tube=(od:number,id:number,h:number)=>`difference(){cylinder(d=${od},h=${h});translate([0,0,-0.1]) cylinder(d=${id},h=${h+.2});}`;
export function resolveMixed(spec:MixedSpec,choice:MixedChoice){
 const m=parseMixed(spec),c=parseChoice(choice),worm={...defaultSpatial('worm'),teeth:c.wheel,starts:c.starts},w=resolveSpatial(worm);
 const origin:Vec3=[m.input[0]+(c.offset??0),m.input[1]-w.spacing,m.input[2]],dx=m.output[0]-origin[0],dy=m.output[1]-origin[1],distance=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;
 const gearProject=initialProject();gearProject.targetRatio=c.zb/c.za;gearProject.components[0].catalogId=`spur-m2-z${c.kind==='spur'?c.za:20}`;gearProject.components[1].catalogId=`spur-m2-z${c.kind==='spur'?c.zb:40}`;gearProject.components[1].position=[c.za+c.zb,0,0];gearProject.axes.output=[c.za+c.zb,0,0];
 const h=resolveHousing(gearProject),motion={...defaultMotion('belt'),teethA:c.za,teethB:c.zb,center:Math.max(40,Math.min(350,distance)),travel:8,beltLength:c.belt||300},b= c.kind==='belt'?resolveMotion(motion):null;
 const baseZ=c.kind==='spur'?m.output[2]-origin[2]+h.lower-h.h.plateThickness:m.output[2]-origin[2]-20;
 const adapterZ=baseZ-16,roof=w.hi[2]+8,columnHeight=adapterZ-roof,wormTip=baseZ-11,extension=wormTip-w.shafts[1].tip;
 const rotate=(x:number,y:number):[number,number]=>[x*Math.cos(angle*Math.PI/180)-y*Math.sin(angle*Math.PI/180),x*Math.sin(angle*Math.PI/180)+y*Math.cos(angle*Math.PI/180)];
 const bw=b?Math.max(...[b.r,b.R].map(r=>Math.max(r+1.5,8)+motion.clearance+4))+10:0;
 const mounts=(c.kind==='spur'?h.posts.map(p=>[p[0],p[1]]):[-15,b!.max+35].flatMap(x=>[-bw+5,bw-5].map(y=>[x,y]))).map(p=>rotate(p[0],p[1]));
 const columns=[w.lo[0]+10,w.hi[0]-10].flatMap(x=>[w.lo[1]+10,w.hi[1]-10].map(y=>[x,y] as [number,number]));
 const corners=(c.kind==='spur'?[[h.x,h.y],[h.x+h.width,h.y],[h.x,h.y+h.depth],[h.x+h.width,h.y+h.depth]]:[[-20,-bw],[-20,bw],[b!.max+40,-bw],[b!.max+40,bw]]).map(p=>rotate(p[0],p[1]));
 const xmin=Math.min(w.lo[0]-8,...corners.map(p=>p[0]))-4,xmax=Math.max(w.hi[0]+8,...corners.map(p=>p[0]))+4,ymin=Math.min(w.lo[1]-8,...corners.map(p=>p[1]))-4,ymax=Math.max(w.hi[1]+8,...corners.map(p=>p[1]))+4;
 const checks:Check[]=[...w.checks.map(k=>({...k,state:k.state as Check['state'],id:'worm/'+k.id})),...(c.kind==='spur'?h.checks:b!.checks).map(k=>({...k,id:'stage/'+k.id}))];
 const check=(id:string,ok:boolean,message:string)=>checks.push({id,state:ok?'pass':'fail',message});
 const ratio=c.wheel/c.starts*c.zb/c.za,error=Math.abs(ratio-m.target)/m.target;
 check('belt-span',c.kind==='spur'||distance>=40&&distance<=350,'Riemen-Achsabstand im Bereich 40–350 mm');
 check('input-axis-travel',Math.abs(c.offset??0)<=m.travel+1e-7,'Stufenposition innerhalb des erlaubten Bereichs entlang der unveränderten Eingangsachse');
 check('family',m.allow==='both'||m.allow===c.kind,'Gewählte Komponentenfamilie erlaubt');check('ratio',error<=m.tolerance/100+1e-9,'Gesamtübersetzung innerhalb der Vorgabe');
 const required=c.kind==='spur'?c.za+c.zb:b!.c;
 check('fixed-axes',Math.abs(distance-required)<1e-5,'Feste XY-Ausgangsachse durch exakten Achsabstand erreicht');
 check('bridge-height',columnHeight>=12&&columnHeight<=150,`Gehäusebrücke ${columnHeight.toFixed(2)} mm; erlaubt 12–150 mm`);
 check('shaft-extension',extension>=0&&extension<=150,`Schneckenradwelle um ${extension.toFixed(2)} mm verlängert; Kupplung mit 1 mm Wellenstoßspalt`);
 check('bridge-corridors',columns.every(p=>Math.hypot(...p)>17&&Math.hypot(p[0]-dx,p[1]-dy)>11),'Brückenstützen außerhalb der Wellen- und Kupplungskorridore');
 check('mount-spacing',columns.every(p=>mounts.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>=13)),'Getrennte Befestigungslöcher für Brücke und Oberstufe');
 check('mount-shafts',mounts.every(p=>Math.hypot(...p)>17&&Math.hypot(p[0]-dx,p[1]-dy)>11.5),'Befestigungen außerhalb der Wellenkorridore');
 checks.push({id:'coupling',state:'unknown',message:'Ø5/5-Metallkupplung: Hülle Ø14 × 12, Einstecktiefe 5,5 mm je Welle. Verfügbarkeit, Klemmung und Ausrichtung am Muster prüfen.'});
 return {m,c,w,worm,origin,distance,angle,gearProject,h,motion,b,baseZ,adapterZ,roof,columnHeight,wormTip,extension,mounts,columns,xmin,xmax,ymin,ymax,ratio,error,checks,valid:checks.every(k=>k.state!=='fail'),ports:[{name:'input',position:m.input,axis:[1,0,0] as Vec3},{name:'output',position:m.output,axis:[0,0,1] as Vec3}]};
}
export function searchMixed(input:MixedSpec,candidates:MixedChoice[]){
 const m=parseMixed(input);if(!Array.isArray(candidates)||candidates.length>2000)throw Error('Ungültige Kandidatenliste.');
 const reasons:Record<string,number>={},solutions:ReturnType<typeof resolveMixed>[]=[];
 for(const raw of candidates){const c=parseChoice(raw),spacing=c.wheel/Math.sqrt(1-(c.starts*2/24)**2)+12,dy=m.output[1]-(m.input[1]-spacing),required=c.kind==='spur'?c.za+c.zb:beltCenter(c.belt,c.za/Math.PI,c.zb/Math.PI);
  if(!Number.isFinite(required)||Math.abs(dy)>required+1e-7){reasons['axis-reach']=(reasons['axis-reach']||0)+1;continue;}
  // Circle/line intersections: move the worm along +X without moving either port axis.
  const along=Math.sqrt(Math.max(0,required**2-dy**2)),offsets=[...new Set([m.output[0]-m.input[0]-along,m.output[0]-m.input[0]+along])];
  for(const offset of offsets){if(Math.abs(offset)>m.travel+1e-7||Math.abs(offset)>150){reasons['input-axis-travel']=(reasons['input-axis-travel']||0)+1;continue;}
   const a=resolveMixed(m,{...c,offset});if(a.valid)solutions.push(a);else for(const k of a.checks.filter(k=>k.state==='fail'))reasons[k.id]=(reasons[k.id]||0)+1;
  }
 }
 solutions.sort((a,b)=>a.error-b.error||(a.xmax-a.xmin)*(a.ymax-a.ymin)-(b.xmax-b.xmin)*(b.ymax-b.ymin)||Math.abs(a.c.offset??0)-Math.abs(b.c.offset??0));return {solutions:solutions.slice(0,40),total:solutions.length,candidates:candidates.length,reasons};
}

export function mixedCAD(m:MixedSpec,c:MixedChoice,exploded=false){
 const a=resolveMixed(m,c);if(!a.valid)throw Error('Gemischte Kette verletzt Anschluss- oder Konstruktionsregeln.');
 const worm=spatialCAD(a.worm,exploded?'open':'housing'),stage=c.kind==='spur'?null:motionCAD(a.motion);
 const sceneHeader=header+strip(worm.definitions),wormBody=worm.source.slice(worm.definitions.length);
 const localMounts=c.kind==='spur'?a.h.posts.map(p=>[p[0],p[1]]):[-15,a.b!.max+35].flatMap(x=>[-(Math.max(...[a.b!.r,a.b!.R].map(r=>Math.max(r+1.5,8)+6))+10)+5,(Math.max(...[a.b!.r,a.b!.R].map(r=>Math.max(r+1.5,8)+6))+10)-5].map(y=>[x,y]));
 const drill=(points:number[][],z:number,height:number,d=4.5)=>points.map(p=>`${move([p[0],p[1],z])} cylinder(d=${d},h=${height});`).join('\n');
 const topDrill=drill(a.columns,a.roof-8.1,8.2);
 const adapter=`difference(){translate([${a.xmin},${a.ymin},0]) cube([${a.xmax-a.xmin},${a.ymax-a.ymin},6]);${drill([...a.columns,...a.mounts],-.1,6.2)}${drill([[0,0]],-.1,6.2,18)}${drill([[m.output[0]-a.origin[0],m.output[1]-a.origin[1]]],-.1,6.2,10)}}`;
 const wormParts=worm.parts.map(p=>p.id==='panel-2-1'?{...p,source:header+`difference(){${strip(p.source)}${drill(a.columns,-.1,8.2)}}`}:p);
 const stageParts=c.kind==='spur'?printableParts(a.gearProject):stage!.parts.map(p=>p.id==='belt-base'?{...p,source:header+`difference(){${strip(p.source)}${drill(localMounts,-.1,6.2)}}`}:p);
 const parts=[...wormParts.map(p=>({...p,id:'worm-'+p.id})),...stageParts.map(p=>({...p,id:'stage-'+p.id})),{id:'bridge-deck',name:'Brückenplatte',quantity:1,source:header+adapter},{id:'bridge-column',name:'Gehäusebrückenstütze',quantity:4,source:header+tube(12,4.5,a.columnHeight)},{id:'stage-spacer',name:'Abstandshalter Oberstufe',quantity:4,source:header+stageSpacer}];
 const stageZ=c.kind==='spur'?m.output[2]-a.origin[2]:a.baseZ;
 const stageSource=c.kind==='spur'?strip(housingScad(a.gearProject,exploded)):`difference(){union(){${strip(stage!.source)}}${drill(localMounts,-.1,6.2)}} translate([0,0,-10]) cylinder(d=5,h=12);`;
 const placed=`${move([0,0,stageZ])} rotate([0,0,${a.angle}]) {${stageSource}}`;
 const bridge=a.columns.map(p=>`${move([p[0],p[1],a.roof])} ${tube(12,4.5,a.columnHeight)}`).join('\n');
 const spacers=a.mounts.map(p=>`${move([p[0],p[1],a.adapterZ+6])} ${stageSpacer}`).join('\n');
 const fasteners=[...a.columns.map(p=>`${move([p[0],p[1],a.roof-12])} cylinder(d=4,h=${a.columnHeight+24});`),...a.mounts.map(p=>`${move([p[0],p[1],a.adapterZ-5])} cylinder(d=4,h=${c.kind==='spur'?a.h.rodLength+16:32});`)].join('\n');
 const source=sceneHeader+`${move(a.origin)} {difference(){union(){${wormBody}}${topDrill}} ${move([0,0,a.w.shafts[1].tip])} cylinder(d=5,h=${a.extension});${move([0,0,a.wormTip-5.5])} ${tube(14,5.1,12)} ${placed}${bridge}${spacers}${fasteners}${move([0,0,a.adapterZ-(exploded?20:0)])} ${adapter}}`;
 const bom=[...worm.bom.filter(s=>!s.startsWith('Schneckenrad:')),`Schneckenradwelle Ø5 × ${(a.wormTip-a.w.shafts[1].cart+22).toFixed(2)} mm (ersetzt Standardwelle)`,...(c.kind==='spur'?a.h.bom.map(b=>`${b.quantity} × ${b.name}: ${b.note}`):stage!.bom),...(c.kind==='belt'?['Eingangs-Riemenwelle Ø5 × 62 mm, lokal -10 bis 52 (ersetzt eine 50-mm-Welle)']:[]),'1 Metall-Wellenkupplung Ø5/5, Hülle Ø14 × 12; je 5,5 mm Eingriff, 1 mm Stoßspalt',`4 M4-Gewindestangen für Brücke, Länge ${Math.ceil((a.columnHeight+24)/5)*5} mm; 8 Muttern + Scheiben`,c.kind==='spur'?`Vier Oberstufen-Gewindestangen um 16 mm verlängern; zusätzlich vier Muttern + Scheiben unter Brückenplatte`:'4 M4 × 35 zur Befestigung der Riemenbasis, Muttern und Scheiben'];
 const probeGroups=[`difference(){union(){${wormBody}}${topDrill}} ${move([0,0,a.w.shafts[1].tip])} cylinder(d=5,h=${a.extension});`,placed,`${bridge}${spacers}${move([0,0,a.adapterZ])} ${adapter}`,`${move([0,0,a.wormTip-5.5])} ${tube(14,5.1,12)}`];
 return {parts,bom,source,checks:a.checks,ports:a.ports,probeGroups,header:sceneHeader};
}
export function mixedInstructions(m:MixedSpec,c:MixedChoice){const a=resolveMixed(m,c);return `Gemischte Kette: Schnecke → ${c.kind}.\n${spatialInstructions(a.worm)}\nOberstufe:\n${c.kind==='spur'?assemblyInstructions(a.gearProject):motionInstructions(a.motion)}\nGemeinsame Montage:\n1. Schneckenstufe mit verlängerter Ausgangswelle montieren. Gehäusedeckel enthält vier Brückenbohrungen. Brückenstangen von innen befestigen, dann Deckel schließen.\n2. Kupplung auf untere Welle schieben und untere Klemmung vor Einsetzen der Brückenplatte festziehen. Vier Stützen und Brückenplatte verschrauben. Kupplung läuft frei in Ø18-Öffnung.\n3. Oberstufe mit vier 10-mm-Distanzhülsen einsetzen. Eingangswelle 5,5 mm in Kupplung führen, 1 mm Stoßspalt lassen. Obere Kupplungsklemmung vor Schließen der Oberstufe befestigen. Kein zusätzliches Radiallager am Kupplungsstoß.\n4. Beide Stufen separat zweifach lagern. Ihre Wellen bleiben getrennt; Lager nicht durch Kupplung verspannen. Fluchtung und Axialspiel am Muster einstellen.\n5. ${c.kind==='belt'?'Ausgangs-Lagerbrücke zum Riemenauflegen lösen, innerhalb ±4 mm verstellen. Im Betrieb auf den vorgegebenen Achsabstand zurückstellen und klemmen. Mindestens 2 mm Entspannweg und 1 mm Nachspannreserve sind geprüft.':'Zahneingriff mit abgenommener oberer Lagerplatte prüfen.'}\nÜbersetzung ${a.ratio}:1. Anschlüsse sind Achsreferenzen am Eingriffs-/Riemenniveau, keine Stirnflächen der Wellen. Eingang +X, Ausgang +Z. Montagebrücke und Kupplung nur geometrisch geprüft; Festigkeit, Lagerlasten und reale Fertigbarkeit bleiben offen.\n`;}
