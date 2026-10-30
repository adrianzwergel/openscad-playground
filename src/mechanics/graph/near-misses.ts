import type {Mechanism} from './contracts.ts';
import {resolveMechanism} from './model.ts';
import {assessConstruction} from './construction.ts';
import {compose} from './frames.ts';
import {terminalDeviation} from './terminals.ts';

export type NearMiss={graph:Mechanism;deviation:ReturnType<typeof terminalDeviation>;score:number};
/** Only the output target may fail. A collision or broken mate is never a near miss. */
export function assessNearMiss(graph:Mechanism):NearMiss|undefined{
 const resolved=resolveMechanism(graph),failures=resolved.checks.filter(c=>c.state==='fail');
 if(!failures.length||failures.some(c=>c.id!=='output/terminal'))return;
 const built=assessConstruction(graph);if(!built.valid)return;
 const deviation=terminalDeviation(compose(built.graph.bodies.find(b=>b.id===graph.output.body)!.frame,graph.output.local),graph.output);
 // Rank excess over the user's tolerance. Angular error is arc length at 30 mm.
 const score=Math.hypot(Math.max(0,deviation.position-deviation.positionLimit),30*Math.max(0,deviation.angle-deviation.angleLimit)*Math.PI/180);
 return {graph:built.graph,deviation,score};
}
/** Rendering-only copy, never a project/adoption candidate. */
export function nearMissPreviewGraph(graph:Mechanism){
 if(!assessNearMiss(graph))throw Error('Kein sicherer Ziel-Nichttreffer');
 const copy=structuredClone(graph);copy.output.target=compose(copy.bodies.find(b=>b.id===copy.output.body)!.frame,copy.output.local);return copy;
}
