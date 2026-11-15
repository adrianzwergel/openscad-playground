// The gearbox editor: the shaft generator's shafts on the left (drag them onto the plane or click), the plane from above
// in the middle (drag shafts: they snap into mesh round a partner in angle steps, else onto the mm grid; Alt: free), the
// layers from the side below (bands to move and stretch), properties on the right (exact values, angle round a
// partner, belts, webs, layer rules).
import type {GearDoc,Layer,GearSettings,Group} from './model.ts';
import type {Pose} from './sweep.ts';
import {webKey} from './model.ts';
import type {GearPlan,ShaftFile} from './plan.ts';
import {topView,bounds} from './draw.ts';
import type {View} from './draw.ts';
import {snapShaft,around} from './snap.ts';

export type Selection={kind:'shaft';id:string}|{kind:'web';a:string;b:string}|{kind:'layer';index:number}|{kind:'bolt';index:number}|{kind:'group';id:string}|undefined;
export type Host={/** Opens the shaft editor over the page; without id: a new shaft. */editShaft(id?:string):void;doc():GearDoc;plan():GearPlan;files():Record<string,ShaftFile>;fileNames():{id:string;name:string}[];begin():void;commit(message?:string):void;live():void;readOnly():boolean};
type Drag={kind:'shaft';id:string;from:[number,number];start:[number,number];plan:GearPlan;moved:boolean}|{kind:'band';index:number;mode:'move'|'l'|'r';start:number;orig:{z0:number;z1:number};moved:boolean}|{kind:'bolt';index:number;from:[number,number];start:[number,number];moved:boolean};

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
const MARGIN=40,SIDE_PAD=12,LABEL=96;

export class GearEditor{
 sel:Selection;layer=0;/** Where the gearbox is shown, away from how it is drawn. */pose:Pose={turn:0,groups:{}};private view?:View;private side?:{z0:number;scale:number};private drag?:Drag;private pending?:{file:string;x:number;y:number};private ghost?:HTMLElement;
 constructor(private host:Host,private status:(m:string)=>void){addEventListener('pointermove',e=>this.onMove(e));addEventListener('pointerup',e=>this.onUp(e));}
 private get doc(){return this.host.doc();}
 private newId(){const used=new Set(this.doc.shafts.map(s=>s.id));let i=1;while(used.has(`w${i}`))i++;return `w${i}`;}
 private posed(){const z=this.pose;return z.turn||Object.values(z.groups).some(Boolean)?z:undefined;}
 /** Back to where the gearbox is drawn: what is dragged is what is saved. */
 private rest(){if(this.posed()){this.pose={turn:0,groups:{}};this.host.live();}}
 /** The sliders that move the gearbox through its ranges. Only a look: nothing of it is saved. */
 renderPose(root:HTMLElement){const d=this.doc,p=this.host.plan(),rows:{key:string;label:string;from:number;to:number;get:()=>number;set:(v:number)=>void}[]=[];
  if(d.turn&&p.shafts.some(x=>x.id===d.turn!.on))rows.push({key:`t:${d.turn.on}:${d.turn.from}:${d.turn.to}`,label:`Drehung ${p.shafts.find(x=>x.id===d.turn!.on)!.label}`,from:d.turn.from,to:d.turn.to,get:()=>this.pose.turn,set:v=>{this.pose.turn=v;}});else this.pose.turn=0;
  for(const g of p.groups)if(g.to>g.from)rows.push({key:`g:${g.id}:${g.from}:${g.to}`,label:g.name,from:g.from,to:g.to,get:()=>this.pose.groups[g.id]??0,set:v=>{this.pose.groups[g.id]=v;}});
  for(const k of Object.keys(this.pose.groups))if(!p.groups.some(g=>g.id===k&&g.to>g.from))delete this.pose.groups[k];
  for(const r of rows){const v=Math.min(Math.max(r.to,0),Math.max(Math.min(r.from,0),r.get()));if(v!==r.get())r.set(v);}
  const key=rows.map(r=>r.key).join('|');
  if(root.dataset.key!==key){root.dataset.key=key;root.replaceChildren(...rows.map(r=>{const i=el('input',{type:'range',min:String(Math.min(r.from,0)),max:String(Math.max(r.to,0)),step:'1',value:String(r.get())}),out=el('output',{textContent:`${n(r.get())}°`});i.dataset.pose=r.key.split(':').slice(0,2).join(':');
    i.oninput=()=>{r.set(Number(i.value));out.textContent=`${n(Number(i.value))}°`;this.host.live();};return el('label',{className:'pose'},el('span',{textContent:r.label}),i,out);}),
   ...(rows.length?[(()=>{const b=el('button',{className:'ghost',textContent:'Grundstellung'});b.dataset.poseReset='true';b.onclick=()=>{this.pose={turn:0,groups:{}};this.host.live();};return b;})()]:[]));return;}
  root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((i,k)=>{if(document.activeElement===i||!rows[k])return;i.value=String(rows[k].get());(i.nextElementSibling as HTMLElement).textContent=`${n(rows[k].get())}°`;});}
 /** The bolts of the body the plan's bolt `index` belongs to, set by hand (the first change by hand makes the proposed
  * places set ones, in the same order): the list, the bolt's place in it, and where the body's bolts start in the plan. */
 private manualBolts(index:number){const d=this.doc,all=this.host.plan().bolts,body=all[index]?.body??'',of=all.filter(b=>b.body===body),k=Math.max(0,of.indexOf(all[index])),g=body?d.groups?.find(v=>v.id===body):undefined,fresh=()=>of.map(b=>[...b.at] as [number,number]);
  const list=g?g.bolts??=fresh():d.bolts??=fresh();return {list,k,start:index-k,clear:()=>{if(g)delete g.bolts;else delete d.bolts;}};}
 private addGroup(pivot:string,fixed:boolean):Group{const d=this.doc;d.groups??=[];let i=1;while(d.groups.some(g=>g.id===`g${i}`))i++;const word=fixed?'Hebel':'Schwinge';let k=1;while(d.groups.some(g=>g.name===`${word} ${k}`))k++;
  const g:Group={id:`g${i}`,name:`${word} ${k}`,pivot,shafts:[],from:fixed?-90:-20,to:fixed?90:20,...(fixed?{fixed:true}:{})};d.groups.push(g);return g;}
 private dropGroup(id:string){const d=this.doc;d.groups=(d.groups??[]).filter(g=>g.id!==id);if(!d.groups.length)delete d.groups;for(const l of d.layers??[])if(l.group===id)delete l.group;delete this.pose.groups[id];}
 /** Takes a shaft out of the gearbox with all that hangs on it: belts, the input, the range, swing arms about it. */
 private dropShaft(id:string){const d=this.doc;d.shafts=d.shafts.filter(v=>v.id!==id);d.belts=d.belts.filter(b=>b.a.on!==id&&b.b.on!==id);if(d.input===id)delete d.input;if(d.turn?.on===id)delete d.turn;
  for(const g of [...(d.groups??[])]){if(g.pivot===id)this.dropGroup(g.id);else g.shafts=g.shafts.filter(v=>v!==id);}}
 /** How far a shaft turns: set here, or what follows from the shaft it is set at. */
 private turnProps(id:string,field:(text:string,value:number|undefined,set:(v:number|undefined)=>void,o?:{step?:number;optional?:boolean;placeholder?:string})=>HTMLElement,button:(text:string,go:()=>void,cls?:string)=>HTMLButtonElement):(HTMLElement|string)[]{
  const d=this.doc,p=this.host.plan(),mine=d.turn?.on===id,k=p.turnRate[id],cur:[number,number]|undefined=mine?[d.turn!.from,d.turn!.to]:d.turn&&k!==undefined?[Math.min(k*d.turn.from,k*d.turn.to),Math.max(k*d.turn.from,k*d.turn.to)]:undefined;
  const set=(from:number|undefined,to:number|undefined)=>{if(from===undefined||to===undefined){if(mine)delete d.turn;return;}d.turn={on:id,from:Math.min(from,to),to:Math.max(from,to)};this.pose.turn=0;};
  return [el('h3',{textContent:'Drehbereich'}),field('dreht von [°]',cur?.[0],v=>set(v,v===undefined?undefined:cur?.[1]??Math.max(0,v)),{optional:true,step:5,placeholder:'endlos'}),field('dreht bis [°]',cur?.[1],v=>set(v===undefined?undefined:cur?.[0]??Math.min(0,v),v),{optional:true,step:5,placeholder:'endlos'}),
   el('p',{className:'prop-info',textContent:!d.turn?'Leer: alles dreht endlos. Ein Bereich hier gilt über die Übersetzungen für alle Wellen; Hebel überstreichen dann nur ihren Fächer.':mine?'Hier gesetzt, gemessen ab der gezeichneten Stellung; die anderen Wellen folgen über die Übersetzungen.':cur?`Folgt aus ${p.shafts.find(v=>v.id===d.turn!.on)?.label??'einer anderen Welle'}. Ein Wert hier setzt den Bereich an diese Welle.`:'Hängt nicht starr an der Welle mit dem Bereich (eine Schwinge dazwischen oder kein Antrieb): gilt als endlos.'}),
   ...(d.turn?[button('Endlos drehen',()=>{delete d.turn;this.pose.turn=0;},'ghost')]:[])];}
 /** A shaft and the swing arms: the one it is on, the ones it is the pivot of, and a new one about it. */
 private groupProps(id:string,button:(text:string,go:()=>void,cls?:string)=>HTMLButtonElement):(HTMLElement|string)[]{const d=this.doc,gs=d.groups??[],inG=gs.find(g=>g.shafts.includes(id)),name=(g:Group)=>g.name||'Schwinge';
  const open=(g:Group)=>{const b=el('button',{className:'ghost',textContent:`${name(g)} öffnen`});b.dataset.openGroup=g.id;b.onclick=()=>{this.sel={kind:'group',id:g.id};this.host.live();};return b;};
  return [el('h3',{textContent:'Schwinge'}),...(inG?[el('p',{className:'prop-info',textContent:`Sitzt auf ${name(inG)} und schwenkt mit ihr.`}),el('div',{className:'prop-row'},open(inG),button('herausnehmen',()=>{inG.shafts=inG.shafts.filter(v=>v!==id);},'ghost'))]:[]),
   ...gs.filter(g=>g.pivot===id).map(g=>el('div',{className:'prop-row'},el('span',{textContent:`Drehachse von ${name(g)}`}),open(g))),
   ...(!inG?gs.filter(g=>g.pivot!==id).map(g=>{const b=button(`Auf ${name(g)} setzen`,()=>{g.shafts.push(id);},'ghost');b.dataset.joinGroup=g.id;return b;}):[]),
   el('div',{className:'prop-col'},(()=>{const b=button('＋ Hebel fest auf dieser Welle',()=>{const g=this.addGroup(id,true);this.sel={kind:'group',id:g.id};},'ghost');b.dataset.newGroup='fest';b.title='Ein Glied, das mit dieser Welle dreht; darauf lassen sich weitere Wellen und Motoren setzen';return b;})(),
    (()=>{const b=button('＋ Schwinge frei um diese Welle',()=>{const g=this.addGroup(id,false);this.sel={kind:'group',id:g.id};},'ghost');b.dataset.newGroup='frei';b.title='Ein Glied, das auf Lagern um diese Welle schwenkt, etwa zum Spannen';return b;})())];}
 // ---------- library ----------
 renderLibrary(root:HTMLElement){const names=this.host.fileNames();
  root.replaceChildren(el('h2',{textContent:'Wellen'}),el('p',{className:'muted small',textContent:'Aus dem Wellen-Generator: auf die Ebene ziehen oder klicken.'}),
   ...names.map(f=>{const b=el('button',{className:'cat-card',title:'Auf die Ebene ziehen oder klicken'},el('strong',{textContent:f.name}),el('small',{textContent:`${this.doc.shafts.filter(s=>s.shaft===f.id).length||'nicht'} im Getriebe`}));b.dataset.addShaft=f.id;b.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();this.pending={file:f.id,x:e.clientX,y:e.clientY};};return b;}),
   (()=>{const b=el('button',{className:'ghost',textContent:'＋ Neue Welle anlegen',disabled:this.host.readOnly()});b.id='new-shaft';b.onclick=()=>this.host.editShaft();return b;})());}
 /** Places a shaft file at `at` (mm), or right of what stands there. */
 place(file:string,at?:[number,number]){if(this.host.readOnly())return;const d=this.doc,p=this.host.plan(),b=bounds(p);this.host.begin();const id=this.newId();
  d.shafts.push({id,shaft:file,at:[0,0],z:0});const fresh=this.host.plan(),want=at??[b?Math.round(b.x1+20):0,b?Math.round((b.y0+b.y1)/2):0],s=snapShaft(fresh,id,want,{angle:d.settings.angle,grid:d.settings.grid,tol:at?8/(this.view?.scale??4):1e9});
  d.shafts[d.shafts.length-1].at=at||s.partner?s.at:want;const onto=this.sel?.kind==='group'?d.groups?.find(g=>g.id===(this.sel as {id:string}).id):undefined;if(onto){onto.shafts.push(id);this.host.commit(`${this.host.files()[file]?.name??'Welle'} auf ${onto.name||'Schwinge'} gesetzt`);return;}this.sel={kind:'shaft',id};this.host.commit(`${this.host.files()[file]?.name??'Welle'} gesetzt${s.partner?', kämmt':''}`);}
 // ---------- top view ----------
 renderTop(root:HTMLElement){const p=this.host.plan(),L=p.layers[this.layer];
  if(!this.drag||this.drag.kind==='band'||!this.view){const b=bounds(p,L)??{x0:-50,x1:50,y0:-30,y1:30},w=Math.max(300,(root.clientWidth||800)-20),scale=Math.max(1,Math.min(12,w/(b.x1-b.x0+2*MARGIN))),h=(b.y1-b.y0+2*MARGIN)*scale;this.view={x0:b.x0-MARGIN,y1:b.y1+MARGIN,scale,W:w,H:Math.max(220,Math.min(560,h))};}
  const sel=this.sel?.kind==='shaft'?this.sel.id:this.sel?.kind==='bolt'?`bolzen:${this.sel.index}`:undefined;root.innerHTML=topView(p,L,{view:this.view,selected:sel,pose:this.posed(),...(this.sel?.kind==='group'?{group:this.sel.id}:{})});
  const svg=root.querySelector('svg')!;svg.dataset.scale=String(this.view.scale);svg.querySelectorAll<SVGGElement>('[data-shaft]').forEach(g=>{g.onpointerdown=e=>this.startShaft(e,g.dataset.shaft!);});
  svg.querySelectorAll<SVGPolygonElement>('[data-web]').forEach(w=>{const [a,b]=w.dataset.web!.split('|');if(this.sel?.kind==='web'&&this.sel.a===a&&this.sel.b===b)w.classList.add('selected');w.onpointerdown=e=>{e.stopPropagation();this.sel={kind:'web',a,b};this.host.live();};});
  // A see-through plate clicked becomes the active one.
  svg.querySelectorAll<SVGGElement>('[data-ghost]').forEach(g=>{g.onpointerdown=ev=>{if(ev.button!==0)return;ev.stopPropagation();this.layer=Number(g.dataset.ghost);this.sel={kind:'layer',index:this.layer};this.host.live();};});
  svg.querySelectorAll<SVGGElement>('[data-bolt]').forEach(g=>{g.onpointerdown=e=>this.startBolt(e,Number(g.dataset.bolt));});
  svg.onpointerdown=e=>{if(e.target===svg){this.sel=undefined;this.host.live();}};}
 private startBolt(e:PointerEvent,index:number){if(e.button!==0)return;e.preventDefault();e.stopPropagation();this.rest();const at=this.mm(e)!,from=this.host.plan().bolts[index].at;this.drag={kind:'bolt',index,from:[...from],start:at,moved:false};if(!this.host.readOnly())this.host.begin();}
 private mm(e:{clientX:number;clientY:number}):[number,number]|undefined{const svg=document.querySelector('#top svg');if(!svg||!this.view)return undefined;const r=svg.getBoundingClientRect();return [this.view.x0+(e.clientX-r.left)/this.view.scale,this.view.y1-(e.clientY-r.top)/this.view.scale];}
 private startShaft(e:PointerEvent,id:string){if(e.button!==0)return;e.preventDefault();e.stopPropagation();this.rest();const s=this.doc.shafts.find(x=>x.id===id)!,at=this.mm(e)!;this.drag={kind:'shaft',id,from:[...s.at],start:at,plan:this.host.plan(),moved:false};if(!this.host.readOnly())this.host.begin();}
 // ---------- side view: layers ----------
 renderLayers(root:HTMLElement){const p=this.host.plan(),d=this.doc;
  const zs=[...p.shafts.flatMap(x=>[x.z0,x.z1]),...p.layers.flatMap(l=>l.band)];if(!zs.length){root.replaceChildren(el('p',{className:'muted',textContent:'Noch keine Welle.'}));return;}
  if(this.drag?.kind!=='band'||!this.side){const z0=Math.min(...zs)-5,z1=Math.max(...zs)+5,w=Math.max(300,(root.clientWidth||800)-20-2*SIDE_PAD-LABEL);this.side={z0,scale:w/(z1-z0)};}
  const {z0,scale}=this.side,X=(z:number)=>LABEL+SIDE_PAD+(z-z0)*scale,ROW=24,rows=p.shafts.length,H=rows*ROW+44,W=X(Math.max(...zs)+5)+SIDE_PAD;
  const box=(a:number,b:number,y:number,h:number,cls:string,title:string,extra='')=>`<rect class="${cls}" x="${X(a)}" y="${y}" width="${Math.max(2,(b-a)*scale)}" height="${h}"${extra}><title>${title}</title></rect>`;
  const shafts=p.shafts.map((x,i)=>{const y=i*ROW+6;return `<g class="row"><text x="2" y="${y+11}">${x.label}</text><line class="axle" x1="${X(x.z0)}" x2="${X(x.z1)}" y1="${y+8}" y2="${y+8}"/>${p.bearings.filter(b=>b.on===x.id).map(b=>box(b.z0,b.z1,y,16,'bearing',b.label)).join('')}${p.wheels.filter(w=>w.on===x.id).map(w=>box(w.z0,w.z1,y+2,12,w.pulley?'pulley':'wheel',w.label)).join('')}${p.arms.filter(v=>v.on===x.id).map(v=>box(v.z0,v.z1,y-2,20,'arm',v.label)).join('')}</g>`;}).join('');
  const bands=p.layers.map((l,i)=>`<g class="band${this.sel?.kind==='layer'&&this.sel.index===i?' selected':''}${l.auto?' auto':''}" data-band="${i}">${box(l.band[0],l.band[1],0,rows*ROW+8,'zone','')}${box(l.band[0],l.band[1],rows*ROW+12,22,'handle',`Schicht ${i+1}: ziehen verschiebt, Kanten ändern`)}<text x="${X(l.band[0])+4}" y="${rows*ROW+27}">${i+1}</text><rect class="edge" data-edge="l" x="${X(l.band[0])-3}" y="${rows*ROW+12}" width="6" height="22"/><rect class="edge" data-edge="r" x="${X(l.band[1])-3}" y="${rows*ROW+12}" width="6" height="22"/></g>`).join('');
  root.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" class="sideview" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bands}${shafts}</svg>`;
  root.querySelectorAll<SVGGElement>('[data-band]').forEach(g=>{g.onpointerdown=e=>{if(e.button!==0)return;if(this.host.plan().layers[Number(g.dataset.band)]?.motor){this.sel={kind:'layer',index:Number(g.dataset.band)};this.layer=Number(g.dataset.band);this.host.live();return;}e.preventDefault();const index=Number(g.dataset.band),edge=(e.target as SVGElement).dataset.edge as 'l'|'r'|undefined;this.manualLayers();const l=this.doc.layers![index];this.sel={kind:'layer',index};this.layer=index;this.drag={kind:'band',index,mode:edge??'move',start:e.clientX,orig:{z0:l.z0,z1:l.z1},moved:false};if(!this.host.readOnly())this.host.begin();};});
  void d;}
 /** The first hand change to a layer turns the proposed layers into set ones. */
 private manualLayers(){const d=this.doc;if(d.layers?.length)return;d.layers=this.host.plan().layers.filter(l=>!l.motor).map(l=>({id:l.id,z0:l.z0,z1:l.z1,...(l.body?{group:l.body}:{})}));}
 // ---------- pointer ----------
 private onMove(e:PointerEvent){
  if(this.pending&&!this.ghost&&Math.hypot(e.clientX-this.pending.x,e.clientY-this.pending.y)>4){this.ghost=el('div',{className:'drag-ghost',textContent:this.host.files()[this.pending.file]?.name??''});document.body.append(this.ghost);}
  if(this.ghost){this.ghost.style.left=`${e.clientX+12}px`;this.ghost.style.top=`${e.clientY+8}px`;return;}
  const g=this.drag;if(!g||this.host.readOnly())return;
  if(g.kind==='bolt'){const at=this.mm(e);if(!at)return;if(!g.moved&&Math.hypot(at[0]-g.start[0],at[1]-g.start[1])*this.view!.scale<3)return;g.moved=true;const grid=e.altKey?0:this.doc.settings.grid,snap=(v:number)=>grid>0?Math.round(v/grid)*grid:+v.toFixed(3);
   const m=this.manualBolts(g.index);m.list[m.k]=[snap(g.from[0]+at[0]-g.start[0]),snap(g.from[1]+at[1]-g.start[1])];this.status(`Bolzen bei ${n(m.list[m.k][0])} / ${n(m.list[m.k][1])} mm`);this.host.live();return;}
  if(g.kind==='shaft'){const at=this.mm(e);if(!at)return;if(!g.moved&&Math.hypot(at[0]-g.start[0],at[1]-g.start[1])*this.view!.scale<3)return;g.moved=true;
   const want:[number,number]=[g.from[0]+at[0]-g.start[0],g.from[1]+at[1]-g.start[1]],s=snapShaft(g.plan,g.id,want,{angle:this.doc.settings.angle,grid:this.doc.settings.grid,tol:8/this.view!.scale,free:e.altKey});
   this.doc.shafts.find(x=>x.id===g.id)!.at=s.at;this.status(s.partner?`kämmt: ${n(s.partner.distance)} mm, ${n(s.partner.angle)}°`:`${n(s.at[0])} / ${n(s.at[1])} mm`);this.host.live();return;}
  const dz=(e.clientX-g.start)/this.side!.scale;if(!g.moved&&Math.abs(dz*this.side!.scale)<3)return;g.moved=true;const l=this.doc.layers![g.index],r=(v:number)=>Math.round(v*2)/2;
  if(g.mode==='move'){l.z0=r(g.orig.z0+dz);l.z1=r(g.orig.z1+dz);}else if(g.mode==='l')l.z0=Math.min(r(g.orig.z0+dz),l.z1-.5);else l.z1=Math.max(r(g.orig.z1+dz),l.z0+.5);this.host.live();}
 private onUp(e:PointerEvent){
  if(this.pending){const file=this.pending.file,dropped=!!this.ghost;this.ghost?.remove();this.ghost=undefined;this.pending=undefined;if(!dropped){this.place(file);return;}const over=(document.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null)?.closest('#top');if(over)this.place(file,this.mm(e));return;}
  const g=this.drag;if(!g)return;this.drag=undefined;if(g.kind==='shaft'&&!g.moved){this.sel={kind:'shaft',id:g.id};this.host.live();return;}if(g.kind==='band'&&!g.moved){this.host.commit();return;}if(g.kind==='bolt'&&!g.moved){this.sel={kind:'bolt',index:g.index};this.host.live();return;}if(g.kind==='bolt')this.sel={kind:'bolt',index:g.index};this.host.commit();}
 // ---------- properties ----------
 renderProperties(root:HTMLElement):void{const d=this.doc,p=this.host.plan(),s=this.sel,ro=this.host.readOnly();
  const field=(text:string,value:number|undefined,set:(v:number|undefined)=>void,o:{step?:number;optional?:boolean;placeholder?:string}={})=>{const i=el('input',{type:'number',step:String(o.step??.5),value:value===undefined?'':String(+value.toFixed(4)),placeholder:o.placeholder??'',disabled:ro});i.onchange=()=>{const v=i.value===''?undefined:Number(i.value);if(v===undefined&&!o.optional||v!==undefined&&!Number.isFinite(v))return;this.host.begin();set(v);this.host.commit();};return el('label',{className:'prop'},el('span',{textContent:text}),i);};
  const button=(text:string,go:()=>void,cls='')=>{const b=el('button',{className:cls,textContent:text,disabled:ro});b.onclick=()=>{this.host.begin();go();this.host.commit();};return b;};
  const head=(t:string,sub?:string)=>[el('h2',{textContent:t}),...(sub?[el('p',{className:'muted',textContent:sub})]:[])];
  const issues=(test:(ref?:string)=>boolean)=>{const mine=p.issues.filter(i=>test(i.ref));return mine.length?el('ul',{className:'prop-issues'},...mine.map(i=>el('li',{className:i.level,textContent:i.message}))):'';};
  if(s?.kind==='shaft'){const x=d.shafts.find(v=>v.id===s.id);if(!x){this.sel=undefined;return this.renderProperties(root);}const w=p.shafts.find(v=>v.id===x.id),label=w?.label??'fehlt';
   const partners=p.meshes.flatMap(m=>{const a=p.wheels.find(v=>v.key===m.a)!,b=p.wheels.find(v=>v.key===m.b)!;return a.on===x.id?[{me:a,other:b}]:b.on===x.id?[{me:b,other:a}]:[];});
   const pulleys=p.wheels.filter(v=>v.on===x.id&&v.pulley),others=p.wheels.filter(v=>v.on!==x.id&&v.pulley);
   root.replaceChildren(...head(label,'Welle aus dem Wellen-Generator, hier nur ihre Lage.'),el('div',{className:'prop-row'},(()=>{const b=el('button',{textContent:'Welle bearbeiten'});b.dataset.editShaft=x.shaft;b.onclick=()=>this.host.editShaft(x.shaft);return b;})(),el('a',{className:'button ghost',href:`./welle.html#open=${encodeURIComponent(x.shaft)}`,target:'_blank',textContent:'In neuem Tab ↗'})),
    field('x [mm]',x.at[0],v=>{x.at[0]=v!;}),field('y [mm]',x.at[1],v=>{x.at[1]=v!;}),field('Höhe z [mm]',x.z,v=>{x.z=v!;}),
    (()=>{const c=el('input',{type:'checkbox',checked:!!x.flip,disabled:ro});c.onchange=()=>{this.host.begin();if(c.checked)x.flip=true;else delete x.flip;this.host.commit();};return el('label',{className:'prop'},el('span',{textContent:'Umgedreht'}),c);})(),
    ...(p.arms.some(a=>a.on===x.id)?[field('Drehung der Welle [°]',x.turn??0,v=>{if(v)x.turn=v;else delete x.turn;},{step:15})]:[]),
    ...partners.map(({me,other})=>{const o=d.shafts.find(v=>v.id===other.on)!,dist=me.pitch+other.pitch,ang=Math.atan2(x.at[1]-o.at[1],x.at[0]-o.at[0])*180/Math.PI;return field(`Winkel um ${p.shafts.find(v=>v.id===o.id)?.label} [°]`,((ang%360)+360)%360,v=>{x.at=around(o.at,dist,v!);},{step:d.settings.angle||1});}),
    ...p.motors.filter(m=>m.on===x.id).flatMap(m=>[el('h3',{textContent:m.part.label}),el('p',{className:'prop-info',textContent:m.layer?`Flansch an ${m.down?'der Unterseite':'der Oberseite'} von Schicht ${p.layers.findIndex(l=>l.id===m.layer)+1}${m.slot?`, Langlöcher ±${n(m.travel/2)} mm in Riemenrichtung`:''}.`:'Der Flansch liegt an keiner Platte.'}),
     ...(m.offset!==undefined?[(()=>{const b=button(`Motor an Schicht-Platte setzen, eigene Platte sparen (Welle ${m.offset>0?'+':''}${n(m.offset)} mm)`,()=>{x.z=+(x.z+m.offset!).toFixed(3);});b.dataset.motorFit='true';return b;})()]:[])]),
    d.input===x.id||(!d.input&&d.shafts[0]?.id===x.id)?el('p',{className:'prop-info',textContent:'Eingang: die Drehzahlen gelten je Umdrehung dieser Welle.'}):button('Als Eingang',()=>{d.input=x.id;}),
    ...pulleys.flatMap(pu=>[el('h3',{textContent:`Riemen an ${pu.label}`}),...d.belts.filter(b=>`${b.a.on}/${b.a.item}`===pu.key||`${b.b.on}/${b.b.item}`===pu.key).map(b=>{const bp=p.belts.find(v=>v.id===b.id);const other=bp?p.wheels.find(v=>v.key===(bp.a===pu.key?bp.b:bp.a)):undefined,fit=bp?.fit;
      const set=fit&&other&&Number.isFinite(fit.center)&&Math.abs(bp!.center-fit.center)>.01?(()=>{const bt=button(`Auf Normriemen ${fit.stock} mm stellen (${n(fit.center)} mm)`,()=>{const dx=x.at[0]-other.at[0],dy=x.at[1]-other.at[1],l=Math.hypot(dx,dy)||1;x.at=[+(other.at[0]+dx/l*fit.center).toFixed(4),+(other.at[1]+dy/l*fit.center).toFixed(4)];},'ghost');bt.dataset.beltFit='true';return bt;})():'';
      return el('div',{className:'prop-col'},el('div',{className:'prop-row'},el('span',{textContent:`${bp?n(bp.length)+' mm':''}${bp?.stock?`, Norm ${bp.stock}`:''}${bp?.tension?`, spannbar ${n(bp.tension.range[0])} bis ${n(bp.tension.range[1])} mm`:''}`}),button('entfernen',()=>{d.belts=d.belts.filter(v=>v!==b);},'ghost')),set);}),
     ...others.filter(o=>!d.belts.some(b=>[`${b.a.on}/${b.a.item}`,`${b.b.on}/${b.b.item}`].sort().join()===[pu.key,o.key].sort().join())).map(o=>{const b=button(`＋ Riemen zu ${o.label}`,()=>{let i=1;while(d.belts.some(v=>v.id===`r${i}`))i++;d.belts.push({id:`r${i}`,a:{on:pu.on,item:pu.item},b:{on:o.on,item:o.item}});},'ghost');b.dataset.belt=o.key;return b;})]),
    ...this.turnProps(x.id,field,button),...this.groupProps(x.id,button),
    issues(r=>r===x.id),button('Aus dem Getriebe nehmen',()=>{this.dropShaft(x.id);this.sel=undefined;},'danger'));return;}
  if(s?.kind==='group'){const g=d.groups?.find(v=>v.id===s.id);if(!g){this.sel=undefined;return this.renderProperties(root);}const gp=p.groups.find(v=>v.id===g.id),label=(id:string)=>p.shafts.find(v=>v.id===id)?.label??id;
   const name=el('input',{type:'text',value:g.name,disabled:ro});name.onchange=()=>{this.host.begin();g.name=name.value.trim().slice(0,60)||'Schwinge';this.host.commit();};
   const pivot=el('select',{disabled:ro},...d.shafts.map(x=>el('option',{value:x.id,textContent:label(x.id)})));pivot.value=g.pivot;pivot.onchange=()=>{this.host.begin();g.pivot=pivot.value;delete this.pose.groups[g.id];this.host.commit();};
   const mine=p.layers.map((l,i)=>({l,i})).filter(v=>v.l.body===g.id);
   const seat=el('select',{disabled:ro},el('option',{value:'fest',textContent:'fest: dreht mit der Welle (Hebel)'}),el('option',{value:'frei',textContent:'frei: schwenkt auf Lagern (Schwinge)'}));seat.value=g.fixed?'fest':'frei';seat.dataset.seat='true';seat.onchange=()=>{this.host.begin();if(seat.value==='fest')g.fixed=true;else delete g.fixed;this.host.commit();};
   const moved=p.drive.joints[g.id],by=moved?moved.map((x,i)=>({x,i})).filter(q=>Math.abs(q.x)>1e-9).map(q=>`${n(q.x)} × ${p.drive.inputs[q.i].label}`).join(' und '):'';
   root.replaceChildren(...head(g.name||'Schwinge',g.fixed?'Ein Glied fest auf seiner Welle: es dreht mit ihr. Wellen und Motoren darauf schwenken mit; ein Rad, das frei auf der Welle läuft (Losrad), treibt durch das Gelenk hindurch weiter.':'Wellen, die gemeinsam auf Lagern um eine Achse schwenken, mit eigenen Platten. Ein Rad auf der Drehachse bleibt mit ihren Rädern im Eingriff.'),
    el('label',{className:'prop'},el('span',{textContent:'Name'}),name),el('label',{className:'prop'},el('span',{textContent:'Drehachse'}),pivot),el('label',{className:'prop'},el('span',{textContent:'Sitzt auf der Achse'}),seat),
    ...(by?[el('p',{className:'prop-info',textContent:`Bewegt von: ${by}.`})]:[]),
    field('schwenkt von [°]',g.from,v=>{g.from=Math.max(-360,Math.min(v!,g.to));delete this.pose.groups[g.id];},{step:5}),field('schwenkt bis [°]',g.to,v=>{g.to=Math.min(360,Math.max(v!,g.from));delete this.pose.groups[g.id];},{step:5}),
    el('p',{className:'prop-info',textContent:'Gegen den Uhrzeigersinn von oben, gemessen ab der gezeichneten Stellung. Für den ganzen Bereich wird geprüft, dass nichts anstößt; Wellen, die durch fremde Platten gehen, bekommen dort einen Ausschnitt im Bogen.'}),
    el('h3',{textContent:'Wellen darauf'}),el('p',{className:'muted small',textContent:'Ankreuzen, oder eine Welle links anklicken oder hereinziehen, solange dieses Feld offen ist.'}),...d.shafts.filter(x=>x.id!==g.pivot).map(x=>{const other=d.groups!.find(o=>o!==g&&o.shafts.includes(x.id)),c=el('input',{type:'checkbox',checked:g.shafts.includes(x.id),disabled:ro||!!other});c.dataset.member=x.id;c.onchange=()=>{this.host.begin();g.shafts=c.checked?[...g.shafts,x.id]:g.shafts.filter(v=>v!==x.id);this.host.commit();};return el('label',{className:'prop'},el('span',{textContent:label(x.id)+(other?` (auf ${other.name||'Schwinge'})`:'')}),c);}),
    el('p',{className:'prop-info',textContent:gp?(mine.length?`Platten: ${mine.map(v=>`Schicht ${v.i+1}`).join(', ')}; ${p.bolts.filter(b=>b.body===g.id).length} Bolzen.`:'Noch keine Platte: ihre Wellen brauchen Lager.'):'Die Drehachse fehlt.'}),
    issues(r=>r===`schwinge:${g.id}`),...(g.bolts?[button('Bolzen automatisch',()=>{delete g.bolts;},'ghost')]:[]),button('Schwinge auflösen',()=>{this.dropGroup(g.id);this.sel=undefined;},'danger'));return;}
  if(s?.kind==='bolt'){const bo=p.bolts[s.index];if(!bo){this.sel=undefined;return this.renderProperties(root);}const set=(f:(b:[number,number][],k:number,start:number)=>void)=>{const m=this.manualBolts(s.index);f(m.list,m.k,m.start);},of=bo.body?` · ${p.groups.find(g=>g.id===bo.body)?.name??'Schwinge'}`:'';
   root.replaceChildren(...head(`Bolzen ${s.index+1}${of}`,bo.auto?'Vom Generator gesetzt; Ziehen oder ein Wert macht alle Bolzen fest.':'Von Hand gesetzt.'),
    field('x [mm]',bo.at[0],v=>set((b,k)=>{b[k]=[v!,b[k][1]];})),field('y [mm]',bo.at[1],v=>set((b,k)=>{b[k]=[b[k][0],v!];})),
    el('p',{className:'prop-info',textContent:`M${n(d.settings.bolt)}, Auge Ø${n(2*bo.eye)}; angebunden an ${Object.values(bo.attach).map(k=>p.bearings.find(b=>b.key===k)?.label??k).join(', ')}.`}),issues(r=>r===`bolzen:${s.index}`),
    el('div',{className:'prop-row'},button('＋ Bolzen',()=>set((b,_k,start)=>{b.push([bo.at[0]+2*bo.eye+2,bo.at[1]]);this.sel={kind:'bolt',index:start+b.length-1};}),'ghost'),...(!bo.auto?[button('Bolzen automatisch',()=>{this.manualBolts(s.index).clear();this.sel=undefined;},'ghost')]:[])),
    button('Bolzen entfernen',()=>set((b,k)=>{b.splice(k,1);this.sel=undefined;}),'danger'));return;}
  if(s?.kind==='web'){const L=p.layers.find(l=>l.webs.some(w=>w.a===s.a&&w.b===s.b)),w=L?.webs.find(v=>v.a===s.a&&v.b===s.b);if(!w){this.sel=undefined;return this.renderProperties(root);}const name=(k:string)=>p.bearings.find(b=>b.key===k)?.label??k;
   const key=`${w.a}|${w.b}`,setRoute=(r?:'aussen'|'tiefe')=>{d.webs??={add:[],remove:[]};const route={...(d.webs.route??{})};if(r)route[key]=r;else delete route[key];if(Object.keys(route).length)d.webs.route=route;else delete d.webs.route;};
   const how=w.route==='aussen'?(w.path?`Außen herum über ${w.path.length} Punkt${w.path.length>1?'e':''}, Streben ${n(2*w.width!)} mm breit.`:'Außen herum: kein freier Weg gefunden.'):w.route==='tiefe'?(w.z?`In der Tiefe: nur von ${n(w.z[0])} bis ${n(w.z[1])} mm hoch.`:'In der Tiefe: kein Platz.'):'';
   const choices=w.hits.length||w.route?[el('h3',{textContent:w.hits.length&&!w.route?`Im Weg: ${w.hits.join(', ')}`:'Am Teil vorbei'}),el('div',{className:'prop-row'},
    ...(w.route!=='aussen'?[button('Außen herum',()=>setRoute('aussen'))]:[]),...(w.route!=='tiefe'?[button('In die Tiefe',()=>setRoute('tiefe'))]:[]),...(w.route?[button('Gerade',()=>setRoute(undefined),'ghost')]:[]))]:[];
   root.replaceChildren(...head('Steg',`${name(w.a)} – ${name(w.b)}`),el('p',{className:'prop-info',textContent:w.forced?'Automatisch, zwischen kämmenden Wellen: hält den Achsabstand.':w.auto?'Automatisch: kürzester Weg, der die Platte zusammenhält.':'Von Hand hinzugefügt.'}),...(how?[el('p',{className:'prop-info',textContent:how})]:[]),...choices,issues(r=>r===`steg:${w.a}|${w.b}`),
    button('Steg entfernen',()=>{d.webs??={add:[],remove:[]};if(w.auto)d.webs.remove.push(webKey(w.a,w.b));else d.webs.add=d.webs.add.filter(k=>!(k[0]===w.a&&k[1]===w.b));setRoute(undefined);this.sel=undefined;},'danger'));return;}
  if(s?.kind==='layer'&&p.layers[s.index]?.motor){const l=p.layers[s.index],m=p.motors.find(x=>x.key===l.motor)!;root.replaceChildren(...head(`Motorplatte (Schicht ${s.index+1})`,`Für ${m.label}: am Flansch bei z ${n(m.face)} mm, ${n(l.band[1]-l.band[0])} mm dick, ${m.down?'über':'unter'} dem Motor.`),el('p',{className:'prop-info',textContent:'Sie folgt dem Motor: im Wellen-Editor den Motor verschieben verschiebt sie. Dicke in den Regeln.'}),issues(r=>r===m.on));return;}
  if(s?.kind==='layer'){const l=p.layers[s.index];if(!l){this.sel=undefined;return this.renderProperties(root);}const set=(f:(x:Layer)=>void)=>{this.manualLayers();f(d.layers![s.index]);};const name=(k:string)=>p.bearings.find(b=>b.key===k)?.label??k;
   const has=(a:string,b:string)=>l.webs.some(w=>w.a===a&&w.b===b),pairs=l.bearings.flatMap((a,i)=>l.bearings.slice(i+1).map(b=>webKey(a,b))).filter(([a,b])=>!has(a,b));const removed=(d.webs?.remove??[]).filter(([a,b])=>l.bearings.includes(a)&&l.bearings.includes(b));
   root.replaceChildren(...head(`Schicht ${s.index+1}${l.body?` · ${p.groups.find(g=>g.id===l.body)?.name??'Schwinge'}`:''}`,`${l.bearings.length} Lager, Platten von ${n(l.band[0])} bis ${n(l.band[1])} mm${l.auto?', vorgeschlagen':''}`),field('von z [mm]',l.z0,v=>set(x=>{x.z0=v!;})),field('bis z [mm]',l.z1,v=>set(x=>{x.z1=v!;})),
    ...(d.groups?.length?[(()=>{const sl=el('select',{disabled:ro},el('option',{value:'',textContent:'Gestell'}),...d.groups!.map(g=>el('option',{value:g.id,textContent:g.name||'Schwinge'})));sl.value=l.body;sl.dataset.layerBody='true';sl.onchange=()=>{this.host.begin();set(x=>{if(sl.value)x.group=sl.value;else delete x.group;});this.host.commit();};return el('label',{className:'prop'},el('span',{textContent:'Gehört zu'}),sl);})()]:[]),
    field('Rand um die Lager [mm]',l.rim,v=>set(x=>{if(v===undefined)delete x.rim;else x.rim=v;}),{optional:true,step:.5}),field('Dicke der Stege [mm]',l.thickness,v=>set(x=>{if(v===undefined)delete x.thickness;else x.thickness=v;}),{optional:true,step:.5}),
    ...(pairs.length?[el('h3',{textContent:'Steg hinzufügen'}),...pairs.map(([a,b])=>button(`＋ ${name(a)} – ${name(b)}`,()=>{d.webs??={add:[],remove:[]};const r=d.webs.remove.findIndex(k=>k[0]===a&&k[1]===b);if(r>=0)d.webs.remove.splice(r,1);else d.webs.add.push([a,b]);},'ghost'))]:[]),
    ...(removed.length?[el('h3',{textContent:'Entfernte Stege'}),...removed.map(([a,b])=>button(`↺ ${name(a)} – ${name(b)}`,()=>{d.webs!.remove=d.webs!.remove.filter(k=>!(k[0]===a&&k[1]===b));},'ghost'))]:[]),
    button('Schicht entfernen',()=>{this.manualLayers();d.layers!.splice(s.index,1);this.sel=undefined;},'danger'));return;}
  type NumberKey={[K in keyof GearSettings]:GearSettings[K] extends number?K:never}[keyof GearSettings];
  const set=(k:NumberKey,text:string,step=.5)=>field(text,d.settings[k],v=>{if(v!==undefined&&v>=0)d.settings[k]=v;},{step});
  root.replaceChildren(...head('Getriebe','Wellen von links auf die Ebene ziehen. Klick auf eine Welle, einen Steg oder eine Schicht zeigt sie hier.'),
   el('div',{className:'prop-row'},button('＋ Schicht',()=>{this.manualLayers();const top=Math.max(0,...(d.layers??[]).map(l=>l.z1));let i=1;while(d.layers!.some(l=>l.id===`h${i}`))i++;d.layers!.push({id:`h${i}`,z0:top+5,z1:top+12});}),...(d.layers?.length?[button('Schichten automatisch',()=>{delete d.layers;},'ghost')]:[])),
   ...(d.groups?.length?[el('h3',{textContent:'Schwingen'}),...d.groups.map(g=>{const b=el('button',{className:'ghost',textContent:`${g.name||'Schwinge'}: ${g.shafts.length} ${g.shafts.length===1?'Welle':'Wellen'}, ${n(g.from)}° bis ${n(g.to)}°`});b.dataset.group=g.id;b.onclick=()=>{this.sel={kind:'group',id:g.id};this.host.live();};return b;})]:[]),
   el('p',{className:'muted small',textContent:'Bewegliches: ein Hebel kommt im Wellen-Editor auf die Welle, der Drehbereich an eine Welle hier. Eine Schwinge entsteht an der Welle, um die sie schwenkt („＋ Hebel fest auf dieser Welle“ oder „＋ Schwinge frei“). Ist ein Glied gewählt, kommt eine neue Welle aus der Liste gleich darauf.'}),
   el('h3',{textContent:'Regeln'}),set('rim','Rand um die Lager [mm]'),set('web','Dicke der Stege [mm]'),set('lip','Bord über dem Lager [mm]',.1),set('lipIn','Bord reicht nach innen [mm]',.1),set('clearance','Abstand zu Rädern [mm]',.1),set('hole','Spiel der Freilöcher [mm]',.1),set('angle','Winkelraster [°]',1),set('grid','mm-Raster',.5),set('slot','Spannweg der Motor-Langlöcher [mm]',.5),set('motorPlate','Dicke einer Motorplatte [mm]',.5),(()=>{const c=el('input',{type:'checkbox',checked:d.settings.clamp,disabled:ro});c.dataset.clamp='true';c.onchange=()=>{this.host.begin();d.settings.clamp=c.checked;this.host.commit(c.checked?'Lager werden zwischen Plattenpaaren eingeklemmt':'Eine Platte je Schicht, Anschläge außen');};return el('label',{className:'prop'},el('span',{textContent:'Lager einklemmen (Plattenpaar je Schicht)'}),c);})(),set('fit','Spiel der Lagertaschen [mm]',.05));}
 removeSelected(){const s=this.sel,d=this.doc;if(!s||this.host.readOnly())return;this.host.begin();
  if(s.kind==='shaft')this.dropShaft(s.id);else if(s.kind==='group')this.dropGroup(s.id);
  else if(s.kind==='web'){const w=this.host.plan().layers.flatMap(l=>l.webs).find(v=>v.a===s.a&&v.b===s.b);d.webs??={add:[],remove:[]};if(w?.auto)d.webs.remove.push(webKey(s.a,s.b));else d.webs.add=d.webs.add.filter(k=>!(k[0]===s.a&&k[1]===s.b));}
  else if(s.kind==='bolt'){const m=this.manualBolts(s.index);m.list.splice(m.k,1);}
  else{this.manualLayers();d.layers!.splice(s.index,1);}
  this.sel=undefined;this.host.commit('Entfernt');}
}
