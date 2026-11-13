// Profiles: the cross-section of a shaft piece (male) and of a bore (female), in one format. A part slides over a piece
// when the piece fits through its bore; it sits on a piece of exactly its own profile. All measures nominal (mm), fits
// come later from the way the part is made.

export type Profile=
 |{kind:'rund';d:number}
 /** A round shaft with one flat, `flat` deep (NEMA motors: 5 mm, 0.5 deep). */
 |{kind:'d';d:number;flat:number}
 /** The LEGO axle: 4.8 across, arms 1.8 wide. */
 |{kind:'kreuz'}
 /** Across flats. */
 |{kind:'sechskant';sw:number};

export const LEGO_ACROSS=4.8,LEGO_ARM=1.8;
const eps=1e-6;
export const rund=(d:number):Profile=>({kind:'rund',d});

/** The circle round the profile (mm): what a bore must at least have to let it through when turned anyhow. */
export function outer(p:Profile){switch(p.kind){case 'rund':case 'd':return p.d;case 'kreuz':return LEGO_ACROSS;case 'sechskant':return p.sw/Math.cos(Math.PI/6);}}
/** The circle inside the profile about its centre (mm): what passes a bore of this profile, and the core a hole in a
 * piece of this profile leaves wall to. */
export function inner(p:Profile){switch(p.kind){case 'rund':return p.d;case 'd':return p.d-2*p.flat;case 'kreuz':return LEGO_ARM;case 'sechskant':return p.sw;}}
/** Cross-section area (mm²), to tell the stronger of two pieces. */
export function area(p:Profile){switch(p.kind){case 'rund':return Math.PI*p.d**2/4;case 'd':{const r=p.d/2,h=r-p.flat,a=Math.acos(h/r);return Math.PI*r*r-(r*r*a-h*Math.sqrt(r*r-h*h));}case 'kreuz':return 2*LEGO_ACROSS*LEGO_ARM-LEGO_ARM**2;case 'sechskant':return Math.sqrt(3)/2*p.sw**2;}}
export function same(a:Profile,b:Profile){if(a.kind!==b.kind)return false;switch(a.kind){case 'rund':return Math.abs(a.d-(b as typeof a).d)<eps;case 'd':return Math.abs(a.d-(b as typeof a).d)<eps&&Math.abs(a.flat-(b as typeof a).flat)<eps;case 'kreuz':return true;case 'sechskant':return Math.abs(a.sw-(b as typeof a).sw)<eps;}}
/** Does a piece of profile `piece` go through a bore of profile `bore`? Its own shape always; a D through a D of the same
 * size with less flat; a hexagon through a larger one; anything whose outer circle fits the bore's inner one. */
export function passes(piece:Profile,bore:Profile){
 if(same(piece,bore))return true;
 if(piece.kind==='d'&&bore.kind==='d'&&piece.d<=bore.d+eps&&piece.flat>=bore.flat-eps)return true;
 if(piece.kind==='sechskant'&&bore.kind==='sechskant'&&piece.sw<=bore.sw+eps)return true;
 return outer(piece)<=inner(bore)+eps;}
/** The strongest profile that goes through all these bores: one of them, or the round in the smallest of their inner
 * circles. Undefined without bores (nothing limits the piece). */
export function largestPassing(bores:Profile[]):Profile|undefined{
 if(!bores.length)return undefined;
 const fits=(p:Profile)=>bores.every(b=>passes(p,b)),round=rund(Math.min(...bores.map(inner)));
 return [...bores,round].filter(fits).sort((a,b)=>area(b)-area(a))[0];}
export function label(p:Profile){const n=(x:number)=>String(+x.toFixed(2)).replace('.',',');switch(p.kind){case 'rund':return `Ø${n(p.d)}`;case 'd':return `D${n(p.d)} (${n(p.flat)} flach)`;case 'kreuz':return 'LEGO-Kreuz';case 'sechskant':return `SW${n(p.sw)}`;}}
export function parseProfile(p:unknown):Profile{const x=p as Profile,pos=(v:unknown)=>typeof v==='number'&&v>0&&v<500;
 if(x&&x.kind==='rund'&&pos(x.d))return {kind:'rund',d:x.d};
 if(x&&x.kind==='d'&&pos(x.d)&&pos(x.flat)&&x.flat<x.d/2)return {kind:'d',d:x.d,flat:x.flat};
 if(x&&x.kind==='kreuz')return {kind:'kreuz'};
 if(x&&x.kind==='sechskant'&&pos(x.sw))return {kind:'sechskant',sw:x.sw};
 throw Error('Profil ungültig');}
