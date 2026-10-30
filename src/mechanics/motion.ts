export type Box={x:number;y:number;z:number;sx:number;sy:number;sz:number};
export type Motion={kind:'belt'|'screw'|'rack';stroke:number;guideLength:number;position:number;clearance:number;
 teethA:number;teethB:number;center:number;travel:number;beltLength:number;lead:number;obstacle:Box|null};
export const BELTS=[200,280,300,400,500,600,610,752,800];
export const PULLEYS=[16,20,30,40,60];
export const defaultMotion=(kind:Motion['kind']):Motion=>({kind,stroke:100,guideLength:234,position:0,clearance:2,teethA:20,teethB:40,center:120,travel:20,beltLength:300,lead:8,obstacle:null});
export function parseMotion(value:unknown):Motion{
 if(!value||typeof value!=='object')throw Error('Ungültige Achsvorlage.');const p=value as Record<string,unknown>;
 if(!['belt','screw','rack'].includes(p.kind as string))throw Error('Unbekannte Achsvorlage.');
 const n=(key:string,min:number,max:number)=>{const v=p[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Ungültiger Achsparameter: ${key}`);return v;};
 let obstacle:Box|null=null;
 if(p.obstacle!==null){const b=p.obstacle as Box;if(!b||!['x','y','z','sx','sy','sz'].every(k=>typeof b[k as keyof Box]==='number'&&Number.isFinite(b[k as keyof Box])&&Math.abs(b[k as keyof Box])<=2000)||Math.min(b.sx,b.sy,b.sz)<=0)throw Error('Ungültiger Sperrraum.');obstacle={x:b.x,y:b.y,z:b.z,sx:b.sx,sy:b.sy,sz:b.sz};}
 const m:Motion={kind:p.kind as Motion['kind'],stroke:n('stroke',20,500),guideLength:n('guideLength',140,700),position:n('position',0,1),clearance:n('clearance',0.5,5),teethA:n('teethA',16,60),teethB:n('teethB',16,60),center:n('center',40,350),travel:n('travel',0,40),beltLength:n('beltLength',100,1000),lead:n('lead',2,8),obstacle};
 if(!PULLEYS.includes(m.teethA)||!PULLEYS.includes(m.teethB)||!BELTS.includes(m.beltLength)||![2,8].includes(m.lead))throw Error('Bauteil nicht im Achskatalog.');return m;
}
export type MotionCheck={id:string;state:'pass'|'fail'|'unknown';message:string};
export function beltPitchLength(c:number,r:number,R:number){const d=Math.abs(R-r);if(c<=d)return Infinity;return 2*Math.sqrt(c*c-d*d)+Math.PI*(r+R)+2*d*Math.asin(d/c);}
export function beltCenter(length:number,r:number,R:number){let low=Math.abs(R-r)+1e-7,high=length/2;if(beltPitchLength(low,r,R)>length)return NaN;for(let i=0;i<70;i++){const mid=(low+high)/2;if(beltPitchLength(mid,r,R)>length)high=mid;else low=mid;}return (low+high)/2;}
export function overlaps(a:Box,b:Box,margin:number){return ['x','y','z'].every(axis=>{const k=axis as 'x'|'y'|'z',size=('s'+axis) as 'sx'|'sy'|'sz';return Math.abs(a[k]-b[k])<(a[size]+b[size])/2+margin-1e-7;});}
export function resolveMotion(input:Motion){
 const m=parseMotion(input),checks:MotionCheck[]=[];
 const check=(id:string,ok:boolean,message:string)=>checks.push({id,state:ok?'pass':'fail',message});
 const r=m.teethA/Math.PI,R=m.teethB/Math.PI,c=beltCenter(m.beltLength,r,R),min=m.center-m.travel/2,max=m.center+m.travel/2;
 const wrap=Number.isFinite(c)?Math.PI-2*Math.asin(Math.abs(R-r)/c):0;
 const beltCandidates=BELTS.map(length=>{const center=beltCenter(length,r,R);return {length,center,release:center-min,reserve:max-center,valid:Number.isFinite(center)&&center-min>=2&&max-center>=1&&min>r+R+3+m.clearance};});
 const rackTeeth=2*Math.ceil((m.stroke+40)/(4*Math.PI))+1,rackLength=rackTeeth*2*Math.PI;
 const right=m.guideLength-79,q=m.position*m.stroke;
 const rackMode=m.kind==='rack',baseLeft=rackMode?Math.min(-79,-rackLength/2-8):-104,baseRight=rackMode?Math.max(right+24,m.stroke+rackLength/2+8):right+24;
 const fixed:Box[]=[{x:(baseLeft+baseRight)/2,y:rackMode?38:0,z:3,sx:baseRight-baseLeft,sy:rackMode?176:100,sz:6},
  ...[-30,30].map(y=>({x:m.guideLength/2-67,y,z:24,sx:m.guideLength,sy:8,sz:8})),
  ...[-61,right+7.5].map(x=>({x,y:0,z:24,sx:15,sy:84,sz:36}))];
 if(m.kind==='screw')fixed.push({x:-84,y:0,z:24,sx:18,sy:40,sz:36},{x:(right-85)/2,y:0,z:24,sx:right+135,sy:8,sz:8},{x:-61,y:0,z:24,sx:30,sy:16,sz:16});
 if(rackMode)fixed.push({x:m.stroke/2,y:92,z:(37+m.clearance)/2+6,sx:72,sy:48,sz:37+m.clearance},{x:m.stroke/2,y:80,z:24,sx:44,sy:44,sz:10},{x:m.stroke/2,y:80,z:32+m.clearance,sx:16,sy:16,sz:47});
 const swept:Box[]=[{x:m.stroke/2,y:0,z:24,sx:m.stroke+76,sy:84,sz:24}];
 if(m.kind==='screw')swept.push({x:m.stroke/2-31,y:0,z:24,sx:m.stroke+15,sy:22,sz:22});
 if(m.kind==='rack'){swept.push({x:m.stroke/2,y:54,z:24,sx:m.stroke+rackLength,sy:16,sz:10},{x:m.stroke/2,y:46,z:15.5,sx:m.stroke+48,sy:16,sz:7});}
 if(m.kind==='belt'){
  check('belt-length',Number.isFinite(c),'Gewählte Riemenlänge besitzt eine offene Tangentenlösung');
  check('belt-install',Number.isFinite(c)&&c-min>=2,'Mindestens 2 mm Achsabstand zum Entspannen/Montieren');
  check('belt-tension',Number.isFinite(c)&&max-c>=1,'Mindestens 1 mm Nachspannreserve im freigegebenen Stellweg');
  check('belt-clearance',min>r+R+3+m.clearance,'Riemenscheiben und Flansche bleiben getrennt');
  check('belt-axial',m.clearance<=4,'Scheibenpaket einschließlich Klemmnabe: 4 mm Abstand zu beiden Lagerplatten');
  check('belt-wrap',wrap>=2*Math.PI/3&&wrap*Math.min(m.teethA,m.teethB)/(2*Math.PI)>=6,'Kleine Scheibe: mindestens 120° Umschlingung und sechs Zähne im Eingriff');
  if(m.obstacle){const radius=Math.max(r+1.5,R+1.5,8);const env:Box={x:max/2,y:0,z:26,sx:max+2*Math.max(20,radius),sy:2*(radius+m.clearance+14),sz:52};check('obstacle',!overlaps(env,m.obstacle,m.clearance),'Konservative Riemen-/Rahmenhülle einschließlich Stellweg frei vom Sperrraum');}
 }else{
  check('guide-span',right-(m.stroke+38)>=m.clearance,'Schlitten und Endkappen bleiben über den ganzen Hub innerhalb der Führung');
  check('guide-start',55-38.5>=m.clearance,'Freiraum zum linken Endblock einschließlich Mutterflansch');
  check('guide-rotation',true,'Zwei Ø8-mm-Führungswellen, je zwei LM8UU; Schlitten gegen Verdrehen geführt');
  check('base-clearance',6>=m.clearance,'Schlittenunterseite hält über den ganzen Hub Abstand zur Grundplatte');
  if(m.kind==='screw'){
   check('nut-engagement',m.stroke-23.5<=right-m.clearance,'Mutter bleibt über den gesamten Hub im nutzbaren Gewindebereich');
   check('screw-support',true,'Spindel: radiale Lager beidseitig, zwei Axiallager am Festlager, Loslager axial verschiebbar');
   check('thrust-clearance',7.5>=m.clearance,'Mutterflansch hält am Hubanfang 7,5 mm Abstand zur axialen Sicherung');
  }else {check('rack-engagement',rackLength/2-m.stroke/2>=20,'Zahnstange deckt den gesamten Hub plus mindestens 20 mm Endreserve ab');check('rack-frame',m.clearance<=4,'Zahnstange und Montagearme: 4 mm Freiraum zur festen Rahmen-/Ritzelhülle');}
  if(m.obstacle)for(const [i,box] of swept.entries())check(`swept-${i}`,!overlaps(box,m.obstacle,m.clearance),`Bewegungshülle ${i+1}: Sperrraum über den gesamten Hub frei`);
  if(m.obstacle)for(const [i,box] of fixed.entries())check(`fixed-${i}`,!overlaps(box,m.obstacle,m.clearance),`Feste Baugruppe ${i+1}: Sperrraum frei`);
 }
 checks.push({id:'physical',state:'unknown',message:'Geometrische Vorlage: Lasten, Riemenvorspannung, Kaufteilmaße und Druckpassungen noch am Muster prüfen.'});
 const ports=m.kind==='belt'?[
  {name:'input',kind:'shaft',position:[0,0,20],axis:[0,0,1],diameter:5},
  {name:'output',kind:'shaft',position:[c,0,20],axis:[0,0,1],diameter:5,allowedX:[min,max]},
 ]:[
  {name:'input',kind:'shaft',position:m.kind==='screw'?[-110,0,24]:[m.stroke/2,80,24],axis:m.kind==='screw'?[1,0,0]:[0,0,1],diameter:m.kind==='screw'?8:5},
  {name:'output',kind:'linear',origin:[0,0,24],axis:[1,0,0],range:[0,m.stroke],position:[q,0,24]},
 ];
 return {m,r,R,c,min,max,wrap,beltCandidates,rackTeeth,rackLength,right,q,swept,fixed,ports,checks,valid:checks.every(c=>c.state!=='fail'),mmPerTurn:m.kind==='screw'?m.lead:40*Math.PI,ratio:m.teethB/m.teethA};
}
