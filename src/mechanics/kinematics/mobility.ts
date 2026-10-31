// Mobility: a Grübler count for the report and the numerical rank of the
// constraint Jacobian for the decision (KINEMATIK-KERN.md 6.3).
import type {Expanded,JointRelation} from './model.ts';
import {jointDofs} from './model.ts';

export type Mobility={grubler:number;rank:number;unknowns:number;freedom:number;redundant:number;message:string};
/** Rank of a matrix by Gaussian elimination with partial pivoting. */
export function rank(rows:number[][],tol=1e-7){
 const a=rows.map(r=>[...r]),m=a.length,n=m?a[0].length:0;let r=0;
 const scaleOf=Math.max(1e-300,...a.flat().map(Math.abs));
 for(let c=0;c<n&&r<m;c++){let p=r;for(let i=r+1;i<m;i++)if(Math.abs(a[i][c])>Math.abs(a[p][c]))p=i;if(Math.abs(a[p][c])<=tol*scaleOf)continue;[a[r],a[p]]=[a[p],a[r]];for(let i=r+1;i<m;i++){const f=a[i][c]/a[r][c];for(let k=c;k<n;k++)a[i][k]-=f*a[r][k];}r++;}
 return r;
}
export function grubler(m:Pick<Expanded,'bodies'|'joints'|'contacts'>){
 const active=m.joints.filter(j=>!j.redundant),n=m.bodies.filter(b=>!b.mirror).length;
 return 6*(n-1)-active.reduce((s,j)=>s+(6-jointDofs(j.joint)),0)-m.contacts.filter(c=>!c.redundant).length;
}
export function describeMobility(m:Pick<Expanded,'bodies'|'joints'|'contacts'>,jacobian:number[][],unknowns:number):Mobility{
 const g=grubler(m),rk=jacobian.length?rank(jacobian):0,freedom=unknowns-rk,redundant=jacobian.length-rk;
 const message=freedom===0?'Mechanismus ist bei festgehaltenem Eingang bestimmt.':freedom>0?`Mechanismus hat ${freedom} freie Bewegung(en) zu viel; ein Gelenk oder Kontakt fehlt.`:'Mechanismus ist überbestimmt.';
 return {grubler:g,rank:rk,unknowns,freedom,redundant,message};
}
export const loopJoints=(joints:JointRelation[],tree:Set<string>)=>joints.filter(j=>!j.redundant&&!tree.has(j.id));
