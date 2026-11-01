import {placeCandidates} from './search';
self.onmessage=({data})=>{try{self.postMessage(placeCandidates(data.project,data.candidates));}catch(e){self.postMessage({error:String(e)});}};
