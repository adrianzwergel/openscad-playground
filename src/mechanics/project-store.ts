// Project files in the browser's private file system (OPFS): one JSON file per project under /projekte, written
// atomically (a writable stream replaces the file on close). Catalogs stay in the app; a project holds only what was
// modelled, so a restart of page or browser loses nothing. A tab holds a lock on the file it has open; a second tab
// on the same file may look, but does not write over the first one.

/** The open scene and phase; `build`, `mechanism`: what files from before the phases name. */
export type ProjectView={scene?:string;phase?:number;build?:string;mechanism?:string};
export type ProjectFile={format:string;name:string;updated:string;doc:unknown;view?:ProjectView};
export type ProjectEntry={id:string;name:string;updated:string};
const activeName='geoeffnet.txt',fileOf=(id:string)=>`${id}.json`,stashKey=(id:string)=>`studio-projekt-kopie:${id}`;
const stashed=(id:string)=>{try{const t=localStorage.getItem(stashKey(id));return t?JSON.parse(t) as ProjectFile:undefined;}catch{return undefined;}};

/** Where the files live: OPFS, or memory where the browser has none (then nothing survives a reload). */
type Backend={read:(name:string)=>Promise<string|undefined>;write:(name:string,text:string)=>Promise<void>;remove:(name:string)=>Promise<void>;list:()=>Promise<string[]>};
async function opfs(dirName:string):Promise<Backend|undefined>{
 if(!navigator.storage?.getDirectory)return undefined;
 let dir:FileSystemDirectoryHandle;try{dir=await (await navigator.storage.getDirectory()).getDirectoryHandle(dirName,{create:true});}catch{return undefined;}
 return {
  read:async name=>{try{return await (await (await dir.getFileHandle(name)).getFile()).text();}catch(e){if((e as DOMException).name==='NotFoundError')return undefined;throw e;}},
  write:async(name,text)=>{const w=await (await dir.getFileHandle(name,{create:true})).createWritable();await w.write(text);await w.close();},
  remove:async name=>{try{await dir.removeEntry(name);}catch(e){if((e as DOMException).name!=='NotFoundError')throw e;}},
  list:async()=>{const names:string[]=[];for await(const name of (dir as unknown as {keys():AsyncIterable<string>}).keys())names.push(name);return names;},
 };
}
function memory():Backend{const m=new Map<string,string>();return {read:async n=>m.get(n),write:async(n,t)=>{m.set(n,t);},remove:async n=>{m.delete(n);},list:async()=>[...m.keys()]};}

export class ProjectStore{
 /** Saves run one after the other; only the newest waiting one is written. */
 private chain:Promise<void>=Promise.resolve();private queued=new Map<string,string>();
 private release?:()=>void;
 private constructor(private files:Backend,readonly persistent:boolean,private format:string){}
 /** `dir`: the folder in OPFS, `format`: what its files must say they are (the Studio's projects by default). */
 static async open(dir='projekte',format='studio-project-1'){const b=await opfs(dir);if(b)void navigator.storage.persist?.().catch(()=>{});return new ProjectStore(b??memory(),!!b,format);}
 async list():Promise<ProjectEntry[]>{
  const out:ProjectEntry[]=[];for(const name of await this.files.list()){if(!name.endsWith('.json'))continue;try{const f=JSON.parse(await this.files.read(name)??'') as ProjectFile;out.push({id:name.slice(0,-5),name:f.name,updated:f.updated});}catch{out.push({id:name.slice(0,-5),name:`${name} (beschädigt)`,updated:''});}}
  return out.sort((a,b)=>a.name.localeCompare(b.name,'de'));
 }
 async read(id:string){const text=await this.files.read(fileOf(id)),kept=stashed(id);if(text===undefined&&!kept)throw Error('Projektdatei fehlt');const f=text===undefined?kept!:JSON.parse(text) as ProjectFile;if(f.format!==this.format)throw Error('Unbekanntes Dateiformat');
  // A page that was closed or reloaded while its last write was still on the way left a copy: the newer one wins.
  if(kept&&kept.updated>f.updated){await this.write(id,kept);return kept;}return f;}
 /** Synchronous copy for a page going away: an asynchronous write may not finish before the next page reads. */
 stash(id:string,file:ProjectFile){try{localStorage.setItem(stashKey(id),JSON.stringify(file));}catch{/* too large or no storage: the file write still runs */}}
 write(id:string,file:ProjectFile){const name=fileOf(id),first=!this.queued.has(name);this.queued.set(name,JSON.stringify(file));if(first)this.chain=this.chain.catch(()=>{}).then(async()=>{const text=this.queued.get(name)!;this.queued.delete(name);await this.files.write(name,text);const kept=stashed(id);if(kept&&kept.updated<=(JSON.parse(text) as ProjectFile).updated)localStorage.removeItem(stashKey(id));});return this.chain;}
 /** Waits until everything asked for is on disk. */
 settled(){return this.chain;}
 async remove(id:string){await this.settled().catch(()=>{});await this.files.remove(fileOf(id));}
 active(){return this.files.read(activeName);}
 setActive(id:string){return this.files.write(activeName,id);}
 /** Holds this tab's lock on a project; false: another tab has it open. */
 async claim(id:string){
  this.release?.();this.release=undefined;if(!navigator.locks)return true;
  // A page being reloaded still holds its lock for a moment: wait for it a little before calling the file taken.
  return new Promise<boolean>(resolve=>{navigator.locks.request(`studio-projekt-${id}`,{signal:AbortSignal.timeout(2500)},()=>{resolve(true);return new Promise<void>(free=>{this.release=free;});}).catch(()=>resolve(false));});
 }
}
