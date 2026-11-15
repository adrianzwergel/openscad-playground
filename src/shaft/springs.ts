// Coil springs: the user's assortment (Work-it 49100, 200 pieces: tension and compression springs of spring steel) and
// what follows from a spring's size, as DIN EN 13906 computes it. The box gives only the outer Ø and the length; wire
// and coils are estimated from typical springs of such assortments until they are measured, and a rate measured with a
// weight (two lengths under two masses) beats any estimate. Lengths: a tension spring over its hooks, a compression
// spring unloaded.
export type SpringKind='zug'|'druck';
/** A spring as bought: outer Ø `D`, free length `L0`, how many in the box. */
export type SpringPart={id:string;kind:SpringKind;D:number;L0:number;count:number;source:string};
/** What was measured: wire Ø, active coils, or lengths under masses (g, mm). */
export type SpringMeasure={d?:number;n?:number;points?:{g:number;L:number}[]};
/** A spring with everything that follows: wire `d`, active coils `n`, mean coil Ø `Dm`, rate `R` (N/mm), a tension
 * spring's initial tension `F0`, the largest force and travel the wire takes (`Fmax`, `smax`), a compression spring's
 * block length `Lc` and the travel at which it buckles unguided (`sBuckle`, undefined: never). `estimated`: which numbers
 * are guesses. */
export type Spring=SpringPart&{label:string;d:number;n:number;Dm:number;R:number;F0:number;Fmax:number;smax:number;Lc?:number;sBuckle?:number;estimated:{d:boolean;n:boolean;R:boolean}};

const G=81500,E=206000,g0=9.81;
const box='Work-it 49100 (Sortiment)';
const part=(kind:SpringKind,count:number,D:number,L0:number):SpringPart=>({id:`${kind}-${String(D).replace('.',',')}x${String(L0).replace('.',',')}`,kind,D,L0,count,source:box});
/** The box, as its label lists it. */
export const springParts:SpringPart[]=[
 ...([[12,4,78],[30,4.5,44.5],[10,5,20.5],[10,5.5,27],[10,6,22],[10,7,36],[12,7,49],[8,8,23],[10,9.5,19]] as const).map(([c,D,L])=>part('zug',c,D,L)),
 ...([[10,5.5,17.5],[10,5.5,38],[10,6.5,10],[10,7,12.5],[10,7,19],[8,9,35],[6,9.5,16],[12,9.5,19]] as const).map(([c,D,L])=>part('druck',c,D,L)),
];
const mm=(x:number)=>String(+x.toFixed(2)).replace('.',',');
/** Tensile strength of patented spring wire (DIN EN 10270-1, SH) by wire Ø, roughly. */
export const strength=(d:number)=>1980*Math.pow(Math.max(.2,d),-.15);
/** Wahl's factor for the stress at the inside of the coil. */
const wahl=(w:number)=>(w+.5)/(w-.75);
/** Typical wire of such a spring: a tenth of its outer Ø, in steps of 0,05 mm. */
const wireOf=(D:number)=>Math.max(.3,Math.round(D/10/.05)*.05);
/** Least squares line F = a + b·L. */
function line(pts:{F:number;L:number}[]){const n=pts.length,mx=pts.reduce((t,p)=>t+p.L,0)/n,my=pts.reduce((t,p)=>t+p.F,0)/n,sxx=pts.reduce((t,p)=>t+(p.L-mx)**2,0),sxy=pts.reduce((t,p)=>t+(p.L-mx)*(p.F-my),0);const b=sxx>1e-9?sxy/sxx:0;return {a:my-b*mx,b};}
/** A spring with its numbers: measured where measured, else estimated. */
export function springOf(p:SpringPart,m:SpringMeasure={}):Spring{
 const d=m.d??wireOf(p.D),Dm=p.D-d,w=Dm/d,Rm=strength(d),tension=p.kind==='zug';
 // Coils: a tension spring is wound close, its two hooks about as high as the coil's inside; a compression spring has
 // a pitch of about a third of its Ø and one closed coil at each end.
 const nEst=tension?Math.max(2,(p.L0-2*(p.D-2*d))/d-1):Math.max(1.5,(p.L0-2*d)/(p.D/3)),n=m.n??nEst;
 let R=G*d**4/(8*Dm**3*n);
 // Initial tension of a close wound spring: a shear stress of the order of 60 N/mm² in the wire, less for slender coils.
 let F0=tension?Math.PI*d**3*Math.max(20,Math.min(120,250-25*w))/(8*Dm):0;
 const pts=(m.points??[]).filter(q=>q.g>0&&q.L>0).map(q=>({F:q.g/1000*g0,L:q.L}));
 if(pts.length>=2&&tension){const f=line(pts);if(f.b>0){R=f.b;F0=Math.max(0,f.a+f.b*p.L0);}}
 else if(pts.length){// One point (or a compression spring): the rate through the free length, with the initial tension as estimated.
  const r=pts.map(q=>tension?(q.F-F0)/(q.L-p.L0):q.F/(p.L0-q.L)).filter(v=>Number.isFinite(v)&&v>0);if(r.length)R=r.reduce((t,v)=>t+v,0)/r.length;}
 const tau=(tension?.45:.5)*Rm,Fmax=tau*Math.PI*d**3/(8*Dm*wahl(w));
 const Lc=tension?undefined:(n+2)*d,smax=tension?Math.max(0,(Fmax-F0)/R):Math.min(Fmax/R,p.L0-Lc!);
 // Buckling of a compression spring with both ends on parallel faces (ν = 0,5), DIN EN 13906-1.
 let sBuckle:number|undefined;if(!tension){const a=(1-G/E)/(.5+G/E)*(Math.PI*Dm/(.5*p.L0))**2;if(a<1)sBuckle=p.L0*.5/(1-G/E)*(1-Math.sqrt(1-a));if(sBuckle!==undefined&&sBuckle>=smax)sBuckle=undefined;}
 return {...p,label:`${tension?'Zugfeder':'Druckfeder'} ${mm(p.D)} × ${mm(p.L0)}`,d,n,Dm,R,F0,Fmax:tension?F0+R*smax:R*smax,smax,...(Lc!==undefined?{Lc}:{}),...(sBuckle!==undefined?{sBuckle}:{}),estimated:{d:m.d===undefined,n:m.n===undefined,R:!pts.length}};}
/** Force at a length (tension: over the hooks; compression: between its faces). A slack tension spring pulls 0. */
export function forceAt(s:Spring,L:number){if(s.kind==='zug')return L<s.L0-1e-9?0:s.F0+s.R*(L-s.L0);return L>s.L0?0:s.R*(s.L0-L);}
export type SpringCatalog=Record<string,Spring>;
export const springCatalog=(measures:Record<string,SpringMeasure>={}):SpringCatalog=>Object.fromEntries(springParts.map(p=>[p.id,springOf(p,measures[p.id])]));
export function parseMeasures(raw:unknown):Record<string,SpringMeasure>{const out:Record<string,SpringMeasure>={};if(!raw||typeof raw!=='object')return out;
 const ok=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>lo&&v<hi;
 for(const [k,v] of Object.entries(raw as Record<string,SpringMeasure>)){if(!springParts.some(p=>p.id===k)||!v||typeof v!=='object')continue;const m:SpringMeasure={};if(ok(v.d,.05,5))m.d=v.d;if(ok(v.n,.5,500))m.n=v.n;
  if(Array.isArray(v.points))m.points=v.points.filter(q=>ok(q?.g,0,1e5)&&ok(q?.L,0,1e4)).slice(0,6).map(q=>({g:q.g,L:q.L}));if(Object.keys(m).length)out[k]=m;}return out;}
