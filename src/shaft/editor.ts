// The shaft editor: catalog on the left, the timeline in the middle (x is the place on the shaft, one track per kind of
// thing), properties on the right. Everything is dragged: from the catalog onto the timeline, clips along it, ranges at
// their edges, the shaft's end. Drops snap to edges and the grid (Alt: free); parts on the shaft never overlap.
import type {ShaftDoc,OnItem,InItem,Work,Side,OwnSection,Settings} from './model.ts';
import type {Plan,Issue} from './plan.ts';
import {onParts,inParts,onGroups,inGroups,onPart,inPart} from './catalog.ts';
import {label,outer,rund} from './profile.ts';
import type {Profile} from './profile.ts';
import {silhouette,tallest} from './draw.ts';
import {snapMove,snapPoint,freeSpot,tickStep,toGrid} from './snap.ts';
import {threads} from './din.ts';

export type Selection={kind:'item';id:string}|{kind:'insert';id:string}|{kind:'work';id:string}|{kind:'section';index:number}|undefined;
export type Host={doc():ShaftDoc;plan():Plan;/** Before a change: what undo goes back to. */begin():void;/** After a change: record, save, draw. */commit(message?:string):void;/** While dragging: draw only. */live():void;readOnly():boolean};
type Lane='auf'|'erzeugt'|'in'|'bearb'|'abschn';
type Clip={key:string;lane:Lane;sel?:Selection;x0:number;x1:number;text:string;title:string;cls:string;resize?:'both'|'inner';point?:boolean};
type Drag={sel:Selection;mode:'move'|'l'|'r'|'length';start:number;orig:unknown;targets:number[];moved:boolean};

const PAD=14,GRID=.5,TOL_PX=8;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
const workLabel:Record<Work['kind'],string>={madenschraube:'Madenschraube',gewinde:'Gewinde am Ende',nut:'Passfedernut',ring:'Sicherungsring-Nut',abflachung:'Abflachung'};
type WorkTemplate={key:string;label:string;text:string;make:(x:number,d:ShaftDoc)=>Work};
const workTemplates:WorkTemplate[]=[
 ...[3,4,5].map(m=>({key:`madenschraube-${m}`,label:`Madenschraube M${m}`,text:'Kernloch nach DIN 13, Gewinde selbst schneiden',make:(x:number)=>({id:'',kind:'madenschraube',x,m}) as Work})),
 ...[3,4,5].map(m=>({key:`gewinde-${m}`,label:`Gewinde M${m} am Ende`,text:'Kernloch in der Stirnfläche',make:(x:number,d:ShaftDoc)=>({id:'',kind:'gewinde',end:x<d.length/2?'links':'rechts',m,depth:2*m+2}) as Work})),
 {key:'nut',label:'Passfedernut',text:'DIN 6885, Maße nach Wellen-Ø',make:x=>({id:'',kind:'nut',x0:x-6,x1:x+6})},
 {key:'ring',label:'Sicherungsring-Nut',text:'DIN 471, nach Wellen-Ø',make:x=>({id:'',kind:'ring',x})},
 {key:'abflachung',label:'Abflachung',text:'Fläche für eine Madenschraube',make:x=>({id:'',kind:'abflachung',x0:x-5,x1:x+5,depth:.5})},
];

export class ShaftEditor{
 sel:Selection;zoom=1;scale=8;
 private lanes=new Map<Lane|'welle',HTMLElement>();private drag?:Drag;private scroller?:HTMLElement;
 constructor(private host:Host,private status:(m:string)=>void){
  addEventListener('pointermove',e=>this.onMove(e));addEventListener('pointerup',e=>this.onUp(e));
 }
 private get doc(){return this.host.doc();}
 // ---------- ids, lookups ----------
 private newId(prefix:string){const d=this.doc,used=new Set([...d.items,...d.inserts,...d.works].map(x=>x.id));let i=1;while(used.has(`${prefix}${i}`))i++;return `${prefix}${i}`;}
 private item(id:string){return this.doc.items.find(x=>x.id===id);}
 private insert(id:string){return this.doc.inserts.find(x=>x.id===id);}
 private work(id:string){return this.doc.works.find(x=>x.id===id);}
 private widthOf(it:OnItem){const p=onPart(it.part);return p?.own&&it.width?it.width:p?.width??5;}
 /** Selection of whatever an issue names: a part, a shaft in it, a machining step, or the part of an adapter or spacer. */
 selectRef(ref:string){const d=this.doc,s=this.host.plan().sleeves.find(x=>x.id===ref),id=s?.for??ref;
  this.sel=d.items.some(x=>x.id===id)?{kind:'item',id}:d.inserts.some(x=>x.id===id)?{kind:'insert',id}:d.works.some(x=>x.id===id)?{kind:'work',id}:this.sel;}
 // ---------- catalog ----------
 renderCatalog(root:HTMLElement,filter=''){
  const f=filter.trim().toLowerCase(),hit=(...s:string[])=>!f||s.some(x=>x.toLowerCase().includes(f));
  const card=(key:string,title:string,text:string,warn=false)=>{const b=el('button',{className:'cat-card',title:'Auf die Zeitleiste ziehen oder klicken'},el('strong',{textContent:title+(warn?' ⚠':'')}),el('small',{textContent:text}));b.dataset.add=key;b.onpointerdown=e=>this.startNew(key,e);return b;};
  const group=(title:string,cards:HTMLElement[])=>cards.length?[el('h3',{textContent:title}),...cards]:[];
  const filterBox=el('input',{type:'search',placeholder:'Suchen …',value:filter,id:'catalog-filter'});filterBox.oninput=()=>{this.renderCatalog(root,filterBox.value);const x=document.getElementById('catalog-filter') as HTMLInputElement;x.focus();x.setSelectionRange(x.value.length,x.value.length);};
  root.replaceChildren(filterBox,
   el('h2',{textContent:'Auf der Welle'}),...onGroups.flatMap(g=>group(g,onParts.filter(p=>p.group===g&&hit(p.label,g)).map(p=>card(`auf:${p.id}`,p.label,p.spacer?'Länge frei, innen wie der Abschnitt':`${label(p.bore)} · ${n(p.width)} mm breit`,!p.checked)))),
   el('h2',{textContent:'In der Welle'}),...inGroups.flatMap(g=>group(g,inParts.filter(p=>p.group===g&&hit(p.label,g)).map(p=>card(`in:${p.id}`,p.label.split(':')[0],`${label(p.profile)}${p.length?` · ${n(p.length)} mm lang`:''} · von einem Ende`,!p.checked)))),
   el('h2',{textContent:'Bearbeitung'}),...workTemplates.filter(w=>hit(w.label)).map(w=>card(`work:${w.key}`,w.label,w.text)),
   el('h2',{textContent:'Abschnitt'}),...(hit('abschnitt','von hand')?[card('section','Abschnitt von Hand','Eigenes Profil für einen Bereich; die Prüfung läuft weiter')]:[]));
 }
 /** Adds what a catalog card stands for at `x` (mm), or where it fits best without one. */
 add(key:string,x?:number){if(this.host.readOnly())return;const d=this.doc;this.host.begin();
  const [kind,id]=key.split(/:(.*)/);
  if(kind==='auf'){const p=onPart(id)!;const w=p.width,taken=d.items.map(i=>({x0:i.x,x1:i.x+this.widthOf(i)}));let at=toGrid(x===undefined?d.length/2-w/2:x-w/2,GRID);at=freeSpot(taken,at,w,d.length);
   if(taken.some(t=>at<t.x1-1e-9&&at+w>t.x0+1e-9)||at+w>d.length+1e-9){at=Math.max(d.length,...taken.map(t=>t.x1))+1;d.length=toGrid(at+w+1,GRID);}
   const it:OnItem={id:this.newId(p.spacer?'h':'t'),part:p.id,x:+at.toFixed(2)};d.items.push(it);this.sel={kind:'item',id:it.id};this.host.commit(`${p.label} bei ${n(it.x)} mm`);return;}
  if(kind==='in'){const p=inPart(id)!;const free=(['links','rechts'] as Side[]).filter(s=>!d.inserts.some(i=>i.end===s));const end:Side=x!==undefined?(x<d.length/2?'links':'rechts'):free[0]??'links';
   const depth=toGrid(Math.min(p.length?Math.max(5,p.length-3):12,d.length*.6),GRID),old=d.inserts.find(i=>i.end===end);if(old)d.inserts.splice(d.inserts.indexOf(old),1);
   const it:InItem={id:this.newId('w'),part:p.id,end,depth};d.inserts.push(it);this.sel={kind:'insert',id:it.id};this.host.commit(`${p.label.split(':')[0]} steckt von ${end}${old?' (ersetzt die bisherige)':''}`);return;}
  if(kind==='work'){const t=workTemplates.find(w=>w.key===id)!,w={...t.make(toGrid(x??d.length/2,GRID),d),id:this.newId('b')};d.works.push(w);this.sel={kind:'work',id:w.id};this.host.commit(`${t.label} gesetzt`);return;}
  if(kind==='section'){const at=toGrid(x??d.length/2,GRID),c=this.host.plan().sections.find(s=>at>=s.x0&&at<=s.x1),o:OwnSection={x0:Math.max(0,at-5),x1:Math.min(d.length,at+5),profile:c?.profile.kind==='rund'?c.profile:rund(c?+outer(c.profile).toFixed(2):6)};(d.sections??=[]).push(o);this.sel={kind:'section',index:d.sections.length-1};this.host.commit('Abschnitt von Hand gesetzt');}
 }
 private ghost?:HTMLElement;private pending?:{key:string;x:number;y:number};
 private startNew(key:string,e:PointerEvent){if(e.button!==0)return;e.preventDefault();this.pending={key,x:e.clientX,y:e.clientY};}
 // ---------- timeline ----------
 clips():Clip[]{const d=this.doc,p=this.host.plan(),out:Clip[]=[],L=d.length;
  const level=(refs:string[])=>{const mine=p.issues.filter(i=>i.ref&&refs.includes(i.ref));return mine.some(i=>i.level==='fehler')?'fehler':mine.some(i=>i.level==='warnung')?'warnung':'';};
  for(const it of d.items){const part=onPart(it.part),pl=p.placed.find(t=>t.id===it.id),sl=p.sleeves.find(s=>s.id===it.id),side=pl?.side??sl?.side,w=this.widthOf(it);
   out.push({key:`item:${it.id}`,lane:'auf',sel:{kind:'item',id:it.id},x0:it.x,x1:it.x+w,text:part?.short??it.part,title:`${part?.label??it.part}${side?` · von ${side} aufgeschoben`:''}${it.side?' (fest)':''}`,cls:`${part?.spacer?'spacer':part?.group==='Lager'?'bearing':'gear'}${side?' from-'+side:''} ${level([it.id])}`,...(part?.own?{resize:'both' as const}:{})});}
  for(const s of p.sleeves.filter(x=>x.auto))out.push({key:`sleeve:${s.id}`,lane:'erzeugt',...(s.for?{sel:{kind:'item',id:s.for} as Selection}:{}),x0:s.x0,x1:s.x1,text:s.kind==='adapter'?'Adapter':'Hülse',title:s.label,cls:`${s.kind} ${level([s.id])}`});
  for(const i of p.inserts)out.push({key:`insert:${i.id}`,lane:'in',sel:{kind:'insert',id:i.id},x0:i.x0,x1:i.x1,text:`${i.end==='links'?'':'→ '}${i.label}${i.end==='links'?' ←':''}`,title:`${i.label} · ${label(i.profile)} · ${n(i.x1-i.x0)} mm tief von ${i.end}`,cls:`insert ${level([i.id])}`,resize:'inner'});
  for(const w of d.works){const base={key:`work:${w.id}`,lane:'bearb' as Lane,sel:{kind:'work',id:w.id} as Selection,cls:`work ${level([w.id])}`,title:workLabel[w.kind]};
   if(w.kind==='madenschraube')out.push({...base,x0:w.x-w.m/2,x1:w.x+w.m/2,text:`M${n(w.m)}`,point:true});
   else if(w.kind==='ring')out.push({...base,x0:w.x-.5,x1:w.x+.5,text:'Ring',point:true});
   else if(w.kind==='gewinde')out.push({...base,x0:w.end==='links'?0:L-w.depth,x1:w.end==='links'?w.depth:L,text:`M${n(w.m)}`,resize:'inner'});
   else out.push({...base,x0:w.x0,x1:w.x1,text:w.kind==='nut'?'Passfeder':'Abflachung',resize:'both'});}
  const shown:typeof p.sections=[];for(const c of p.sections){const last=shown.at(-1);if(last&&label(last.profile)===label(c.profile)&&Math.abs(last.x1-c.x0)<1e-6)shown[shown.length-1]={...last,x1:c.x1,role:last.role==='bund'||c.role==='bund'?'bund':last.role};else shown.push({...c});}
  shown.forEach((c,i)=>out.push({key:`plan-section:${i}`,lane:'abschn',x0:c.x0,x1:c.x1,text:label(c.profile),title:`${label(c.profile)} · ${({sitz:'Sitz',frei:'frei',bund:'Bund',eigen:'von Hand'})[c.role]} · ${n(c.x0)} bis ${n(c.x1)} mm`,cls:`plan ${c.role} ${c.profile.kind}`}));
  (d.sections??[]).forEach((o,index)=>out.push({key:`section:${index}`,lane:'abschn',sel:{kind:'section',index},x0:o.x0,x1:o.x1,text:`${label(o.profile)} (von Hand)`,title:'Abschnitt von Hand',cls:'own',resize:'both'}));
  return out;}
 renderTimeline(root:HTMLElement){
  const d=this.doc,p=this.host.plan();
  if(!this.scroller||!root.contains(this.scroller)){this.scroller=el('div',{className:'tl-scroll',id:'timeline-scroll'});root.replaceChildren(this.scroller);this.scroller.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();this.setZoom(this.zoom*(e.deltaY<0?1.2:1/1.2));},{passive:false});}
  const left=this.scroller.scrollLeft,avail=Math.max(320,(this.scroller.clientWidth||900)-92);if(!this.drag?.moved)this.scale=this.zoom*(avail-2*PAD)/d.length;const s=this.scale,W=d.length*s+2*PAD,X=(x:number)=>PAD+x*s;
  const sel=this.selKey(),rows:HTMLElement[]=[];this.lanes.clear();
  const row=(lane:Lane|'welle'|'lineal',title:string,...kids:HTMLElement[])=>{const l=el('div',{className:`tl-lane ${lane}`},...kids);l.style.width=`${W}px`;l.dataset.lane=lane;if(lane!=='lineal')this.lanes.set(lane,l);rows.push(el('div',{className:`tl-row ${lane}`},el('div',{className:'tl-label',textContent:title}),l));return l;};
  const step=tickStep(s),ruler=row('lineal','mm');for(let x=0;x<=d.length+1e-9;x+=step){const t=el('span',{className:'tick',textContent:String(+x.toFixed(1))});t.style.left=`${X(x)}px`;ruler.append(t);}
  const welle=row('welle','Welle');welle.innerHTML=silhouette(p,{scale:s,pad:PAD,vscale:Math.min(s,110/tallest(p)),ticks:false});const end=el('div',{className:'tl-length',title:`Länge ${n(d.length)} mm: ziehen`});end.style.left=`${X(d.length)-4}px`;end.onpointerdown=e=>this.startDrag(e,undefined,'length');welle.append(end);
  const titles:Record<Lane,string>={auf:'Auf',erzeugt:'Erzeugt',in:'In',bearb:'Bearbeitung',abschn:'Abschnitte'};
  const lanes=Object.fromEntries((Object.keys(titles) as Lane[]).map(k=>[k,row(k,titles[k])])) as unknown as Record<Lane,HTMLElement>;
  for(const c of this.clips()){const b=el('div',{className:`clip ${c.cls}${c.sel&&this.selKey(c.sel)===sel?' selected':''}${c.point?' point':''}${c.sel?'':' fixed'}`,title:c.title},el('span',{textContent:c.text}));b.dataset.clip=c.key;
   const w=Math.max(c.point?12:6,(c.x1-c.x0)*s);b.style.left=`${c.point?X((c.x0+c.x1)/2)-w/2:X(c.x0)}px`;b.style.width=`${w}px`;
   if(c.sel&&c.lane==='erzeugt'){const target=c.sel;b.onpointerdown=e=>{e.stopPropagation();this.sel=target;this.host.live();};}
   else if(c.sel){b.onpointerdown=e=>this.startDrag(e,c.sel,(e.target as HTMLElement).dataset.edge as 'l'|'r'|undefined??'move');
    if(c.resize){const edges:('l'|'r')[]=c.resize==='both'?['l','r']:[c.x0<=1e-9?'r':'l'];for(const e of edges){const h=el('i',{className:`edge ${e}`});h.dataset.edge=e;b.append(h);}}}
   lanes[c.lane].append(b);}
  this.scroller.replaceChildren(...rows);this.scroller.scrollLeft=left;
 }
 setZoom(z:number){this.zoom=Math.min(40,Math.max(1,z));this.host.live();}
 private selKey(s:Selection=this.sel){return !s?'':s.kind==='section'?`section:${s.index}`:`${s.kind}:${s.id}`;}
 /** mm under the pointer. */
 private xAt(clientX:number){const lane=this.lanes.get('auf');if(!lane)return 0;return (clientX-lane.getBoundingClientRect().left-PAD)/this.scale;}
 private targets(skip:Selection){const d=this.doc,p=this.host.plan(),k=this.selKey(skip),t=[0,d.length];
  for(const c of this.clips())if(!c.sel||this.selKey(c.sel)!==k)t.push(c.x0,c.x1);for(const s of p.sections)t.push(s.x0,s.x1);
  // Edges of the dragged thing stay where it was.
  const own=this.clips().find(c=>c.sel&&this.selKey(c.sel)===k);return own?t.filter(x=>Math.abs(x-own.x0)>1e-6&&Math.abs(x-own.x1)>1e-6):t;}
 private startDrag(e:PointerEvent,sel:Selection,mode:Drag['mode']){if(e.button!==0)return;e.preventDefault();e.stopPropagation();
  const orig=mode==='length'?this.doc.length:sel?structuredClone(sel.kind==='item'?this.item(sel.id):sel.kind==='insert'?this.insert(sel.id):sel.kind==='work'?this.work(sel.id):this.doc.sections![sel.index]):undefined;
  this.drag={sel,mode,start:this.xAt(e.clientX),orig,targets:mode==='length'?[...this.targets(undefined).filter(x=>Math.abs(x-this.doc.length)>1e-6)]:this.targets(sel),moved:false};if(!this.host.readOnly())this.host.begin();}
 private onMove(e:PointerEvent){
  if(this.pending&&!this.ghost&&Math.hypot(e.clientX-this.pending.x,e.clientY-this.pending.y)>4){this.ghost=el('div',{className:'drag-ghost',textContent:(document.querySelector(`[data-add="${CSS.escape(this.pending.key)}"] strong`)?.textContent)??''});document.body.append(this.ghost);}
  if(this.ghost){this.ghost.style.left=`${e.clientX+12}px`;this.ghost.style.top=`${e.clientY+8}px`;return;}
  const g=this.drag;if(!g||this.host.readOnly())return;const x=this.xAt(e.clientX),dx=x-g.start;if(!g.moved&&Math.abs(dx*this.scale)<3)return;g.moved=true;
  const tol=e.altKey?0:TOL_PX/this.scale,grid=e.altKey?0:GRID,pt=(v:number)=>snapPoint(v,g.targets,tol,grid),d=this.doc,L=d.length;
  if(g.mode==='length'){const others=[...d.items.map(i=>i.x+this.widthOf(i)),...d.works.flatMap(w=>'x1' in w?[w.x1]:'x' in w?[w.x]:[])];d.length=Math.max(1,...others,pt((g.orig as number)+dx));this.host.live();return;}
  const s=g.sel!;
  if(s.kind==='item'){const it=this.item(s.id)!,o=g.orig as OnItem,w=this.widthOf(o);
   if(g.mode==='move')it.x=+Math.max(0,Math.min(L-w,snapMove(o.x+dx,w,g.targets,tol,grid))).toFixed(3);
   else if(g.mode==='r')it.width=+Math.max(.5,pt(o.x+w+dx)-o.x).toFixed(3);
   else{const x0=Math.min(pt(o.x+dx),o.x+w-.5);it.x=+Math.max(0,x0).toFixed(3);it.width=+(o.x+w-it.x).toFixed(3);}}
  else if(s.kind==='insert'||s.kind==='work'&&(this.work(s.id)!.kind==='gewinde')){const t=(s.kind==='insert'?this.insert(s.id):this.work(s.id)) as InItem|Extract<Work,{kind:'gewinde'}>,o=g.orig as typeof t,oEnd=o.end;
   if(g.mode==='move')t.end=x<L/2?'links':'rechts';
   else{const edge=pt(oEnd==='links'?o.depth+dx:L-o.depth+dx);t.depth=+Math.max(.5,Math.min(L,oEnd==='links'?edge:L-edge)).toFixed(3);}}
  else if(s.kind==='work'){const w=this.work(s.id)!,o=g.orig as Work;
   if(w.kind==='madenschraube'||w.kind==='ring')(w as {x:number}).x=+Math.max(0,Math.min(L,pt((o as {x:number}).x+dx))).toFixed(3);
   else if(w.kind==='nut'||w.kind==='abflachung'){const oo=o as {x0:number;x1:number},len=oo.x1-oo.x0;if(g.mode==='move'){const x0=Math.max(0,Math.min(L-len,snapMove(oo.x0+dx,len,g.targets,tol,grid)));w.x0=+x0.toFixed(3);w.x1=+(x0+len).toFixed(3);}else if(g.mode==='l')w.x0=+Math.min(pt(oo.x0+dx),oo.x1-.5).toFixed(3);else w.x1=+Math.max(pt(oo.x1+dx),oo.x0+.5).toFixed(3);}}
  else if(s.kind==='section'){const c=d.sections![s.index],o=g.orig as OwnSection,len=o.x1-o.x0;if(g.mode==='move'){const x0=Math.max(0,Math.min(L-len,snapMove(o.x0+dx,len,g.targets,tol,grid)));c.x0=+x0.toFixed(3);c.x1=+(x0+len).toFixed(3);}else if(g.mode==='l')c.x0=+Math.max(0,Math.min(pt(o.x0+dx),o.x1-.5)).toFixed(3);else c.x1=+Math.min(L,Math.max(pt(o.x1+dx),o.x0+.5)).toFixed(3);}
  this.host.live();}
 private onUp(e:PointerEvent){
  if(this.pending){const key=this.pending.key,dropped=!!this.ghost;this.ghost?.remove();this.ghost=undefined;this.pending=undefined;
   if(!dropped){this.add(key);return;}const over=(document.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null)?.closest('.tl-lane');if(over)this.add(key,this.xAt(e.clientX));return;}
  const g=this.drag;if(!g)return;this.drag=undefined;
  if(!g.moved){this.sel=g.sel;this.host.live();return;}
  // Parts on the shaft do not overlap: a drop on a taken place goes to the nearest free one.
  if(g.sel?.kind==='item'){const it=this.item(g.sel.id)!,w=this.widthOf(it),taken=this.doc.items.filter(i=>i!==it).map(i=>({x0:i.x,x1:i.x+this.widthOf(i)}));it.x=+freeSpot(taken,it.x,w,this.doc.length).toFixed(3);}
  this.sel=g.sel??this.sel;this.host.commit();}
 // ---------- properties ----------
 renderProperties(root:HTMLElement):void{const d=this.doc,p=this.host.plan(),s=this.sel,ro=this.host.readOnly();
  const field=(text:string,value:number|undefined,set:(v:number|undefined)=>void,o:{step?:number;min?:number;placeholder?:string;optional?:boolean}={})=>{const i=el('input',{type:'number',step:String(o.step??.5),value:value===undefined?'':String(value),placeholder:o.placeholder??'',disabled:ro});if(o.min!==undefined)i.min=String(o.min);i.onchange=()=>{const v=i.value===''?undefined:Number(i.value);if(v===undefined&&!o.optional||v!==undefined&&!Number.isFinite(v))return;this.host.begin();set(v);this.host.commit();};return el('label',{className:'prop'},el('span',{textContent:text}),i);};
  const choice=<T extends string>(text:string,value:T,opts:[T,string][],set:(v:T)=>void)=>{const sl=el('select',{disabled:ro},...opts.map(([v,t])=>el('option',{value:v,textContent:t})));sl.value=value;sl.onchange=()=>{this.host.begin();set(sl.value as T);this.host.commit();};return el('label',{className:'prop'},el('span',{textContent:text}),sl);};
  const profile=(text:string,value:Profile,set:(p:Profile)=>void)=>{const box=el('div',{className:'profile-edit'});const kind=choice(text,value.kind,[['rund','rund'],['d','D (abgeflacht)'],['kreuz','LEGO-Kreuz'],['sechskant','Sechskant']],k=>set(k==='rund'?rund('d' in value?value.d:5):k==='d'?{kind:'d',d:'d' in value?value.d:5,flat:.5}:k==='kreuz'?{kind:'kreuz'}:{kind:'sechskant',sw:'d' in value?value.d:5}));box.append(kind);
   if(value.kind==='rund'||value.kind==='d')box.append(field('Ø [mm]',value.d,v=>{if(v&&v>0)set({...value,d:v});},{step:.1,min:.5}));if(value.kind==='d')box.append(field('Abflachung [mm]',value.flat,v=>{if(v&&v>0)set({...value,flat:v});},{step:.05,min:.05}));if(value.kind==='sechskant')box.append(field('Schlüsselweite [mm]',value.sw,v=>{if(v&&v>0)set({kind:'sechskant',sw:v});},{step:.1,min:.5}));return box;};
  const issues=(refs:string[])=>{const mine=p.issues.filter(i=>i.ref&&refs.includes(i.ref));return mine.length?el('ul',{className:'prop-issues'},...mine.map((i:Issue)=>el('li',{className:i.level,textContent:i.message}))):'';};
  const remove=(what:string,go:()=>void)=>{const b=el('button',{className:'danger',textContent:`${what} entfernen`,disabled:ro});b.dataset.remove='true';b.onclick=()=>{this.host.begin();go();this.sel=undefined;this.host.commit(`${what} entfernt`);};return b;};
  const head=(title:string,sub?:string)=>[el('h2',{textContent:title}),...(sub?[el('p',{className:'muted',textContent:sub})]:[])];
  if(s?.kind==='item'){const it=this.item(s.id);if(!it){this.sel=undefined;return this.renderProperties(root);}const part=onPart(it.part)!,pl=p.placed.find(t=>t.id===it.id),sleeves=p.sleeves.filter(x=>x.for===it.id||x.id===it.id);
   root.replaceChildren(...head(part.label,part.note),field('Position [mm]',it.x,v=>{it.x=Math.max(0,v!);}),
    ...(part.own?[field('Breite [mm]',this.widthOf(it),v=>{if(v&&v>0)it.width=v;},{min:.5})]:[]),...(part.own&&!part.spacer?[profile('Bohrung',it.bore??part.bore,b=>{it.bore=b;})]:[]),
    choice('Aufschieben von','auto' as 'auto'|Side,[['auto',`selbst wählen${pl?` (jetzt ${pl.side})`:''}`],['links','links (fest)'],['rechts','rechts (fest)']],v=>{if(v==='auto')delete it.side;else it.side=v;}),
    el('p',{className:'prop-info'},pl?`Sitzt auf ${label(p.sections.find(c=>pl.x0+.01>=c.x0&&pl.x0+.01<=c.x1)?.profile??pl.bore)}, Bohrung ${label(pl.bore)}, von ${pl.side} aufgeschoben.`:sleeves[0]?`Innen ${label(sleeves[0].inner)}, von ${sleeves[0].side} aufgeschoben.`:''),
    ...sleeves.filter(x=>x.auto).map(x=>el('p',{className:'prop-info sleeve'},`Dazu erzeugt: ${x.label}, ${n(x.x1-x.x0)} mm lang.`)),issues([it.id,...sleeves.map(x=>x.id)]),remove(part.spacer?'Hülse':'Teil',()=>{d.items.splice(d.items.indexOf(it),1);}));return;}
  if(s?.kind==='insert'){const it=this.insert(s.id);if(!it){this.sel=undefined;return this.renderProperties(root);}const part=inPart(it.part)!;
   root.replaceChildren(...head(part.label,part.note),choice('Von',it.end,[['links','links'],['rechts','rechts']],v=>{const other=d.inserts.find(x=>x!==it&&x.end===v);if(other)other.end=it.end;it.end=v;}),field('Tiefe [mm]',it.depth,v=>{if(v&&v>0)it.depth=v;},{min:.5}),
    field('Wand mindestens [mm]',it.wall,v=>{if(v===undefined)delete it.wall;else it.wall=v;},{step:.1,optional:true,placeholder:`${n(d.settings.insertWall)} (Vorgabe)`}),issues([it.id]),remove('Steckung',()=>{d.inserts.splice(d.inserts.indexOf(it),1);}));return;}
  if(s?.kind==='work'){const w=this.work(s.id);if(!w){this.sel=undefined;return this.renderProperties(root);}const m=p.machining.find(x=>x.work.id===w.id),ms=threads.map(t=>[String(t.m),`M${n(t.m)} (Kernloch Ø${n(t.drill)})`] as [string,string]),kids:(HTMLElement|string)[]=[];
   if(w.kind==='madenschraube')kids.push(field('Position [mm]',w.x,v=>{w.x=v!;}),choice('Gewinde',String(w.m),ms,v=>{w.m=Number(v);}),field('Winkel [°]',w.angle??0,v=>{w.angle=v??0;},{step:15}));
   if(w.kind==='gewinde')kids.push(choice('Ende',w.end,[['links','links'],['rechts','rechts']],v=>{w.end=v;}),choice('Gewinde',String(w.m),ms,v=>{w.m=Number(v);}),field('Tiefe [mm]',w.depth,v=>{if(v&&v>0)w.depth=v;}));
   if(w.kind==='nut'||w.kind==='abflachung')kids.push(field('von [mm]',w.x0,v=>{w.x0=v!;}),field('bis [mm]',w.x1,v=>{w.x1=v!;}));
   if(w.kind==='abflachung')kids.push(field('Tiefe [mm]',w.depth,v=>{if(v&&v>0)w.depth=v;},{step:.05}));
   if(w.kind==='ring')kids.push(field('Position [mm]',w.x,v=>{w.x=v!;}));
   const info=m?.screw?`${m.screw}; Kernloch Ø${n(m.drill!)}, ${n(m.depth!)} mm Gewinde bis zur Welle innen.`:m?.drill?`Kernloch Ø${n(m.drill)}, ${n(m.depth!)} mm tief.`:m?.key?`Passfeder ${m.key.b} × ${m.key.h} × ${m.key.length}, Nut ${n(m.key.t1)} mm tief.`:m?.ring?`Nut Ø${n(m.ring.d2)}, ${n(m.ring.m)} mm breit.`:'';
   root.replaceChildren(...head(workLabel[w.kind]),...kids,el('p',{className:'prop-info'},info),issues([w.id]),remove(workLabel[w.kind],()=>{d.works.splice(d.works.indexOf(w),1);}));return;}
  if(s?.kind==='section'){const o=d.sections?.[s.index];if(!o){this.sel=undefined;return this.renderProperties(root);}
   root.replaceChildren(...head('Abschnitt von Hand','Gilt statt des geplanten Abschnitts; geprüft wird trotzdem.'),field('von [mm]',o.x0,v=>{o.x0=v!;}),field('bis [mm]',o.x1,v=>{o.x1=v!;}),profile('Profil',o.profile,q=>{o.profile=q;}),remove('Abschnitt',()=>{d.sections!.splice(s.index,1);if(!d.sections!.length)delete d.sections;}));return;}
  // Nothing chosen: the shaft itself.
  const set=(k:keyof Settings,text:string,step=.1)=>field(text,d.settings[k],v=>{if(v!==undefined&&v>=0)d.settings[k]=v;},{step});
  root.replaceChildren(...head('Welle','Teile aus dem Katalog auf die Zeitleiste ziehen. Klick auf ein Teil zeigt es hier.'),field('Länge [mm]',d.length,v=>{if(v&&v>0)d.length=v;},{min:1}),
   choice('Fertigung',d.making,[['druck','3D-Druck'],['cnc','CNC (Drehen/Fräsen)']],v=>{d.making=v;}),field('Bund-Ø [mm]',d.collar,v=>{if(v===undefined)delete d.collar;else d.collar=v;},{optional:true,placeholder:'aus den Nachbarn'}),
   el('h3',{textContent:'Regeln'}),set('shoulder','Absatz über Nachbar [mm]'),set('spacerWall','Wand Distanzhülse [mm]'),set('minWall','Dünnste Wand [mm]'),set('insertWall','Wand um gesteckte Wellen [mm]'),set('chamfer','Fase an den Enden [mm]'),set('play','Spiel je Seite beim Druck [mm]',.05));
 }
 /** Del removes what is chosen. */
 removeSelected(){const d=this.doc,s=this.sel;if(!s||this.host.readOnly())return;this.host.begin();
  if(s.kind==='item')d.items=d.items.filter(x=>x.id!==s.id);else if(s.kind==='insert')d.inserts=d.inserts.filter(x=>x.id!==s.id);else if(s.kind==='work')d.works=d.works.filter(x=>x.id!==s.id);else{d.sections?.splice(s.index,1);if(!d.sections?.length)delete d.sections;}
  this.sel=undefined;this.host.commit('Entfernt');}
}
