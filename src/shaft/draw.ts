// The shaft as a longitudinal section in SVG: sections as the outline, inserted shafts dashed inside, adapters and
// spacers over it, the parts on it as outlines. Pure: a string, so the page and checks draw the same.
// `scale`: px per mm along the shaft, `vscale` across it (the timeline keeps the drawing low on long zooms).
import {outer,inner,label} from './profile.ts';
import type {Plan} from './plan.ts';

const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
export const tallest=(p:Plan)=>Math.max(10,...p.sections.map(c=>outer(c.profile)),...p.placed.map(t=>t.part.outer),...p.sleeves.flatMap(s=>s.steps.map(x=>outer(x.outer))));
export function silhouette(p:Plan,{scale=8,pad=16,vscale=scale,ticks=true}:{scale?:number;pad?:number;vscale?:number;ticks?:boolean}={}){
 const tall=tallest(p),w=p.length*scale+2*pad,h=tall*vscale+2*8+(ticks?18:0),mid=8+tall*vscale/2,X=(x:number)=>pad+x*scale,Y=(r:number)=>mid-r*vscale;
 const box=(x0:number,x1:number,r:number,cls:string,title:string,ri=0)=>`<g class="${cls}"><title>${esc(title)}</title>${ri>0?`<rect x="${X(x0)}" y="${Y(r)}" width="${(x1-x0)*scale}" height="${(r-ri)*vscale}"/><rect x="${X(x0)}" y="${mid+ri*vscale}" width="${(x1-x0)*scale}" height="${(r-ri)*vscale}"/>`:`<rect x="${X(x0)}" y="${Y(r)}" width="${(x1-x0)*scale}" height="${2*r*vscale}"/>`}</g>`;
 const parts=p.placed.map(t=>box(t.x0,t.x1,t.part.outer/2,'part',`${t.label} · ${label(t.bore)} · von ${t.side}`,outer(t.bore)/2));
 const sleeves=p.sleeves.flatMap(s=>s.steps.map(x=>box(x.x0,x.x1,outer(x.outer)/2,`sleeve ${s.kind}`,`${s.label} · ${s.auto?'erzeugt':'von Hand'}`,outer(s.inner)/2)));
 const shaft=p.sections.map(c=>box(c.x0,c.x1,outer(c.profile)/2,`section ${c.role} ${c.profile.kind}`,`${label(c.profile)} · ${c.x0.toFixed(1)} bis ${c.x1.toFixed(1)} mm`));
 const flats=p.sections.filter(c=>c.profile.kind!=='rund').map(c=>`<line class="core" x1="${X(c.x0)}" x2="${X(c.x1)}" y1="${Y(inner(c.profile)/2)}" y2="${Y(inner(c.profile)/2)}"/>`);
 const holes=p.inserts.map(i=>`<g class="insert"><title>${esc(i.label)} · ${label(i.profile)} · ${(i.x1-i.x0).toFixed(1)} mm tief</title><rect x="${X(i.x0)}" y="${Y(outer(i.profile)/2)}" width="${(i.x1-i.x0)*scale}" height="${outer(i.profile)*vscale}"/></g>`);
 const marks=p.machining.flatMap(m=>{const w=m.work;
  if(w.kind==='madenschraube'&&m.drill){const c=p.sections.find(s=>w.x>=s.x0&&w.x<=s.x1),r=c?outer(c.profile)/2:0;return [`<g class="work"><title>M${w.m} · Kernloch Ø${m.drill} · ${(m.depth??0).toFixed(1)} mm Gewinde</title><rect class="drill" x="${X(w.x)-m.drill*scale/2}" y="${Y(r)}" width="${m.drill*scale}" height="${Math.max(0,m.depth??0)*vscale}"/></g>`];}
  if(w.kind==='gewinde'&&m.drill){const x0=w.end==='links'?0:p.length-w.depth;return [`<g class="work"><title>M${w.m} · Kernloch Ø${m.drill}</title><rect class="drill" x="${X(x0)}" y="${Y(m.drill/2)}" width="${w.depth*scale}" height="${m.drill*vscale}"/></g>`];}
  if(w.kind==='ring'&&m.ring)return [`<line class="work groove" x1="${X(w.x)}" x2="${X(w.x)}" y1="${Y(tall/2)}" y2="${Y(-tall/2)}"><title>Sicherungsring-Nut Ø${m.ring.d2}</title></line>`];
  if(w.kind==='nut'&&m.key){const c=p.sections.find(s=>w.x0>=s.x0-1e-6&&w.x0<=s.x1),r=c?outer(c.profile)/2:0;return [`<rect class="work key" x="${X(w.x0)}" y="${Y(r)}" width="${(w.x1-w.x0)*scale}" height="${m.key.t1*vscale}"><title>Passfeder ${m.key.b} × ${m.key.h}</title></rect>`];}
  if(w.kind==='abflachung'){const c=p.sections.find(s=>w.x0>=s.x0-1e-6&&w.x0<=s.x1),r=c?outer(c.profile)/2:0;return [`<rect class="work key" x="${X(w.x0)}" y="${Y(r)}" width="${(w.x1-w.x0)*scale}" height="${w.depth*vscale}"><title>Abflachung ${w.depth} mm</title></rect>`];}
  return [];});
 const tickList=ticks?Array.from({length:Math.floor(p.length/10)+1},(_,i)=>i*10).map(x=>`<line class="tick" x1="${X(x)}" x2="${X(x)}" y1="${h-16}" y2="${h-10}"/><text class="tick" x="${X(x)}" y="${h-1}">${x}</text>`):[];
 return `<svg xmlns="http://www.w3.org/2000/svg" class="silhouette" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${parts.join('')}${shaft.join('')}${flats.join('')}${holes.join('')}${sleeves.join('')}${marks.join('')}<line class="axis" x1="${pad/2}" x2="${w-pad/2}" y1="${mid}" y2="${mid}"/>${tickList.join('')}</svg>`;
}
