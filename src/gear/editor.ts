// The gearbox editor: the shaft generator's shafts on the left (drag them onto the plane or click), the plane from above
// in the middle (drag shafts: they snap into mesh round a partner in angle steps, else onto the mm grid; Alt: free), the
// layers from the side below (bands to move and stretch), properties on the right (exact values, angle round a
// partner, belts, webs, layer rules).
import type {GearDoc,Layer,GearSettings} from './model.ts';
import {webKey} from './model.ts';
import type {GearPlan,ShaftFile} from './plan.ts';
import {topView,bounds} from './draw.ts';
import type {View} from './draw.ts';
import {snapShaft,around} from './snap.ts';

export type Selection={kind:'shaft';id:string}|{kind:'web';a:string;b:string}|{kind:'layer';index:number}|undefined;
export type Host={/** Opens the shaft editor over the page; without id: a new shaft. */editShaft(id?:string):void;doc():GearDoc;plan():GearPlan;files():Record<string,ShaftFile>;fileNames():{id:string;name:string}[];begin():void;commit(message?:string):void;live():void;readOnly():boolean};
type Drag={kind:'shaft';id:string;from:[number,number];start:[number,number];plan:GearPlan;moved:boolean}|{kind:'band';index:number;mode:'move'|'l'|'r';start:number;orig:{z0:number;z1:number};moved:boolean};

const el=<K extends keyof HTMLElementTagNameMap>(tag:K,props:Record<string,unknown>={},...children:(Node|string)[]):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
const MARGIN=40,SIDE_PAD=12,LABEL=96;

export class GearEditor{
 sel:Selection;layer=0;private view?:View;private side?:{z0:number;scale:number};private drag?:Drag;private pending?:{file:string;x:number;y:number};private ghost?:HTMLElement;
 constructor(private host:Host,private status:(m:string)=>void){addEventListener('pointermove',e=>this.onMove(e));addEventListener('pointerup',e=>this.onUp(e));}
 private get doc(){return this.host.doc();}
 private newId(){const used=new Set(this.doc.shafts.map(s=>s.id));let i=1;while(used.has(`w${i}`))i++;return `w${i}`;}
 // ---------- library ----------
 renderLibrary(root:HTMLElement){const names=this.host.fileNames();
  root.replaceChildren(el('h2',{textContent:'Wellen'}),el('p',{className:'muted small',textContent:'Aus dem Wellen-Generator: auf die Ebene ziehen oder klicken.'}),
   ...names.map(f=>{const b=el('button',{className:'cat-card',title:'Auf die Ebene ziehen oder klicken'},el('strong',{textContent:f.name}),el('small',{textContent:`${this.doc.shafts.filter(s=>s.shaft===f.id).length||'nicht'} im Getriebe`}));b.dataset.addShaft=f.id;b.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();this.pending={file:f.id,x:e.clientX,y:e.clientY};};return b;}),
   (()=>{const b=el('button',{className:'ghost',textContent:'＋ Neue Welle anlegen',disabled:this.host.readOnly()});b.id='new-shaft';b.onclick=()=>this.host.editShaft();return b;})());}
 /** Places a shaft file at `at` (mm), or right of what stands there. */
 place(file:string,at?:[number,number]){if(this.host.readOnly())return;const d=this.doc,p=this.host.plan(),b=bounds(p);this.host.begin();const id=this.newId();
  d.shafts.push({id,shaft:file,at:[0,0],z:0});const fresh=this.host.plan(),want=at??[b?Math.round(b.x1+20):0,b?Math.round((b.y0+b.y1)/2):0],s=snapShaft(fresh,id,want,{angle:d.settings.angle,grid:d.settings.grid,tol:at?8/(this.view?.scale??4):1e9});
  d.shafts[d.shafts.length-1].at=at||s.partner?s.at:want;this.sel={kind:'shaft',id};this.host.commit(`${this.host.files()[file]?.name??'Welle'} gesetzt${s.partner?', kämmt':''}`);}
 // ---------- top view ----------
 renderTop(root:HTMLElement){const p=this.host.plan(),L=p.layers[this.layer];
  if(!this.drag||this.drag.kind!=='shaft'||!this.view){const b=bounds(p,L)??{x0:-50,x1:50,y0:-30,y1:30},w=Math.max(300,(root.clientWidth||800)-20),scale=Math.max(1,Math.min(12,w/(b.x1-b.x0+2*MARGIN))),h=(b.y1-b.y0+2*MARGIN)*scale;this.view={x0:b.x0-MARGIN,y1:b.y1+MARGIN,scale,W:w,H:Math.max(220,Math.min(560,h))};}
  const sel=this.sel?.kind==='shaft'?this.sel.id:undefined;root.innerHTML=topView(p,L,{view:this.view,selected:sel});
  const svg=root.querySelector('svg')!;svg.dataset.scale=String(this.view.scale);svg.querySelectorAll<SVGGElement>('[data-shaft]').forEach(g=>{g.onpointerdown=e=>this.startShaft(e,g.dataset.shaft!);});
  svg.querySelectorAll<SVGPolygonElement>('[data-web]').forEach(w=>{const [a,b]=w.dataset.web!.split('|');if(this.sel?.kind==='web'&&this.sel.a===a&&this.sel.b===b)w.classList.add('selected');w.onpointerdown=e=>{e.stopPropagation();this.sel={kind:'web',a,b};this.host.live();};});
  svg.onpointerdown=e=>{if(e.target===svg){this.sel=undefined;this.host.live();}};}
 private mm(e:{clientX:number;clientY:number}):[number,number]|undefined{const svg=document.querySelector('#top svg');if(!svg||!this.view)return undefined;const r=svg.getBoundingClientRect();return [this.view.x0+(e.clientX-r.left)/this.view.scale,this.view.y1-(e.clientY-r.top)/this.view.scale];}
 private startShaft(e:PointerEvent,id:string){if(e.button!==0)return;e.preventDefault();e.stopPropagation();const s=this.doc.shafts.find(x=>x.id===id)!,at=this.mm(e)!;this.drag={kind:'shaft',id,from:[...s.at],start:at,plan:this.host.plan(),moved:false};if(!this.host.readOnly())this.host.begin();}
 // ---------- side view: layers ----------
 renderLayers(root:HTMLElement){const p=this.host.plan(),d=this.doc;
  const zs=[...p.shafts.flatMap(x=>[x.z0,x.z1]),...p.layers.flatMap(l=>l.band)];if(!zs.length){root.replaceChildren(el('p',{className:'muted',textContent:'Noch keine Welle.'}));return;}
  if(this.drag?.kind!=='band'||!this.side){const z0=Math.min(...zs)-5,z1=Math.max(...zs)+5,w=Math.max(300,(root.clientWidth||800)-20-2*SIDE_PAD-LABEL);this.side={z0,scale:w/(z1-z0)};}
  const {z0,scale}=this.side,X=(z:number)=>LABEL+SIDE_PAD+(z-z0)*scale,ROW=24,rows=p.shafts.length,H=rows*ROW+44,W=X(Math.max(...zs)+5)+SIDE_PAD;
  const box=(a:number,b:number,y:number,h:number,cls:string,title:string,extra='')=>`<rect class="${cls}" x="${X(a)}" y="${y}" width="${Math.max(2,(b-a)*scale)}" height="${h}"${extra}><title>${title}</title></rect>`;
  const shafts=p.shafts.map((x,i)=>{const y=i*ROW+6;return `<g class="row"><text x="2" y="${y+11}">${x.label}</text><line class="axle" x1="${X(x.z0)}" x2="${X(x.z1)}" y1="${y+8}" y2="${y+8}"/>${p.bearings.filter(b=>b.on===x.id).map(b=>box(b.z0,b.z1,y,16,'bearing',b.label)).join('')}${p.wheels.filter(w=>w.on===x.id).map(w=>box(w.z0,w.z1,y+2,12,w.pulley?'pulley':'wheel',w.label)).join('')}</g>`;}).join('');
  const bands=p.layers.map((l,i)=>`<g class="band${this.sel?.kind==='layer'&&this.sel.index===i?' selected':''}${l.auto?' auto':''}" data-band="${i}">${box(l.band[0],l.band[1],0,rows*ROW+8,'zone','')}${box(l.band[0],l.band[1],rows*ROW+12,22,'handle',`Schicht ${i+1}: ziehen verschiebt, Kanten ändern`)}<text x="${X(l.band[0])+4}" y="${rows*ROW+27}">${i+1}</text><rect class="edge" data-edge="l" x="${X(l.band[0])-3}" y="${rows*ROW+12}" width="6" height="22"/><rect class="edge" data-edge="r" x="${X(l.band[1])-3}" y="${rows*ROW+12}" width="6" height="22"/></g>`).join('');
  root.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" class="sideview" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bands}${shafts}</svg>`;
  root.querySelectorAll<SVGGElement>('[data-band]').forEach(g=>{g.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const index=Number(g.dataset.band),edge=(e.target as SVGElement).dataset.edge as 'l'|'r'|undefined;this.manualLayers();const l=this.doc.layers![index];this.sel={kind:'layer',index};this.layer=index;this.drag={kind:'band',index,mode:edge??'move',start:e.clientX,orig:{z0:l.z0,z1:l.z1},moved:false};if(!this.host.readOnly())this.host.begin();};});
  void d;}
 /** The first hand change to a layer turns the proposed layers into set ones. */
 private manualLayers(){const d=this.doc;if(d.layers?.length)return;d.layers=this.host.plan().layers.map(l=>({id:l.id,z0:l.z0,z1:l.z1}));}
 // ---------- pointer ----------
 private onMove(e:PointerEvent){
  if(this.pending&&!this.ghost&&Math.hypot(e.clientX-this.pending.x,e.clientY-this.pending.y)>4){this.ghost=el('div',{className:'drag-ghost',textContent:this.host.files()[this.pending.file]?.name??''});document.body.append(this.ghost);}
  if(this.ghost){this.ghost.style.left=`${e.clientX+12}px`;this.ghost.style.top=`${e.clientY+8}px`;return;}
  const g=this.drag;if(!g||this.host.readOnly())return;
  if(g.kind==='shaft'){const at=this.mm(e);if(!at)return;if(!g.moved&&Math.hypot(at[0]-g.start[0],at[1]-g.start[1])*this.view!.scale<3)return;g.moved=true;
   const want:[number,number]=[g.from[0]+at[0]-g.start[0],g.from[1]+at[1]-g.start[1]],s=snapShaft(g.plan,g.id,want,{angle:this.doc.settings.angle,grid:this.doc.settings.grid,tol:8/this.view!.scale,free:e.altKey});
   this.doc.shafts.find(x=>x.id===g.id)!.at=s.at;this.status(s.partner?`kämmt: ${n(s.partner.distance)} mm, ${n(s.partner.angle)}°`:`${n(s.at[0])} / ${n(s.at[1])} mm`);this.host.live();return;}
  const dz=(e.clientX-g.start)/this.side!.scale;if(!g.moved&&Math.abs(dz*this.side!.scale)<3)return;g.moved=true;const l=this.doc.layers![g.index],r=(v:number)=>Math.round(v*2)/2;
  if(g.mode==='move'){l.z0=r(g.orig.z0+dz);l.z1=r(g.orig.z1+dz);}else if(g.mode==='l')l.z0=Math.min(r(g.orig.z0+dz),l.z1-.5);else l.z1=Math.max(r(g.orig.z1+dz),l.z0+.5);this.host.live();}
 private onUp(e:PointerEvent){
  if(this.pending){const file=this.pending.file,dropped=!!this.ghost;this.ghost?.remove();this.ghost=undefined;this.pending=undefined;if(!dropped){this.place(file);return;}const over=(document.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null)?.closest('#top');if(over)this.place(file,this.mm(e));return;}
  const g=this.drag;if(!g)return;this.drag=undefined;if(g.kind==='shaft'&&!g.moved){this.sel={kind:'shaft',id:g.id};this.host.live();return;}if(g.kind==='band'&&!g.moved){this.host.commit();return;}this.host.commit();}
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
    ...partners.map(({me,other})=>{const o=d.shafts.find(v=>v.id===other.on)!,dist=me.pitch+other.pitch,ang=Math.atan2(x.at[1]-o.at[1],x.at[0]-o.at[0])*180/Math.PI;return field(`Winkel um ${p.shafts.find(v=>v.id===o.id)?.label} [°]`,((ang%360)+360)%360,v=>{x.at=around(o.at,dist,v!);},{step:d.settings.angle||1});}),
    ...p.motors.filter(m=>m.on===x.id).flatMap(m=>[el('h3',{textContent:m.part.label}),el('p',{className:'prop-info',textContent:m.layer?`Flansch an ${m.down?'der Unterseite':'der Oberseite'} von Schicht ${p.layers.findIndex(l=>l.id===m.layer)+1}${m.slot?`, Langlöcher ±${n(m.travel/2)} mm in Riemenrichtung`:''}.`:'Der Flansch liegt an keiner Platte.'}),
     ...(m.offset!==undefined?[(()=>{const b=button(`Motor an die Platte setzen (Welle ${m.offset>0?'+':''}${n(m.offset)} mm)`,()=>{x.z=+(x.z+m.offset!).toFixed(3);});b.dataset.motorFit='true';return b;})()]:[])]),
    d.input===x.id||(!d.input&&d.shafts[0]?.id===x.id)?el('p',{className:'prop-info',textContent:'Eingang: die Drehzahlen gelten je Umdrehung dieser Welle.'}):button('Als Eingang',()=>{d.input=x.id;}),
    ...pulleys.flatMap(pu=>[el('h3',{textContent:`Riemen an ${pu.label}`}),...d.belts.filter(b=>`${b.a.on}/${b.a.item}`===pu.key||`${b.b.on}/${b.b.item}`===pu.key).map(b=>{const bp=p.belts.find(v=>v.id===b.id);const other=bp?p.wheels.find(v=>v.key===(bp.a===pu.key?bp.b:bp.a)):undefined,fit=bp?.fit;
      const set=fit&&other&&Number.isFinite(fit.center)&&Math.abs(bp!.center-fit.center)>.01?(()=>{const bt=button(`Auf Normriemen ${fit.stock} mm stellen (${n(fit.center)} mm)`,()=>{const dx=x.at[0]-other.at[0],dy=x.at[1]-other.at[1],l=Math.hypot(dx,dy)||1;x.at=[+(other.at[0]+dx/l*fit.center).toFixed(4),+(other.at[1]+dy/l*fit.center).toFixed(4)];},'ghost');bt.dataset.beltFit='true';return bt;})():'';
      return el('div',{className:'prop-col'},el('div',{className:'prop-row'},el('span',{textContent:`${bp?n(bp.length)+' mm':''}${bp?.stock?`, Norm ${bp.stock}`:''}${bp?.tension?`, spannbar ${n(bp.tension.range[0])} bis ${n(bp.tension.range[1])} mm`:''}`}),button('entfernen',()=>{d.belts=d.belts.filter(v=>v!==b);},'ghost')),set);}),
     ...others.filter(o=>!d.belts.some(b=>[`${b.a.on}/${b.a.item}`,`${b.b.on}/${b.b.item}`].sort().join()===[pu.key,o.key].sort().join())).map(o=>{const b=button(`＋ Riemen zu ${o.label}`,()=>{let i=1;while(d.belts.some(v=>v.id===`r${i}`))i++;d.belts.push({id:`r${i}`,a:{on:pu.on,item:pu.item},b:{on:o.on,item:o.item}});},'ghost');b.dataset.belt=o.key;return b;})]),
    issues(r=>r===x.id),button('Aus dem Getriebe nehmen',()=>{d.shafts=d.shafts.filter(v=>v!==x);d.belts=d.belts.filter(b=>b.a.on!==x.id&&b.b.on!==x.id);if(d.input===x.id)delete d.input;this.sel=undefined;},'danger'));return;}
  if(s?.kind==='web'){const L=p.layers.find(l=>l.webs.some(w=>w.a===s.a&&w.b===s.b)),w=L?.webs.find(v=>v.a===s.a&&v.b===s.b);if(!w){this.sel=undefined;return this.renderProperties(root);}const name=(k:string)=>p.bearings.find(b=>b.key===k)?.label??k;
   const key=`${w.a}|${w.b}`,setRoute=(r?:'aussen'|'tiefe')=>{d.webs??={add:[],remove:[]};const route={...(d.webs.route??{})};if(r)route[key]=r;else delete route[key];if(Object.keys(route).length)d.webs.route=route;else delete d.webs.route;};
   const how=w.route==='aussen'?(w.path?`Außen herum über ${w.path.length} Punkt${w.path.length>1?'e':''}, Streben ${n(2*w.width!)} mm breit.`:'Außen herum: kein freier Weg gefunden.'):w.route==='tiefe'?(w.z?`In der Tiefe: nur von ${n(w.z[0])} bis ${n(w.z[1])} mm hoch.`:'In der Tiefe: kein Platz.'):'';
   const choices=w.hits.length||w.route?[el('h3',{textContent:w.hits.length&&!w.route?`Im Weg: ${w.hits.join(', ')}`:'Am Teil vorbei'}),el('div',{className:'prop-row'},
    ...(w.route!=='aussen'?[button('Außen herum',()=>setRoute('aussen'))]:[]),...(w.route!=='tiefe'?[button('In die Tiefe',()=>setRoute('tiefe'))]:[]),...(w.route?[button('Gerade',()=>setRoute(undefined),'ghost')]:[]))]:[];
   root.replaceChildren(...head('Steg',`${name(w.a)} – ${name(w.b)}`),el('p',{className:'prop-info',textContent:w.forced?'Automatisch, zwischen kämmenden Wellen: hält den Achsabstand.':w.auto?'Automatisch: kürzester Weg, der die Platte zusammenhält.':'Von Hand hinzugefügt.'}),...(how?[el('p',{className:'prop-info',textContent:how})]:[]),...choices,issues(r=>r===`steg:${w.a}|${w.b}`),
    button('Steg entfernen',()=>{d.webs??={add:[],remove:[]};if(w.auto)d.webs.remove.push(webKey(w.a,w.b));else d.webs.add=d.webs.add.filter(k=>!(k[0]===w.a&&k[1]===w.b));setRoute(undefined);this.sel=undefined;},'danger'));return;}
  if(s?.kind==='layer'){const l=p.layers[s.index];if(!l){this.sel=undefined;return this.renderProperties(root);}const set=(f:(x:Layer)=>void)=>{this.manualLayers();f(d.layers![s.index]);};const name=(k:string)=>p.bearings.find(b=>b.key===k)?.label??k;
   const has=(a:string,b:string)=>l.webs.some(w=>w.a===a&&w.b===b),pairs=l.bearings.flatMap((a,i)=>l.bearings.slice(i+1).map(b=>webKey(a,b))).filter(([a,b])=>!has(a,b));const removed=(d.webs?.remove??[]).filter(([a,b])=>l.bearings.includes(a)&&l.bearings.includes(b));
   root.replaceChildren(...head(`Schicht ${s.index+1}`,`${l.bearings.length} Lager, Platten von ${n(l.band[0])} bis ${n(l.band[1])} mm${l.auto?', vorgeschlagen':''}`),field('von z [mm]',l.z0,v=>set(x=>{x.z0=v!;})),field('bis z [mm]',l.z1,v=>set(x=>{x.z1=v!;})),
    field('Rand um die Lager [mm]',l.rim,v=>set(x=>{if(v===undefined)delete x.rim;else x.rim=v;}),{optional:true,step:.5}),field('Dicke der Stege [mm]',l.thickness,v=>set(x=>{if(v===undefined)delete x.thickness;else x.thickness=v;}),{optional:true,step:.5}),
    ...(pairs.length?[el('h3',{textContent:'Steg hinzufügen'}),...pairs.map(([a,b])=>button(`＋ ${name(a)} – ${name(b)}`,()=>{d.webs??={add:[],remove:[]};const r=d.webs.remove.findIndex(k=>k[0]===a&&k[1]===b);if(r>=0)d.webs.remove.splice(r,1);else d.webs.add.push([a,b]);},'ghost'))]:[]),
    ...(removed.length?[el('h3',{textContent:'Entfernte Stege'}),...removed.map(([a,b])=>button(`↺ ${name(a)} – ${name(b)}`,()=>{d.webs!.remove=d.webs!.remove.filter(k=>!(k[0]===a&&k[1]===b));},'ghost'))]:[]),
    button('Schicht entfernen',()=>{this.manualLayers();d.layers!.splice(s.index,1);this.sel=undefined;},'danger'));return;}
  type NumberKey={[K in keyof GearSettings]:GearSettings[K] extends number?K:never}[keyof GearSettings];
  const set=(k:NumberKey,text:string,step=.5)=>field(text,d.settings[k],v=>{if(v!==undefined&&v>=0)d.settings[k]=v;},{step});
  root.replaceChildren(...head('Getriebe','Wellen von links auf die Ebene ziehen. Klick auf eine Welle, einen Steg oder eine Schicht zeigt sie hier.'),
   el('div',{className:'prop-row'},button('＋ Schicht',()=>{this.manualLayers();const top=Math.max(0,...(d.layers??[]).map(l=>l.z1));let i=1;while(d.layers!.some(l=>l.id===`h${i}`))i++;d.layers!.push({id:`h${i}`,z0:top+5,z1:top+12});}),...(d.layers?.length?[button('Schichten automatisch',()=>{delete d.layers;},'ghost')]:[])),
   el('h3',{textContent:'Regeln'}),set('rim','Rand um die Lager [mm]'),set('web','Dicke der Stege [mm]'),set('lip','Bord über dem Lager [mm]',.1),set('lipIn','Bord reicht nach innen [mm]',.1),set('clearance','Abstand zu Rädern [mm]',.1),set('hole','Spiel der Freilöcher [mm]',.1),set('angle','Winkelraster [°]',1),set('grid','mm-Raster',.5),set('slot','Spannweg der Motor-Langlöcher [mm]',.5),(()=>{const c=el('input',{type:'checkbox',checked:d.settings.clamp,disabled:ro});c.dataset.clamp='true';c.onchange=()=>{this.host.begin();d.settings.clamp=c.checked;this.host.commit(c.checked?'Lager werden zwischen Plattenpaaren eingeklemmt':'Eine Platte je Schicht, Anschläge außen');};return el('label',{className:'prop'},el('span',{textContent:'Lager einklemmen (Plattenpaar je Schicht)'}),c);})(),set('fit','Spiel der Lagertaschen [mm]',.05));}
 removeSelected(){const s=this.sel,d=this.doc;if(!s||this.host.readOnly())return;this.host.begin();
  if(s.kind==='shaft'){d.shafts=d.shafts.filter(v=>v.id!==s.id);d.belts=d.belts.filter(b=>b.a.on!==s.id&&b.b.on!==s.id);if(d.input===s.id)delete d.input;}
  else if(s.kind==='web'){const w=this.host.plan().layers.flatMap(l=>l.webs).find(v=>v.a===s.a&&v.b===s.b);d.webs??={add:[],remove:[]};if(w?.auto)d.webs.remove.push(webKey(s.a,s.b));else d.webs.add=d.webs.add.filter(k=>!(k[0]===s.a&&k[1]===s.b));}
  else{this.manualLayers();d.layers!.splice(s.index,1);}
  this.sel=undefined;this.host.commit('Entfernt');}
}
