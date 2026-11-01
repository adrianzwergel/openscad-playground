// Second solver of the structure core (LAGER-UND-STRUKTUR.md, B5): density
// topology optimisation (SIMP) on a voxel grid, for the same anchors, loads and
// keep-out as the frame solver. 8-node hexahedra, matrix-free conjugate
// gradients with a Jacobi preconditioner (warm started), density filter,
// optimality criteria at a given volume, and optionally Langelaar's
// additive-manufacturing filter: printed in +z, every element must rest on
// material in the layer below within 45°. The surface at density 0.5 is meshed
// with the anchors' bosses and holes, clipped by the keep-out field.
import type {V} from './vec.ts';
import {norm} from './vec.ts';
import type {Anchor} from './generate.ts';
import {featureGeometry} from './features.ts';
import {Scene,PrimIndex,primDistance,primBounds} from './sdf.ts';
import {surfaceNets,largestPart,inspect} from './mesh.ts';
import type {Mesh} from './mesh.ts';
import {PLA} from './truss.ts';

export type SimpSpec={id:string;anchors:Anchor[];clearance:(p:V)=>number;load?:number;
 /** Element edge (mm), margin around the anchors (mm), iterations. `volume`: share of the free design domain, or
 * `material`: volume of material in mm³ (the anchors' solid elements included), e.g. to match another solver's mass. */
 voxel?:number;margin?:number;volume?:number;material?:number;iterations?:number;overhang?:boolean;resolution?:number};
/** `density`: printed density per element (i fastest, then j, then k = layers in +z) on `grid`. */
export type SimpResult={id:string;mesh:Mesh;density:Float64Array;grid:{nx:number;ny:number;nz:number;h:number;lo:V};mass:number;volume:number;compliance:number;deflection:number;closed:boolean;elements:number;iterations:number;seconds:number;history:number[]};

/** Stiffness of a unit 8-node brick (E = 1, ν), 2×2×2 Gauss points; scales with the edge length h (K = E·h·k). */
export function brick(nu:number){
 const k=new Float64Array(576),corner=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],g=1/Math.sqrt(3);
 const lam=nu/((1+nu)*(1-2*nu)),mu=1/(2*(1+nu)),D=[[lam+2*mu,lam,lam,0,0,0],[lam,lam+2*mu,lam,0,0,0],[lam,lam,lam+2*mu,0,0,0],[0,0,0,mu,0,0],[0,0,0,0,mu,0],[0,0,0,0,0,mu]];
 for(const a of [-g,g])for(const b of [-g,g])for(const c of [-g,g]){
  // Shape function derivatives on the cube [0,1]³ (Jacobian 1/2 per axis from [-1,1]).
  const dN=corner.map(([x,y,z])=>[x*(1+y*b)*(1+z*c)/8*2,y*(1+x*a)*(1+z*c)/8*2,z*(1+x*a)*(1+y*b)/8*2]);
  const B=Array.from({length:6},()=>new Float64Array(24));
  dN.forEach(([dx,dy,dz],n)=>{B[0][3*n]=dx;B[1][3*n+1]=dy;B[2][3*n+2]=dz;B[3][3*n]=dy;B[3][3*n+1]=dx;B[4][3*n+1]=dz;B[4][3*n+2]=dy;B[5][3*n]=dz;B[5][3*n+2]=dx;});
  const DB=D.map(row=>{const r=new Float64Array(24);for(let j=0;j<24;j++){let s=0;for(let m=0;m<6;m++)s+=row[m]*B[m][j];r[j]=s;}return r;});
  // Weight 1 per Gauss point times det J = 1/8 on the unit cube.
  for(let i=0;i<24;i++)for(let j=0;j<24;j++){let s=0;for(let m=0;m<6;m++)s+=B[m][i]*DB[m][j];k[i*24+j]+=s/8;}}
 return k;
}

export function simpStructure(spec:SimpSpec,progress?:(stage:string,f:number)=>void):SimpResult{
 const t0=performance.now(),h=spec.voxel??6,margin=spec.margin??25,load=spec.load??20,E0=PLA.E,Emin=E0*1e-9,p=3,iterations=spec.iterations??40;
 const geo=spec.anchors.map(a=>featureGeometry(a.feature,a.frame)),bosses=new PrimIndex(12,12),holes=new PrimIndex(12,12),keep=new PrimIndex(12,40);
 geo.forEach(g=>{g.solids.forEach(x=>bosses.add(x));g.holes.forEach(x=>holes.add(x));g.keep.forEach(x=>keep.add(x));});
 const pts=spec.anchors.map(a=>a.frame.position),lo=[0,1,2].map(i=>Math.min(...pts.map(q=>q[i]))-margin) as V,hi=[0,1,2].map(i=>Math.max(...pts.map(q=>q[i]))+margin) as V;
 // Printed in +z the bed is the underside of the supports: the grid starts there (nothing is printed below it).
 if(spec.overhang){const bed=Math.min(...spec.anchors.flatMap((a,k)=>a.role==='support'?geo[k].solids.map(x=>primBounds(x).min[2]):[]));if(Number.isFinite(bed))lo[2]=bed;}
 const nx=Math.ceil((hi[0]-lo[0])/h),ny=Math.ceil((hi[1]-lo[1])/h),nz=Math.ceil((hi[2]-lo[2])/h),ne=nx*ny*nz,nn=(nx+1)*(ny+1)*(nz+1),nd=3*nn;
 const node=(i:number,j:number,k:number)=>i+(nx+1)*(j+(ny+1)*k),centre=(e:number):V=>{const i=e%nx,j=Math.floor(e/nx)%ny,k=Math.floor(e/(nx*ny));return [lo[0]+(i+.5)*h,lo[1]+(j+.5)*h,lo[2]+(k+.5)*h];};
 const conn=new Int32Array(ne*8);for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const e=i+nx*(j+ny*k),c=[node(i,j,k),node(i+1,j,k),node(i+1,j+1,k),node(i,j+1,k),node(i,j,k+1),node(i+1,j,k+1),node(i+1,j+1,k+1),node(i,j+1,k+1)];conn.set(c,e*8);}
 // Passive elements: anchor bosses are solid; keep-out, holes and keep zones are void.
 const passive=new Int8Array(ne);for(let e=0;e<ne;e++){const c=centre(e);if(bosses.distance(c)<0)passive[e]=1;else if(spec.clearance(c)<h/2||holes.distance(c)<0||keep.distance(c)<0)passive[e]=-1;}
 // Supports: nodes in support bosses are fixed. Loads: per case, each loaded anchor's force over the nodes in its boss.
 // An anchor's elements (centre within half an element of its boss) are solid; its nodes take its load or support
 // (nodes in a bore would carry a force with nothing around them).
 const inAnchor=(a:number)=>{const g=geo[a],out=new Set<number>();for(let e=0;e<ne;e++){if(Math.min(...g.solids.map(s=>primDistance(centre(e),s)))>h*.5)continue;passive[e]=1;for(let c=0;c<8;c++)out.add(conn[e*8+c]);}return [...out];};
 const fixed=new Uint8Array(nd);spec.anchors.forEach((a,k)=>{if(a.role==='support')for(const n of inAnchor(k))fixed.fill(1,3*n,3*n+3);});
 const loaded=spec.anchors.map((a,k)=>({a,nodes:a.role==='load'&&(a.load??load)>0?inAnchor(k):[]})).filter(x=>x.nodes.length);
 if(!fixed.some(x=>x))throw Error(`${spec.id}: kein Auflager im Gitter.`);
 const cases:Float64Array[]=[0,1,2].map(dir=>{const f=new Float64Array(nd);for(const {a,nodes} of loaded){const F=(a.load??load)/nodes.length;for(const n of nodes)f[3*n+dir]+=F;}return f;});
 // ---- density filter (radius 1.5 h) ----
 const rf=1.5,nb:number[][]=[],wsum=new Float64Array(ne);
 for(let e=0;e<ne;e++){const i=e%nx,j=Math.floor(e/nx)%ny,k=Math.floor(e/(nx*ny)),l:number[]=[];for(let dk=-1;dk<=1;dk++)for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const a=i+di,b=j+dj,c=k+dk;if(a<0||b<0||c<0||a>=nx||b>=ny||c>=nz)continue;const w=rf-Math.hypot(di,dj,dk);if(w>0){l.push(a+nx*(b+ny*c),w);wsum[e]+=w;}}nb.push(l);}
 const filter=(x:Float64Array)=>{const y=new Float64Array(ne);for(let e=0;e<ne;e++){let s=0;const l=nb[e];for(let q=0;q<l.length;q+=2)s+=l[q+1]*x[l[q]];y[e]=s/wsum[e];}return y;};
 const filterT=(g:Float64Array)=>{const y=new Float64Array(ne);for(let e=0;e<ne;e++){const l=nb[e],v=g[e]/wsum[e];for(let q=0;q<l.length;q+=2)y[l[q]]+=l[q+1]*v;}return y;};
 // ---- Langelaar's AM filter, build direction +z: ξ = smin(ρ̃, smax(ξ of the 5 supporting elements below)) ----
 const P=40,xi0=.5,eps=1e-4,layer=nx*ny;
 const support=(e:number)=>{const i=e%nx,j=Math.floor(e/nx)%ny,b=e-layer,out=[b];if(i>0)out.push(b-1);if(i<nx-1)out.push(b+1);if(j>0)out.push(b-nx);if(j<ny-1)out.push(b+nx);return out;};
 const smin=(a:number,b:number)=>.5*(a+b-Math.sqrt((a-b)**2+eps)+Math.sqrt(eps)),dsmin=(a:number,b:number)=>{const r=Math.sqrt((a-b)**2+eps);return [.5*(1-(a-b)/r),.5*(1+(a-b)/r)];};
 // Fixed elements (anchors solid, keep-out void) take their value right away: they carry what is printed above them.
 const fix=(xi:Float64Array,e:number)=>{if(passive[e])xi[e]=passive[e]===1?1:0;};
 const am=(rt:Float64Array)=>{const xi=new Float64Array(rt),S=new Float64Array(ne);if(!spec.overhang){for(let e=0;e<ne;e++)fix(xi,e);return {xi,S};}
  for(let e=0;e<layer;e++)fix(xi,e);
  for(let e=layer;e<ne;e++){const s=support(e),Q=P+Math.log(s.length)/Math.log(xi0);let sum=0;for(const q of s)sum+=xi[q]**P;S[e]=sum**(1/Q);xi[e]=smin(rt[e],S[e]);fix(xi,e);}return {xi,S};};
 const amT=(rt:Float64Array,xi:Float64Array,S:Float64Array,g:Float64Array)=>{if(!spec.overhang)return new Float64Array(g);const lam=new Float64Array(g),out=new Float64Array(ne);
  for(let e=ne-1;e>=layer;e--){if(passive[e])continue;const s=support(e),Q=P+Math.log(s.length)/Math.log(xi0),[da,db]=dsmin(rt[e],S[e]);out[e]=lam[e]*da;
   // ∂S/∂ξq = (P/Q)·S·(ξq^P/Σ)/ξq: bounded factors (Σ^(1/Q−1) itself overflows for tiny Σ).
   let sum=0;for(const q of s)sum+=xi[q]**P;if(!(sum>0))continue;for(const q of s)if(xi[q]>0)lam[q]+=lam[e]*db*(P/Q)*S[e]*(xi[q]**P/sum)/xi[q];}
  for(let e=0;e<layer;e++)out[e]=passive[e]?0:lam[e];return out;};
 // ---- stiffness: K u = f, matrix-free ----
 const KE=brick(.35),scaleK=h;
 const apply=(Ee:Float64Array,u:Float64Array,out:Float64Array)=>{out.fill(0);const ue=new Float64Array(24);
  // Elements with almost no material add nothing that matters (no loads act there): left out, a third of the work.
  for(let e=0;e<ne;e++){const w=Ee[e];if(w<E0*1e-6)continue;for(let a=0;a<8;a++){const n=conn[e*8+a]*3;ue[3*a]=u[n];ue[3*a+1]=u[n+1];ue[3*a+2]=u[n+2];}
   for(let r=0;r<24;r++){let s=0;const row=r*24;for(let c=0;c<24;c++)s+=KE[row+c]*ue[c];const n=conn[e*8+(r/3|0)]*3+r%3;out[n]+=w*scaleK*s;}}
  for(let d=0;d<nd;d++)if(fixed[d])out[d]=u[d];};
 const diagonal=(Ee:Float64Array)=>{const dg=new Float64Array(nd);for(let e=0;e<ne;e++)if(Ee[e]>=E0*1e-6)for(let r=0;r<24;r++)dg[conn[e*8+(r/3|0)]*3+r%3]+=Ee[e]*scaleK*KE[r*25];for(let d=0;d<nd;d++)if(fixed[d]||dg[d]<=0)dg[d]=1;return dg;};
 const solve=(Ee:Float64Array,f:Float64Array,u:Float64Array)=>{const dg=diagonal(Ee),r=new Float64Array(nd),z=new Float64Array(nd),q=new Float64Array(nd),Ap=new Float64Array(nd);
  for(let d=0;d<nd;d++)if(fixed[d])u[d]=0;apply(Ee,u,Ap);let fn=0;for(let d=0;d<nd;d++){r[d]=fixed[d]?0:f[d]-Ap[d];fn+=f[d]*f[d];}fn=Math.sqrt(fn)||1;
  for(let d=0;d<nd;d++)z[d]=r[d]/dg[d];q.set(z);let rz=0;for(let d=0;d<nd;d++)rz+=r[d]*z[d];
  for(let it=0;it<800;it++){apply(Ee,q,Ap);for(let d=0;d<nd;d++)if(fixed[d])Ap[d]=0;let qAq=0;for(let d=0;d<nd;d++)qAq+=q[d]*Ap[d];const alpha=rz/qAq;let rn=0;
   for(let d=0;d<nd;d++){u[d]+=alpha*q[d];r[d]-=alpha*Ap[d];rn+=r[d]*r[d];}if(Math.sqrt(rn)/fn<1e-3)break;
   for(let d=0;d<nd;d++)z[d]=r[d]/dg[d];let rz2=0;for(let d=0;d<nd;d++)rz2+=r[d]*z[d];const beta=rz2/rz;rz=rz2;for(let d=0;d<nd;d++)q[d]=z[d]+beta*q[d];}};
 // ---- optimisation ----
 const free=[...passive].map((x,e)=>x===0?e:-1).filter(e=>e>=0),solids=[...passive].filter(x=>x===1).length;
 const target=spec.material!==undefined?Math.max(.01*free.length,spec.material/h**3-solids):(spec.volume??.1)*free.length,share=target/free.length;
 let x=new Float64Array(ne);for(let e=0;e<ne;e++)x[e]=passive[e]===1?1:passive[e]===-1?0:share;
 const us=cases.map(()=>new Float64Array(nd)),history:number[]=[];let compliance=0,it=0,phys=x;
 const physical=(xd:Float64Array)=>{const rt=filter(xd);const {xi,S}=am(rt);return {rt,xi,S};};
 for(;it<iterations;it++){progress?.('Dichte',it/iterations);
  const {rt,xi,S}=physical(x);phys=xi;const Ee=new Float64Array(ne);for(let e=0;e<ne;e++)Ee[e]=Emin+xi[e]**p*(E0-Emin);
  const dc=new Float64Array(ne);compliance=0;const ue=new Float64Array(24);
  cases.forEach((f,ci)=>{solve(Ee,f,us[ci]);const u=us[ci];for(let d=0;d<nd;d++)compliance+=f[d]*u[d];
   for(let e=0;e<ne;e++){for(let a=0;a<8;a++){const n=conn[e*8+a]*3;ue[3*a]=u[n];ue[3*a+1]=u[n+1];ue[3*a+2]=u[n+2];}let s=0;for(let r=0;r<24;r++){let t=0;for(let c=0;c<24;c++)t+=KE[r*24+c]*ue[c];s+=ue[r]*t;}dc[e]-=p*xi[e]**(p-1)*(E0-Emin)*scaleK*s;}});
  for(let e=0;e<ne;e++)if(passive[e])dc[e]=0;
  history.push(compliance);
  const dcx=filterT(amT(rt,xi,S,dc)),dvx=filterT(amT(rt,xi,S,new Float64Array(ne).map((_,e)=>passive[e]?0:1)));
  // Optimality criteria with a move limit; bisection on the volume of the printed (physical) densities.
  let l1=1e-12,l2=1e12;const next=new Float64Array(ne),move=.2;
  while(l2/l1>1+1e-4){const lm=Math.sqrt(l1*l2);for(const e of free){const b=Math.max(1e-12,-dcx[e]/Math.max(1e-12,dvx[e])/lm),v=x[e]*Math.sqrt(b);next[e]=Math.max(0,Math.max(x[e]-move,Math.min(1,Math.min(x[e]+move,v))));}
   for(let e=0;e<ne;e++)if(passive[e])next[e]=passive[e]===1?1:0;const xi2=physical(next).xi;let vol=0;for(const e of free)vol+=xi2[e];if(vol>target)l1=lm;else l2=lm;}
  const change=Math.max(...free.map(e=>Math.abs(next[e]-x[e])));x=next;if(it>8&&change<.01)break;}
 // Deflection: largest mean displacement of a loaded anchor's nodes over the cases.
 let deflection=0;for(const u of us)for(const {nodes} of loaded){let m:V=[0,0,0];for(const n of nodes)m=[m[0]+u[3*n],m[1]+u[3*n+1],m[2]+u[3*n+2]];deflection=Math.max(deflection,norm(m)/nodes.length);}
 // ---- surface: trilinear density at 0.5, with the anchors' bosses and holes, clipped by the keep-out field ----
 progress?.('Geometrie',.9);
 const rho=(q:V)=>{const fx=(q[0]-lo[0])/h-.5,fy=(q[1]-lo[1])/h-.5,fz=(q[2]-lo[2])/h-.5,i=Math.floor(fx),j=Math.floor(fy),k=Math.floor(fz),a=fx-i,b=fy-j,c=fz-k;let s=0;
  for(let dk=0;dk<2;dk++)for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++){const ii=Math.min(nx-1,Math.max(0,i+di)),jj=Math.min(ny-1,Math.max(0,j+dj)),kk=Math.min(nz-1,Math.max(0,k+dk));s+=(di?a:1-a)*(dj?b:1-b)*(dk?c:1-c)*phys[ii+nx*(jj+ny*kk)];}return s;};
 const scene=new Scene(1,12);geo.forEach(g=>{g.solids.forEach(s=>scene.hardSolid(s));g.holes.forEach(s=>scene.hole(s));});
 const field=(q:V)=>{const inside=q.some((v,i)=>v<lo[i]||v>hi[i]);let d=inside?h:(.5-rho(q))*h;d=Math.min(d,scene.distance(q));for(const g of geo)for(const s of g.holes)d=Math.max(d,-primDistance(q,s));if(bosses.distance(q)>.5)d=Math.max(d,.6-spec.clearance(q));return d;};
 const raw=surfaceNets(field,lo,hi,spec.resolution??1,4),{mesh}=largestPart(raw),info=inspect(mesh);
 return {id:spec.id,mesh,density:phys,grid:{nx,ny,nz,h,lo},mass:info.volume*PLA.density,volume:info.volume,compliance,deflection,closed:info.closed&&info.components===1,elements:ne,iterations:it,seconds:(performance.now()-t0)/1000,history};
}
