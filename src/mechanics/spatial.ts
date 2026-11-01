export type Spatial={kind:'internal'|'bevel'|'worm';teeth:number;starts:number;clearance:number;phase:number};
export type V=[number,number,number];
export type Shaft={origin:V;axis:V;cart:number;tip:number;aux:boolean;name:string};
export const defaultSpatial=(kind:Spatial['kind']):Spatial=>({kind,teeth:kind==='internal'?60:kind==='bevel'?40:30,starts:1,clearance:2,phase:0});
export function parseSpatial(value:unknown):Spatial{
 if(!value||typeof value!=='object')throw Error('Räumliche Vorlage fehlt.');const p=value as Spatial;
 if(!['internal','bevel','worm'].includes(p.kind)||![p.teeth,p.starts,p.clearance,p.phase].every(Number.isFinite))throw Error('Ungültige räumliche Vorlage.');
 const teeth=p.kind==='internal'?[60,80]:p.kind==='bevel'?[20,40]:[30,40];
 if(!teeth.includes(p.teeth)||![1,2].includes(p.starts)||p.clearance<1||p.clearance>3||p.phase<0||p.phase>360)throw Error('Räumlicher Parameter außerhalb des Katalogs.');
 return {kind:p.kind,teeth:p.teeth,starts:p.starts,clearance:p.clearance,phase:p.phase};
}
export function resolveSpatial(input:Spatial){
 const p=parseSpatial(input),c=p.clearance,r=20,R=p.teeth,cb=Math.sqrt(1-(p.starts*2/24)**2);
 const wheelRadius=p.kind==='worm'?p.teeth/cb:R,spacing=p.kind==='internal'?R-r:p.kind==='worm'?wheelRadius+12:0;
 let lo:V,hi:V,shafts:Shaft[];
 if(p.kind==='internal'){
  const bottom=-61-2*c,top=-55-c;
  lo=[-R-15-c,-R-15-c,bottom+12];hi=[R+15+c,R+15+c,-top-12];
  shafts=[{name:'Ritzel',origin:[spacing,0,0],axis:[0,0,-1],cart:top,tip:3,aux:false},{name:'Hohlrad',origin:[0,0,0],axis:[0,0,1],cart:bottom,tip:-7-c,aux:false}];
 }else if(p.kind==='bevel'){
  const cart=-54-c;
  lo=[-R-4-c,-r-4-c,-R+cart+12];hi=[R+4+c,r-cart-12,R+4+c];
  shafts=[{name:'Kegelritzel',origin:[0,0,-R],axis:[0,0,1],cart,tip:3,aux:false},{name:'Kegelrad',origin:[0,r,0],axis:[0,-1,0],cart,tip:3,aux:false}];
 }else{
  const cart=Math.min(-62-c,-wheelRadius-4-c-12);
  lo=[cart+12,-wheelRadius-4-c,-43-c];hi=[wheelRadius+4+c,spacing+26+c,26+c];
  shafts=[{name:'Schnecke',origin:[0,spacing,0],axis:[1,0,0],cart,tip:hi[0]+19,aux:true},{name:'Schneckenrad',origin:[0,0,0],axis:[0,0,1],cart:-55-c,tip:hi[2]+19,aux:true}];
 }
 const envelope=p.kind==='internal'?{lo:[-R-15,-R-15,-19-c],hi:[R+15,R+15,13]}:p.kind==='bevel'?{lo:[-R-4,-24,-R-12],hi:[R+4,32,R+4]}:{lo:[-wheelRadius-4,-wheelRadius-4,-14],hi:[wheelRadius+4,spacing+14,14]};
 const minHousingGap=Math.min(...lo.map((n,i)=>envelope.lo[i]-n),...hi.map((n,i)=>n-envelope.hi[i]));
 const segments=shafts.map(s=>s.origin.map((v,i)=>[v+s.axis[i]*(s.cart-22),v+s.axis[i]*s.tip].sort((a,b)=>a-b)));
 const shaftGap=Math.hypot(...segments[0].map((range,i)=>Math.max(0,range[0]-segments[1][i][1],segments[1][i][0]-range[1])))-5;
 const checks=[{id:'axes',state:'pass',message:p.kind==='internal'?`Parallele, entgegengesetzt referenzierte Wellen; Achsabstand ${spacing.toFixed(3)} mm`:p.kind==='bevel'?'90°-Achsen; gemeinsame Kegelspitze bei [0,0,0]; Wellen enden davor':`90° windschiefe Achsen; kürzester Abstand ${spacing.toFixed(3)} mm`},
  {id:'pair',state:'pass',message:p.kind==='worm'?'Normalmodul 2, gleiche Gangzahl und Rechtshändigkeit, 20°; Profilverschiebung 0':'Modul 2, 20°, aufeinander abgestimmte Zähnezahlen und Zahnphasen'},
  {id:'bearings',state:'pass',message:p.kind==='worm'?'Je Welle ein 625-Lager in der Kassette und eines gegenüber; zwei Axiallager am Festlager':'Je Welle zwei 625-Radiallager und zwei Axiallager in verschraubter Kassette'},
  {id:'housing',state:minHousingGap>=c-1e-7?'pass':'fail',message:`Rotationshülle zu Gehäuse: ${minHousingGap.toFixed(3)} mm ≥ ${c} mm; abnehmbare 8-mm-Platten`},
  {id:'shaft-clearance',state:shaftGap>=c?'pass':'fail',message:`Freiraum zwischen den endlichen Ø5-Wellen: ${shaftGap.toFixed(3)} mm`},
  {id:'assembly',state:'pass',message:p.kind==='internal'?'Hohlrad separat auf Mitnehmerscheibe verschraubt; Ritzel von der offenen Seite einsetzen':'Räder und Kassetten bei geöffneten Seitenwänden einsetzen; keine Montage durch Lagerbohrungen'},
  {id:'physical',state:'unknown',message:'Tragfähigkeit, Lagerauswahl, Schmierung, Passungen und Sicherung am physischen Muster prüfen. Keine Selbsthemmung zugesichert.'}];
 return {p,r,R,wheelRadius,spacing,lo,hi,shafts,envelope,minHousingGap,shaftGap,checks,valid:checks.every(c=>c.state!=='fail'),ratio:p.kind==='worm'?p.teeth/p.starts:p.teeth/20,
  outputGain:p.kind==='internal'?-20/p.teeth:p.kind==='bevel'?-20/p.teeth:p.starts/p.teeth,
  ports:shafts.map((s,i)=>({name:i?'output':'input',kind:'shaft',position:s.origin,axis:s.axis,diameter:5})),
  coneAngles:p.kind==='bevel'?[Math.atan2(20,R)*180/Math.PI,Math.atan2(R,20)*180/Math.PI]:undefined};
}
