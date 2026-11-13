// What goes with the files: the parts list as CSV and the making notes as text. For the CNC each section gets the fit
// it is usually made to (bearing seats k6, sliding seats h7, bores for shafts H7, keyways N9, else ISO 2768-m); for the
// printer, the play that is already in the model. Then every machining step as a work instruction.
import type {Plan} from './plan.ts';
import type {ShaftDoc} from './model.ts';
import {label,outer} from './profile.ts';

const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
/** The fit a section is usually turned to, by what sits on it. */
export function fitFor(plan:Plan,x0:number,x1:number,role:string){
 const on=plan.placed.find(t=>t.x0<x1-1e-6&&t.x1>x0+1e-6&&!t.adapter);
 if(role==='sitz'&&on)return on.part.group==='Lager'?'k6 (Lagersitz, Innenring fest)':on.bore.kind==='rund'?'h7 (Schiebesitz)':'Profil nach Gegenstück, spielfrei';
 if(plan.sleeves.some(s=>s.x0<x1-1e-6&&s.x1>x0+1e-6))return 'h7 (Sitz der Hülse)';
 return 'Freimaß ISO 2768-m';}
export function partsCsv(plan:Plan){const q=(s:string)=>/[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;return ['Menge;Teil;Hinweis',...plan.bom.map(b=>[String(b.count),q(b.what),q(b.note??'')].join(';'))].join('\r\n')+'\r\n';}
export function makingNotes(name:string,doc:ShaftDoc,plan:Plan){
 const cnc=doc.making==='cnc',lines:string[]=[`${name}`,`Welle ${n(doc.length)} mm, ${cnc?'CNC (Drehen/Fräsen)':'3D-Druck'}`,`Erzeugt mit dem Wellen-Generator. Achse = x, die Welle liegt von 0 bis ${n(doc.length)} mm.`,''];
 lines.push(cnc?'Maße im Modell sind Nennmaße. Passungen:':`Im Modell eingerechnet: ${n(doc.settings.play)} mm Spiel je Seite an Bohrungen, Kreuz-/D-/Sechskant-Zapfen um ${n(doc.settings.play)} mm kleiner, runde Sitze auf Nennmaß.`,'');
 lines.push('Abschnitte');for(const c of plan.sections)lines.push(`  ${n(c.x0).padStart(6)} bis ${n(c.x1).padStart(6)} mm  ${label(c.profile).padEnd(18)} ${({sitz:'Sitz',frei:'frei',bund:'Bund',eigen:'von Hand'})[c.role].padEnd(9)}${cnc?fitFor(plan,c.x0,c.x1,c.role):''}`);
 if(plan.inserts.length){lines.push('','Bohrungen für gesteckte Wellen');for(const i of plan.inserts)lines.push(`  von ${i.end}, ${n(i.x1-i.x0)} mm tief: ${label(i.profile)} für ${i.label}${cnc?', H7':''}`);}
 if(plan.machining.length){lines.push('','Bearbeitung');for(const m of plan.machining){const w=m.work;
  if(w.kind==='madenschraube'&&m.drill)lines.push(`  bei ${n(w.x)} mm, ${n(w.angle??0)}°: Kernloch Ø${n(m.drill)} (im Modell), Gewinde M${n(w.m)} schneiden, ${n(m.depth??0)} mm Gewinde; ${m.screw}`);
  if(w.kind==='gewinde'&&m.drill)lines.push(`  Stirnseite ${w.end}: Kernloch Ø${n(m.drill)} × ${n(w.depth)} (im Modell), Gewinde M${n(w.m)} schneiden`);
  if(w.kind==='nut'&&m.key)lines.push(`  ${n(w.x0)} bis ${n(w.x1)} mm: Passfedernut DIN 6885 A, b = ${n(m.key.b)}${cnc?' N9':''}, t1 = ${n(m.key.t1)}; Passfeder ${m.key.b} × ${m.key.h} × ${m.key.length}`);
  if(w.kind==='ring'&&m.ring)lines.push(`  bei ${n(w.x)} mm: Nut für Sicherungsring DIN 471, Ø${n(m.ring.d2)} × ${n(m.ring.m)}${cnc?' (H13)':''}`);
  if(w.kind==='abflachung')lines.push(`  ${n(w.x0)} bis ${n(w.x1)} mm: Abflachung ${n(w.depth)} mm tief`);}}
 if(plan.sleeves.length){lines.push('','Hülsen und Adapter');for(const s of plan.sleeves)lines.push(`  ${s.label}: ${n(s.x1-s.x0)} mm lang, innen ${label(s.inner)}, außen ${s.steps.map(x=>label(x.outer)).join(' / ')}, größter Ø ${n(Math.max(...s.steps.map(x=>outer(x.outer))))}`);}
 const open=plan.issues.filter(i=>i.level!=='hinweis');if(open.length){lines.push('','Offene Meldungen');for(const i of open)lines.push(`  ${i.level==='fehler'?'FEHLER':'Warnung'}: ${i.message}`);}
 const hints=plan.issues.filter(i=>i.level==='hinweis');if(hints.length){lines.push('','Hinweise');for(const i of hints)lines.push(`  ${i.message}`);}
 return lines.join('\r\n')+'\r\n';}
