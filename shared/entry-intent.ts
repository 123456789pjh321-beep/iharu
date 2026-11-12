import {z} from 'zod';

export const accountDeletionRequestPath='/privacy?request=delete';
const paths=new Set(['/timetable','/today/calendar','/today/repeats','/chat','/briefing','/child/chat','/tuition','/records','/family','/family/invite','/invite','/account','/account/email','/account/reauth','/privacy',accountDeletionRequestPath,'/notification-settings','/more','/settings','/help','/more/service','/more/notices','/more/blog','/admin']);
/** Auth returns are exact app destinations, including explicitly supported settings and saved views. */
export function entryReturnPath(value:unknown):string{
 if(typeof value!=='string')return '/timetable';
 if(value==='/admin?section=ai'||value==='/briefing?settings=1'||value==='/briefing?view=saved')return value;
 return paths.has(value)||/^\/more\/(notices|blog)\/[a-z0-9-]{1,100}$/.test(value)?value:'/timetable';
}
const pageIntent=z.object({type:z.literal('page'),path:z.string()}).strict();
const createIntent=z.object({type:z.literal('create'),path:z.string(),kind:z.enum(['EVENT','REPEAT','FEE','NOTE']),date:z.iso.date(),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()}).strict();
export const entryIntentSchema=z.discriminatedUnion('type',[pageIntent,createIntent]).superRefine((value,ctx)=>{
 if(entryReturnPath(value.path)!==value.path)ctx.addIssue({code:'custom',message:'Unknown return path'});
 if(value.type==='create'){
  const allowed={EVENT:['/today/calendar'],REPEAT:['/timetable','/today/repeats'],FEE:['/tuition'],NOTE:['/records']};
  if(!allowed[value.kind].includes(value.path))ctx.addIssue({code:'custom',message:'Action and path do not match'});
 }
});
export type EntryIntent=z.infer<typeof entryIntentSchema>;
export const entryIntentKey='iharu:entry-intent:v1';
export const entryIntentLifetime=15*60*1000;
export interface EntryStorage{getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
export function saveEntryIntent(storage:EntryStorage,intent:EntryIntent,now=Date.now()){
 storage.setItem(entryIntentKey,JSON.stringify({intent:entryIntentSchema.parse(intent),expiresAt:now+entryIntentLifetime}));
}
export function clearEntryIntent(storage:EntryStorage){storage.removeItem(entryIntentKey);}
/** Contains only an input position; never a password, message, personal record, or write request. */
export function takeEntryIntent(storage:EntryStorage,path:string,now=Date.now()):EntryIntent|null{
 try{
  const raw=storage.getItem(entryIntentKey);if(!raw)return null;
  const value=JSON.parse(raw),parsed=entryIntentSchema.safeParse(value.intent);
  if(!parsed.success||!Number.isFinite(value.expiresAt)||value.expiresAt<=now||value.expiresAt>now+entryIntentLifetime){clearEntryIntent(storage);return null;}
  if(parsed.data.path!==path)return null;
  clearEntryIntent(storage);return parsed.data;
 }catch{clearEntryIntent(storage);return null;}
}
