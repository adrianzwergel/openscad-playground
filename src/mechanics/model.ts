import {parseMechanism} from './graph/model.ts';
import type {Mechanism} from './graph/contracts.ts';
import {parseMixed} from './mixed-model.ts';
import type {MixedSpec} from './mixed-model.ts';
import {parseMotion} from './motion.ts';
import type {Motion} from './motion.ts';
import {parseSpatial} from './spatial.ts';
import type {Spatial} from './spatial.ts';
/** Millimetres and degrees. Stage C: unshifted spur gears on parallel +Z shaft axes. */
export const CATALOG_VERSION = 'mechanics10-spur-1';
export type Vec3 = [number, number, number];
export type Gear = {id:string; kind:'spur'; teeth:number; module:number; pressureAngle:number; width:number; bore:number; backlash:number};
export const CATALOG: readonly Gear[] = [2,3].flatMap(module => [20,30,40,50].map(teeth => ({
  id:`spur-m${module}-z${teeth}`, kind:'spur' as const, teeth, module, pressureAngle:20, width:10, bore:5.1, backlash:0.15,
})));
export type Instance = {id:string; catalogId:string; position:Vec3};
export type Endpoint = {component:string; port:'shaft'|'teeth'};
export type Connection = {kind:'external-spur-mesh'|'rigid-shaft'; a:Endpoint; b:Endpoint};
export type SearchSettings = {maxLayers:1|2; layerSpacing:number; margin:number; maxError:number; direction:'any'|'same'|'opposite'};
export type HousingSettings={plateThickness:number;clearance:number;bearingFit:number;endplay:number};
export const DEFAULT_HOUSING:HousingSettings={plateThickness:6,clearance:2,bearingFit:0.15,endplay:0.3};
export type Project = {format:'mechanics10'; version:6; catalogVersion:typeof CATALOG_VERSION; name:string;
  targetRatio:number; components:Instance[]; input:Endpoint; output:Endpoint; connections:Connection[];
  axes:{input:Vec3; output:Vec3}; search:SearchSettings;housing?:HousingSettings;motion?:Motion;spatial?:Spatial;mixed?:MixedSpec;graph?:Mechanism};
export type Check = {id:string; state:'pass'|'fail'|'unknown'; message:string};
export const gear = (id:string) => {const g=CATALOG.find(g=>g.id===id);if(!g)throw Error(`Unbekannter Katalogeintrag: ${id}`);return g;};
export function initialProject():Project {
  return {format:'mechanics10',version:6,catalogVersion:CATALOG_VERSION,name:'Mein Getriebe',targetRatio:2.1,
    components:[{id:'input',catalogId:'spur-m2-z20',position:[0,0,0]},{id:'output',catalogId:'spur-m2-z40',position:[60,0,0]}],
    input:{component:'input',port:'shaft'},output:{component:'output',port:'shaft'},
    connections:[{kind:'external-spur-mesh',a:{component:'input',port:'teeth'},b:{component:'output',port:'teeth'}}],
    axes:{input:[0,0,0],output:[60,0,0]},search:{maxLayers:2,layerSpacing:15,margin:1,maxError:100,direction:'any'}};
}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Objekt erwartet.');return v as Record<string,unknown>;}
function string(v:unknown):string{if(typeof v!=='string'||!v.length||v.length>100)throw Error('Ungültiger Text (1–100 Zeichen).');return v;}
function number(v:unknown):number{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10000)throw Error('Ungültiger Zahlenwert.');return v;}
function vector(v:unknown):Vec3{if(!Array.isArray(v)||v.length!==3)throw Error('Position muss [x,y,z] enthalten.');return v.map(number) as Vec3;}
/** Files carry design inputs, never executable code, URLs or cached solver results. */
export function parseProject(text:string):Project {
  if(text.length>100000)throw Error('Projektdatei ist zu groß (max. 100 KB).');
  const p=object(JSON.parse(text));
  if(p.format!=='mechanics10'||![1,2,3,4,5,6].includes(p.version as number))throw Error('Projektformat oder Version wird nicht unterstützt.');
  if([p.motion,p.spatial,p.mixed,p.graph].filter(x=>x!==undefined).length>1)throw Error('Nur eine aktive Baugruppen-Vorlage erlaubt.');
  if(p.catalogVersion!==CATALOG_VERSION)throw Error('Katalogversion wird nicht unterstützt.');
  if(!Array.isArray(p.components)||p.components.length<2||p.components.length>6)throw Error('Zwei bis sechs Stirnräder erforderlich.');
  const components=p.components.map(v=>{const c=object(v);const catalogId=string(c.catalogId);gear(catalogId);return {id:string(c.id),catalogId,position:vector(c.position)};});
  if(new Set(components.map(c=>c.id)).size!==components.length)throw Error('Komponenten-IDs müssen eindeutig sein.');
  function endpoint(v:unknown,port:Endpoint['port']):Endpoint{const e=object(v);const component=string(e.component);
    if(e.port!==port||!components.some(c=>c.id===component))throw Error('Unbekannter Anschluss.');return {component,port};}
  const input=endpoint(p.input,'shaft'),output=endpoint(p.output,'shaft');
  if(input.component===output.component)throw Error('Eingang und Ausgang müssen verschieden sein.');
  if(!Array.isArray(p.connections)||p.connections.length!==components.length-1)throw Error('Eine zusammenhängende Übertragungskette ist erforderlich.');
  const connections=p.connections.map(v=>{const c=object(v);if(c.kind!=='external-spur-mesh'&&c.kind!=='rigid-shaft')throw Error('Unbekannte Paarungsregel.');
    const port=c.kind==='rigid-shaft'?'shaft':'teeth';const a=endpoint(c.a,port),b=endpoint(c.b,port);
    if(a.component===b.component)throw Error('Selbstverbindung ist nicht erlaubt.');return {kind:c.kind,a,b} as Connection;});
  const seen=new Set<string>();const walk=(id:string,parent?:string)=>{if(seen.has(id))throw Error('Zyklische oder doppelte Verbindung.');seen.add(id);
    const edges=connections.filter(c=>c.a.component===id||c.b.component===id);
    if(edges.length>2)throw Error('Nur unverzweigte Übertragungsketten werden unterstützt.');
    for(const edge of edges){const next=edge.a.component===id?edge.b.component:edge.a.component;if(next!==parent)walk(next,id);}};
  walk(input.component);if(seen.size!==components.length)throw Error('Nicht verbundene Komponenten.');
  for(const id of [input.component,output.component])if(connections.filter(c=>c.a.component===id||c.b.component===id).length!==1)throw Error('Ein- und Ausgang müssen die Enden der Kette sein.');
  const targetRatio=number(p.targetRatio);if(targetRatio<=0||targetRatio>100)throw Error('Soll-Untersetzung muss größer 0 bis 100 sein.');
  const defaults=initialProject().search;
  const s=p.version===1?defaults:object(p.search);
  if(s.maxLayers!==1&&s.maxLayers!==2)throw Error('Es sind eine oder zwei Ebenen erlaubt.');
  if(!['any','same','opposite'].includes(s.direction as string))throw Error('Ungültige Drehrichtung.');
  const layerSpacing=number(s.layerSpacing),margin=number(s.margin),maxError=number(s.maxError);
  if(layerSpacing<10||layerSpacing>100||margin<0||margin>20||maxError<0||maxError>1000)throw Error('Ungültige Suchgrenzen.');
  const axes=p.version===1?{input:components.find(c=>c.id===input.component)!.position,output:components.find(c=>c.id===output.component)!.position}:object(p.axes);
  let housing:HousingSettings|undefined;
  if(p.housing!==undefined){const h=object(p.housing);housing={plateThickness:number(h.plateThickness),clearance:number(h.clearance),bearingFit:number(h.bearingFit),endplay:number(h.endplay)};
    if(housing.plateThickness<4||housing.plateThickness>15||housing.clearance<1||housing.clearance>20||housing.bearingFit<0||housing.bearingFit>0.5||housing.endplay<0.1||housing.endplay>0.8)throw Error('Ungültige Gehäuseparameter.');}
  return {format:'mechanics10',version:6,catalogVersion:CATALOG_VERSION,name:string(p.name),targetRatio,components,input,output,connections,
    axes:{input:vector(axes.input),output:vector(axes.output)},search:{maxLayers:s.maxLayers,layerSpacing,margin,maxError,direction:s.direction as SearchSettings['direction']},...(housing?{housing}:{}),...(p.motion!==undefined?{motion:parseMotion(p.motion)}:{}),...(p.spatial!==undefined?{spatial:parseSpatial(p.spatial)}:{}),...(p.mixed!==undefined?{mixed:parseMixed(p.mixed)}:{}),...(p.graph!==undefined?{graph:parseMechanism(p.graph)}:{})};
}
export function serializeProject(p:Project){return JSON.stringify(parseProject(JSON.stringify(p)),null,2)+'\n';}
export const distanceXY=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const EPS=1e-6;
export function resolveProject(project:Project){
  const p=parseProject(JSON.stringify(project));
  const checks:Check[]=[];
  const check=(id:string,ok:boolean,message:string)=>checks.push({id,state:ok?'pass':'fail',message});
  const byId=new Map(p.components.map(c=>[c.id,{...c,gear:gear(c.catalogId),spin:0,speed:0,shaft:c.id}]));
  const root=byId.get(p.input.component)!;root.speed=1;
  const visited=new Set([root.id]);
  function visit(a:typeof root){for(const edge of p.connections){
    const other=edge.a.component===a.id?edge.b.component:edge.b.component===a.id?edge.a.component:undefined;
    if(!other||visited.has(other))continue;const b=byId.get(other)!;visited.add(other);
    const key=`${a.id}/${b.id}`;
    if(edge.kind==='rigid-shaft'){
      check(`coaxial:${key}`,distanceXY(a.position,b.position)<EPS,`${key}: gemeinsame Wellenachse`);
      check(`separation:${key}`,Math.abs(a.position[2]-b.position[2])>=(a.gear.width+b.gear.width)/2+p.search.margin-EPS,`${key}: axialer Abstand für Doppelzahnrad`);
      b.speed=a.speed;b.spin=a.spin;b.shaft=a.shaft;
    }else{
      const required=(a.gear.module*a.gear.teeth+b.gear.module*b.gear.teeth)/2;
      const dist=distanceXY(a.position,b.position);
      check(`module:${key}`,a.gear.module===b.gear.module,`${key}: gleicher Modul`);
      check(`pressure-angle:${key}`,a.gear.pressureAngle===b.gear.pressureAngle,`${key}: gleicher Eingriffswinkel`);
      check(`distance:${key}`,Math.abs(dist-required)<EPS,`${key}: Achsabstand ${dist.toFixed(3)} / ${required} mm`);
      check(`plane:${key}`,Math.abs(a.position[2]-b.position[2])<EPS,`${key}: gleiche Verzahnungsebene`);
      const angle=Math.atan2(b.position[1]-a.position[1],b.position[0]-a.position[0])*180/Math.PI;
      b.spin=angle+90-180/b.gear.teeth-(a.spin-(angle-90))*a.gear.teeth/b.gear.teeth;
      b.speed=-a.speed*a.gear.teeth/b.gear.teeth;
    }
    visit(b);
  }}visit(root);
  const components=[root,...p.components.filter(c=>c.id!==root.id&&c.id!==p.output.component).map(c=>byId.get(c.id)!),byId.get(p.output.component)!];
  const output=byId.get(p.output.component)!;
  check('input-axis',distanceXY(root.position,p.axes.input)<EPS,'Feste Eingangsachse eingehalten');
  check('output-axis',distanceXY(output.position,p.axes.output)<EPS,'Feste Ausgangsachse eingehalten');
  for(const c of components){const level=(c.position[2]-p.axes.input[2])/p.search.layerSpacing;
    check(`level:${c.id}`,Math.abs(level-Math.round(level))<EPS&&level>=-EPS&&level<=p.search.maxLayers-1+EPS,`${c.id}: zulässige Ebene`);}
  const isMesh=(a:string,b:string)=>p.connections.some(e=>e.kind==='external-spur-mesh'&&[e.a.component,e.b.component].includes(a)&&[e.a.component,e.b.component].includes(b));
  const outer=(c:typeof root)=>c.gear.module*(c.gear.teeth/2+1);
  // Conservative swept cylinders: no tooth-by-tooth sampled collision certificate.
  for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++){
    const a=components[i],b=components[j];if(isMesh(a.id,b.id))continue;
    const axial=Math.max(0,Math.abs(a.position[2]-b.position[2])-(a.gear.width+b.gear.width)/2);
    const radial=Math.max(0,distanceXY(a.position,b.position)-outer(a)-outer(b));
    check(`clearance:${a.id}/${b.id}`,Math.hypot(axial,radial)>=p.search.margin-EPS&&!(axial===0&&radial===0),`${a.id}/${b.id}: Hüllkörper-Freiraum ≥ ${p.search.margin} mm`);
  }
  const shafts=[...new Set(components.map(c=>c.shaft))];
  // Reserve through-shaft corridors across all used levels, without claiming bearing design.
  for(const id of shafts){const own=components.filter(c=>c.shaft===id);const pos=own[0].position;const radius=Math.max(...own.map(c=>c.gear.bore/2))+(own.length>1?2:0);
    for(const c of components.filter(c=>c.shaft!==id))check(`shaft-clearance:${id}/${c.id}`,distanceXY(pos,c.position)>=radius+outer(c)+p.search.margin-EPS,`Welle ${id}/${c.id}: Wellenkorridor frei`);
  }
  const ratio=Math.abs(1/output.speed),direction=output.speed>0?'gleichläufig':'gegenläufig';
  const ports=components.flatMap(c=>[{component:c.id,name:'shaft',kind:'shaft-bore',position:c.position,axis:[0,0,1],diameter:c.gear.bore},
    {component:c.id,name:'teeth',kind:'external-spur',position:c.position,axis:[0,0,1],module:c.gear.module,pressureAngle:c.gear.pressureAngle,pitchRadius:c.gear.module*c.gear.teeth/2,width:c.gear.width,spin:c.spin}]);
  checks.push({id:'construction',state:'unknown',message:'Lager, Gehäuse, Befestigung und Montage noch ungeprüft. Hüllkörper ersetzen keine Detailprüfung.'});
  const x=components.flatMap(c=>[c.position[0]-outer(c),c.position[0]+outer(c)]),y=components.flatMap(c=>[c.position[1]-outer(c),c.position[1]+outer(c)]);
  return {components,ports,checks,valid:checks.every(c=>c.state!=='fail'),ratio,error:Math.abs(ratio-p.targetRatio)/p.targetRatio,
    requiredDistance:(root.gear.module*root.gear.teeth+output.gear.module*output.gear.teeth)/2,actualDistance:distanceXY(root.position,output.position),direction,
    shaftCount:shafts.length,layers:new Set(components.map(c=>c.position[2])).size,stages:p.connections.filter(c=>c.kind==='external-spur-mesh').length,
    bounds:{width:Math.max(...x)-Math.min(...x),height:Math.max(...y)-Math.min(...y)}};
}
export function generateScad(p:Project){
  const r=resolveProject(p);if(!r.valid)throw Error('Paarungs- oder Freiraumregeln verletzt.');
  const lines=['include <BOSL2/std.scad>','include <BOSL2/gears.scad>','$fn=48;'];
  const rendered=new Set<string>();
  for(const c of r.components){if(rendered.has(c.shaft))continue;rendered.add(c.shaft);
    const group=r.components.filter(g=>g.shaft===c.shaft);
    lines.push('union() {');
    for(const g of group)lines.push(`translate([${g.position.join(',')}]) spur_gear(mod=${g.gear.module}, teeth=${g.gear.teeth}, thickness=${g.gear.width}, shaft_diam=${g.gear.bore}, pressure_angle=${g.gear.pressureAngle}, profile_shift=0, backlash=${g.gear.backlash}, spin=${g.spin});`);
    if(group.length>1){const low=Math.min(...group.map(g=>g.position[2])),high=Math.max(...group.map(g=>g.position[2]));const bore=Math.max(...group.map(g=>g.gear.bore));
      lines.push(`translate([${c.position[0]},${c.position[1]},${low}]) difference() { cylinder(h=${high-low},d=${bore+4}); translate([0,0,-0.1]) cylinder(h=${high-low+0.2},d=${bore}); }`);}
    lines.push('}');
  }
  return lines.join('\n')+'\n';
}
/** Legacy manual edit action; never used by stage-C search. Changes the output axis explicitly. */
export function alignPair(p:Project):Project{
  if(p.components.length!==2)throw Error('Ausrichten ist nur für ein einzelnes Paar verfügbar.');
  const r=resolveProject(p);const input=r.components[0],output=r.components[1];
  const position:Vec3=[input.position[0]+r.requiredDistance,input.position[1],input.position[2]];
  return {...p,axes:{input:[...input.position],output:position},components:p.components.map(c=>c.id===output.id?{...c,position}:c)};
}
export function solverCatalog(){return CATALOG.map((g,index)=>({index,teeth:g.teeth,module:g.module,pressureAngle:g.pressureAngle}));}
export function applySolution(p:Project,indexA:number,indexB:number):Project{
  if(!Number.isInteger(indexA)||!Number.isInteger(indexB)||!CATALOG[indexA]||!CATALOG[indexB])throw Error('Ungültige Solver-Antwort.');
  return alignPair({...p,components:p.components.map(c=>({...c,catalogId:CATALOG[c.id===p.input.component?indexA:indexB].id}))});
}
