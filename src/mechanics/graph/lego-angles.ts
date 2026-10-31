import {legoBevelIds,legoWormProfiles} from './lego-config.ts';
import {compose,identity,axisAngle,norm,add,scale,rotationError} from './frames.ts';
import type {Registry,PairContext,PairChoice,Check} from './contracts.ts';
import {legoParts} from './lego-parts.ts';
const part=(model:number)=>{const p=legoParts.find(p=>p.model===model);if(!p)throw Error('LEGO-Teil fehlt');return p;};
const choice=(a:typeof legoParts[number],b:typeof legoParts[number]):PairChoice=>({elements:[a,b].map(p=>({family:'lego-technic',params:{model:p.model}})),params:{azimuth:0}});
function check(c:PairContext){if(c.elements.some(e=>e.family!=='lego-technic')||!Number.isFinite(c.params.azimuth)||Math.abs(c.params.azimuth)>360||c.params.angle!==undefined&&c.params.angle!==90)throw Error('LEGO-Paarung benötigt 90° und freigegebene Kaufteile.');}
function placed(c:PairContext,frame:ReturnType<typeof identity>,phase:number,teeth:number):Check[]{const period=360/teeth,d=((c.elements[1].phase-phase)%period+period)%period;return [{id:'position',state:norm(add(c.frames[1].position,scale(frame.position,-1)))<1e-5?'pass':'fail',message:'LEGO-spezifischer Mittenversatz'},{id:'orientation',state:rotationError(c.frames[1].rotation,frame.rotation)<1e-4?'pass':'fail',message:'Rechtwinklige Achsausrichtung'},{id:'phase',state:Math.min(d,period-d)<1e-5?'pass':'fail',message:'Phasenlage der LDraw-Zahnprofile'}];}
export function registerLegoAngles(r:Registry){
 const bevel=legoParts.filter(p=>legoBevelIds.includes(p.id));
 const bevelPhase=(c:PairContext)=>{const [a,b]=c.elements;return 180/part(b.params.model).teeth-(a.phase-c.params.azimuth)*part(a.params.model).teeth/part(b.params.model).teeth;};
 const bevelFrame=(c:PairContext)=>{const [a,b]=c.elements.map(e=>part(e.params.model));return compose(c.frames[0],compose({...identity(),rotation:axisAngle([0,0,1],c.params.azimuth)},{position:[0,a.teeth/2+2,b.teeth/2+2],rotation:axisAngle([1,0,0],90)}));};
 r.rule({id:'lego-bevel-90',category:'transmission',arity:2,dofs:0,
  validate:c=>{check(c);if(c.elements.some(e=>!legoBevelIds.includes(part(e.params.model).id)))throw Error('90°-Regel gilt für die freigegebenen Doppelkegelräder.');},
  transfers:c=>[{from:0,to:1,gain:-part(c.elements[0].params.model).teeth/part(c.elements[1].params.model).teeth}],mateFrames:c=>[bevelFrame(c)],
  evaluate:c=>[...placed(c,bevelFrame(c),bevelPhase(c),part(c.elements[1].params.model).teeth),{id:'purchase',state:'unknown',message:'LEGO-Doppelkegelräder: nominelle Mittenlage mit 2-mm-Stirnversatz. LDraw-Darstellung und Zahnspiel ersetzen keine reale Passungs-/Lastprüfung.'}],
  rearSupports:c=>c.elements.map(e=>e.body),shaftLimits:c=>c.elements.map(e=>({body:e.body,max:e.pose.position[2]+part(e.params.model).size[2]/2})),
  search:{changesAxis:true,sharedRotor:true,variables:[{key:'azimuth',lo:-360,hi:360}],phase:bevelPhase,catalog:()=>bevel.flatMap(a=>bevel.map(b=>choice(a,b)))}
 });
 const worms=legoParts.filter(p=>legoWormProfiles[p.id]),wheels=legoParts.filter(p=>p.search&&!legoBevelIds.includes(p.id));
 const wormPhase=(c:PairContext)=>{const profile=legoWormProfiles[part(c.elements[0].params.model).id];return (c.elements[0].phase-c.params.azimuth+profile.phase)*profile.starts/part(c.elements[1].params.model).teeth;};
 const wormFrame=(c:PairContext)=>{const [a,b]=c.elements.map(e=>part(e.params.model)),profile=legoWormProfiles[a.id];return compose(c.frames[0],compose({...identity(),rotation:axisAngle([0,0,1],c.params.azimuth)},{position:[0,-(profile.pitchRadius+b.teeth/2),0],rotation:axisAngle([0,1,0],-90)}));};
 r.rule({id:'lego-worm',category:'transmission',arity:2,dofs:0,
  validate:c=>{check(c);if(!legoWormProfiles[part(c.elements[0].params.model).id]||!wheels.some(p=>p.model===c.elements[1].params.model))throw Error('LEGO-Schnecke treibt ein freigegebenes Stirnrad; umgekehrte Suche ist nicht freigegeben.');},
  transfers:c=>[{from:0,to:1,gain:legoWormProfiles[part(c.elements[0].params.model).id].starts/part(c.elements[1].params.model).teeth}],mateFrames:c=>[wormFrame(c)],
  evaluate:c=>[...placed(c,wormFrame(c),wormPhase(c),part(c.elements[1].params.model).teeth),{id:'thrust',state:'unknown',message:'LEGO-Schnecke: Axialabstützung, Zahnspiel und Lasten bleiben extern auszulegen. Keine Aussage zur Selbsthemmung.'}],
  contactShafts:c=>{const [a,b]=c.elements,h=part(a.params.model).size[2]/2;return [{element:b.id,body:a.body,min:a.pose.position[2]-h,max:a.pose.position[2]+h}];},
  bearingSpans:c=>{const [a,b]=c.elements,radius=part(b.params.model).radius;return [{body:a.body,min:a.pose.position[2]-radius-4,max:a.pose.position[2]+radius+4}];},
  search:{changesAxis:true,sharedRotor:true,variables:[{key:'azimuth',lo:-360,hi:360}],phase:wormPhase,catalog:()=>worms.flatMap(a=>wheels.map(b=>choice(a,b)))}
 });
}
