// The gearbox from above as SVG: the chosen layer's plate (rings round its bearings, webs as the hull of two rings),
// wheels as their pitch and tip circles, belts, shafts. Pure: a string. The hull of two rings is the quadrilateral
// between their outer tangent points plus both discs.
import type {GearPlan,LayerPlan} from './plan.ts';

const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
type P=[number,number];
/** The outer tangent points of two discs: on a, on b, then the other side. */
export function tangents(a:P,ra:number,b:P,rb:number):[P,P,P,P]|undefined{
 const d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<=Math.abs(ra-rb)+1e-9)return undefined;const t=Math.atan2(b[1]-a[1],b[0]-a[0]),f=Math.acos((ra-rb)/d);
 const on=(c:P,r:number,ang:number):P=>[c[0]+r*Math.cos(ang),c[1]+r*Math.sin(ang)];return [on(a,ra,t+f),on(b,rb,t+f),on(b,rb,t-f),on(a,ra,t-f)];}
/** What is drawn: x0..x1, y0..y1 in mm. */
export type View={x0:number;y1:number;scale:number;W:number;H:number};
export function bounds(p:GearPlan,layer?:LayerPlan){const s=p.layers.length?layer:undefined,pts=[...p.wheels.map(w=>({at:w.at,r:w.outer})),...p.bearings.map(b=>({at:b.at,r:b.D/2+(s?.rim??3)})),...p.shafts.map(x=>({at:x.at,r:5}))];if(!pts.length)return undefined;return {x0:Math.min(...pts.map(q=>q.at[0]-q.r)),x1:Math.max(...pts.map(q=>q.at[0]+q.r)),y0:Math.min(...pts.map(q=>q.at[1]-q.r)),y1:Math.max(...pts.map(q=>q.at[1]+q.r))};}
export function topView(p:GearPlan,layer?:LayerPlan,{scale=4,pad=12,view,selected}:{scale?:number;pad?:number;view?:View;selected?:string}={}){
 const s=p.layers.length?layer:undefined,ring=(k:string)=>{const b=p.bearings.find(x=>x.key===k)!;return {at:b.at,r:b.D/2+(s?.rim??0)};};
 const pts=[...p.wheels.map(w=>({at:w.at,r:w.outer})),...p.bearings.map(b=>({at:b.at,r:b.D/2+(s?.rim??3)})),...p.shafts.map(x=>({at:x.at,r:5}))];
 if(!pts.length&&!view)return '<svg xmlns="http://www.w3.org/2000/svg" class="topview" viewBox="0 0 200 80" width="200" height="80"><text x="10" y="40" class="empty">Noch keine Welle</text></svg>';
 const b=bounds(p,layer)??{x0:0,x1:50,y0:0,y1:50},v:View=view??{x0:b.x0-pad/scale,y1:b.y1+pad/scale,scale,W:(b.x1-b.x0)*scale+2*pad,H:(b.y1-b.y0)*scale+2*pad};void pts;
 scale=v.scale;const {W,H}=v,X=(x:number)=>(x-v.x0)*scale,Y=(y:number)=>(v.y1-y)*scale,R=(r:number)=>r*scale;
 const circle=(c:P,r:number,cls:string,title='',data='')=>`<circle class="${cls}" cx="${X(c[0])}" cy="${Y(c[1])}" r="${R(r)}"${data}>${title?`<title>${esc(title)}</title>`:''}</circle>`;
 const quad=(a:P,ra:number,b:P,rb:number)=>{const q=tangents(a,ra,b,rb);return q?q.map(v=>`${X(v[0])},${Y(v[1])}`).join(' '):'';};
 const plate=s?[...s.webs.map(w=>{const a=ring(w.a),b=ring(w.b),cls=`web${w.auto?'':' own'}${w.z?' stepped':''}${w.path?' round':''}${w.hits.length&&!w.path&&!w.z?' hit':''}`,data=`data-web="${esc(w.a)}|${esc(w.b)}"`;
  if(w.path){const pts=[a.at,...w.path,b.at];return `<g class="${cls}" ${data}>${pts.slice(1).map((q,i)=>`<polygon points="${quad(pts[i],w.width!,q,w.width!)}"/>${circle(q,w.width!,'joint')}`).join('')}</g>`;}
  return `<polygon class="${cls}" ${data} points="${quad(a.at,a.r,b.at,b.r)}"><title>${w.z?`in der Tiefe: ${w.z[0].toFixed(1)} bis ${w.z[1].toFixed(1)} mm`:''}</title></polygon>`;}),...s.bearings.map(k=>{const r=ring(k);return circle(r.at,r.r,'ring');}),
  ...p.bolts.flatMap(bo=>{const k=bo.attach[s.id];if(!k)return [];const r=ring(k);return [`<polygon class="ring" points="${quad(r.at,r.r,bo.at,bo.eye)}"/>`,circle(bo.at,bo.eye,'ring')];}),
  ...s.bearings.map(k=>{const b=p.bearings.find(x=>x.key===k)!;if(b.motor){const m=b.motor,t=m.slot?m.travel/2:0,sl=(c:P,r:number)=>t?`<line class="slot" x1="${X(c[0]-m.slot![0]*t)}" y1="${Y(c[1]-m.slot![1]*t)}" x2="${X(c[0]+m.slot![0]*t)}" y2="${Y(c[1]+m.slot![1]*t)}" stroke-width="${2*R(r)}"/>`:circle(c,r,'hole');return `<g class="motor" data-motor="${esc(m.key)}"><title>${esc(m.label)}${t?`, Langlöcher ±${t} mm`:''}</title>${sl(b.at,(m.part.pilot??0)/2)}${m.part.holes.map(h=>sl([b.at[0]+h.at[0],b.at[1]+h.at[1]],h.d/2)).join('')}</g>`;}return circle(b.at,b.D/2,'pocket',`${b.label}: Tasche Ø${b.D}`);}),...s.holes.filter(h=>h.ring).map(h=>circle(p.shafts.find(x=>x.id===h.on)!.at,h.ring!,'ring')),...s.holes.map(h=>circle(p.shafts.find(x=>x.id===h.on)!.at,h.r,'hole','Freiloch'))]:[];
 const belts=p.belts.map(bt=>{const a=p.wheels.find(w=>w.key===bt.a)!,b=p.wheels.find(w=>w.key===bt.b)!,t=tangents(a.at,a.pitch,b.at,b.pitch);return t?`<path class="belt" d="M${X(t[0][0])},${Y(t[0][1])}L${X(t[1][0])},${Y(t[1][1])}M${X(t[2][0])},${Y(t[2][1])}L${X(t[3][0])},${Y(t[3][1])}"><title>Riemen ${bt.length.toFixed(1)} mm</title></path>`:'';});
 const away=(z0:number,z1:number)=>!!s&&(Math.min(z1,s.band[1])-Math.max(z0,s.band[0])<=0);
 const wheels=p.wheels.map(w=>`<g class="wheel${w.pulley?' pulley':''}${away(w.z0,w.z1)?' away':''}" data-wheel="${esc(w.key)}">${circle(w.at,w.outer,'tip',`${w.label}`)}${circle(w.at,w.pitch,'pitch')}</g>`);
 const bolts=p.bolts.map((bo,i)=>`<g class="bolt-grip${bo.hit?' hit':''}${bo.auto?' auto':''}${selected===`bolzen:${i}`?' selected':''}" data-bolt="${i}"><title>Bolzen M${(2*bo.hole-.4).toFixed(0)} bei ${bo.at[0].toFixed(1)} / ${bo.at[1].toFixed(1)} mm: ziehen verschiebt</title>${circle(bo.at,bo.eye,'grip')}${circle(bo.at,bo.hole,'bolt')}</g>`);
 const shafts=p.shafts.map(x=>`<g class="shaft${x.id===selected?' selected':''}" data-shaft="${esc(x.id)}">${circle(x.at,Math.max(1.5,Math.max(...x.pieces.map(q=>q.r))),'axle',x.label)}<text x="${X(x.at[0])+6}" y="${Y(x.at[1])-6}">${esc(x.label)}</text></g>`);
 const meshes=p.meshes.map(m=>{const a=p.wheels.find(w=>w.key===m.a)!,b=p.wheels.find(w=>w.key===m.b)!;return `<line class="mesh" x1="${X(a.at[0])}" y1="${Y(a.at[1])}" x2="${X(b.at[0])}" y2="${Y(b.at[1])}"/>`;});
 return `<svg xmlns="http://www.w3.org/2000/svg" class="topview" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${plate.join('')}${wheels.join('')}${belts.join('')}${meshes.join('')}${bolts.join('')}${shafts.join('')}</svg>`;
}
