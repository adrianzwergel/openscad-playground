import type {Terminal} from './contracts.ts';
import type {Frame} from './frames.ts';
import {add,scale,norm,cross,axis,rotationError} from './frames.ts';

/** Position is a radial distance (not a separate +/- box on each coordinate).
 * A frame constrains full orientation; an axis only constrains its direction. */
export function terminalDeviation(actual:Frame,terminal:Terminal){
 const delta=add(actual.position,scale(terminal.target.position,-1));
 const position=terminal.constraint==='frame'?norm(delta):norm(cross(delta,axis(terminal.target)));
 const angle=terminal.constraint==='frame'?rotationError(actual.rotation,terminal.target.rotation):Math.acos(Math.max(-1,Math.min(1,axis(actual).reduce((s,n,i)=>s+n*axis(terminal.target)[i],0))))*180/Math.PI;
 return {position,angle,positionLimit:terminal.tolerance?.position??0,angleLimit:terminal.tolerance?.angle??0};
}
