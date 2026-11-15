// The printed strut (Federbein) with a compression spring of the assortment: its sizes follow from spring and points;
// at block the rod stays clear of the tube's bottom, at the free spring it keeps its guide; in a linkage (a swing arm on
// an axis, the strut from the chassis to the arm) its length, the spring's length and its force over the arm's range,
// the parts list, the two printed parts; too short, too much preload and a tension spring are said.
import assert from 'node:assert/strict';
import {strutOf,strutAt,strutShortest,strutSolids,STRUT} from '../../src/mechanics/parts/strut.ts';
import {sweep,linkageIssues,linkageShopping,parseLinkage,strutOfLink} from '../../src/mechanics/parts/linkage.ts';
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e,spec={spring:'druck-9,5x19',preload:2},reach=10,E=strutShortest(spec,reach)+5,s=strutOf(spec,E,reach);
assert.deepEqual(s.issues,[]);assert.ok(near(s.Ls,s.spring.L0-2));assert.ok(s.rod>=3.5&&s.rod<s.spring.D-2*s.spring.d-.5,`Stange Ø ${s.rod} passt in die Feder`);assert.ok(s.tube>=s.spring.D,'die Feder sitzt auf dem Rohr');
// At block: the spring 0,5 mm above it, the rod's end above the tube's tapped bottom; free: the guide still in the tube.
const atBlock=strutAt(s,s.Emin);assert.ok(near(atBlock.Ls,s.spring.Lc+STRUT.block)&&!atBlock.block);assert.ok(strutAt(s,s.Emin-1).block);
const rodEnd=(L)=>L-reach-STRUT.head-s.rodLen;assert.ok(rodEnd(s.Emin)>=reach+STRUT.tapDepth+1-1e-6,'Stange frei vom Gewinde unten');assert.ok(near(reach+s.tubeLen-rodEnd(s.Emax),s.guide),'Führung bei freier Feder');
assert.ok(strutAt(s,s.Emax+1).loose&&!strutAt(s,s.Emax).loose);assert.ok(near(strutAt(s,E-3).F,s.spring.R*(s.spring.L0-s.Ls+3)));
// Said: too short, preload to block, a tension spring.
assert.ok(strutOf(spec,E-10,reach).issues.some(m=>/braucht mindestens/.test(m)));assert.ok(strutOf({...spec,preload:30},E,reach).issues.some(m=>/auf Block/.test(m)));assert.ok(strutOf({spring:'zug-7x36',preload:0},E,reach).issues.some(m=>/Druckfeder/.test(m)));
// The printed parts: tube with the lower tap and the bore, rod with head and the upper tap.
const tube=strutSolids(s,'rohr'),rod=strutSolids(s,'stange');assert.equal(tube.solids.length,1);assert.equal(tube.holes.length,2);assert.equal(rod.solids.length,2);assert.ok(near(rod.solids[0].z1,E-reach));
// In a linkage: an arm turning about x, the strut from the chassis up to a point 40 mm out on the arm.
const g=parseLinkage({links:[{id:'arm',label:'Schwinge',kind:'lenker',d:6,points:[{id:'achse',kind:'dreh',at:[-5,0,0],to:[5,0,0],body:''}],input:{point:'achse',min:-10,max:10}},
 {id:'fb',label:'Federbein',kind:'feder',part:'daempfer-65',strut:spec,points:[{id:'unten',kind:'kugel',at:[0,40,-E],body:''},{id:'oben',kind:'kugel',at:[0,40,0],body:'lenker:arm'}]}]});
assert.deepEqual(linkageIssues(g).map(i=>i.message),[]);assert.equal(strutOfLink(g.links[1]).E,E);
const rows=sweep(g,{now:{},rest:{}},11),d=rows.map(r=>r.reading.dampers[0]);assert.ok(d.every(x=>x.fits&&x.spring!==undefined),'über den ganzen Weg im Hub');
const F=d.map(x=>x.force),span=Math.max(...d.map(x=>x.length))-Math.min(...d.map(x=>x.length));assert.ok(span>10,`Weg ${span}`);for(const x of d)assert.ok(near(x.force,s.spring.R*Math.max(0,s.spring.L0-x.spring),1e-9),'Kraft aus der Federlänge');assert.ok(d.some(x=>x.force===0)&&Math.max(...F)>s.spring.R*8,'ausgefedert frei, eingefedert gespannt');
const shop=linkageShopping(g).map(x=>x.label).join(' | ');assert.match(shop,/Druckfeder 9,5 × 19/);assert.match(shop,/Federbein gedruckt/);assert.match(shop,/Kugelpfanne 5,8 mm/);assert.doesNotMatch(shop,/Öldämpfer/);
console.log(`Federbein: ${s.spring.label}, ${E.toFixed(1)} mm Kugel zu Kugel, Rohr Ø ${s.tube} × ${s.tubeLen.toFixed(1)}, Stange Ø ${s.rod}; ${s.Emin.toFixed(1)}–${s.Emax.toFixed(1)} mm; an der Schwinge ${span.toFixed(1)} mm Weg, ${Math.min(...F).toFixed(1)}–${Math.max(...F).toFixed(1)} N; Stückliste und zwei Druckteile.`);
