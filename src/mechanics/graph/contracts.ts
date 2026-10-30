import type {Frame,V} from './frames.ts';
export type Motion='rotation'|'translation';
export type Binding='fixed'|'free'|'sliding';
export type Params=Record<string,number>;
export type Body={id:string;kind:'shaft'|'rigid';motion?:Motion|'fixed';frame:Frame;shaft?:{diameter:number;start:number;end:number}};
export type Element={id:string;family:string;body:string;binding?:Binding;rotorGroup?:string;pose:Frame;phase:number;params:Params};
export type Relation={id:string;rule:string;elements:string[];params:Params};
export type Terminal={body:string;local:Frame;target:Frame;constraint:'frame'|'axis';tolerance?:{position:number;angle:number};motion?:Motion;stroke?:number;element?:string};
export type Region={id:string;frame:Frame;size:V};
export type Environment={bounds?:Region;obstacles:Region[];margin:number};
export type Mechanism={version:1|2|3|4;environment?:Environment;registryVersion:string;bodies:Body[];elements:Element[];relations:Relation[];input:Terminal;output:Terminal};
export type Check={id:string;state:'pass'|'fail'|'unknown';message:string};
export type PairContext={elements:Element[];frames:Frame[];params:Params};
export type Envelope={radius:number;min:number;max:number;transverse?:[number,number]};
export interface ElementFamily {id:string;carrier:'shaft'|'any';compoundRotor?:boolean;motion?:Motion;support?:'rear';pairDependent?:boolean;bore?:(e:Element)=>number;validate:(p:Params)=>void;envelope:(e:Element,c?:PairContext)=>Envelope;scad:(e:Element,c?:PairContext)=>string;}
export type PairChoice={elements:{family:string;params:Params}[];params:Params};
// Open-chain search providers expose one directed transfer from element 0 to 1.
// phase() returns the driven element phase; variables only change relation params.
/** changesAxis=false promises parallel carrier frames for generated catalog pairs; undefined is unknown. */
export type SearchProvider={changesAxis?:boolean;sharedRotor?:boolean;catalog:(request?:{stroke?:number})=>PairChoice[];variables:{key:string;lo:number;hi:number}[];phase:(c:PairContext)=>number};
export type ReservedSpace={frame:Frame;half:[number,number,number];exempt:{kind:'rotor'|'shaft';id:string}[]};
export type Residual={id:string;value:number;unit:'mm'|'deg'|'ratio'|'unitless';sense:'eq'|'gte'|'lte';tolerance:number};
export interface RelationRule {id:string;category:'transmission'|'joint'|'loop';arity:number;dofs:number;motion?:[Motion,Motion];search?:SearchProvider;contactShafts?:(c:PairContext)=>{element:string;body:string}[];bearingSpans?:(c:PairContext)=>{body:string;min:number;max:number}[];sweeps?:(c:PairContext)=>{body:string;direction:V;min:number;max:number}[];spaces?:(c:PairContext)=>ReservedSpace[];scad?:(c:PairContext)=>string;validate:(c:PairContext)=>void;evaluate:(c:PairContext)=>Check[];residuals?:(c:PairContext)=>Residual[];transfers?:(c:PairContext)=>{from:number;to:number;gain:number}[];mateFrames?:(c:PairContext)=>Frame[];}
// Extensions are registered by application code, never executed from imported project files.
export class Registry {
 readonly families=new Map<string,ElementFamily>();readonly rules=new Map<string,RelationRule>();
 readonly version:string;
 constructor(version:string){this.version=version;}
 family(f:ElementFamily){if(this.families.has(f.id))throw Error('Doppelte Familie: '+f.id);this.families.set(f.id,f);return this;}
 rule(r:RelationRule){if(this.rules.has(r.id)||r.arity<2||!Number.isInteger(r.arity))throw Error('Ungültige Regel: '+r.id);this.rules.set(r.id,r);return this;}
 getFamily(id:string){const f=this.families.get(id);if(!f)throw Error('Nicht unterstützte Elementfamilie: '+id);return f;}
 getRule(id:string){const r=this.rules.get(id);if(!r)throw Error('Nicht unterstützte Paarungsregel: '+id);return r;}
}
