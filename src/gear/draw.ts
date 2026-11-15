// The gearbox from above as SVG: the chosen layer's plate (rings round its bearings, webs as the hull of two rings),
// wheels as their pitch and tip circles, belts, shafts. Pure: a string. The hull of two rings is the quadrilateral
// between their outer tangent points plus both discs.
import type {GearPlan,LayerPlan} from './plan.ts';
import {rot,carried,links} from './sweep.ts';
import {involuteOutline} from '../mechanics/kinematics/generate/involute.ts';
import type {Pose} from './sweep.ts';

const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
type P=[number,number];
/** The outer tangent points of two discs: on a, on b, then the other side. */
export function tangents(a:P,ra:number,b:P,rb:number):[P,P,P,P]|undefined{
 const d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<=Math.abs(ra-rb)+1e-9)return undefined;const t=Math.atan2(b[1]-a[1],b[0]-a[0]),f=Math.acos((ra-rb)/d);
 const on=(c:P,r:number,ang:number):P=>[c[0]+r*Math.cos(ang),c[1]+r*Math.sin(ang)];return [on(a,ra,t+f),on(b,rb,t+f),on(b,rb,t-f),on(a,ra,t-f)];}
/** The plan as it stands in a pose: swing arms turned about their pivots with all that is on them, arms turned with
 * their shafts. Slots along an arc stay with their plate. */
export function posePlan(p:GearPlan,pose:Pose):GearPlan{
 const bodyOf=(shaft:string)=>p.groups.find(g=>g.shafts.includes(shaft))?.id??'',chain=(body:string)=>links(p.groups,body,pose.groups),total=(body:string)=>chain(body).reduce((t,g)=>t+g.angle,0);
 const mv=(at:P,body:string):P=>carried(at,chain(body)),on=<T extends {at:P;on:string}>(x:T):T=>({...x,at:mv(x.at,bodyOf(x.on))});
 return {...p,wheels:p.wheels.map(on),bearings:p.bearings.map(on),shafts:p.shafts.map(x=>({...x,at:mv(x.at,bodyOf(x.id))})),
  arms:p.arms.map(a=>({...on(a),zero:a.angle+total(bodyOf(a.on)),angle:a.angle+total(bodyOf(a.on))+(p.turnRate[a.on]??0)*pose.turn})),bolts:p.bolts.map(b=>({...b,at:mv(b.at,b.body)})),
  // A slot along an arc stays in its plate: its centre and its start move with the plate's body.
  layers:p.layers.map(l=>({...l,webs:l.webs.map(w=>w.path?{...w,path:w.path.map(q=>mv(q,l.body))}:w),holes:l.holes.map(h=>{const at=p.shafts.find(x=>x.id===h.on)!.at;return {...h,...(h.arc?{arc:{...h.arc,c:mv(h.arc.c,l.body)},base:mv(at,l.body)}:{}),...(h.open&&total(l.body)?{open:{...h.open,dir:rot(h.open.dir,[0,0],total(l.body))}}:{})};})}))};}
/** What is drawn: x0..x1, y0..y1 in mm. */
export type View={x0:number;y1:number;scale:number;W:number;H:number};
export function bounds(p:GearPlan,layer?:LayerPlan){const s=p.layers.length?layer:undefined,pts=[...p.wheels.map(w=>({at:w.at,r:w.outer})),...p.bearings.map(b=>({at:b.at,r:b.D/2+(s?.rim??3)})),...p.shafts.map(x=>({at:x.at,r:5})),...p.arms.map(a=>({at:a.at,r:a.length+a.r1})),...p.groups.filter(g=>g.to>g.from).flatMap(g=>g.shafts.flatMap(id=>{const x=p.shafts.find(v=>v.id===id);return x?[g.from,(g.from+g.to)/2,g.to].map(deg=>({at:rot(x.at,g.at,deg),r:12})):[];}))];if(!pts.length)return undefined;return {x0:Math.min(...pts.map(q=>q.at[0]-q.r)),x1:Math.max(...pts.map(q=>q.at[0]+q.r)),y0:Math.min(...pts.map(q=>q.at[1]-q.r)),y1:Math.max(...pts.map(q=>q.at[1]+q.r))};}
export function topView(p:GearPlan,layer?:LayerPlan,{scale=4,pad=12,view,selected,pose,group}:{scale?:number;pad?:number;view?:View;selected?:string;/** Where the gearbox stands, else as drawn. */pose?:Pose;/** The swing arm chosen. */group?:string}={}){
 const drawn=p;if(pose){const k=layer?p.layers.indexOf(layer):-1;p=posePlan(p,pose);if(k>=0)layer=p.layers[k];}
 const s=p.layers.length?layer:undefined,ring=(k:string)=>{const b=p.bearings.find(x=>x.key===k)!;return {at:b.at,r:b.D/2+(s?.rim??0)};};
 const pts=[...p.wheels.map(w=>({at:w.at,r:w.outer})),...p.bearings.map(b=>({at:b.at,r:b.D/2+(s?.rim??3)})),...p.shafts.map(x=>({at:x.at,r:5}))];
 if(!pts.length&&!view)return '<svg xmlns="http://www.w3.org/2000/svg" class="topview" viewBox="0 0 200 80" width="200" height="80"><text x="10" y="40" class="empty">Noch keine Welle</text></svg>';
 const b=bounds(p,layer)??{x0:0,x1:50,y0:0,y1:50},v:View=view??{x0:b.x0-pad/scale,y1:b.y1+pad/scale,scale,W:(b.x1-b.x0)*scale+2*pad,H:(b.y1-b.y0)*scale+2*pad};void pts;
 scale=v.scale;const {W,H}=v,X=(x:number)=>(x-v.x0)*scale,Y=(y:number)=>(v.y1-y)*scale,R=(r:number)=>r*scale;
 const circle=(c:P,r:number,cls:string,title='',data='')=>`<circle class="${cls}" cx="${X(c[0])}" cy="${Y(c[1])}" r="${R(r)}"${data}>${title?`<title>${esc(title)}</title>`:''}</circle>`;
 const quad=(a:P,ra:number,b:P,rb:number)=>{const q=tangents(a,ra,b,rb);return q?q.map(v=>`${X(v[0])},${Y(v[1])}`).join(' '):'';};
 const arc=(base:P,w:{c:P;from:number;to:number})=>{const r=Math.hypot(base[0]-w.c[0],base[1]-w.c[1]),a=rot(base,w.c,w.from),e=rot(base,w.c,w.to),m=rot(base,w.c,(w.from+w.to)/2);
  return w.to-w.from>=359.9?`M${X(a[0])},${Y(a[1])}A${R(r)},${R(r)} 0 1 0 ${X(m[0])},${Y(m[1])}A${R(r)},${R(r)} 0 1 0 ${X(a[0])},${Y(a[1])}`:`M${X(a[0])},${Y(a[1])}A${R(r)},${R(r)} 0 ${w.to-w.from>180?1:0} 0 ${X(e[0])},${Y(e[1])}`;};
 const stroke=(cls:string,base:P,w:{c:P;from:number;to:number},r:number,title='')=>`<path class="${cls}" d="${arc(base,w)}" stroke-width="${2*R(r)}" stroke-linecap="round" fill="none">${title?`<title>${esc(title)}</title>`:''}</path>`;
 const plate=s?[...s.webs.map(w=>{const a=ring(w.a),b=ring(w.b),cls=`web${w.auto?'':' own'}${w.z?' stepped':''}${w.path?' round':''}${w.hits.length&&!w.path&&!w.z?' hit':''}`,data=`data-web="${esc(w.a)}|${esc(w.b)}"`;
  if(w.path){const pts=[a.at,...w.path,b.at];return `<g class="${cls}" ${data}>${pts.slice(1).map((q,i)=>`<polygon points="${quad(pts[i],w.width!,q,w.width!)}"/>${circle(q,w.width!,'joint')}`).join('')}</g>`;}
  return `<polygon class="${cls}" ${data} points="${quad(a.at,a.r,b.at,b.r)}"><title>${w.z?`in der Tiefe: ${w.z[0].toFixed(1)} bis ${w.z[1].toFixed(1)} mm`:''}</title></polygon>`;}),...s.bearings.map(k=>{const r=ring(k);return circle(r.at,r.r,'ring');}),
  ...p.bolts.flatMap(bo=>{const k=bo.attach[s.id];if(!k)return [];const r=ring(k);return [`<polygon class="ring" points="${quad(r.at,r.r,bo.at,bo.eye)}"/>`,circle(bo.at,bo.eye,'ring')];}),
  ...s.bearings.map(k=>{const b=p.bearings.find(x=>x.key===k)!;if(b.motor){const m=b.motor,t=m.slot?m.travel/2:0,sl=(c:P,r:number)=>t?`<line class="slot" x1="${X(c[0]-m.slot![0]*t)}" y1="${Y(c[1]-m.slot![1]*t)}" x2="${X(c[0]+m.slot![0]*t)}" y2="${Y(c[1]+m.slot![1]*t)}" stroke-width="${2*R(r)}"/>`:circle(c,r,'hole');return `<g class="motor" data-motor="${esc(m.key)}"><title>${esc(m.label)}${t?`, Langlöcher ±${t} mm`:''}</title>${sl(b.at,(m.part.pilot??0)/2)}${m.part.holes.map(h=>sl([b.at[0]+h.at[0],b.at[1]+h.at[1]],h.d/2)).join('')}</g>`;}if(b.hub)return `<g class="hub"><title>${esc(b.label)}: sitzt fest auf der Welle</title>${circle(b.at,b.d/2+.8,'hub-ring')}${circle(b.at,b.d/2,'hub-bore')}</g>`;return circle(b.at,b.D/2,'pocket',`${b.label}: Tasche Ø${b.D}`);}),...s.holes.filter(h=>h.ring).map(h=>{const c=h.base??p.shafts.find(x=>x.id===h.on)!.at;return h.arc?stroke('ring-arc',c,h.arc,h.ring!):circle(c,h.ring!,'ring');}),...s.holes.map(h=>{const c=h.base??p.shafts.find(x=>x.id===h.on)!.at;if(h.arc)return `<g class="hole arc">${stroke('hole-edge',c,h.arc,h.r+.6/scale)}${stroke('hole-arc',c,h.arc,h.r,'Ausschnitt im Bogen: die Welle schwenkt hier durch die Platte')}</g>`;if(!h.open)return circle(c,h.r,'hole','Freiloch');const [dx,dy]=h.open.dir,nx=-dy*h.r,ny=dx*h.r,L=h.open.length,pts=[[c[0]+nx,c[1]+ny],[c[0]+dx*L+nx,c[1]+dy*L+ny],[c[0]+dx*L-nx,c[1]+dy*L-ny],[c[0]-nx,c[1]-ny]];return `<g class="hole open"><title>Freiloch, zum Rand offen</title>${circle(c,h.r,'hole')}<polygon class="hole" points="${pts.map(q=>`${X(q[0])},${Y(q[1])}`).join(' ')}"/></g>`;})]:[];
 const belts=p.belts.map(bt=>{const a=p.wheels.find(w=>w.key===bt.a)!,b=p.wheels.find(w=>w.key===bt.b)!,t=tangents(a.at,a.pitch,b.at,b.pitch);return t?`<path class="belt" d="M${X(t[0][0])},${Y(t[0][1])}L${X(t[1][0])},${Y(t[1][1])}M${X(t[2][0])},${Y(t[2][1])}L${X(t[3][0])},${Y(t[3][1])}"><title>Riemen ${bt.length.toFixed(1)} mm</title></path>`:'';});
 // The other layers' plates under the chosen one, see-through, each body in its colour: the frame, then every link.
 const tone=(body:string)=>body?`tone-${p.groups.findIndex(g=>g.id===body)%5+1}`:'tone-0';
 const ghosts=s?p.layers.map((l,i)=>{if(l===s)return '';const rg=(k:string)=>{const b=p.bearings.find(x=>x.key===k)!;return {at:b.at,r:b.D/2+l.rim};},of=l.body?` · ${p.groups.find(g=>g.id===l.body)?.name??''}`:'';
  return `<g class="ghost ${tone(l.body)}${l.body===s.body?' same':''}" data-ghost="${i}"><title>Schicht ${i+1}${esc(of)}: anklicken macht sie zur aktiven Platte</title>${l.webs.map(w=>{const a=rg(w.a),b=rg(w.b);if(w.path){const pts=[a.at,...w.path,b.at];return pts.slice(1).map((q,k)=>`<polygon points="${quad(pts[k],w.width!,q,w.width!)}"/>${circle(q,w.width!,'')}`).join('');}return `<polygon points="${quad(a.at,a.r,b.at,b.r)}"/>`;}).join('')}${l.bearings.map(k=>{const r=rg(k);return circle(r.at,r.r,'');}).join('')}${p.bolts.map(bo=>{const k=bo.attach[l.id];if(!k)return '';const r=rg(k);return `<polygon points="${quad(r.at,r.r,bo.at,bo.eye)}"/>${circle(bo.at,bo.eye,'')}`;}).join('')}</g>`;}):[];
 const away=(z0:number,z1:number)=>!!s&&(Math.min(z1,s.band[1])-Math.max(z0,s.band[0])<=0);
 // What moves: the area an arm sweeps, and a mark on every pivot.
 const fans=p.arms.map(a=>{const reach=a.length+a.r1,zero=a.zero??a.angle;if(!a.spin)return circle(a.at,reach,'fan endless',`${a.label}: dreht endlos`);
  const pt=(deg:number)=>`${X(a.at[0]+reach*Math.cos(deg*Math.PI/180))},${Y(a.at[1]+reach*Math.sin(deg*Math.PI/180))}`;
  return `<path class="fan" d="M${X(a.at[0])},${Y(a.at[1])}L${pt(zero+a.spin[0])}A${R(reach)},${R(reach)} 0 ${a.spin[1]-a.spin[0]>180?1:0} 0 ${pt(zero+a.spin[1])}Z"><title>${esc(a.label)}: schwenkt ${a.spin[0].toFixed(0)}° bis ${a.spin[1].toFixed(0)}°</title></path>`;});
 const armShapes=p.arms.map(a=>{const end:P=[a.at[0]+a.length*Math.cos(a.angle*Math.PI/180),a.at[1]+a.length*Math.sin(a.angle*Math.PI/180)];
  return `<g class="arm${away(a.z0,a.z1)?' away':''}" data-arm="${esc(a.key)}"><title>${esc(a.label)}</title><polygon points="${quad(a.at,a.r0,end,a.r1)}"/>${circle(a.at,a.r0,'arm-body')}${circle(end,a.r1,'arm-body')}${a.hole?circle(end,a.hole/2,'hole'):''}</g>`;});
 const swings=drawn.groups.filter(g=>g.to>g.from).flatMap(g=>{return [`<g class="pivot${group===g.id?' selected':''}"><title>Drehachse von ${esc(g.name)}</title><circle cx="${X(g.at[0])}" cy="${Y(g.at[1])}" r="9"/><path d="M${X(g.at[0])-13},${Y(g.at[1])}h26M${X(g.at[0])},${Y(g.at[1])-13}v26"/></g>`];});
 // Wheels with their teeth (the involute outline, as the 3D model has it), pulleys with their pitch as dashes, bearings as
 // rings with balls, motors as their square bodies.
 const teeth=(w:GearPlan['wheels'][number])=>{if(w.pulley||!w.module||w.module*(w.teeth/2-1.25)<1)return '';try{const pts=involuteOutline({module:w.module,teeth:w.teeth,samples:2});return `<path class="teeth" d="M${pts.map(q=>`${X(w.at[0]+q[0]).toFixed(1)},${Y(w.at[1]+q[1]).toFixed(1)}`).join('L')}Z"/>`;}catch{return '';}};
 const balls=p.bearings.filter(b=>!b.motor&&!b.hub).map(b=>{const mid=(b.D+b.d)/4,rb=Math.max(.6,(b.D-b.d)/8),k=Math.max(6,Math.min(12,Math.floor(2*Math.PI*mid/(2.6*rb))));
  return `<g class="bearing-sym${away(b.z0,b.z1)?' away':''}"><title>${esc(b.label)}</title>${circle(b.at,b.D/2,'race')}${circle(b.at,b.d/2+(b.D-b.d)*.08,'race')}${Array.from({length:k},(_,i)=>circle([b.at[0]+mid*Math.cos(2*Math.PI*i/k),b.at[1]+mid*Math.sin(2*Math.PI*i/k)],rb,'ball')).join('')}</g>`;});
 const motorBodies=p.motors.map(m=>{const q=p.shafts.find(x=>x.id===m.on)?.at??m.at,w=m.part.size[0];return `<rect class="motor-body" x="${X(q[0]-w/2)}" y="${Y(q[1]+w/2)}" width="${R(w)}" height="${R(w)}" rx="${R(3)}"><title>${esc(m.label)}</title></rect>`;});
 const wheels=p.wheels.map(w=>`<g class="wheel${w.free?' free':''}${w.pulley?' pulley':''}${away(w.z0,w.z1)?' away':''}" data-wheel="${esc(w.key)}">${circle(w.at,w.outer,'tip',`${w.label}`)}${teeth(w)}${circle(w.at,w.pitch,'pitch')}</g>`);
 const bolts=p.bolts.map((bo,i)=>`<g class="bolt-grip${bo.hit?' hit':''}${bo.auto?' auto':''}${selected===`bolzen:${i}`?' selected':''}" data-bolt="${i}"><title>Bolzen M${(2*bo.hole-.4).toFixed(0)} bei ${bo.at[0].toFixed(1)} / ${bo.at[1].toFixed(1)} mm: ziehen verschiebt</title>${circle(bo.at,bo.eye,'grip')}${circle(bo.at,bo.hole,'bolt')}</g>`);
 const shafts=p.shafts.map(x=>`<g class="shaft${x.id===selected?' selected':''}${p.groups.some(g=>g.shafts.includes(x.id))?' on-swing':''}${group&&p.groups.find(g=>g.id===group)?.shafts.includes(x.id)?' of-group':''}" data-shaft="${esc(x.id)}">${circle(x.at,Math.max(1.5,Math.max(...x.pieces.map(q=>q.r))),'axle',x.label)}<text x="${X(x.at[0])+6}" y="${Y(x.at[1])-6}">${esc(x.label)}</text></g>`);
 const meshes=p.meshes.map(m=>{const a=p.wheels.find(w=>w.key===m.a)!,b=p.wheels.find(w=>w.key===m.b)!;return `<line class="mesh" x1="${X(a.at[0])}" y1="${Y(a.at[1])}" x2="${X(b.at[0])}" y2="${Y(b.at[1])}"/>`;});
 return `<svg xmlns="http://www.w3.org/2000/svg" class="topview" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${motorBodies.join('')}${ghosts.join('')}<g class="plate ${tone(s?.body??'')}${s?.body?' swing-plate':''}">${plate.join('')}</g>${balls.join('')}${swings.join('')}${fans.join('')}${wheels.join('')}${belts.join('')}${meshes.join('')}${armShapes.join('')}${bolts.join('')}${shafts.join('')}</svg>`;
}
