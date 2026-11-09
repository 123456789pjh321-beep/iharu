import {clearEntryIntent,saveEntryIntent,takeEntryIntent,entryIntentLifetime,type EntryIntent} from '../../shared/entry-intent';
let inMemory:{intent:EntryIntent;expiresAt:number}|null=null;
export function rememberEntry(intent:EntryIntent){inMemory={intent,expiresAt:Date.now()+entryIntentLifetime};try{saveEntryIntent(sessionStorage,intent);}catch{/* In-page login still resumes when storage is unavailable. */}}
export function forgetEntry(){inMemory=null;try{clearEntryIntent(sessionStorage);}catch{/* Optional navigation state. */}}
export function resumeEntry(path:string){
 try{const saved=takeEntryIntent(sessionStorage,path);if(saved){inMemory=null;return saved;}}catch{/* Fall back to this page's state. */}
 if(inMemory&&inMemory.expiresAt<=Date.now())inMemory=null;
 if(inMemory?.intent.path===path){const saved=inMemory.intent;inMemory=null;return saved;}return null;
}
