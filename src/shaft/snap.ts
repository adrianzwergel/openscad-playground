// Snapping on the timeline: a dragged clip lands with its start or its end on an edge nearby (shaft ends, other clips,
// section boundaries), else on the grid. Parts on the shaft never overlap: a drop on a taken place moves to the
// nearest free one.

export type Interval={x0:number;x1:number};
const best=(cands:{d:number;at:number}[])=>cands.reduce<{d:number;at:number}|undefined>((a,c)=>!a||Math.abs(c.d)<Math.abs(a.d)?c:a,undefined);
export const toGrid=(x:number,grid:number)=>grid>0?Math.round(x/grid)*grid:x;
/** A point: the nearest target within `tol`, else the grid. */
export function snapPoint(x:number,targets:number[],tol:number,grid:number){const b=best(targets.map(t=>({d:t-x,at:t})));return b&&Math.abs(b.d)<=tol?b.at:toGrid(x,grid);}
/** A clip `w` long starting at `x0`: its start or its end on the nearest target within `tol`, else its start on the
 * grid. Returns the new start. */
export function snapMove(x0:number,w:number,targets:number[],tol:number,grid:number){const b=best(targets.flatMap(t=>[{d:t-x0,at:t},{d:t-(x0+w),at:t-w}]));return b&&Math.abs(b.d)<=tol?b.at:toGrid(x0,grid);}
/** The start nearest to `x0` where a clip `w` long fits inside [0, length] without overlapping `taken`. Without
 * such a place: `x0` kept inside the shaft. */
export function freeSpot(taken:Interval[],x0:number,w:number,length:number){
 const fits=(s:number)=>s>=-1e-9&&s+w<=length+1e-9&&taken.every(t=>s+w<=t.x0+1e-9||s>=t.x1-1e-9);
 const cands=[x0,...taken.flatMap(t=>[t.x1,t.x0-w]),0,length-w].filter(fits);
 if(!cands.length)return Math.max(0,Math.min(x0,length-w));
 return cands.reduce((a,c)=>Math.abs(c-x0)<Math.abs(a-x0)?c:a);}
/** Tick spacing (mm) for `scale` px per mm: about one label every 60 px. */
export function tickStep(scale:number){for(const s of [1,2,5,10,20,50,100,200])if(s*scale>=60)return s;return 500;}
