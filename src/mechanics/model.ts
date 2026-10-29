/** Millimetres, degrees; stage B supports two unshifted spur gears on +Z axes. */
export const CATALOG_VERSION = 'mechanics10-spur-1';
export type Gear = {id:string; kind:'spur'; teeth:number; module:number; pressureAngle:number; width:number; bore:number; backlash:number};
export const CATALOG: readonly Gear[] = [2,3].flatMap(module => [20,30,40,50].map(teeth => ({
  id:`spur-m${module}-z${teeth}`, kind:'spur' as const, teeth, module, pressureAngle:20, width:10, bore:5.1, backlash:0.15,
})));
export type Instance = {id:string; catalogId:string; position:[number,number,number]};
export type Endpoint = {component:string; port:'shaft'|'teeth'};
export type Project = {format:'mechanics10'; version:1; catalogVersion:typeof CATALOG_VERSION; name:string;
  targetRatio:number; components:Instance[]; input:Endpoint; output:Endpoint;
  connections:{kind:'external-spur-mesh'; a:Endpoint; b:Endpoint}[]};
export type Check = {id:string; state:'pass'|'fail'|'unknown'; message:string};
export const gear = (id:string) => {const g=CATALOG.find(g=>g.id===id);if(!g)throw Error(`Unbekannter Katalogeintrag: ${id}`);return g;};
export function initialProject():Project {
  return {format:'mechanics10',version:1,catalogVersion:CATALOG_VERSION,name:'Mein Zahnradpaar',targetRatio:2.1,
    components:[{id:'input',catalogId:'spur-m2-z20',position:[0,0,0]},{id:'output',catalogId:'spur-m2-z40',position:[60,0,0]}],
    input:{component:'input',port:'shaft'},output:{component:'output',port:'shaft'},
    connections:[{kind:'external-spur-mesh',a:{component:'input',port:'teeth'},b:{component:'output',port:'teeth'}}]};
}

function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Objekt erwartet.');return v as Record<string,unknown>;}
function string(v:unknown):string{if(typeof v!=='string'||!v.length||v.length>100)throw Error('Ungültiger Text (1–100 Zeichen).');return v;}
function number(v:unknown):number{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>10000)throw Error('Ungültiger Zahlenwert.');return v;}
/** Parse and reconstruct untrusted files; never import code, URLs or computed results. */
export function parseProject(text:string):Project {
  if(text.length>100000)throw Error('Projektdatei ist zu groß (max. 100 KB).');
  const p=object(JSON.parse(text));
  if(p.format!=='mechanics10'||p.version!==1)throw Error('Projektformat oder Version wird nicht unterstützt.');
  if(p.catalogVersion!==CATALOG_VERSION)throw Error('Katalogversion wird nicht unterstützt.');
  if(!Array.isArray(p.components)||p.components.length!==2)throw Error('Etappe B unterstützt genau zwei Stirnräder.');
  const components=p.components.map(v=>{const c=object(v);const catalogId=string(c.catalogId);gear(catalogId);
    if(!Array.isArray(c.position)||c.position.length!==3)throw Error('Position muss [x,y,z] enthalten.');
    return {id:string(c.id),catalogId,position:c.position.map(number) as [number,number,number]};});
  if(new Set(components.map(c=>c.id)).size!==2)throw Error('Komponenten-IDs müssen eindeutig sein.');
  function endpoint(v:unknown,port:Endpoint['port']):Endpoint{const e=object(v);const component=string(e.component);
    if(e.port!==port||!components.some(c=>c.id===component))throw Error('Anschluss verweist auf eine unbekannte Komponente oder einen falschen Port.');return {component,port};}
  const input=endpoint(p.input,'shaft'),output=endpoint(p.output,'shaft');
  if(input.component===output.component)throw Error('Eingang und Ausgang müssen verschieden sein.');
  if(!Array.isArray(p.connections)||p.connections.length!==1)throw Error('Genau eine Verzahnungspaarung ist erforderlich.');
  const c=object(p.connections[0]);if(c.kind!=='external-spur-mesh')throw Error('Unbekannte Paarungsregel.');
  const a=endpoint(c.a,'teeth'),b=endpoint(c.b,'teeth');
  if(a.component===b.component)throw Error('Ein Zahnrad kann nicht mit sich selbst gepaart werden.');
  const targetRatio=number(p.targetRatio);if(targetRatio<=0||targetRatio>100)throw Error('Soll-Untersetzung muss größer 0 bis 100 sein.');
  return {format:'mechanics10',version:1,catalogVersion:CATALOG_VERSION,name:string(p.name),targetRatio,components,input,output,connections:[{kind:'external-spur-mesh',a,b}]};
}
export function serializeProject(p:Project){return JSON.stringify(parseProject(JSON.stringify(p)),null,2)+'\n';}
export function resolveProject(project:Project){
  const p=parseProject(JSON.stringify(project));
  const input=p.components.find(c=>c.id===p.input.component)!;
  const output=p.components.find(c=>c.id===p.output.component)!;
  const a=gear(input.catalogId),b=gear(output.catalogId);
  const dx=output.position[0]-input.position[0],dy=output.position[1]-input.position[1];
  const actualDistance=Math.hypot(dx,dy),requiredDistance=(a.module*a.teeth+b.module*b.teeth)/2;
  const overlap=Math.min(input.position[2]+a.width/2,output.position[2]+b.width/2)-Math.max(input.position[2]-a.width/2,output.position[2]-b.width/2);
  const check=(id:string,ok:boolean,message:string):Check=>({id,state:ok?'pass':'fail',message});
  const checks:Check[]=[check('module',a.module===b.module,'Gleicher Modul'),check('pressure-angle',a.pressureAngle===b.pressureAngle,'Gleicher Eingriffswinkel'),
    check('distance',Math.abs(actualDistance-requiredDistance)<1e-6,`Achsabstand: ${actualDistance.toFixed(3)} mm · erforderlich ${requiredDistance} mm`),
    check('face-overlap',overlap>1e-6,`Axiale Zahnbreiten-Überdeckung: ${Math.max(0,overlap).toFixed(3)} mm`),
    {id:'construction',state:'unknown',message:'Lager, Gehäuse, Bewegungsfreiräume und Montage noch ungeprüft.'}];
  const angle=Math.atan2(dy,dx)*180/Math.PI;
  const resolved=[{...input,gear:a,spin:angle-90},{...output,gear:b,spin:angle+90-180/b.teeth}];
  const ratio=b.teeth/a.teeth;
  const ports=resolved.flatMap(c=>[
    {component:c.id,name:'shaft',kind:'shaft-bore',position:c.position,axis:[0,0,1],diameter:c.gear.bore},
    {component:c.id,name:'teeth',kind:'external-spur',position:c.position,axis:[0,0,1],module:c.gear.module,pressureAngle:c.gear.pressureAngle,pitchRadius:c.gear.module*c.gear.teeth/2,width:c.gear.width}]);
  return {components:resolved,ports,checks,valid:checks.every(c=>c.state!=='fail'),ratio,error:Math.abs(ratio-p.targetRatio)/p.targetRatio,requiredDistance,actualDistance,direction:'gegenläufig' as const};
}
export function generateScad(p:Project){
  const r=resolveProject(p);if(!r.valid)throw Error('Paarungsregeln verletzt. Positionen oder Katalogauswahl korrigieren.');
  return 'include <BOSL2/std.scad>\ninclude <BOSL2/gears.scad>\n$fn=48;\n'+r.components.map(c=>
    `translate([${c.position.join(',')}]) spur_gear(mod=${c.gear.module}, teeth=${c.gear.teeth}, thickness=${c.gear.width}, shaft_diam=${c.gear.bore}, pressure_angle=${c.gear.pressureAngle}, profile_shift=0, backlash=${c.gear.backlash}, spin=${c.spin});`).join('\n')+'\n';
}
/** Explicit user action, never an implicit correction of a manually positioned project. */
export function alignPair(p:Project):Project{
  const r=resolveProject(p);const input=r.components[0],output=r.components[1];
  return {...p,components:p.components.map(c=>c.id===output.id?{...c,position:[input.position[0]+r.requiredDistance,input.position[1],input.position[2]]}:c)};
}
export function solverCatalog(){return CATALOG.map((g,index)=>({index,teeth:g.teeth,module:g.module,pressureAngle:g.pressureAngle}));}
export function applySolution(p:Project,indexA:number,indexB:number):Project{
  if(!Number.isInteger(indexA)||!Number.isInteger(indexB)||!CATALOG[indexA]||!CATALOG[indexB])throw Error('Ungültige Solver-Antwort.');
  return alignPair({...p,components:p.components.map(c=>({...c,catalogId:CATALOG[c.id===p.input.component?indexA:indexB].id}))});
}
