// From what sits on a shaft to the shaft itself: which end every part is slid on from, the sections and shoulders that
// follow, adapters where a part's bore does not fit the section it has to sit on, spacers where nothing stops a part,
// and the checks. Pure: no page, no CAD.
//
// Mounting: a part slid on from the left goes over everything left of its seat, so every section there must pass its
// bore; parts further in go on first. Parts from the left therefore all sit left of parts from the right, the plan tries
// every split between them. Between the two sides stays a collar (Bund) that stops the innermost parts.
import {inner,outer,passes,largestPassing,label,same,rund} from './profile.ts';
import type {Profile} from './profile.ts';
import {onPart,inPart} from './catalog.ts';
import type {OnPart,InPart} from './catalog.ts';
import {thread,setScrew,keyFor,keyLengths,ringFor,eclipFor} from './din.ts';
import type {ShaftDoc,Side,Work} from './model.ts';

const eps=1e-6;
export type Role='sitz'|'frei'|'bund'|'eigen';
export type Section={x0:number;x1:number;profile:Profile;role:Role};
/** A part on the shaft as planned: its seat, its bore, the end it goes on from. */
export type Placed={id:string;part:OnPart;label:string;x0:number;x1:number;bore:Profile;side:Side;adapter?:string};
/** A printed or turned sleeve: an adapter under a part, or a spacer. `steps`: its outside along x. */
export type Sleeve={id:string;kind:'adapter'|'huelse';label:string;for?:string;auto:boolean;x0:number;x1:number;side:Side;inner:Profile;steps:{x0:number;x1:number;outer:Profile}[]};
export type Insert={id:string;part:InPart;label:string;end:Side;x0:number;x1:number;profile:Profile;wall:number};
/** `work`: about a machining step. Those never decide which end parts go on from: machining follows the shaft. */
export type Issue={level:'fehler'|'warnung'|'hinweis';message:string;ref?:string;work?:boolean};
export type BomLine={what:string;count:number;note?:string};
/** A machining step with what it came to: drill and screw for a set screw, the key, the groove. */
export type Machining={work:Work;drill?:number;depth?:number;screw?:string;key?:{b:number;h:number;t1:number;length:number};ring?:{d2:number;m:number;norm:'471'|'6799';label:string}};
export type Plan={length:number;sections:Section[];placed:Placed[];sleeves:Sleeve[];inserts:Insert[];machining:Machining[];issues:Issue[];bom:BomLine[];split:number};

type Ref={id:string;part:OnPart;label:string;x0:number;x1:number;bore:Profile;spacer:boolean;clamp:boolean;side?:Side};
const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
const mm=(x:number)=>`${n(x)} mm`;
const overlaps=(a0:number,a1:number,b0:number,b1:number)=>a0<b1-eps&&b0<a1-eps;

export function planShaft(doc:ShaftDoc):Plan{
 const issues:Issue[]=[],L=doc.length;
 const refs:Ref[]=[];
 for(const it of doc.items){const part=onPart(it.part);if(!part){issues.push({level:'fehler',message:`Unbekanntes Teil ${it.part}`,ref:it.id});continue;}
  const width=part.own&&it.width?it.width:part.width,bore=part.own&&it.bore?it.bore:part.bore;
  refs.push({id:it.id,part,label:part.spacer?'Distanzhülse':part.label.split(' (')[0],x0:it.x,x1:it.x+width,bore,spacer:!!part.spacer,clamp:!!part.clamp,...(it.side?{side:it.side}:{})});}
 refs.sort((a,b)=>a.x0-b.x0);
 for(const r of refs)if(r.x0<-eps||r.x1>L+eps)issues.push({level:'fehler',message:`${r.label} ragt über das Wellenende (${mm(r.x0)} bis ${mm(r.x1)}, Welle ${mm(L)})`,ref:r.id});
 for(let i=1;i<refs.length;i++)if(refs[i].x0<refs[i-1].x1-eps)issues.push({level:'fehler',message:`${refs[i-1].label} und ${refs[i].label} überlappen um ${mm(refs[i-1].x1-refs[i].x0)}`,ref:refs[i].id});
 const inserts:Insert[]=[];
 for(const it of doc.inserts){const part=inPart(it.part);if(!part){issues.push({level:'fehler',message:`Unbekannte Welle ${it.part}`,ref:it.id});continue;}
  const depth=Math.min(it.depth,L);inserts.push({id:it.id,part,label:part.label.split(':')[0],end:it.end,x0:it.end==='links'?0:L-depth,x1:it.end==='links'?depth:L,profile:part.profile,wall:it.wall??doc.settings.insertWall});
  if(it.depth>L+eps)issues.push({level:'fehler',message:`${part.label} steckt ${mm(it.depth)} tief, die Welle ist nur ${mm(L)} lang`,ref:it.id});
  if(part.length!==undefined&&it.depth>part.length+eps)issues.push({level:'warnung',message:`${part.label.split(':')[0]}: die Welle ist nur ${mm(part.length)} lang, gesteckt ${mm(it.depth)}`,ref:it.id});}
 if(inserts.filter(i=>i.end==='links').length>1||inserts.filter(i=>i.end==='rechts').length>1)issues.push({level:'fehler',message:'Je Ende steckt höchstens eine Welle.'});
 if(issues.some(i=>i.level==='fehler'&&refs.some(r=>r.id===i.ref)))return finish(doc,{length:L,sections:[{x0:0,x1:L,profile:rund(doc.collar??8),role:'bund'}],placed:[],sleeves:[],inserts,machining:[],issues,bom:[],split:0});
 // Every split the fixed sides allow; the one with the fewest mistakes, adapters and spacers wins.
 let best:Plan|undefined,bestScore=Infinity;
 for(let k=0;k<=refs.length;k++){if(refs.some((r,i)=>r.side==='links'&&i>=k||r.side==='rechts'&&i<k))continue;
  const p=finish(doc,build(doc,refs,k,inserts,issues)),mount=p.issues.filter(i=>!i.work);const score=1000*mount.filter(i=>i.level==='fehler').length+10*mount.filter(i=>i.level==='warnung').length+20*p.sleeves.filter(s=>s.kind==='adapter').length+2*p.sleeves.filter(s=>s.auto&&s.kind==='huelse').length+(k===Math.ceil(refs.length/2)?0:.1);
  if(score<bestScore){best=p;bestScore=score;}}
 if(!best){issues.push({level:'fehler',message:'Die festgelegten Seiten widersprechen sich: Teile von links müssen links von denen von rechts sitzen.'});return finish(doc,{length:L,sections:[{x0:0,x1:L,profile:rund(doc.collar??8),role:'bund'}],placed:[],sleeves:[],inserts,machining:[],issues,bom:[],split:0});}
 return best;
}

/** One split: parts 0..k-1 from the left, k.. from the right. Walks each side from the collar outwards and keeps the
 * bores that must still pass. */
function build(doc:ShaftDoc,refs:Ref[],k:number,inserts:Insert[],given:Issue[]):Plan{
 const L=doc.length,s=doc.settings,secs:(Omit<Section,'profile'>&{profile?:Profile})[]=[],placed:Placed[]=[],sleeves:Sleeve[]=[],issues:Issue[]=[...given];
 const lo=k>0?refs[k-1].x1:0,hi=k<refs.length?refs[k].x0:L;
 if(hi>lo+eps)secs.push({x0:lo,x1:hi,role:'bund'});
 const walk=(list:Ref[],side:Side)=>{const C:Profile[]=[];let edge=side==='links'?lo:hi;
  list.forEach((r,i)=>{const inward=side==='links'?r.x1:r.x0,outward=side==='links'?r.x0:r.x1,gap:[number,number]=side==='links'?[inward,edge]:[edge,inward];
   const free=largestPassing(C);
   // The bore: a spacer takes what the next part outwards needs, or what passes everything further in.
   const bore=r.spacer?free??list.slice(i+1).find(x=>!x.spacer)?.bore??r.bore:r.bore;
   let seat=bore,adapter:Sleeve|undefined;
   if(!C.every(c=>passes(bore,c))){seat=free!;adapter={id:`adapter-${r.id}`,kind:'adapter',label:`Adapter ${label(seat)} → ${label(bore)}`,for:r.id,auto:true,x0:r.x0,x1:r.x1,side,inner:seat,steps:[{x0:r.x0,x1:r.x1,outer:bore}]};
    const wall=(inner(bore)-outer(seat))/2;if(wall<=eps)issues.push({level:'fehler',message:`${r.label}: ${label(seat)} passt nicht in die Bohrung ${label(bore)}, kein Adapter möglich. Ein Teil von der anderen Seite aufschieben?`,ref:r.id});else if(wall<s.minWall-eps)issues.push({level:'warnung',message:`${adapter.label} unter ${r.label}: Wand nur ${mm(wall)} (mindestens ${mm(s.minWall)})`,ref:adapter.id});}
   // Nothing between this part and the next one in stops it: a spacer, or the adapter gets a collar.
   if(gap[1]>gap[0]+eps){const stopBore=adapter?seat:bore,stopped=r.clamp||free===undefined||!passes(free,stopBore);
    secs.push({x0:gap[0],x1:gap[1],role:free?'frei':'bund',...(free?{profile:free}:{})});
    if(!stopped){const want=Math.max(outer(free!)+2*s.spacerWall,inner(bore)+2*s.shoulder),cap=Math.min(r.part.stop??Infinity,list[i-1]?.part.stop??Infinity),d=cap>inner(bore)+.5&&cap<want?cap:want,step={x0:gap[0],x1:gap[1],outer:rund(+d.toFixed(2))};
     if(adapter){adapter.x0=Math.min(adapter.x0,gap[0]);adapter.x1=Math.max(adapter.x1,gap[1]);adapter.steps.push(step);adapter.steps.sort((a,b)=>a.x0-b.x0);adapter.label+=' mit Bund';}
     else sleeves.push({id:`huelse-${r.id}`,kind:'huelse',label:`Distanzhülse ${label(free!)} × Ø${n(d)}`,for:r.id,auto:true,x0:gap[0],x1:gap[1],side,inner:free!,steps:[step]});}}
   secs.push({x0:r.x0,x1:r.x1,role:'sitz',profile:seat});
   if(adapter){sleeves.push(adapter);C.push(seat);}
   if(r.spacer){const d=+(outer(bore)+2*s.spacerWall).toFixed(2);sleeves.push({id:r.id,kind:'huelse',label:`Distanzhülse ${label(bore)} × Ø${n(d)}`,auto:false,x0:r.x0,x1:r.x1,side,inner:bore,steps:[{x0:r.x0,x1:r.x1,outer:rund(d)}]});}
   else placed.push({id:r.id,part:r.part,label:r.label,x0:r.x0,x1:r.x1,bore,side,...(adapter?{adapter:adapter.id}:{})});
   C.push(bore);edge=outward;});
  const end=side==='links'?0:L,free=largestPassing(C);if(Math.abs(edge-end)>eps)secs.push({x0:Math.min(edge,end),x1:Math.max(edge,end),role:free?'frei':'bund',...(free?{profile:free}:{})});};
 walk(refs.slice(0,k).reverse(),'links');walk(refs.slice(k),'rechts');
 // Collars: Ø over what sits beside them, a shaft in them keeps its wall, a bearing's outer ring stays free.
 for(const c of secs){if(c.profile)continue;const beside=[...placed,...sleeves.filter(x=>!x.auto||x.kind==='huelse')].filter(t=>Math.abs(t.x1-c.x0)<eps||Math.abs(t.x0-c.x1)<eps);
  const faces=secs.filter(o=>o.profile&&o.role==='sitz'&&(Math.abs(o.x1-c.x0)<eps||Math.abs(o.x0-c.x1)<eps)).map(o=>outer(o.profile!)),sleeveFaces=sleeves.filter(x=>Math.abs(x.x1-c.x0)<eps||Math.abs(x.x0-c.x1)<eps).flatMap(x=>x.steps.map(st=>outer(st.outer)));
  const room=inserts.filter(i=>overlaps(i.x0,i.x1,c.x0,c.x1)).map(i=>outer(i.profile)+2*i.wall);
  let d=Math.max(...faces.map(f=>f+2*s.shoulder),...sleeveFaces.map(f=>f+2*s.shoulder),...room,faces.length||sleeveFaces.length||room.length?0:8);
  const cap=Math.min(...beside.map(t=>'part' in t?t.part.stop??Infinity:Infinity)),least=Math.max(0,...faces,...sleeveFaces)+1;
  if(cap<d&&cap>=least&&cap>=Math.max(0,...room))d=cap;else if(cap<d)issues.push({level:'warnung',message:`Bund bei ${mm(c.x0)} bis ${mm(c.x1)} (Ø${n(d)}) reicht bis an den Außenring von ${beside.filter(t=>'part' in t&&t.part.stop!==undefined&&t.part.stop<d).map(t=>t.label).join(', ')}`});
  c.profile=rund(doc.collar??+d.toFixed(2));}
 let sections=(secs as Section[]).sort((a,b)=>a.x0-b.x0);
 for(const o of doc.sections??[]){const out:Section[]=[];for(const x of sections){if(!overlaps(x.x0,x.x1,o.x0,o.x1)){out.push(x);continue;}if(x.x0<o.x0-eps)out.push({...x,x1:o.x0});if(x.x1>o.x1+eps)out.push({...x,x0:o.x1});}
  out.push({x0:Math.max(0,o.x0),x1:Math.min(L,o.x1),profile:o.profile,role:'eigen'});sections=out.sort((a,b)=>a.x0-b.x0);}
 const merged:Section[]=[];for(const x of sections){const last=merged.at(-1);if(last&&same(last.profile,x.profile)&&Math.abs(last.x1-x.x0)<eps&&last.role===x.role)last.x1=x.x1;else merged.push({...x});}
 return {length:L,sections:merged,placed,sleeves,inserts,machining:[],issues,bom:[],split:k};
}

/** The checks, independent of how the plan came about (also for sections set by hand), machining and the parts list. */
function finish(doc:ShaftDoc,p:Plan):Plan{
 const L=doc.length,s=doc.settings,issues=p.issues,at=(x:number)=>p.sections.find(c=>x>=c.x0-eps&&x<=c.x1+eps),within=(a:number,b:number)=>p.sections.filter(c=>overlaps(c.x0,c.x1,a,b));
 const sleeveOf=(id?:string)=>p.sleeves.find(x=>x.id===id);
 // Seats.
 for(const t of p.placed){const want=sleeveOf(t.adapter)?.inner??t.bore,wrong=within(t.x0,t.x1).filter(c=>!same(c.profile,want));if(wrong.length)issues.push({level:'fehler',message:`${t.label} braucht ${label(want)}, dort ist ${wrong.map(c=>label(c.profile)).join(', ')}`,ref:t.id});}
 // Passing: every part and sleeve over everything between its end and its seat.
 const movers=[...p.placed.map(t=>({id:t.id,label:t.label,x0:t.x0,x1:t.x1,side:t.side,bore:t.bore})),...p.sleeves.map(x=>({id:x.id,label:x.label,x0:x.x0,x1:x.x1,side:x.side,bore:x.inner}))];
 for(const m of movers){const way=m.side==='links'?within(0,m.x0):within(m.x1,L),stuck=way.find(c=>!passes(c.profile,m.bore));if(stuck)issues.push({level:'fehler',message:`${m.label} geht von ${m.side} nicht über ${label(stuck.profile)} bei ${mm(stuck.x0)} bis ${mm(stuck.x1)}`,ref:m.id});}
 // Stops: what is slid on ends at a shoulder or at the next thing.
 const units=[...p.placed.filter(t=>!t.adapter&&!t.part.clamp).map(t=>({id:t.id,label:t.label,x0:t.x0,x1:t.x1,side:t.side,bore:t.bore})),...p.sleeves.map(x=>({id:x.id,label:x.label,x0:x.x0,x1:x.x1,side:x.side,bore:x.inner}))];
 const bodies=[...p.placed,...p.sleeves];
 for(const u of units){const face=u.side==='links'?u.x1:u.x0;if(bodies.some(b=>b.id!==u.id&&(u.side==='links'?Math.abs(b.x0-face)<eps:Math.abs(b.x1-face)<eps)))continue;const next=u.side==='links'?at(face+.01):at(face-.01);
  if(next&&passes(next.profile,u.bore)&&!(u.side==='links'?face>=L-eps:face<=eps))issues.push({level:'fehler',message:`${u.label} hat nach innen keinen Anschlag: Absatz oder Distanzhülse fehlt`,ref:u.id});}
 // Outermost things want holding outwards.
 const rings=doc.works.filter(w=>w.kind==='ring') as Extract<Work,{kind:'ring'}>[],ends=doc.works.filter(w=>w.kind==='gewinde') as Extract<Work,{kind:'gewinde'}>[];
 for(const side of ['links','rechts'] as Side[]){const mine=bodies.filter(b=>b.side===side);if(!mine.length)continue;const o=side==='links'?mine.reduce((a,b)=>b.x0<a.x0?b:a):mine.reduce((a,b)=>b.x1>a.x1?b:a),face=side==='links'?o.x0:o.x1;
  if(!('part' in o&&o.part.clamp)&&!rings.some(r=>Math.abs(r.x-face)<3)&&!ends.some(e=>e.end===side&&Math.abs(face-(side==='links'?0:L))<3))issues.push({level:'hinweis',message:`${o.label} ist nach ${side} nicht gesichert: ${p.sections.some(c=>c.profile.kind==='kreuz'&&(overlaps(c.x0,c.x1,o.x0,o.x1)||Math.abs((side==='links'?c.x1:c.x0)-face)<eps))?'Sicherungsring oder E-Ring (Nut ins Kreuz), LEGO-Buchse':'Sicherungsring, E-Ring oder Stellring'}, Gewinde mit Scheibe, oder das Gehäuse hält es`,ref:o.id});}
 // Shafts inside.
 for(const i of p.inserts){const wall=Math.min(...within(i.x0,i.x1).map(c=>(inner(c.profile)-outer(i.profile))/2));if(wall<=eps)issues.push({level:'fehler',message:`${i.label} (${label(i.profile)}) passt nicht in die Welle: dort ${[...new Set(within(i.x0,i.x1).map(c=>label(c.profile)))].join(', ')}`,ref:i.id});else if(wall<i.wall-eps)issues.push({level:wall<s.minWall?'fehler':'warnung',message:`Wand um ${i.label} nur ${mm(wall)} (gewünscht ${mm(i.wall)})`,ref:i.id});}
 // Machining.
 const covered=(a:number,b:number)=>bodies.find(t=>overlaps(t.x0,t.x1,a,b));
 const before=issues.length;
 for(const w of doc.works){const m:Machining={work:w};p.machining.push(m);
  if(w.kind==='madenschraube'){const t=thread(w.m);if(!t){issues.push({level:'fehler',message:`M${n(w.m)} ist kein Regelgewinde der Tabelle`,ref:w.id});continue;}const c=at(w.x);if(!c||w.x<-eps||w.x>L+eps){issues.push({level:'fehler',message:`Madenschraube bei ${mm(w.x)} liegt außerhalb der Welle`,ref:w.id});continue;}
   const ins=p.inserts.find(i=>w.x>=i.x0-eps&&w.x<=i.x1+eps),R=inner(c.profile)/2,r=ins?(ins.profile.kind==='d'&&(w.angle??0)===0?ins.profile.d/2-ins.profile.flat:ins.profile.kind==='kreuz'?outer(ins.profile)/2:inner(ins.profile)/2):0,room=R-r;
   m.drill=t.drill;m.depth=room;const screw=setScrew(w.m,room);m.screw=`Madenschraube DIN 913 M${n(w.m)} × ${screw.length}`;
   if(!ins)issues.push({level:'warnung',message:`Madenschraube bei ${mm(w.x)}: keine Welle innen, auf die sie drückt`,ref:w.id});
   if(Math.abs(w.x-(ins?.end==='links'?ins.x1:ins?.x0??-1e9))<t.m/2+.5)issues.push({level:'warnung',message:`Madenschraube bei ${mm(w.x)} trifft das Ende der gesteckten Welle`,ref:w.id});
   if(room<3*t.pitch)issues.push({level:'fehler',message:`Madenschraube M${n(w.m)}: nur ${mm(room)} Gewinde, mindestens ${mm(3*t.pitch)}`,ref:w.id});else if(room<t.m)issues.push({level:'warnung',message:`Madenschraube M${n(w.m)}: ${mm(room)} Gewinde, besser mindestens ${mm(t.m)}`,ref:w.id});
   if(screw.proud>eps)issues.push({level:'warnung',message:`Kürzeste Madenschraube M${n(w.m)} (${screw.length} mm) steht ${mm(screw.proud)} über`,ref:w.id});
   const over=covered(w.x-t.m/2,w.x+t.m/2);if(over)issues.push({level:'warnung',message:`Madenschraube bei ${mm(w.x)} liegt unter ${over.label} und ist nicht erreichbar`,ref:w.id});}
  else if(w.kind==='gewinde'){const t=thread(w.m);if(!t){issues.push({level:'fehler',message:`M${n(w.m)} ist kein Regelgewinde der Tabelle`,ref:w.id});continue;}const c=at(w.end==='links'?0:L)!,wall=(inner(c.profile)-t.drill)/2;m.drill=t.drill;m.depth=w.depth;
   if(p.inserts.some(i=>i.end===w.end))issues.push({level:'fehler',message:`Gewinde ${w.end}: dort steckt schon eine Welle`,ref:w.id});
   if(wall<s.minWall)issues.push({level:wall<=eps?'fehler':'warnung',message:`Gewinde M${n(w.m)} ${w.end}: Wand nur ${mm(wall)} in ${label(c.profile)}`,ref:w.id});
   if(w.depth>L)issues.push({level:'fehler',message:`Gewinde ${mm(w.depth)} tief, Welle ${mm(L)}`,ref:w.id});else if(w.depth<w.m)issues.push({level:'warnung',message:`Gewinde M${n(w.m)} nur ${mm(w.depth)} tief, besser mindestens ${mm(w.m*1.5)}`,ref:w.id});}
  else if(w.kind==='nut'){const cs=within(w.x0,w.x1),d=cs[0]&&cs[0].profile.kind==='rund'?cs[0].profile.d:undefined;
   if(d===undefined||!cs.every(c=>c.profile.kind==='rund'&&c.profile.d===d)){issues.push({level:'fehler',message:`Passfedernut ${mm(w.x0)} bis ${mm(w.x1)} muss auf einem runden Abschnitt eines Ø liegen`,ref:w.id});continue;}
   const key=keyFor(d);if(!key){issues.push({level:'fehler',message:`Für Ø${n(d)} hat DIN 6885 keine Passfeder (6 bis 38 mm)`,ref:w.id});continue;}
   const length=[...keyLengths].reverse().find(l=>l<=w.x1-w.x0+eps);m.key={b:key.b,h:key.h,t1:key.t1,length:length??w.x1-w.x0};if(!length)issues.push({level:'warnung',message:`Nut ${mm(w.x1-w.x0)} ist kürzer als die kürzeste Passfeder (6 mm)`,ref:w.id});}
  else if(w.kind==='ring'){const c=at(w.x),norm=w.norm??'471',name=norm==='471'?'Sicherungsring DIN 471':'E-Ring DIN 6799',cross=c?.profile.kind==='kreuz';
   // The size the ring is chosen by: a round or D shaft its Ø. On the LEGO cross (4.8 across) the groove is turned into the
   // arms: DIN 471 for Ø4 (groove Ø3.8, the ring for Ø5 would have a groove of 4.8 and grip nothing), E-clip 3.2 (for 4–5).
   const d=c?.profile.kind==='rund'||c?.profile.kind==='d'?c.profile.d:cross?(norm==='471'?4:outer(c!.profile)):undefined,r471=d!==undefined?ringFor(d):undefined,e=d!==undefined?eclipFor(d):undefined;
   if(norm==='471'&&!r471||norm==='6799'&&!e){issues.push({level:'fehler',message:`${name} bei ${mm(w.x)}: ${d===undefined?`braucht einen runden, abgeflachten oder LEGO-Kreuz-Abschnitt, dort ${c?label(c.profile):'nichts'}`:`kein Ring für Ø${n(d)} (${norm==='471'?'DIN 471 hat Ø3 bis Ø20 in ganzen Größen':'DIN 6799 hat Ø1,4 bis Ø24'})`}${norm==='471'&&eclipFor(d??0)?'. Ein E-Ring DIN 6799 passt.':''}`,ref:w.id});continue;}
   m.ring=norm==='471'?{d2:r471!.d2,m:r471!.m,norm,label:`Sicherungsring DIN 471 ${n(d!)} × ${n(r471!.m-.1)}`}:{d2:e!.d2,m:e!.m,norm,label:`Sicherungsscheibe DIN 6799 ${n(e!.d2)}`};
   if(cross&&norm==='471')issues.push({level:'hinweis',message:`${m.ring.label} auf dem LEGO-Kreuz: Nut Ø${n(m.ring.d2)} in die Arme gestochen; der Ring wird beim Aufsetzen über 4,8 mm gespreizt. Geht das schwer: E-Ring DIN 6799 3,2 wird von der Seite gesteckt.`,ref:w.id});
   const over=bodies.find(t=>w.x>t.x0+eps&&w.x<t.x1-eps);if(over)issues.push({level:'fehler',message:`${name} bei ${mm(w.x)} liegt unter ${over.label}`,ref:w.id});
   // DIN 471 rings are spread over an end: nothing thicker than what it is spread over may lie between groove and that end.
   const spread=cross?outer(c!.profile):d!;
   if(norm==='471'&&!(['links','rechts'] as const).some(sd=>(sd==='links'?within(0,w.x):within(w.x,L)).every(x=>outer(x.profile)<=spread+eps)))issues.push({level:'warnung',message:`Sicherungsring bei ${mm(w.x)}: zu beiden Enden liegt ein dickerer Abschnitt, er lässt sich nicht aufschieben. Ein E-Ring DIN 6799 wird von der Seite gesteckt.`,ref:w.id});}
  else if(w.kind==='abflachung'){const cs=within(w.x0,w.x1);if(!cs.length||cs.some(c=>c.profile.kind!=='rund'||w.depth>c.profile.d/4))issues.push({level:'fehler',message:`Abflachung ${mm(w.x0)} bis ${mm(w.x1)}: nur auf runden Abschnitten, höchstens ein Viertel des Ø tief`,ref:w.id});}}
 for(const i of issues.slice(before))i.work=true;
 if(doc.making==='cnc'&&p.sections.some(c=>c.profile.kind==='kreuz'))issues.push({level:'hinweis',message:'LEGO-Kreuz an der CNC: die Innenecken brauchen einen Fräser unter 1,8 mm, oder das Kreuz wird gedruckt.'});
 // Parts list.
 const bom=new Map<string,BomLine>(),add=(what:string,note?:string)=>{const b=bom.get(what);if(b)b.count++;else bom.set(what,{what,count:1,...(note?{note}:{})});};
 add(doc.making==='cnc'?'Welle (gedreht/gefräst)':'Welle (gedruckt)',`${mm(L)} lang, größter Ø ${n(Math.max(...p.sections.map(c=>outer(c.profile))))}`);
 for(const t of p.placed){add(t.part.label);if(t.part.extra)add(t.part.extra);}
 for(const x of p.sleeves)add(`${x.kind==='adapter'?'Adapter':'Distanzhülse'} (gedruckt): ${x.label.replace(/^(Adapter|Distanzhülse) /,'')}`,mm(x.x1-x.x0)+' lang');
 for(const m of p.machining){if(m.screw)add(m.screw);if(m.drill!==undefined){const t=thread((m.work as {m:number}).m)!;add(`Gewindebohrer M${n(t.m)} (Kernloch Ø${n(t.drill)})`);}if(m.key)add(`Passfeder DIN 6885 A ${m.key.b} × ${m.key.h} × ${m.key.length}`);if(m.ring)add(m.ring.label);}
 // One tap per size is enough.
 p.bom=[...bom.values()].map(b=>b.what.startsWith('Gewindebohrer')?{...b,count:1}:b);
 return p;
}
