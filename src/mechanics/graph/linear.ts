import type {Registry,PairContext,Check,PairChoice} from './contracts.ts';
import {identity,compose,axisAngle,axis,norm,add,scale,rotationError} from './frames.ts';

function bounded(n:number,lo:number,hi:number){if(!Number.isFinite(n)||n<lo||n>hi)throw Error('Linearparameter außerhalb des Katalogbereichs.');}
function poseChecks(c:PairContext,f:ReturnType<typeof identity>):Check[]{return [{id:'pose',state:norm(add(c.frames[1].position,scale(f.position,-1)))<1e-5&&rotationError(c.frames[1].rotation,f.rotation)<1e-4?'pass':'fail',message:'Feste Referenzlage und Verfahrrichtung stimmen überein.'}];}
const obligation:Check={id:'guide',state:'unknown',message:'Lineare Bewegung setzt eine gegen Verdrehen gesicherte Führung voraus. Führung, Montage und Lager werden hier nicht konstruiert.'};
export function registerLinear(registry:Registry){
 registry.family({id:'tr8-screw',carrier:'shaft',validate:p=>{if(![2,8].includes(p.lead)||p.length!==200)throw Error('Spindel fehlt im Katalog.');},
  envelope:e=>({radius:4,min:0,max:e.params.length}),
  scad:e=>`cylinder(d=8,h=${e.params.length});`});
 registry.family({id:'tr8-nut',carrier:'any',motion:'translation',validate:p=>{if(![2,8].includes(p.lead))throw Error('Mutter fehlt im Katalog.');},
  envelope:()=>({radius:11,min:-8,max:8}),
  scad:()=>`difference(){cylinder(d=22,h=16,center=true);cylinder(d=8.6,h=18,center=true);}`});
 const screwFrame=(c:PairContext)=>compose(c.frames[0],{...identity(),position:[0,0,30]});
 registry.rule({id:'screw-nut',category:'transmission',arity:2,dofs:0,motion:['rotation','translation'],
  validate:c=>{const [a,b]=c.elements;if(a.family!=='tr8-screw'||b.family!=='tr8-nut'||a.params.lead!==b.params.lead)throw Error('Spindel und Mutter passen nicht zusammen.');bounded(c.params.stroke,1,140);},
  transfers:c=>[{from:0,to:1,gain:c.elements[0].params.lead}],mateFrames:c=>[screwFrame(c)],
  evaluate:c=>[...poseChecks(c,screwFrame(c)),{id:'engagement',state:30+c.params.stroke+8<=c.elements[0].params.length-20?'pass':'fail',message:'Mutter bleibt über den gesamten Hub im nutzbaren Spindelbereich.'},obligation,{id:'purchase',state:'unknown',message:'TR8-Spindel und Mutter sind Kaufteil-Hüllen ohne Gewinde. Axiale Abstützung, Befestigung und Gewindepassung bleiben offen.'}],
  search:{variables:[],phase:()=>0,catalog:request=>[2,8].map((lead):PairChoice=>({elements:[{family:'tr8-screw',params:{lead,length:200}},{family:'tr8-nut',params:{lead}}],params:{stroke:request?.stroke??100}}))},
  sweeps:c=>[{body:c.elements[1].body,direction:axis(c.frames[1]),min:0,max:c.params.stroke}],
  contactShafts:c=>[{element:c.elements[1].id,body:c.elements[0].body}]
 });
 registry.family({id:'rack-pinion',carrier:'shaft',bore:e=>e.params.bore,
  validate:p=>{if(![20,30,40].includes(p.teeth)||p.module!==2||p.width!==10||p.bore!==5.1)throw Error('Ritzel fehlt im Katalog.');},
  envelope:e=>({radius:e.params.teeth+2,min:-5,max:5}),
  scad:e=>`spur_gear(mod=2,teeth=${e.params.teeth},thickness=10,shaft_diam=5.1,profile_shift=0,pressure_angle=20,backlash=0.15,gear_spin=${e.phase+180/e.params.teeth});`});
 registry.family({id:'rack',carrier:'any',motion:'translation',validate:p=>{if(p.teeth!==41||p.module!==2||p.width!==10)throw Error('Zahnstange fehlt im Katalog.');},
  // Conservative transverse box encloses the toothed back and thickness.
  envelope:e=>({radius:16,transverse:[5,16],min:-e.params.teeth*Math.PI+e.phase,max:e.params.teeth*Math.PI+e.phase}),
  scad:e=>`translate([0,0,${e.phase}]) rotate([0,-90,0]) rack(mod=2,teeth=41,thickness=10,bottom=14,orient=BACK,profile_shift=0,pressure_angle=20,backlash=0.15);`});
 const rackPhase=(c:PairContext)=>{const p=c.elements[0].params,pitch=2*Math.PI,offset=c.params.stroke/2+(c.elements[0].phase-c.params.azimuth)*p.teeth*Math.PI/180;return ((offset%pitch)+pitch)%pitch;};
 const rackFrame=(c:PairContext)=>compose(c.frames[0],compose({position:[0,0,0],rotation:axisAngle([0,0,1],c.params.azimuth)},{position:[-c.params.stroke/2,-c.elements[0].params.teeth,0],rotation:axisAngle([0,1,0],90)}));
 registry.rule({id:'rack-drive',category:'transmission',arity:2,dofs:0,motion:['rotation','translation'],
  validate:c=>{if(c.elements[0].family!=='rack-pinion'||c.elements[1].family!=='rack')throw Error('Ritzel/Zahnstange passen nicht zusammen.');bounded(c.params.stroke,1,200);bounded(c.params.azimuth,-360,360);},
  transfers:c=>[{from:0,to:1,gain:2*Math.PI*c.elements[0].params.teeth}],mateFrames:c=>[rackFrame(c)],
  evaluate:c=>[...poseChecks(c,rackFrame(c)),{id:'coverage',state:c.elements[1].params.teeth*2*Math.PI>=c.params.stroke+40?'pass':'fail',message:'Zahnstange deckt den Hub und mindestens 20 mm Endreserve ab.'},obligation,{id:'rack-phase',state:Math.abs(c.elements[1].phase-rackPhase(c))<1e-6?'pass':'fail',message:'Zahnphase der Zahnstange entspricht Ritzelphase und Referenzlage.'}],
  search:{variables:[{key:'azimuth',lo:-360,hi:360}],phase:rackPhase,catalog:request=>[20,30,40].map((teeth):PairChoice=>({elements:[{family:'rack-pinion',params:{teeth,module:2,width:10,bore:5.1}},{family:'rack',params:{teeth:41,module:2,width:10}}],params:{azimuth:0,stroke:request?.stroke??100}}))},
  sweeps:c=>[{body:c.elements[1].body,direction:axis(c.frames[1]),min:0,max:c.params.stroke}]
 });
}
