import type {Registry,PairContext,Params,Check,PairChoice} from './contracts.ts';
import {identity,compose,axisAngle,norm,add,scale,rotationError,matrix,rotate} from './frames.ts';
import {BELTS,beltCenter,beltPitchLength} from '../motion.ts';

function range(p:Params,k:string,lo:number,hi:number){if(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi)throw Error(`Ungültiger Antriebsparameter ${k}`);}
function integer(p:Params,k:string,lo:number,hi:number){range(p,k,lo,hi);if(!Number.isInteger(p[k]))throw Error(`${k} muss ganzzahlig sein.`);}
function matching(c:PairContext,a:string,b:string){if(c.elements[0].family!==a||c.elements[1].family!==b)throw Error('Unpassende Antriebspartner.');range(c.params,'azimuth',-360,360);}
function placed(c:PairContext,f:ReturnType<typeof identity>,phase:number,period:number):Check[]{
 const d=((c.elements[1].phase-phase)%period+period)%period;
 return [{id:'placement',state:norm(add(c.frames[1].position,scale(f.position,-1)))<1e-5&&rotationError(c.frames[1].rotation,f.rotation)<1e-4?'pass':'fail',message:'Paarungslage und Achsausrichtung'},
 {id:'phase',state:Math.min(d,period-d)<1e-5?'pass':'fail',message:'Relative Antriebsphase'}];
}
export function beltDimensions(c:PairContext){const [a,b]=c.elements.map(e=>e.params),r=a.teeth/Math.PI,R=b.teeth/Math.PI,center=beltCenter(c.params.length,r,R);return {r,R,center,wrap:Math.PI-2*Math.asin(Math.abs(R-r)/center)};}
export function registerDrives(registry:Registry){
 const azimuth={key:'azimuth',lo:-360,hi:360};
 registry.family({id:'gt2-pulley',carrier:'shaft',bore:e=>e.params.bore,
  validate:p=>{integer(p,'teeth',16,60);range(p,'width',6,6);range(p,'bore',5,10);},
  envelope:e=>({radius:Math.max(e.params.teeth/Math.PI+1.5,8),min:-4,max:12}),
  scad:e=>`rotate([0,0,${e.phase}]) difference(){union(){cylinder(r=${e.params.teeth/Math.PI},h=6,center=true);for(z=[-4,3])translate([0,0,z])cylinder(r=${e.params.teeth/Math.PI+1.5},h=1);translate([0,0,4])cylinder(r=8,h=8);}translate([0,0,-5])cylinder(d=${e.params.bore},h=18);}`});
 const beltFrame=(c:PairContext)=>compose(c.frames[0],compose({position:[0,0,0],rotation:axisAngle([0,0,1],c.params.azimuth)},{...identity(),position:[beltDimensions(c).center,0,0]}));
 // Pulley body frames remain parallel; azimuth only changes center location.
 const parallelBeltFrame=(c:PairContext)=>({...beltFrame(c),rotation:c.frames[0].rotation});
 const beltPhase=(c:PairContext)=>{const [a,b]=c.elements;return c.params.azimuth+(a.phase-c.params.azimuth)*a.params.teeth/b.params.teeth;};
 registry.rule({id:'gt2-belt',category:'transmission',arity:2,dofs:0,
  validate:c=>{matching(c,'gt2-pulley','gt2-pulley');if(!BELTS.includes(c.params.length))throw Error('Riemenlänge fehlt im Katalog.');range(c.params,'release',2,10);range(c.params,'tension',1,10);const d=beltDimensions(c);if(!Number.isFinite(d.center)||d.center-c.params.release<=d.r+d.R+4||d.wrap<2*Math.PI/3||d.wrap*Math.min(...c.elements.map(e=>e.params.teeth))/(2*Math.PI)<6)throw Error('Riemenscheiben, Entspannweg oder Umschlingung unzulässig.');},
  transfers:c=>[{from:0,to:1,gain:c.elements[0].params.teeth/c.elements[1].params.teeth}],mateFrames:c=>[parallelBeltFrame(c)],
  evaluate:c=>[...placed(c,parallelBeltFrame(c),beltPhase(c),360/c.elements[1].params.teeth),{id:'belt-length',state:Math.abs(beltPitchLength(beltDimensions(c).center,beltDimensions(c).r,beltDimensions(c).R)-c.params.length)<1e-6?'pass':'fail',message:`GT2 ${c.params.length} mm; Entspannweg ${c.params.release} mm, Nachspannreserve ${c.params.tension} mm`},{id:'purchase',state:'unknown',message:'GT2-Kaufteile als Hüllgeometrie; Zahnprofil, reale Nabe, Vorspannung und Spannmechanismus noch abgleichen.'}],
  search:{variables:[azimuth],phase:beltPhase,catalog:()=>[20,30,40].flatMap(a=>[20,30,40].flatMap(b=>BELTS.map(length=>({elements:[a,b].map(teeth=>({family:'gt2-pulley',params:{teeth,width:6,bore:5.1}})),params:{azimuth:0,length,release:2,tension:1}}))))},
  sweeps:c=>[{body:c.elements[1].body,direction:rotate(c.frames[0].rotation,[Math.cos(c.params.azimuth*Math.PI/180),Math.sin(c.params.azimuth*Math.PI/180),0]),min:-c.params.release,max:c.params.tension}],
  spaces:c=>{const {r,R,center}=beltDimensions(c),radius=Math.max(r,R)+2;return [{frame:compose(c.frames[0],compose({position:[0,0,0],rotation:axisAngle([0,0,1],c.params.azimuth)},{...identity(),position:[center/2,0,0]})),half:[center/2+radius+c.params.tension,radius,3],exempt:[...c.elements.map(e=>({kind:'rotor' as const,id:e.id})),...c.elements.map(e=>({kind:'shaft' as const,id:e.body}))]}];},
  scad:c=>{const {r,R,center}=beltDimensions(c),f=compose(c.frames[0],{position:[0,0,0],rotation:axisAngle([0,0,1],c.params.azimuth)});return `multmatrix(${JSON.stringify(matrix(f))}) linear_extrude(6,center=true) difference(){hull(){circle(r=${r+.75});translate([${center},0])circle(r=${R+.75});}hull(){circle(r=${r-.75});translate([${center},0])circle(r=${R-.75});}}`;}
 });
 registry.family({id:'worm',carrier:'shaft',bore:e=>e.params.bore,validate:p=>{integer(p,'starts',1,2);range(p,'module',2,2);range(p,'diameter',24,24);range(p,'width',24,24);range(p,'bore',5,10);},
  envelope:e=>({radius:e.params.diameter/2+2,min:-e.params.width/2,max:e.params.width/2}),
  scad:e=>`difference(){worm(mod=2,d=24,l=24,starts=${e.params.starts},left_handed=false,pressure_angle=20,backlash=0.15,gear_spin=${e.phase});cylinder(d=${e.params.bore},h=26,center=true);}`});
 registry.family({id:'worm-wheel',carrier:'shaft',pairDependent:true,bore:e=>e.params.bore,validate:p=>{integer(p,'teeth',20,40);integer(p,'starts',1,2);range(p,'module',2,2);range(p,'width',10,10);range(p,'bore',5,10);},
  envelope:e=>({radius:e.params.teeth/Math.sqrt(1-(e.params.starts*2/24)**2)+4,min:-5,max:5}),
  scad:e=>`difference(){worm_gear(mod=2,teeth=${e.params.teeth},thickness=10,worm_diam=24,worm_starts=${e.params.starts},left_handed=false,profile_shift=0,pressure_angle=20,backlash=0.15,slices=8,search_steps=24,gear_spin=${e.phase});cylinder(d=${e.params.bore},h=12,center=true);}`});
 const wormFrame=(c:PairContext)=>{const [a,b]=c.elements,spacing=12+b.params.teeth/Math.sqrt(1-(a.params.starts*2/24)**2);return compose(c.frames[0],compose({position:[0,0,0],rotation:axisAngle([0,0,1],c.params.azimuth)},{position:[0,-spacing,0],rotation:axisAngle([0,1,0],-90)}));};
 const wormPhase=(c:PairContext)=>(c.elements[0].phase-c.params.azimuth)*c.elements[0].params.starts/c.elements[1].params.teeth;
 registry.rule({id:'worm-mesh',category:'transmission',arity:2,dofs:0,
  validate:c=>{matching(c,'worm','worm-wheel');if(c.elements[0].params.starts!==c.elements[1].params.starts||c.elements[0].params.module!==c.elements[1].params.module)throw Error('Schneckenrad benötigt passendes Modul und passende Gangzahl.');},
  bearingSpans:c=>{const [a,b]=c.elements,r=b.params.teeth/Math.sqrt(1-(a.params.starts*2/24)**2)+4;return [{body:a.body,min:a.pose.position[2]-r-4,max:a.pose.position[2]+r+4}];},
  transfers:c=>[{from:0,to:1,gain:c.elements[0].params.starts/c.elements[1].params.teeth}],mateFrames:c=>[wormFrame(c)],
  evaluate:c=>[...placed(c,wormFrame(c),wormPhase(c),360/c.elements[1].params.teeth),{id:'thrust',state:'unknown',message:'Schnecke: Axiallager, Wirkungsgrad und Rücktreibbarkeit noch nicht ausgelegt; Drehzahlrelation ist kein Selbsthemmungsnachweis.'}],
  search:{variables:[azimuth],phase:wormPhase,catalog:()=>[1,2].flatMap(starts=>[20,30,40].map(teeth=>({elements:[{family:'worm',params:{starts,module:2,diameter:24,width:24,bore:5.1}},{family:'worm-wheel',params:{teeth,starts,module:2,width:10,bore:5.1}}],params:{azimuth:0}} as PairChoice)))}
 });
}
