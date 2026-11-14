// What goes with a gearbox's files: how to put it together, layer by layer, and the parts list.
import type {GearDoc} from './model.ts';
import type {GearPlan} from './plan.ts';

const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');
export const slug=(s:string)=>s.toLowerCase().replace(/[äöüß]/g,c=>({ä:'ae',ö:'oe',ü:'ue',ß:'ss'}[c]!)).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'welle';
export function gearCsv(p:GearPlan){const q=(s:string)=>/[;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;return ['Menge;Teil;Hinweis',...p.bom.map(b=>[String(b.count),q(b.what),q(b.note??'')].join(';'))].join('\r\n')+'\r\n';}
export function gearNotes(name:string,doc:GearDoc,p:GearPlan){
 const s=doc.settings,lines=[name,'Erzeugt mit dem Getriebe-Generator. Ebene x/y, z nach oben; die Wellen stehen senkrecht.',''];
 lines.push('Wellen');for(const x of p.shafts){const placed=doc.shafts.find(v=>v.id===x.id)!;lines.push(`  ${x.label}: bei ${n(x.at[0])} / ${n(x.at[1])} mm, von z ${n(x.z0)} bis ${n(x.z1)}${placed.flip?', umgedreht':''}${p.rates[x.id]!==undefined?`, ${n(p.rates[x.id])} U je Umdrehung des Eingangs`:''}`);}
 if(p.meshes.length||p.belts.length){lines.push('','Antrieb');for(const m of p.meshes){const a=p.wheels.find(w=>w.key===m.a)!,b=p.wheels.find(w=>w.key===m.b)!;lines.push(`  ${a.label} kämmt mit ${b.label}, Achsabstand ${n(a.pitch+b.pitch)} mm`);}for(const b of p.belts)lines.push(`  Riemen ${n(b.length)} mm${b.stock?`, Normlänge ${b.stock} mm`:''}, Achsabstand ${n(b.center)} mm`);}
 lines.push('','Schichten (je ein Plattenpaar, das die Lager einklemmt)');
 p.layers.forEach((l,i)=>{lines.push(`  Schicht ${i+1}: unten ${n(l.band[0])} bis ${n(l.split)} mm, oben ${n(l.split)} bis ${n(l.band[1])} mm; Rand ${n(l.rim)} mm, ${l.webs.length} Stege${l.holes.length?`, ${l.holes.length} Freiloch`:''}`);
  for(const k of l.bearings){const b=p.bearings.find(x=>x.key===k)!;lines.push(`    ${b.label}: Tasche Ø${n(b.D+2*s.fit)}, Bord ${n(s.lip)} mm mit Öffnung Ø${n(b.D-2*s.lipIn)}`);}});
 if(p.bolts.length){lines.push('','Zusammenbau',`  ${p.bolts.length} Bolzen M${n(s.bolt)}: ${p.bolts.map(b=>`${n(b.at[0])} / ${n(b.at[1])}`).join(', ')} mm`);
  lines.push('  1. Lager auf die Wellen (Wellen-Generator), Wellen in die untere Platte jeder Schicht stecken.','  2. Säulen auf die Bolzenlöcher, obere Platten auflegen.',`  3. ${p.screw?.what??'Schraube'} mit Scheibe von unten durch alles, Scheibe und Mutter oben, anziehen: das klemmt die Lager.`);
  for(const c of p.columns)lines.push(`  Säulen ${c.from} – ${c.to}: ${n(c.z1-c.z0)} mm lang`);}
 const open=p.issues.filter(i=>i.level!=='hinweis');if(open.length){lines.push('','Offene Meldungen');for(const i of open)lines.push(`  ${i.level==='fehler'?'FEHLER':'Warnung'}: ${i.message}`);}
 return lines.join('\r\n')+'\r\n';}
