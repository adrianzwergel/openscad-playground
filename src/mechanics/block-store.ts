// The library's own blocks: rigid groups saved from a project, for every project. They live in the browser's private
// file system next to the projects (/bausteine/bausteine.json), or in memory where the browser has none.
import type {Block} from './parts/groups';

const dirName='bausteine',fileName='bausteine.json';
export class BlockStore{
 private constructor(private dir:FileSystemDirectoryHandle|undefined,private list:Block[]){}
 static async open(){
  let dir:FileSystemDirectoryHandle|undefined,list:Block[]=[];
  try{dir=await (await navigator.storage.getDirectory()).getDirectoryHandle(dirName,{create:true});}catch{dir=undefined;}
  if(dir)try{const parsed=JSON.parse(await (await (await dir.getFileHandle(fileName)).getFile()).text());if(Array.isArray(parsed))list=parsed;}catch{/* none yet, or unreadable: start empty */}
  return new BlockStore(dir,list);}
 get all():readonly Block[]{return this.list;}
 async add(block:Block){this.list=[...this.list,block];await this.save();}
 async remove(id:string){this.list=this.list.filter(b=>b.id!==id);await this.save();}
 private async save(){if(!this.dir)return;const w=await (await this.dir.getFileHandle(fileName,{create:true})).createWritable();await w.write(JSON.stringify(this.list));await w.close();}
}
