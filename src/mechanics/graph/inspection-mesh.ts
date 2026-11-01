import type {IndexedPolyhedron,Color} from '../../io/common.ts';
import type {Mechanism} from './contracts.ts';
import type {Hull} from './space.ts';
import {regionHull} from './space.ts';
import {constructionHulls} from './construction.ts';
export type SpaceLayers={bounds:boolean;obstacles:boolean;clearances:boolean};
export function inspectionMesh(mesh:IndexedPolyhedron,graph:Mechanism,layers:SpaceLayers):IndexedPolyhedron{
 const out:IndexedPolyhedron={vertices:[...mesh.vertices],faces:[...mesh.faces],colors:[...mesh.colors]};
 function box(h:Hull,color:Color){const offset=out.vertices.length,index=out.colors.length;out.colors.push(color);
  for(let k=0;k<8;k++){const p=[...h.center];h.axes.forEach((axis,i)=>axis.forEach((v,j)=>p[j]+=v*h.half[i]*(k&(1<<i)?1:-1)));out.vertices.push({x:p[0],y:p[1],z:p[2]});}
  for(const [a,b,c,d] of [[0,2,3,1],[4,5,7,6],[0,1,5,4],[2,6,7,3],[0,4,6,2],[1,3,7,5]])for(const tri of [[a,b,c],[a,c,d]])out.faces.push({vertices:tri.map(i=>offset+i) as [number,number,number],colorIndex:index});
 }
 if(layers.bounds&&graph.environment?.bounds)box(regionHull(graph.environment.bounds),[.15,.5,1,.07]);
 if(layers.obstacles)for(const region of graph.environment?.obstacles??[])box(regionHull(region),[1,.15,.12,.22]);
 if(layers.clearances)for(const hull of constructionHulls(graph,false).boxes)box(hull,[1,.65,.1,.10]);
 return out;
}
